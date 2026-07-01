import { zValidator } from "@hono/zod-validator";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import PostalMime from "postal-mime";
import {
  attachments,
  calendarEvents,
  emailAddresses,
  eventAttendees,
  messages,
} from "@mailflare/db";
import type { Database } from "@mailflare/db";
import {
  bulkActionSchema,
  saveDraftSchema,
  scheduleMessageSchema,
  sendMessageSchema,
  updateMessageSchema,
} from "@mailflare/shared";
import { z } from "zod";
import type { AppEnv } from "../env.js";
import type { Bindings } from "../env.js";
import { parseIcs } from "../lib/ical.js";
import { makeSnippet, resolveDelivery, storeInboundEmail } from "../lib/mail.js";
import { readableAddressIds, sendableAddressIds } from "../lib/mailbox-access.js";
import {
  OutboundMailError,
  scheduleUserMessage,
  sendUserMessage,
} from "../lib/outbound-mail.js";
import { sanitizeOutboundHtml } from "../lib/sanitize.js";

/**
 * 用户可访问的全部地址 id：自有地址（含别名）+ 被授权的公共邮箱。
 * 邮件读取/操作的授权边界。
 */
/**
 * 作用域地址集：指定 addressId 且可访问时锁定到该账号，否则为全部可访问地址。
 * 返回 null 表示请求了无权访问的地址（应视为空结果）。
 */
async function scopeIds(
  db: Database,
  userId: string,
  addressId?: string,
): Promise<string[] | null> {
  const all = await readableAddressIds(db, userId);
  if (addressId) return all.includes(addressId) ? [addressId] : null;
  return all;
}

/** 校验某条邮件当前用户可访问，返回邮件行 + 归属地址 */
async function accessibleMessage(db: Database, userId: string, id: string) {
  const ids = await readableAddressIds(db, userId);
  if (!ids.length) return null;
  const [row] = await db
    .select({ m: messages, address: emailAddresses.address })
    .from(messages)
    .innerJoin(emailAddresses, eq(messages.addressId, emailAddresses.id))
    .where(and(eq(messages.id, id), inArray(messages.addressId, ids)));
  return row ?? null;
}

type InvitePartstat = "needs-action" | "accepted" | "declined" | "tentative";

interface InviteAttachment {
  id: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  contentId: string | null;
  r2ObjectKey: string | null;
}

interface CalendarInvitePreview {
  attachmentId: string;
  filename: string | null;
  method: string | null;
  uid: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  organizer: string | null;
  myPartstat: InvitePartstat | null;
  eventId: string | null;
}

const INVITE_PARTSTATS = new Set<InvitePartstat>(["needs-action", "accepted", "declined", "tentative"]);

function normalizeInvitePartstat(v: string | null): InvitePartstat | null {
  const s = (v ?? "").toLowerCase();
  return INVITE_PARTSTATS.has(s as InvitePartstat) ? (s as InvitePartstat) : null;
}

function isCalendarAttachment(att: Pick<InviteAttachment, "contentType" | "filename">): boolean {
  const ct = att.contentType?.toLowerCase() ?? "";
  const name = att.filename?.toLowerCase() ?? "";
  return ct.includes("text/calendar") || name.endsWith(".ics");
}

