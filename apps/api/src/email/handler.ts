import PostalMime from "postal-mime";
import { eq } from "drizzle-orm";
import { createDb, mailboxMembers } from "@mailflare/db";
import type { Bindings } from "../env.js";
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
      ctx.waitUntil(notifyRecipients(db, env, result.deliveredTo));
    }
  } catch (err) {
    console.error("入站邮件处理失败", err);
    message.setReject("MailFlare：邮件处理失败，请稍后重试");
  } finally {
    ctx.waitUntil(client.end());
  }
}

/** 向收件人（含公共邮箱成员）的 Durable Object 广播「新邮件」信号 */
async function notifyRecipients(
  db: Awaited<ReturnType<typeof createDb>>["db"],
  env: Bindings,
  deliveredTo: { id: string; userId: string | null; type: string },
): Promise<void> {
  let userIds: string[] = [];
  if (deliveredTo.userId) {
    userIds = [deliveredTo.userId];
  } else if (deliveredTo.type === "shared") {
    const members = await db
      .select({ userId: mailboxMembers.userId })
      .from(mailboxMembers)
      .where(eq(mailboxMembers.addressId, deliveredTo.id));
    userIds = members.map((m) => m.userId);
  }
  if (!userIds.length) return;

  const payload = JSON.stringify({ type: "new-mail" });
  await Promise.allSettled(
    userIds.map((uid) => {
      const stub = env.USER_HUB.get(env.USER_HUB.idFromName(uid));
      return stub.fetch("https://user-hub/broadcast", { method: "POST", body: payload });
    }),
  );
}
