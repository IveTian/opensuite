import { and, eq, sql } from "drizzle-orm";
import type { Email, Address } from "postal-mime";
import { attachments, domains, emailAddresses, messages, userQuota } from "@mailflare/db";
import type { Database, EmailAddress } from "@mailflare/db";
import type { Bindings } from "../env.js";
import { attachmentKey, rawKey, toBytes } from "./storage.js";

/**
 * 把收件地址解析为最终投递的 mailbox 行。
 * 顺序：精确匹配 mailbox → alias 解析到 target mailbox → 域级 catch-all。
 */
export async function resolveDelivery(
  db: Database,
  to: string,
): Promise<EmailAddress | null> {
  const addr = await db.query.emailAddresses.findFirst({
    where: and(eq(emailAddresses.address, to), eq(emailAddresses.status, "active")),
  });
  const toMailbox = async (a: EmailAddress | undefined): Promise<EmailAddress | null> => {
    if (!a) return null;
    if (a.type === "mailbox") return a;
    if (a.type === "alias" && a.targetAddressId) {
      const t = await db.query.emailAddresses.findFirst({
        where: and(
          eq(emailAddresses.id, a.targetAddressId),
          eq(emailAddresses.status, "active"),
        ),
      });
      return t?.type === "mailbox" ? t : null;
    }
    return null;
  };

  if (addr) return toMailbox(addr);

  // 无精确匹配 → 域级 catch-all
  const domainName = to.split("@")[1];
  if (!domainName) return null;
  const domain = await db.query.domains.findFirst({
    where: eq(domains.name, domainName),
  });
  if (domain?.isCatchAllEnabled && domain.catchAllAddressId) {
    const ca = await db.query.emailAddresses.findFirst({
      where: and(
        eq(emailAddresses.id, domain.catchAllAddressId),
        eq(emailAddresses.status, "active"),
      ),
    });
    return toMailbox(ca);
  }
  return null;
}

/** 把 postal-mime 的地址列表（含 group）拍平为地址字符串数组 */
export function flattenAddresses(list?: Address[]): string[] {
  const out: string[] = [];
  for (const a of list ?? []) {
    if (a.address) out.push(a.address);
    else if (a.group) for (const m of a.group) if (m.address) out.push(m.address);
  }
  return out;
}

/** 由正文生成纯文本摘要 */
export function makeSnippet(text?: string, html?: string): string {
  const src = text ?? html ?? "";
  return src
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export interface StoreInboundResult {
  stored: boolean;
  reason?: "no_mailbox";
  messageId?: string;
}

/**
 * 入站邮件落库：匹配收件地址 → 写 messages → 原始 MIME 与附件入 R2 → 累加用量。
 * 抽成独立函数，便于 email() 处理器与本地测试共用。
 */
export async function storeInboundEmail(
  db: Database,
  env: Bindings,
  opts: { envelopeFrom: string; envelopeTo: string; raw: ArrayBuffer; parsed: Email },
): Promise<StoreInboundResult> {
  const to = opts.envelopeTo.trim().toLowerCase();
  const addr = await resolveDelivery(db, to);
  if (!addr) return { stored: false, reason: "no_mailbox" };

  const p = opts.parsed;
  const text = p.text ?? null;
  const html = p.html ?? null;

  const [msg] = await db
    .insert(messages)
    .values({
      addressId: addr.id,
      direction: "inbound",
      messageId: p.messageId ?? null,
      inReplyTo: p.inReplyTo ?? null,
      references: p.references ?? null,
      fromAddress: opts.envelopeFrom,
      // 显示名取 From 头（envelope-from 只是地址），如「张三」<a@b.com>
      fromName: p.from?.name || null,
      toAddresses: flattenAddresses(p.to).length ? flattenAddresses(p.to) : [to],
      ccAddresses: flattenAddresses(p.cc),
      subject: p.subject ?? null,
      snippet: makeSnippet(text ?? undefined, html ?? undefined),
      bodyText: text,
      bodyHtml: html,
      sizeBytes: opts.raw.byteLength,
      folder: "inbox",
      isRead: false,
      receivedAt: new Date(),
    })
    .returning();

  // 原始 MIME 入 R2
  const rk = rawKey(msg!.id);
  await env.RAW_EMAILS.put(rk, opts.raw);
  await db.update(messages).set({ r2ObjectKey: rk }).where(eq(messages.id, msg!.id));

  // 附件入 R2 + 元数据
  for (const att of p.attachments ?? []) {
    const bytes = toBytes(att.content);
    const [a] = await db
      .insert(attachments)
      .values({
        messageId: msg!.id,
        filename: att.filename ?? null,
        contentType: att.mimeType ?? null,
        sizeBytes: bytes.byteLength,
        r2ObjectKey: "pending",
        contentId: att.contentId ?? null,
      })
      .returning();
    const ak = attachmentKey(msg!.id, a!.id);
    await env.RAW_EMAILS.put(ak, bytes);
    await db.update(attachments).set({ r2ObjectKey: ak }).where(eq(attachments.id, a!.id));
  }

  // 累加用量（地址级 + 用户级）
  const total = opts.raw.byteLength;
  await db
    .update(emailAddresses)
    .set({ usedBytes: sql`${emailAddresses.usedBytes} + ${total}` })
    .where(eq(emailAddresses.id, addr.id));
  if (addr.userId) {
    await db
      .update(userQuota)
      .set({ usedBytes: sql`${userQuota.usedBytes} + ${total}` })
      .where(eq(userQuota.userId, addr.userId));
  }

  return { stored: true, messageId: msg!.id };
}
