import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  attachments,
  emailAddresses,
  messages,
  systemSettings,
  userQuota,
} from "@mailflare/db";
import type { Database } from "@mailflare/db";
import type { SendMessageInput, ScheduleMessageInput } from "@mailflare/shared";
import { SYSTEM_SETTINGS_ID } from "@mailflare/shared";
import type { AuthUser, Bindings } from "../env.js";
import { sendableAddressIds } from "./mailbox-access.js";
import { makeSnippet } from "./mail.js";
import { sanitizeOutboundHtml } from "./sanitize.js";
import { attachmentKey, base64ToBytes } from "./storage.js";

type OutboundInput = SendMessageInput | Omit<ScheduleMessageInput, "scheduledAt">;

export class OutboundMailError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 422 | 429 | 502 = 422,
  ) {
    super(message);
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string): string {
  return `<p>${escapeHtml(text).replace(/\r?\n/g, "<br>")}</p>`;
}

function appendHtmlBlocks(
  html: string | undefined,
  text: string | undefined,
  blocks: (string | null | undefined)[],
): string | undefined {
  const parts = blocks.map((b) => b?.trim()).filter((b): b is string => Boolean(b));
  if (!parts.length) return html;
  const base = html?.trim() || (text ? textToHtml(text) : "<p></p>");
  return sanitizeOutboundHtml(`${base}<br>${parts.join("<br>")}`);
}

function appendTextBlocks(
  text: string | undefined,
  html: string | undefined,
  blocks: (string | null | undefined)[],
): string | undefined {
  const parts = blocks
    .map((b) => (b ? htmlToPlainText(b) : ""))
    .filter(Boolean);
  if (!parts.length) return text || (html ? htmlToPlainText(html) : undefined);
  const base = text?.trim() || (html ? htmlToPlainText(html) : "");
  return [base, ...parts].filter(Boolean).join("\n\n");
}

async function readReplyHeaders(
  db: Database,
  userId: string,
  replyToMessageId?: string,
  draftId?: string,
) {
  const sendable = await sendableAddressIds(db, userId);
  if (!sendable.length) return { inReplyTo: null, references: null };

  if (!replyToMessageId && draftId) {
    const [draft] = await db
      .select({
        inReplyTo: messages.inReplyTo,
        references: messages.references,
      })
      .from(messages)
      .where(and(eq(messages.id, draftId), inArray(messages.addressId, sendable)));
    if (draft?.inReplyTo || draft?.references) {
      return {
        inReplyTo: draft.inReplyTo ?? null,
        references: draft.references ?? null,
      };
    }
  }

  if (!replyToMessageId) return { inReplyTo: null, references: null };
  const [orig] = await db
    .select({
      messageId: messages.messageId,
      references: messages.references,
    })
    .from(messages)
    .where(and(eq(messages.id, replyToMessageId), inArray(messages.addressId, sendable)));

  if (!orig?.messageId) return { inReplyTo: null, references: null };
  return {
    inReplyTo: orig.messageId,
    references: `${orig.references ? orig.references + " " : ""}${orig.messageId}`,
  };
}

async function prepareOutboundMessage(db: Database, user: AuthUser, input: OutboundInput) {
  const from = await db.query.emailAddresses.findFirst({
    where: and(eq(emailAddresses.id, input.fromAddressId), eq(emailAddresses.status, "active")),
  });
  const sendable = await sendableAddressIds(db, user.id);
  if (!from || (from.type !== "mailbox" && from.type !== "shared") || !sendable.includes(from.id)) {
    throw new OutboundMailError("发件地址无效或不属于你", 422);
  }

  const cleanHtml = input.html ? sanitizeOutboundHtml(input.html) : undefined;
  const senderName = from.senderName || user.name;
  const sys = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
  });
  const signatureBlocks = [
    from.type === "shared" ? from.sharedSignatureHtml : null,
    sys?.orgSignatureHtml,
  ];
  const finalHtml = appendHtmlBlocks(cleanHtml, input.text, signatureBlocks);
  const finalText = appendTextBlocks(input.text, cleanHtml, signatureBlocks);
  const { inReplyTo, references } = await readReplyHeaders(
    db,
    user.id,
    input.replyToMessageId,
    input.draftId,
  );
  const domain = from.address.split("@")[1] ?? "mail";

  return {
    from,
    senderName,
    finalHtml,
    finalText,
    inReplyTo,
    references,
    messageId: `<${crypto.randomUUID()}@${domain}>`,
  };
}

function buildEmailAttachments(input: OutboundInput): EmailAttachment[] {
  return (input.attachments ?? []).map((a) =>
    a.inline && a.contentId
      ? {
          disposition: "inline" as const,
          contentId: a.contentId,
          filename: a.filename,
          type: a.contentType ?? "application/octet-stream",
          content: base64ToBytes(a.contentBase64),
        }
      : {
          disposition: "attachment" as const,
          filename: a.filename,
          type: a.contentType ?? "application/octet-stream",
          content: base64ToBytes(a.contentBase64),
        },
  );
}

