import PostalMime from "postal-mime";
import { createDb } from "@mailflare/db";
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
    }
  } catch (err) {
    console.error("入站邮件处理失败", err);
    message.setReject("MailFlare：邮件处理失败，请稍后重试");
  } finally {
    ctx.waitUntil(client.end());
  }
}
