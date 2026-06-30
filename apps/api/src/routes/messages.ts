import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import PostalMime from "postal-mime";
import { attachments, emailAddresses, messages, userQuota } from "@mailflare/db";
import type { Database } from "@mailflare/db";
import {
  saveDraftSchema,
  sendMessageSchema,
  updateMessageSchema,
} from "@mailflare/shared";
import { z } from "zod";
import type { AppEnv } from "../env.js";
import { makeSnippet, resolveDelivery, storeInboundEmail } from "../lib/mail.js";
import { attachmentKey, base64ToBytes, rawKey } from "../lib/storage.js";

/** 当前用户名下全部地址 id */
async function userAddressIds(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: emailAddresses.id })
    .from(emailAddresses)
    .where(eq(emailAddresses.userId, userId));
  return rows.map((r) => r.id);
}

/** 校验某条邮件归属当前用户，返回邮件行 + 归属地址 */
async function ownedMessage(db: Database, userId: string, id: string) {
  const [row] = await db
    .select({ m: messages, address: emailAddresses.address })
    .from(messages)
    .innerJoin(emailAddresses, eq(messages.addressId, emailAddresses.id))
    .where(and(eq(messages.id, id), eq(emailAddresses.userId, userId)));
  return row ?? null;
}

const simulateSchema = z
  .object({
    addressId: z.string().uuid().optional(),
    to: z.string().email().optional(),
    raw: z.string().min(1),
  })
  .refine((d) => d.addressId || d.to, { message: "需提供 addressId 或 to" });

const LIST_FIELDS = {
  id: messages.id,
  addressId: messages.addressId,
  direction: messages.direction,
  fromAddress: messages.fromAddress,
  toAddresses: messages.toAddresses,
  subject: messages.subject,
  snippet: messages.snippet,
  isRead: messages.isRead,
  isStarred: messages.isStarred,
  folder: messages.folder,
  sizeBytes: messages.sizeBytes,
  receivedAt: messages.receivedAt,
  sentAt: messages.sentAt,
  createdAt: messages.createdAt,
};