async function storeInputAttachments(
  db: Database,
  bucket: Bindings["RAW_EMAILS"],
  messageId: string,
  input: OutboundInput,
) {
  for (const a of input.attachments ?? []) {
    const bytes = base64ToBytes(a.contentBase64);
    const [row] = await db
      .insert(attachments)
      .values({
        messageId,
        filename: a.filename,
        contentType: a.contentType ?? null,
        sizeBytes: bytes.byteLength,
        r2ObjectKey: "pending",
        contentId: a.inline ? (a.contentId ?? null) : null,
      })
      .returning();
    const ak = attachmentKey(messageId, row!.id);
    await bucket.put(ak, bytes);
    await db.update(attachments).set({ r2ObjectKey: ak }).where(eq(attachments.id, row!.id));
  }
}

async function deleteMessageWithObjects(
  db: Database,
  bucket: Bindings["RAW_EMAILS"],
  id: string,
) {
  const atts = await db
    .select({ key: attachments.r2ObjectKey })
    .from(attachments)
    .where(eq(attachments.messageId, id));
  const keys = atts.map((a) => a.key).filter((k): k is string => Boolean(k));
  if (keys.length) await bucket.delete(keys);
  await db.delete(messages).where(eq(messages.id, id));
}

async function cleanupSubmittedDraft(
  db: Database,
  bucket: Bindings["RAW_EMAILS"],
  userId: string,
  draftId?: string,
) {
  if (!draftId) return;
  const sendable = await sendableAddressIds(db, userId);
  if (!sendable.length) return;
  const [draft] = await db
    .select({ id: messages.id, folder: messages.folder })
    .from(messages)
    .where(and(eq(messages.id, draftId), inArray(messages.addressId, sendable)));
  if (draft && (draft.folder === "draft" || draft.folder === "scheduled")) {
    await deleteMessageWithObjects(db, bucket, draft.id);
  }
}

async function enforceDailyQuota(db: Database, userId: string) {
  const quota = await db.query.userQuota.findFirst({
    where: eq(userQuota.userId, userId),
  });
  if (quota?.dailySendQuota != null && (quota.sentToday ?? 0) >= quota.dailySendQuota) {
    throw new OutboundMailError("今日发信已达上限", 429);
  }
  return quota;
}

async function incrementDailyQuota(db: Database, userId: string, hasQuota: boolean) {
  if (!hasQuota) return;
  await db
    .update(userQuota)
    .set({ sentToday: sql`${userQuota.sentToday} + 1` })
    .where(eq(userQuota.userId, userId));
}

export async function sendUserMessage(
  db: Database,
  env: Bindings,
  user: AuthUser,
  input: SendMessageInput,
) {
  const prepared = await prepareOutboundMessage(db, user, input);
  const quota = await enforceDailyQuota(db, user.id);
  const headers: Record<string, string> = {};
  if (prepared.inReplyTo) headers["In-Reply-To"] = prepared.inReplyTo;
  if (prepared.references) headers["References"] = prepared.references;
  const emailAttachments = buildEmailAttachments(input);

  try {
    await env.EMAIL.send({
      from: { email: prepared.from.address, name: prepared.senderName },
      to: input.to,
      ...(input.cc?.length ? { cc: input.cc } : {}),
      ...(input.bcc?.length ? { bcc: input.bcc } : {}),
      subject: input.subject,
      ...(prepared.finalText ? { text: prepared.finalText } : {}),
      ...(prepared.finalHtml ? { html: prepared.finalHtml } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(emailAttachments.length ? { attachments: emailAttachments } : {}),
    });
  } catch (err) {
    throw new OutboundMailError(
      `发送失败：${err instanceof Error ? err.message : "未知错误"}`,
      502,
    );
  }

  const [msg] = await db
    .insert(messages)
    .values({
      addressId: prepared.from.id,
      direction: "outbound",
      messageId: prepared.messageId,
      inReplyTo: prepared.inReplyTo,
      references: prepared.references,
      fromAddress: prepared.from.address,
      fromName: prepared.senderName,
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      bccAddresses: input.bcc ?? [],
      subject: input.subject,
      snippet: makeSnippet(prepared.finalText, prepared.finalHtml),
      bodyText: prepared.finalText ?? null,
      bodyHtml: prepared.finalHtml ?? null,
      folder: "sent",
      isRead: true,
      sentAt: new Date(),
      sendStatus: "sent",
      sentByUserId: user.id,
    })
    .returning();

  await storeInputAttachments(db, env.RAW_EMAILS, msg!.id, input);
  await incrementDailyQuota(db, user.id, quota?.dailySendQuota != null);
  try {
    await cleanupSubmittedDraft(db, env.RAW_EMAILS, user.id, input.draftId);
  } catch (err) {
    console.warn("清理已提交草稿失败", err);
  }
  return msg!;
}

export async function scheduleUserMessage(
  db: Database,
  env: Bindings,
  user: AuthUser,
  input: ScheduleMessageInput,
) {
  const scheduledAt = new Date(input.scheduledAt);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new OutboundMailError("定时发送时间必须晚于当前时间", 422);
  }

  const prepared = await prepareOutboundMessage(db, user, input);
  const [msg] = await db
    .insert(messages)
    .values({
      addressId: prepared.from.id,
      direction: "outbound",
      messageId: prepared.messageId,
      inReplyTo: prepared.inReplyTo,
      references: prepared.references,
      fromAddress: prepared.from.address,
      fromName: prepared.senderName,
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      bccAddresses: input.bcc ?? [],
      subject: input.subject,
      snippet: makeSnippet(prepared.finalText, prepared.finalHtml),
      bodyText: prepared.finalText ?? null,
      bodyHtml: prepared.finalHtml ?? null,
      folder: "scheduled",
      isRead: true,
      scheduledAt,
      sendStatus: "scheduled",
      sentByUserId: user.id,
    })
    .returning();

  await storeInputAttachments(db, env.RAW_EMAILS, msg!.id, input);
  try {
    await cleanupSubmittedDraft(db, env.RAW_EMAILS, user.id, input.draftId);
  } catch (err) {
    console.warn("清理已提交草稿失败", err);
  }
  return msg!;
}

