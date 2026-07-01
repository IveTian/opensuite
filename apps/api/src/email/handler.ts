import PostalMime from "postal-mime";
import { eq } from "drizzle-orm";
import { createDb, mailboxMembers } from "@mailflare/db";
import type { Bindings } from "../env.js";
import { processInboundInvites } from "../lib/calendar-inbound.js";
import { storeInboundEmail } from "../lib/mail.js";

/**
 * 入站邮件处理器（Email Routing）。
 *
 * 流程：缓冲原始 MIME（单次）→ postal-mime 解析 → 按 envelope 收件人匹配邮箱地址
 *       → messages 落库 + 原始/附件入 R2 → 累加 usedBytes。
 * 未匹配到 active mailbox 时 setReject（避免静默丢弃）。
 */
export async function emailHandler(
  message: ForwardableEmailMessage,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  // message.raw 单次可读，先缓冲
  const raw = await new Response(message.raw).arrayBuffer();

  const { db, client } = await createDb(env.HYPERDRIVE.connectionString);
  try {
    const parsed = await PostalMime.parse(raw);
    const result = await storeInboundEmail(db, env, {
      envelopeFrom: message.from,
      envelopeTo: message.to,
      raw,
      parsed,
    });
    if (!result.stored) {
      message.setReject("MailFlare：该地址不存在或未启用");
    } else if (result.deliveredTo) {
      // 实时推送：通知收件人（公共邮箱通知全部成员）浏览器有新邮件
      const userIds = await recipientUserIds(db, result.deliveredTo);
      ctx.waitUntil(broadcast(env, userIds, { type: "new-mail" }));

      // 入站 .ics：解析并落库日历改动（须在 db 连接关闭前 await）
      const calChanged = await processInboundInvites(db, parsed, result.deliveredTo).catch((e) => {
        console.error("入站日历邀请处理失败", e);
        return false;
      });
      if (calChanged) ctx.waitUntil(broadcast(env, userIds, { type: "calendar-updated" }));
    }
  } catch (err) {
    console.error("入站邮件处理失败", err);
    message.setReject("MailFlare：邮件处理失败，请稍后重试");
  } finally {
    ctx.waitUntil(client.end());
  }
}

/** 解析该次投递应通知的用户 id（个人邮箱本人；公共邮箱全部成员） */
async function recipientUserIds(
  db: Awaited<ReturnType<typeof createDb>>["db"],
  deliveredTo: { id: string; userId: string | null; type: string },
): Promise<string[]> {
  if (deliveredTo.userId) return [deliveredTo.userId];
  if (deliveredTo.type === "shared") {
    const members = await db
      .select({ userId: mailboxMembers.userId })
      .from(mailboxMembers)
      .where(eq(mailboxMembers.addressId, deliveredTo.id));
    return members.map((m) => m.userId);
  }
  return [];
}

/** 向若干用户的 Durable Object 广播实时信号（新邮件 / 日历更新） */
async function broadcast(env: Bindings, userIds: string[], message: unknown): Promise<void> {
  if (!userIds.length) return;
  const payload = JSON.stringify(message);
  await Promise.allSettled(
    userIds.map((uid) => {
      const stub = env.USER_HUB.get(env.USER_HUB.idFromName(uid));
      return stub.fetch("https://user-hub/broadcast", { method: "POST", body: payload });
    }),
  );
}