async function readCalendarInvites(
  db: Database,
  bucket: Bindings["RAW_EMAILS"],
  user: { id: string; email: string },
  atts: InviteAttachment[],
): Promise<CalendarInvitePreview[]> {
  const inviteDrafts: (Omit<CalendarInvitePreview, "eventId" | "myPartstat"> & {
    uidKey: string | null;
    fallbackPartstat: InvitePartstat | null;
  })[] = [];
  const uidKeys = new Set<string>();
  const me = user.email.toLowerCase();

  for (const att of atts.filter(isCalendarAttachment)) {
    if (!att.r2ObjectKey) continue;
    const obj = await bucket.get(att.r2ObjectKey);
    if (!obj) continue;
    const text = await obj.text();
    const parsed = parseIcs(text);
    if (!parsed) continue;

    const fallback =
      normalizeInvitePartstat(
        parsed.attendees.find((a) => a.email.toLowerCase() === me)?.partstat ?? null,
      ) ?? "needs-action";
    const uidKey = parsed.uid ?? null;
    if (uidKey) uidKeys.add(uidKey);

    inviteDrafts.push({
      attachmentId: att.id,
      filename: att.filename,
      method: parsed.method,
      uid: parsed.uid,
      uidKey,
      summary: parsed.summary,
      description: parsed.description,
      location: parsed.location,
      startsAt: parsed.dtstart ? parsed.dtstart.toISOString() : null,
      endsAt: parsed.dtend ? parsed.dtend.toISOString() : null,
      allDay: parsed.allDay,
      organizer: parsed.organizer,
      fallbackPartstat: fallback,
    });
  }

  if (!inviteDrafts.length) return [];

  const eventByUid = new Map<string, { id: string; partstat: InvitePartstat | null }>();
  if (uidKeys.size) {
    const rows = await db
      .select({
        id: calendarEvents.id,
        uid: calendarEvents.uid,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, user.id),
          inArray(calendarEvents.uid, [...uidKeys]),
        ),
      )
      .orderBy(desc(calendarEvents.sequence), desc(calendarEvents.updatedAt));
    const eventIds = rows.map((r) => r.id);
    let partstatByEvent = new Map<string, InvitePartstat>();
    if (eventIds.length) {
      const attendeeRows = await db
        .select({
          eventId: eventAttendees.eventId,
          partstat: eventAttendees.partstat,
          userId: eventAttendees.userId,
          email: eventAttendees.email,
        })
        .from(eventAttendees)
        .where(
          and(
            inArray(eventAttendees.eventId, eventIds),
            or(
              eq(eventAttendees.userId, user.id),
              sql`lower(${eventAttendees.email}) = ${me}`,
            ),
          ),
        );
      for (const row of attendeeRows) {
        const part = normalizeInvitePartstat(row.partstat);
        if (!part) continue;
        const existing = partstatByEvent.get(row.eventId);
        if (!existing || row.userId === user.id) partstatByEvent.set(row.eventId, part);
      }
    }
    for (const row of rows) {
      if (eventByUid.has(row.uid)) continue;
      eventByUid.set(row.uid, { id: row.id, partstat: partstatByEvent.get(row.id) ?? null });
    }
  }

  return inviteDrafts.map((inv) => {
    const linked = inv.uidKey ? eventByUid.get(inv.uidKey) : null;
    return {
      attachmentId: inv.attachmentId,
      filename: inv.filename,
      method: inv.method,
      uid: inv.uid,
      summary: inv.summary,
      description: inv.description,
      location: inv.location,
      startsAt: inv.startsAt,
      endsAt: inv.endsAt,
      allDay: inv.allDay,
      organizer: inv.organizer,
      myPartstat: linked?.partstat ?? inv.fallbackPartstat,
      eventId: linked?.id ?? null,
    };
  });
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
  fromName: messages.fromName,
  toAddresses: messages.toAddresses,
  subject: messages.subject,
  snippet: messages.snippet,
  isRead: messages.isRead,
  isStarred: messages.isStarred,
  folder: messages.folder,
  sizeBytes: messages.sizeBytes,
  receivedAt: messages.receivedAt,
  sentAt: messages.sentAt,
  scheduledAt: messages.scheduledAt,
  sendStatus: messages.sendStatus,
  sendError: messages.sendError,
  createdAt: messages.createdAt,
  hasAttachments: sql<boolean>`
    exists (
      select 1
      from attachments a
      where a.message_id = ${messages.id}
    )
  `,
  hasCalendarInvite: sql<boolean>`
    exists (
      select 1
      from attachments a
      where a.message_id = ${messages.id}
        and (
          lower(coalesce(a.content_type, '')) like '%text/calendar%'
          or lower(coalesce(a.filename, '')) like '%.ics'
        )
    )
  `,
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

    const ids = await scopeIds(db, user.id, addressId);
    if (!ids?.length) return c.json({ items: [], total: 0 });

    const conds = [inArray(messages.addressId, ids)];
    if (folder === "starred") {
      conds.push(eq(messages.isStarred, true), notInArray(messages.folder, ["trash", "scheduled"]));
    } else if (folder === "all") {
      // 「全部邮件」：除回收站、草稿、定时外的所有已发生邮件（收件箱/已发/归档）
      conds.push(notInArray(messages.folder, ["trash", "draft", "scheduled"]));
    } else {
      conds.push(eq(messages.folder, folder));
    }
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
        .orderBy(folder === "scheduled" ? asc(messages.scheduledAt) : desc(messages.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ n: sql<number>`count(*)::int` }).from(messages).where(where),
    ]);
    return c.json({ items, total: totalRow[0]?.n ?? 0 });
  })

  /** 各文件夹「未读」计数（按选中账号作用域）；侧栏只显示未读，不显示全部数量 */
  .get("/counts", async (c) => {
    const db = c.var.db;
    const ids = await scopeIds(db, c.var.user!.id, c.req.query("addressId"));
    const empty = {
      inbox: 0,
      sent: 0,
      draft: 0,
      scheduled: 0,
      trash: 0,
      archive: 0,
      starred: 0,
      all: 0,
    };
    if (!ids?.length) return c.json(empty);

    const rows = await db
      .select({
        folder: messages.folder,
        unread: sql<number>`sum(case when ${messages.isRead} = false then 1 else 0 end)::int`,
      })
      .from(messages)
      .where(inArray(messages.addressId, ids))
      .groupBy(messages.folder);

    const out = { ...empty };
    for (const r of rows) {
      if (r.folder in out) (out as Record<string, number>)[r.folder] = r.unread ?? 0;
      // 「全部邮件」：除回收站、草稿、定时外的未读累加
      if (r.folder !== "trash" && r.folder !== "draft" && r.folder !== "scheduled") {
        out.all += r.unread ?? 0;
      }
    }
    // 星标未读（排除回收站）
    out.starred = await db.$count(
      messages,
      and(
        inArray(messages.addressId, ids),
        eq(messages.isStarred, true),
        eq(messages.isRead, false),
        notInArray(messages.folder, ["trash", "scheduled"]),
      ),
    );
    return c.json(out);
  })

  /** 新邮件轮询：返回 since 之后到达的入站邮件（跨可访问地址），用于 web 通知 */
  .get("/new", async (c) => {
    const db = c.var.db;
    const now = new Date();
    const ids = await readableAddressIds(db, c.var.user!.id);
    if (!ids.length) return c.json({ items: [], now: now.toISOString() });
    const sinceStr = c.req.query("since");
    const since = sinceStr ? new Date(sinceStr) : now;

    const items = await db
      .select({
        id: messages.id,
        addressId: messages.addressId,
        fromAddress: messages.fromAddress,
        fromName: messages.fromName,
        subject: messages.subject,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          inArray(messages.addressId, ids),
          eq(messages.direction, "inbound"),
          eq(messages.folder, "inbox"),
          gt(messages.createdAt, since),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(20);
    return c.json({ items, now: now.toISOString() });
  })

  /**
   * 高级搜索：多条件组合，跨可访问地址。
   * 支持 q / from / to / subject / participant（与某人往来）/ hasAttachment /
   * unread / starred / dateFrom / dateTo / folder（不传或 all=除草稿、定时与回收站外全部）。
   * 返回 {items,total}，字段与列表一致，前端可直接复用渲染。
   */
  .get("/search", async (c) => {
    const db = c.var.db;
    const user = c.var.user!;
    const query = c.req.query();
    const limit = Math.min(Number(query.limit ?? 50), 100);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    const ids = await scopeIds(db, user.id, query.addressId);
    if (!ids?.length) return c.json({ items: [], total: 0 });

    const conds = [inArray(messages.addressId, ids)];

    const folder = query.folder?.trim();
    if (folder && folder !== "all") conds.push(eq(messages.folder, folder));
    else conds.push(notInArray(messages.folder, ["draft", "scheduled", "trash"]));

    const like = (s: string) => `%${s.trim()}%`;

    if (query.q?.trim()) {
      const l = like(query.q);
      conds.push(
        or(
          ilike(messages.subject, l),
          ilike(messages.snippet, l),
          ilike(messages.fromAddress, l),
          sql`${messages.toAddresses}::text ilike ${l}`,
        )!,
      );
    }
    if (query.from?.trim()) conds.push(ilike(messages.fromAddress, like(query.from)));
    if (query.to?.trim()) conds.push(sql`${messages.toAddresses}::text ilike ${like(query.to)}`);
    if (query.subject?.trim()) conds.push(ilike(messages.subject, like(query.subject)));
    if (query.participant?.trim()) {
      // 与某人往来：对方是发件人，或对方在收件人/抄送里（引号界定完整地址）
      const p = query.participant.trim();
      const inList = `%"${p}"%`;
      conds.push(
        or(
          ilike(messages.fromAddress, p),
          sql`${messages.toAddresses}::text ilike ${inList}`,
          sql`${messages.ccAddresses}::text ilike ${inList}`,
        )!,
      );
    }
    if (query.hasAttachment === "1") {
      conds.push(sql`exists (select 1 from attachments a where a.message_id = ${messages.id})`);
    }
    if (query.unread === "1") conds.push(eq(messages.isRead, false));
    if (query.starred === "1") conds.push(eq(messages.isStarred, true));
    if (query.dateFrom) {
      const d = new Date(query.dateFrom);
      if (!Number.isNaN(d.getTime())) conds.push(gte(messages.createdAt, d));
    }
    if (query.dateTo) {
      const d = new Date(query.dateTo);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        conds.push(lte(messages.createdAt, d));
      }
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

  /** 批量操作：勾选多封后一次性归档/删除/移回收件箱/标记（仅限本人邮件） */
  .post("/bulk", zValidator("json", bulkActionSchema), async (c) => {
    const db = c.var.db;
    const ids = await readableAddressIds(db, c.var.user!.id);
    if (!ids.length) return c.json({ ok: true, affected: 0 });
    const { ids: msgIds, action } = c.req.valid("json");

    const patch: Record<string, unknown> = {};
    switch (action) {
      case "archive":
        patch.folder = "archive";
        break;
      case "trash":
        patch.folder = "trash";
        patch.isStarred = false;
        break;
      case "inbox":
        patch.folder = "inbox";
        break;
      case "read":
        patch.isRead = true;
        break;
      case "unread":
        patch.isRead = false;
        break;
      case "star":
        patch.isStarred = true;
        break;
      case "unstar":
        patch.isStarred = false;
        break;
    }

    const rows = await db
      .update(messages)
      .set(patch)
      .where(and(inArray(messages.id, msgIds), inArray(messages.addressId, ids)))
      .returning({ id: messages.id });
    return c.json({ ok: true, affected: rows.length });
  })

  /** 导出邮箱为 .mbox（收件箱 + 已发） */
  .get("/export", async (c) => {
    const db = c.var.db;
    const ids = await readableAddressIds(db, c.var.user!.id);
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
    try {
      const msg = await sendUserMessage(c.var.db, c.env, c.var.user!, c.req.valid("json"));
      return c.json(msg, 201);
    } catch (err) {
      if (err instanceof OutboundMailError) return c.json({ error: err.message }, err.status);
      return c.json({ error: err instanceof Error ? err.message : "发送失败" }, 502);
    }
  })

  /** 定时发送：保存完整出站内容，由 Cron 到点发送 */
  .post("/schedule", zValidator("json", scheduleMessageSchema), async (c) => {
    try {
      const msg = await scheduleUserMessage(c.var.db, c.env, c.var.user!, c.req.valid("json"));
      return c.json(msg, 201);
    } catch (err) {
      if (err instanceof OutboundMailError) return c.json({ error: err.message }, err.status);
      return c.json({ error: err instanceof Error ? err.message : "定时发送失败" }, 502);
    }
  })

  /** 保存草稿（新建或更新） */
  .post("/draft", zValidator("json", saveDraftSchema), async (c) => {
    const db = c.var.db;
    const user = c.var.user!;
    const b = c.req.valid("json");
    if (b.html) b.html = sanitizeOutboundHtml(b.html);

    const from = await db.query.emailAddresses.findFirst({
      where: eq(emailAddresses.id, b.fromAddressId),
    });
    const draftable = await sendableAddressIds(db, user.id);
    if (!from || !draftable.includes(from.id)) return c.json({ error: "发件地址无效" }, 422);

    const values = {
      addressId: from.id,
      fromAddress: from.address,
      fromName: from.senderName || user.name,
      toAddresses: b.to ?? [],
      ccAddresses: b.cc ?? [],
      bccAddresses: b.bcc ?? [],
      subject: b.subject ?? null,
      snippet: makeSnippet(b.text, b.html),
      bodyText: b.text ?? null,
      bodyHtml: b.html ?? null,
    };

    if (b.id) {
      const row = await accessibleMessage(db, user.id, b.id);
      if (!row || row.m.folder !== "draft") return c.json({ error: "草稿不存在" }, 404);
      await db.update(messages).set(values).where(eq(messages.id, b.id));
      return c.json({ id: b.id });
    }
    const [m] = await db
      .insert(messages)
      .values({ ...values, direction: "outbound", folder: "draft", isRead: true, sendStatus: "draft" })
      .returning();
    return c.json({ id: m!.id }, 201);
  })

  /** 模拟入站（开发/自测用，仅本人邮箱） */
  .post("/simulate-inbound", zValidator("json", simulateSchema), async (c) => {
    const db = c.var.db;
    const user = c.var.user!;
    const { addressId, to, raw } = c.req.valid("json");

    const accessible = await readableAddressIds(db, user.id);
    let envelopeTo = to;
    if (!envelopeTo && addressId) {
      const addr = await db.query.emailAddresses.findFirst({
        where: eq(emailAddresses.id, addressId),
      });
      if (!addr || !accessible.includes(addr.id)) {
        return c.json({ error: "地址无效或不属于你" }, 422);
      }
      envelopeTo = addr.address;
    }
    if (!envelopeTo) return c.json({ error: "缺少收件地址" }, 422);

    // 解析投递目标，且必须为当前用户可访问的地址（防止注入他人邮箱）
    const target = await resolveDelivery(db, envelopeTo.toLowerCase());
    if (!target || !accessible.includes(target.id)) {
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
    const me = c.var.user!;
    const row = await accessibleMessage(db, me.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);
    const atts = await db
      .select({
        id: attachments.id,
        filename: attachments.filename,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
        contentId: attachments.contentId,
        r2ObjectKey: attachments.r2ObjectKey,
      })
      .from(attachments)
      .where(eq(attachments.messageId, row.m.id));
    const calendarInvites = await readCalendarInvites(db, c.env.RAW_EMAILS, me, atts);
    return c.json({
      ...row.m,
      attachments: atts.map(({ r2ObjectKey: _k, ...rest }) => rest),
      calendarInvites,
    });
  })

  /** 会话线程：同一对话内的邮件（按线程头聚合） */
  .get("/:id/thread", async (c) => {
    const db = c.var.db;
    const row = await accessibleMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);
    const m = row.m;

    const chain = new Set<string>();
    if (m.messageId) chain.add(m.messageId);
    if (m.inReplyTo) chain.add(m.inReplyTo);
    for (const r of (m.references ?? "").split(/\s+/).filter(Boolean)) chain.add(r);

    const ids = await readableAddressIds(db, c.var.user!.id);
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
        fromName: messages.fromName,
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
    const row = await accessibleMessage(db, c.var.user!.id, c.req.param("id"));
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
    const row = await accessibleMessage(db, c.var.user!.id, c.req.param("id"));
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
    const row = await accessibleMessage(db, c.var.user!.id, c.req.param("id"));
    if (!row) return c.json({ error: "邮件不存在" }, 404);
    await db.update(messages).set(c.req.valid("json")).where(eq(messages.id, row.m.id));
    return c.json({ ok: true });
  })

  /** 删除：非回收站→移入回收站；回收站内→永久删除并清理 R2 */
  .delete("/:id", async (c) => {
    const db = c.var.db;
    const row = await accessibleMessage(db, c.var.user!.id, c.req.param("id"));
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