async function readStoredAttachments(
  db: Database,
  bucket: Bindings["RAW_EMAILS"],
  messageId: string,
): Promise<EmailAttachment[]> {
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      contentType: attachments.contentType,
      r2ObjectKey: attachments.r2ObjectKey,
      contentId: attachments.contentId,
    })
    .from(attachments)
    .where(eq(attachments.messageId, messageId));

  const out: EmailAttachment[] = [];
  for (const row of rows) {
    const obj = await bucket.get(row.r2ObjectKey);
    if (!obj) continue;
    const bytes = await obj.arrayBuffer();
    if (row.contentId) {
      out.push({
        disposition: "inline",
        contentId: row.contentId,
        filename: row.filename ?? row.id,
        type: row.contentType ?? "application/octet-stream",
        content: bytes,
      });
    } else {
      out.push({
        disposition: "attachment",
        filename: row.filename ?? row.id,
        type: row.contentType ?? "application/octet-stream",
        content: bytes,
      });
    }
  }
  return out;
}

async function sendScheduledRow(
  db: Database,
  env: Bindings,
  row: typeof messages.$inferSelect,
  now: Date,
) {
  if (!row.fromAddress || !row.sentByUserId || !row.toAddresses?.length) {
    throw new Error("定时邮件缺少发件人、创建者或收件人");
  }
  const quota = await enforceDailyQuota(db, row.sentByUserId);
  const headers: Record<string, string> = {};
  if (row.inReplyTo) headers["In-Reply-To"] = row.inReplyTo;
  if (row.references) headers["References"] = row.references;
  const emailAttachments = await readStoredAttachments(db, env.RAW_EMAILS, row.id);

  await env.EMAIL.send({
    from: { email: row.fromAddress, name: row.fromName ?? "" },
    to: row.toAddresses,
    ...(row.ccAddresses?.length ? { cc: row.ccAddresses } : {}),
    ...(row.bccAddresses?.length ? { bcc: row.bccAddresses } : {}),
    subject: row.subject ?? "",
    ...(row.bodyText ? { text: row.bodyText } : {}),
    ...(row.bodyHtml ? { html: row.bodyHtml } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(emailAttachments.length ? { attachments: emailAttachments } : {}),
  });

  await db
    .update(messages)
    .set({
      folder: "sent",
      sentAt: now,
      sendStatus: "sent",
      sendError: null,
    })
    .where(eq(messages.id, row.id));
  await incrementDailyQuota(db, row.sentByUserId, quota?.dailySendQuota != null);
}

export async function runScheduledMail(
  db: Database,
  env: Bindings,
  now: Date,
  limit = 25,
): Promise<{ picked: number; sent: number; failed: number }> {
  const due = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.folder, "scheduled"),
        eq(messages.sendStatus, "scheduled"),
        lte(messages.scheduledAt, now),
      ),
    )
    .orderBy(asc(messages.scheduledAt))
    .limit(limit);
  if (!due.length) return { picked: 0, sent: 0, failed: 0 };

  const picked = await db
    .update(messages)
    .set({ sendStatus: "sending", sendError: null })
    .where(and(inArray(messages.id, due.map((m) => m.id)), eq(messages.sendStatus, "scheduled")))
    .returning();

  let sent = 0;
  let failed = 0;
  for (const row of picked) {
    try {
      await sendScheduledRow(db, env, row, now);
      sent += 1;
    } catch (err) {
      failed += 1;
      await db
        .update(messages)
        .set({
          sendStatus: "failed",
          sendError: err instanceof Error ? err.message : "未知错误",
        })
        .where(eq(messages.id, row.id));
    }
  }

  return { picked: picked.length, sent, failed };
}