export const messageRoutes = new Hono<AppEnv>()
  /** 列表：folder / 搜索 q / 分页 limit·offset，返回 {items,total} */
  .get("/", async (c) => {
    const db = c.var.db;
    const user = c.var.user!;
    const folder = c.req.query("folder") ?? "inbox";
    const addressId = c.req.query("addressId");
    const q = c.req.query("q")?.trim();
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

    const ids = await userAddressIds(db, user.id);
    if (!ids.length) return c.json({ items: [], total: 0 });

    const conds = [inArray(messages.addressId, ids)];
    if (folder === "starred") {
      conds.push(eq(messages.isStarred, true), ne(messages.folder, "trash"));
    } else {
      conds.push(eq(messages.folder, folder));
    }
    if (addressId) conds.push(eq(messages.addressId, addressId));
    if (q) {
      const like = `%${q}%`;
      conds.push(
        or(
          ilike(messages.subject, like),
          ilike(messages.fromAddress, like),
          ilike(messages.snippet, like),
        )!,
      );
    }
    const where = and(...conds);

    const [items, totalRow] = await Promise.all([
      db
        .select(LIST_FIELDS)
        .from(messages)
        .where(where)
        .orderBy(desc(messages.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ n: sql<number>`count(*)::int` }).from(messages).where(where),
    ]);
    return c.json({ items, total: totalRow[0]?.n ?? 0 });
  })

  /** 各文件夹计数 + 未读 */
  .get("/counts", async (c) => {
    const db = c.var.db;
    const ids = await userAddressIds(db, c.var.user!.id);
    const empty = { inbox: 0, sent: 0, draft: 0, trash: 0, starred: 0, unread: 0 };
    if (!ids.length) return c.json(empty);

    const rows = await db
      .select({
        folder: messages.folder,
        total: sql<number>`count(*)::int`,
        unread: sql<number>`sum(case when ${messages.isRead} = false then 1 else 0 end)::int`,
      })
      .from(messages)
      .where(inArray(messages.addressId, ids))
      .groupBy(messages.folder);

    const out = { ...empty };
    for (const r of rows) {
      if (r.folder in out) (out as Record<string, number>)[r.folder] = r.total;
      if (r.folder === "inbox") out.unread = r.unread;
    }
    out.starred = await db.$count(
      messages,
      and(
        inArray(messages.addressId, ids),
        eq(messages.isStarred, true),
        ne(messages.folder, "trash"),
      ),
    );
    return c.json(out);
  })

  /** 导出邮箱为 .mbox（收件箱 + 已发） */
  .get("/export", async (c) => {
    const db = c.var.db;
    const ids = await userAddressIds(db, c.var.user!.id);
    if (!ids.length) {
      return new Response("", { headers: { "Content-Type": "application/mbox" } });
    }
    const rows = await db
      .select({
        fromAddress: messages.fromAddress,
        toAddresses: messages.toAddresses,
        subject: messages.subject,
        bodyText: messages.bodyText,
        messageId: messages.messageId,
        r2ObjectKey: messages.r2ObjectKey,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(inArray(messages.addressId, ids), inArray(messages.folder, ["inbox", "sent"])))
      .orderBy(asc(messages.createdAt));

    const parts: string[] = [];
    for (const m of rows) {
      const from = m.fromAddress ?? "unknown@localhost";
      parts.push(`From ${from} ${m.createdAt.toUTCString()}\n`);
      let body = "";
      if (m.r2ObjectKey) {
        const obj = await c.env.RAW_EMAILS.get(m.r2ObjectKey);
        if (obj) body = await obj.text();
      }
      if (!body) {
        body =
          `From: ${from}\nTo: ${(m.toAddresses ?? []).join(", ")}\n` +
          `Subject: ${m.subject ?? ""}\n` +
          (m.messageId ? `Message-ID: ${m.messageId}\n` : "") +
          `\n${m.bodyText ?? ""}`;
      }
      parts.push(body.replace(/\nFrom /g, "\n>From "), "\n\n");
    }
    return new Response(parts.join(""), {
      headers: {
        "Content-Type": "application/mbox",
        "Content-Disposition": 'attachment; filename="mailflare.mbox"',
      },
    });
  })

  /** 发信：附件 + 回复线程头 + 发送草稿后清理 */
  .post("/send", zValidator("json", sendMessageSchema), async (c) => {
    const db = c.var.db;
    const user = c.var.user!;
    const body = c.req.valid("json");

    const from = await db.query.emailAddresses.findFirst({
      where: and(
        eq(emailAddresses.id, body.fromAddressId),
        eq(emailAddresses.userId, user.id),
        eq(emailAddresses.status, "active"),
      ),
    });
    if (!from || from.type !== "mailbox") {
      return c.json({ error: "发件地址无效或不属于你" }, 422);
    }

    const quota = await db.query.userQuota.findFirst({
      where: eq(userQuota.userId, user.id),
    });
    if (quota?.dailySendQuota != null && (quota.sentToday ?? 0) >= quota.dailySendQuota) {
      return c.json({ error: "今日发信已达上限" }, 429);
    }

    // 线程头（回复/转发）
    let inReplyTo: string | null = null;
    let references: string | null = null;
    if (body.replyToMessageId) {
      const orig = await ownedMessage(db, user.id, body.replyToMessageId);
      if (orig?.m.messageId) {
        inReplyTo = orig.m.messageId;
        references = `${orig.m.references ? orig.m.references + " " : ""}${orig.m.messageId}`;
      }
    }
    const headers: Record<string, string> = {};
    if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
    if (references) headers["References"] = references;

    const emailAttachments = (body.attachments ?? []).map((a) => ({
      disposition: "attachment" as const,
      filename: a.filename,
      type: a.contentType ?? "application/octet-stream",
      content: base64ToBytes(a.contentBase64),
    }));

    try {
      await c.env.EMAIL.send({
        from: { email: from.address, name: user.name },
        to: body.to,
        ...(body.cc?.length ? { cc: body.cc } : {}),
        ...(body.bcc?.length ? { bcc: body.bcc } : {}),
        subject: body.subject,
        ...(body.text ? { text: body.text } : {}),
        ...(body.html ? { html: body.html } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(emailAttachments.length ? { attachments: emailAttachments } : {}),
      });
    } catch (err) {
      return c.json(
        { error: `发送失败：${err instanceof Error ? err.message : "未知错误"}` },
        502,
      );
    }

    const domain = from.address.split("@")[1] ?? "mail";
    const genMessageId = `<${crypto.randomUUID()}@${domain}>`;
    const [msg] = await db
      .insert(messages)
      .values({
        addressId: from.id,
        direction: "outbound",
        messageId: genMessageId,
        inReplyTo,
        references,
        fromAddress: from.address,
        toAddresses: body.to,
        ccAddresses: body.cc ?? [],
        bccAddresses: body.bcc ?? [],
        subject: body.subject,
        snippet: makeSnippet(body.text, body.html),
        bodyText: body.text ?? null,
        bodyHtml: body.html ?? null,
        folder: "sent",
        isRead: true,
        sentAt: new Date(),
      })
      .returning();

    // 出站附件入 R2
    for (const a of body.attachments ?? []) {
      const bytes = base64ToBytes(a.contentBase64);
      const [row] = await db
        .insert(attachments)
        .values({
          messageId: msg!.id,
          filename: a.filename,
          contentType: a.contentType ?? null,
          sizeBytes: bytes.byteLength,
          r2ObjectKey: "pending",
        })
        .returning();
      const ak = attachmentKey(msg!.id, row!.id);
      await c.env.RAW_EMAILS.put(ak, bytes);
      await db.update(attachments).set({ r2ObjectKey: ak }).where(eq(attachments.id, row!.id));
    }

    if (quota?.dailySendQuota != null) {
      await db
        .update(userQuota)
        .set({ sentToday: sql`${userQuota.sentToday} + 1` })
        .where(eq(userQuota.userId, user.id));
    }
    // 发送的是草稿 → 删除草稿
    if (body.draftId) {
      const draft = await ownedMessage(db, user.id, body.draftId);
      if (draft?.m.folder === "draft") {
        await db.delete(messages).where(eq(messages.id, body.draftId));
      }
    }
    return c.json(msg, 201);
  })

  /** 保存草稿（新建或更新） */
  .post("/draft", zValidator("json", saveDraftSchema), async (c) => {
    const db = c.var.db;
    const user = c.var.user!;
    const b = c.req.valid("json");

    const from = await db.query.emailAddresses.findFirst({
      where: and(
        eq(emailAddresses.id, b.fromAddressId),
        eq(emailAddresses.userId, user.id),
      ),
    });
    if (!from) return c.json({ error: "发件地址无效" }, 422);

    const values = {
      addressId: from.id,
      fromAddress: from.address,
      toAddresses: b.to ?? [],
      ccAddresses: b.cc ?? [],
      bccAddresses: b.bcc ?? [],
      subject: b.subject ?? null,
      snippet: makeSnippet(b.text, b.html),
      bodyText: b.text ?? null,
      bodyHtml: b.html ?? null,
    };

    if (b.id) {
      const row = await ownedMessage(db, user.id, b.id);
      if (!row || row.m.folder !== "draft") return c.json({ error: "草稿不存在" }, 404);
      await db.update(messages).set(values).where(eq(messages.id, b.id));
      return c.json({ id: b.id });
    }
    const [m] = await db
      .insert(messages)
      .values({ ...values, direction: "outbound", folder: "draft", isRead: true })
      .returning();
    return c.json({ id: m!.id }, 201);
  })

  /** 模拟入站（开发/自测用，仅本人邮箱） */
  .post("/simulate-inbound", zValidator("json", simulateSchema), async (c) => {
    const db = c.var.db;
    const user = c.var.user!;
    const { addressId, to, raw } = c.req.valid("json");

    let envelopeTo = to;
    if (!envelopeTo && addressId) {
      const addr = await db.query.emailAddresses.findFirst({
        where: and(eq(emailAddresses.id, addressId), eq(emailAddresses.userId, user.id)),
      });
      if (!addr) return c.json({ error: "地址无效或不属于你" }, 422);
      envelopeTo = addr.address;
    }
    if (!envelopeTo) return c.json({ error: "缺少收件地址" }, 422);

    // 解析投递目标，且必须属于当前用户（防止注入他人邮箱）
    const target = await resolveDelivery(db, envelopeTo.toLowerCase());
    if (!target || target.userId !== user.id) {
      return c.json({ error: "投递目标不存在或不属于你" }, 422);
    }

    const bytes = new TextEncoder().encode(raw);
    const parsed = await PostalMime.parse(raw);
    const result = await storeInboundEmail(db, c.env, {
      envelopeFrom: parsed.from?.address ?? "unknown@unknown",
      envelopeTo,
      raw: bytes.buffer as ArrayBuffer,
      parsed,
    });
    return c.json(result, result.stored ? 201 : 422);
  })

  /** 邮件详情（含附件元数据） */
  .get("/:id", async (c) => {
    const db = c.var.db;
    const row = await ownedMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);
    const atts = await db
      .select({
        id: attachments.id,
        filename: attachments.filename,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
        contentId: attachments.contentId,
      })
      .from(attachments)
      .where(eq(attachments.messageId, row.m.id));
    return c.json({ ...row.m, attachments: atts });
  })

  /** 会话线程：同一对话内的邮件（按线程头聚合） */
  .get("/:id/thread", async (c) => {
    const db = c.var.db;
    const row = await ownedMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);
    const m = row.m;

    const chain = new Set<string>();
    if (m.messageId) chain.add(m.messageId);
    if (m.inReplyTo) chain.add(m.inReplyTo);
    for (const r of (m.references ?? "").split(/\s+/).filter(Boolean)) chain.add(r);

    const ids = await userAddressIds(db, c.var.user!.id);
    const ors = [eq(messages.id, m.id)];
    if (chain.size) ors.push(inArray(messages.messageId, [...chain]));
    if (m.messageId) {
      ors.push(ilike(messages.references, `%${m.messageId}%`));
      ors.push(eq(messages.inReplyTo, m.messageId));
    }

    const rows = await db
      .select({
        id: messages.id,
        direction: messages.direction,
        fromAddress: messages.fromAddress,
        toAddresses: messages.toAddresses,
        subject: messages.subject,
        bodyText: messages.bodyText,
        bodyHtml: messages.bodyHtml,
        receivedAt: messages.receivedAt,
        sentAt: messages.sentAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(inArray(messages.addressId, ids), or(...ors)))
      .orderBy(asc(messages.createdAt));
    return c.json(rows);
  })

  /** 下载原始 .eml */
  .get("/:id/raw", async (c) => {
    const db = c.var.db;
    const row = await ownedMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row?.m.r2ObjectKey) return c.json({ error: "原文不存在" }, 404);
    const obj = await c.env.RAW_EMAILS.get(row.m.r2ObjectKey);
    if (!obj) return c.json({ error: "原文不存在" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": `attachment; filename="${row.m.id}.eml"`,
      },
    });
  })

  /** 下载附件 */
  .get("/:id/attachments/:attId", async (c) => {
    const db = c.var.db;
    const row = await ownedMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);
    const att = await db.query.attachments.findFirst({
      where: and(
        eq(attachments.id, c.req.param("attId")),
        eq(attachments.messageId, row.m.id),
      ),
    });
    if (!att) return c.json({ error: "附件不存在" }, 404);
    const obj = await c.env.RAW_EMAILS.get(att.r2ObjectKey);
    if (!obj) return c.json({ error: "附件不存在" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": att.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${att.filename ?? att.id}"`,
      },
    });
  })

  /** 标记已读/星标/移动文件夹 */
  .patch("/:id", zValidator("json", updateMessageSchema), async (c) => {
    const db = c.var.db;
    const row = await ownedMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);
    await db.update(messages).set(c.req.valid("json")).where(eq(messages.id, row.m.id));
    return c.json({ ok: true });
  })

  /** 删除：非回收站→移入回收站；回收站内→永久删除并清理 R2 */
  .delete("/:id", async (c) => {
    const db = c.var.db;
    const row = await ownedMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);

    if (row.m.folder !== "trash") {
      await db
        .update(messages)
        .set({ folder: "trash", isStarred: false })
        .where(eq(messages.id, row.m.id));
      return c.json({ ok: true, trashed: true });
    }

    const atts = await db
      .select({ key: attachments.r2ObjectKey })
      .from(attachments)
      .where(eq(attachments.messageId, row.m.id));
    const keys = [row.m.r2ObjectKey, ...atts.map((a) => a.key)].filter(
      (k): k is string => Boolean(k),
    );
    if (keys.length) await c.env.RAW_EMAILS.delete(keys);
    await db.delete(messages).where(eq(messages.id, row.m.id));
    return c.json({ ok: true, deleted: true });
  });
