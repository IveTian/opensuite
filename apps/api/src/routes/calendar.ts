import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  calendarEvents,
  calendarMembers,
  calendars,
  departments,
  directoryProfiles,
  emailAddresses,
  eventAttendees,
  user,
} from "@mailflare/db";
import type { Database } from "@mailflare/db";
import {
  createCalendarSchema,
  createEventSchema,
  rsvpSchema,
  shareCalendarSchema,
  updateCalendarSchema,
  updateEventSchema,
  type Calendar,
  type CalendarEvent,
  type CalendarMember,
  type CalendarMemberRole,
  type EventAttendee,
  type EventReminder,
  type EventStatus,
} from "@mailflare/shared";
import type { AppEnv } from "../env.js";
import { expandOccurrences, type IcsAttendee, type Occurrence } from "../lib/ical.js";
import { sendCalendarIcs, toIcsEvent } from "../lib/calendar-mail.js";
import { loadUser, requireAuth } from "../middleware/auth.js";

// ------------------------- 权限 -------------------------

const ROLE_RANK: Record<CalendarMemberRole, number> = { viewer: 1, editor: 2, owner: 3 };
const RANK_ROLE: CalendarMemberRole[] = ["viewer", "editor", "owner"];
function rankToRole(rank: number): CalendarMemberRole {
  return RANK_ROLE[Math.min(3, Math.max(1, rank)) - 1]!;
}

type CalendarRow = typeof calendars.$inferSelect;

/** 计算某用户对某日历的有效角色（拥有者 / 部门成员 / 显式共享 取最高），无权返回 null */
async function resolveRole(
  db: Database,
  userId: string,
  cal: CalendarRow,
  deptId?: string | null,
): Promise<CalendarMemberRole | null> {
  let rank = 0;
  if (cal.ownerUserId === userId) rank = 3;
  if (cal.type === "department" && cal.departmentId) {
    const d =
      deptId !== undefined
        ? deptId
        : (
            await db.query.directoryProfiles.findFirst({
              where: eq(directoryProfiles.userId, userId),
            })
          )?.departmentId ?? null;
    if (d && d === cal.departmentId) rank = Math.max(rank, ROLE_RANK.editor);
  }
  const mem = await db.query.calendarMembers.findFirst({
    where: and(eq(calendarMembers.calendarId, cal.id), eq(calendarMembers.userId, userId)),
  });
  if (mem) rank = Math.max(rank, ROLE_RANK[mem.role as CalendarMemberRole] ?? 0);
  return rank > 0 ? rankToRole(rank) : null;
}

interface AccessibleCalendar {
  cal: CalendarRow & { departmentName: string | null };
  role: CalendarMemberRole;
}

/** 列出用户可见的全部日历（拥有 + 部门 + 显式共享），并标注有效角色 */
async function listAccessibleCalendars(
  db: Database,
  userId: string,
): Promise<AccessibleCalendar[]> {
  const prof = await db.query.directoryProfiles.findFirst({
    where: eq(directoryProfiles.userId, userId),
  });
  const deptId = prof?.departmentId ?? null;

  const memberRows = await db
    .select({ calendarId: calendarMembers.calendarId, role: calendarMembers.role })
    .from(calendarMembers)
    .where(eq(calendarMembers.userId, userId));
  const memberMap = new Map(memberRows.map((m) => [m.calendarId, m.role as CalendarMemberRole]));

  const conds = [eq(calendars.ownerUserId, userId)];
  if (deptId) {
    conds.push(and(eq(calendars.type, "department"), eq(calendars.departmentId, deptId))!);
  }
  if (memberMap.size) conds.push(inArray(calendars.id, [...memberMap.keys()]));

  const rows = await db
    .select({
      id: calendars.id,
      name: calendars.name,
      color: calendars.color,
      type: calendars.type,
      ownerUserId: calendars.ownerUserId,
      departmentId: calendars.departmentId,
      isDefault: calendars.isDefault,
      isVisible: calendars.isVisible,
      createdAt: calendars.createdAt,
      updatedAt: calendars.updatedAt,
      departmentName: departments.name,
    })
    .from(calendars)
    .leftJoin(departments, eq(departments.id, calendars.departmentId))
    .where(or(...conds));

  const out: AccessibleCalendar[] = [];
  for (const r of rows) {
    let rank = 0;
    if (r.ownerUserId === userId) rank = 3;
    if (r.type === "department" && r.departmentId && r.departmentId === deptId) {
      rank = Math.max(rank, ROLE_RANK.editor);
    }
    const mr = memberMap.get(r.id);
    if (mr) rank = Math.max(rank, ROLE_RANK[mr] ?? 0);
    if (rank > 0) out.push({ cal: r as AccessibleCalendar["cal"], role: rankToRole(rank) });
  }
  return out;
}

/** 懒创建默认个人日历（用户首次访问时） */
async function ensureDefaultCalendar(db: Database, userId: string): Promise<void> {
  const existing = await db.query.calendars.findFirst({
    where: and(eq(calendars.ownerUserId, userId), eq(calendars.type, "personal")),
  });
  if (existing) return;
  await db
    .insert(calendars)
    .values({
      name: "我的日历",
      color: "#7c3aed",
      type: "personal",
      ownerUserId: userId,
      isDefault: true,
    });
}

/** 用户主发信地址（.ics 组织者身份），无 mailbox 时回退登录邮箱 */
async function primaryAddress(
  db: Database,
  userId: string,
  fallbackEmail: string,
  fallbackName: string,
): Promise<{ email: string; name: string }> {
  const rows = await db
    .select({
      address: emailAddresses.address,
      senderName: emailAddresses.senderName,
      isPrimary: emailAddresses.isPrimary,
    })
    .from(emailAddresses)
    .where(
      and(
        eq(emailAddresses.userId, userId),
        eq(emailAddresses.status, "active"),
        eq(emailAddresses.type, "mailbox"),
      ),
    );
  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  return {
    email: primary?.address ?? fallbackEmail,
    name: primary?.senderName ?? fallbackName,
  };
}

// ------------------------- DTO 映射 -------------------------

function toCalendarDto(
  cal: CalendarRow & { departmentName: string | null },
  role: CalendarMemberRole,
): Calendar {
  return {
    id: cal.id,
    name: cal.name,
    color: cal.color,
    type: cal.type as Calendar["type"],
    ownerUserId: cal.ownerUserId,
    departmentId: cal.departmentId,
    departmentName: cal.departmentName,
    isDefault: cal.isDefault,
    isVisible: cal.isVisible,
    role,
  };
}

type EventRow = typeof calendarEvents.$inferSelect;
type AttendeeRow = typeof eventAttendees.$inferSelect;

function toAttendeeDto(a: AttendeeRow): EventAttendee {
  return {
    id: a.id,
    userId: a.userId,
    email: a.email,
    displayName: a.displayName,
    role: a.role as EventAttendee["role"],
    isOrganizer: a.isOrganizer,
    partstat: a.partstat as EventAttendee["partstat"],
    respondedAt: a.respondedAt ? a.respondedAt.toISOString() : null,
  };
}

function toEventInstance(r: EventRow, occ: Occurrence, attendees?: EventAttendee[]): CalendarEvent {
  return {
    id: r.id,
    calendarId: r.calendarId,
    uid: r.uid,
    title: r.title,
    description: r.description,
    location: r.location,
    color: r.color,
    allDay: r.allDay,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    timezone: r.timezone,
    rrule: r.rrule,
    status: r.status as EventStatus,
    sequence: r.sequence,
    organizerEmail: r.organizerEmail,
    reminders: (r.reminders ?? []) as EventReminder[],
    attendees,
    occurrenceStart: occ.start.toISOString(),
    occurrenceEnd: occ.end.toISOString(),
    isRecurring: Boolean(r.rrule) || Boolean(r.recurrenceId),
  };
}

// ------------------------- 事件写入助手 -------------------------

/** RRULE 字符串去掉 COUNT/UNTIL 后追加 UNTIL=<utc>（用于 following 拆分） */
function setRruleUntil(rrule: string, until: Date): string {
  const parts = rrule
    .replace(/^RRULE:/i, "")
    .split(";")
    .filter((p) => p && !/^COUNT=/i.test(p) && !/^UNTIL=/i.test(p));
  const u = until.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  parts.push(`UNTIL=${u}`);
  return parts.join(";");
}

/** 把参与者输入 + 组织者拼成插入行 */
function buildAttendeeRows(
  eventId: string,
  organizer: { userId: string; email: string; name: string },
  attendees: { email: string; displayName?: string | null; userId?: string | null; role: string }[],
): (typeof eventAttendees.$inferInsert)[] {
  const rows: (typeof eventAttendees.$inferInsert)[] = [
    {
      eventId,
      userId: organizer.userId,
      email: organizer.email,
      displayName: organizer.name,
      role: "required",
      isOrganizer: true,
      partstat: "accepted",
      respondedAt: new Date(),
    },
  ];
  for (const a of attendees) {
    if (a.email === organizer.email) continue;
    rows.push({
      eventId,
      userId: a.userId ?? null,
      email: a.email,
      displayName: a.displayName ?? null,
      role: a.role,
      isOrganizer: false,
      partstat: "needs-action",
    });
  }
  return rows;
}

function attendeesToIcs(rows: AttendeeRow[]): IcsAttendee[] {
  return rows
    .filter((a) => !a.isOrganizer)
    .map((a) => ({
      email: a.email,
      displayName: a.displayName,
      role: a.role,
      partstat: a.partstat,
    }));
}

// ------------------------- 路由 -------------------------

/** 日历：日历本 + 事件（RRULE 展开）+ 参与者 RSVP + 共享。需登录 */
export const calendarRoutes = new Hono<AppEnv>()
  .use("*", loadUser, requireAuth)

  // ---------- 日历本 ----------

  .get("/calendars", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    await ensureDefaultCalendar(db, u.id);
    const list = await listAccessibleCalendars(db, u.id);
    return c.json(list.map((x) => toCalendarDto(x.cal, x.role)));
  })

  .post("/calendars", zValidator("json", createCalendarSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const v = c.req.valid("json");

    if (v.type === "department") {
      if (!v.departmentId) return c.json({ error: "部门日历需指定部门" }, 422);
      const prof = await db.query.directoryProfiles.findFirst({
        where: eq(directoryProfiles.userId, u.id),
      });
      if (u.role !== "admin" && prof?.departmentId !== v.departmentId) {
        return c.json({ error: "无权在该部门创建日历" }, 403);
      }
    }

    const [row] = await db
      .insert(calendars)
      .values({
        name: v.name,
        color: v.color ?? null,
        type: v.type,
        ownerUserId: u.id,
        departmentId: v.type === "department" ? v.departmentId! : null,
      })
      .returning();

    const dept = row!.departmentId
      ? await db.query.departments.findFirst({ where: eq(departments.id, row!.departmentId) })
      : null;
    return c.json(toCalendarDto({ ...row!, departmentName: dept?.name ?? null }, "owner"), 201);
  })

  .patch("/calendars/:id", zValidator("json", updateCalendarSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const v = c.req.valid("json");
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, id) });
    if (!cal) return c.json({ error: "日历不存在" }, 404);
    const role = await resolveRole(db, u.id, cal);
    if (!role || ROLE_RANK[role] < ROLE_RANK.editor) return c.json({ error: "无权修改" }, 403);

    const patch: Partial<typeof calendars.$inferInsert> = { updatedAt: new Date() };
    if (v.name !== undefined) patch.name = v.name;
    if (v.color !== undefined) patch.color = v.color ?? null;
    if (v.isVisible !== undefined) patch.isVisible = v.isVisible;
    const [row] = await db.update(calendars).set(patch).where(eq(calendars.id, id)).returning();
    const dept = row!.departmentId
      ? await db.query.departments.findFirst({ where: eq(departments.id, row!.departmentId) })
      : null;
    return c.json(toCalendarDto({ ...row!, departmentName: dept?.name ?? null }, role));
  })

  .delete("/calendars/:id", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, id) });
    if (!cal) return c.json({ error: "日历不存在" }, 404);
    const role = await resolveRole(db, u.id, cal);
    if (role !== "owner") return c.json({ error: "仅拥有者可删除" }, 403);
    if (cal.isDefault && cal.type === "personal") {
      return c.json({ error: "默认日历不可删除" }, 422);
    }
    await db.delete(calendars).where(eq(calendars.id, id));
    return c.json({ ok: true });
  })

  // ---------- 共享成员 ----------

  .get("/calendars/:id/members", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, id) });
    if (!cal) return c.json({ error: "日历不存在" }, 404);
    if (!(await resolveRole(db, u.id, cal))) return c.json({ error: "无权访问" }, 403);
    const rows = await db
      .select({
        userId: calendarMembers.userId,
        role: calendarMembers.role,
        name: user.name,
        email: user.email,
      })
      .from(calendarMembers)
      .innerJoin(user, eq(user.id, calendarMembers.userId))
      .where(eq(calendarMembers.calendarId, id));
    return c.json(
      rows.map(
        (r): CalendarMember => ({
          userId: r.userId,
          name: r.name,
          email: r.email,
          role: r.role as CalendarMemberRole,
        }),
      ),
    );
  })

  .post("/calendars/:id/members", zValidator("json", shareCalendarSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const v = c.req.valid("json");
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, id) });
    if (!cal) return c.json({ error: "日历不存在" }, 404);
    if ((await resolveRole(db, u.id, cal)) !== "owner") return c.json({ error: "仅拥有者可共享" }, 403);
    await db
      .insert(calendarMembers)
      .values({ calendarId: id, userId: v.userId, role: v.role })
      .onConflictDoUpdate({
        target: [calendarMembers.calendarId, calendarMembers.userId],
        set: { role: v.role },
      });
    return c.json({ ok: true }, 201);
  })

  .delete("/calendars/:id/members/:userId", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const memberId = c.req.param("userId");
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, id) });
    if (!cal) return c.json({ error: "日历不存在" }, 404);
    if ((await resolveRole(db, u.id, cal)) !== "owner") return c.json({ error: "仅拥有者可修改" }, 403);
    await db
      .delete(calendarMembers)
      .where(and(eq(calendarMembers.calendarId, id), eq(calendarMembers.userId, memberId)));
    return c.json({ ok: true });
  })

  // ---------- 事件 ----------

  /** 展开重复为实例返回。必带 from/to（ISO），可选 calendarId 过滤 */
  .get("/events", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    const from = fromStr ? new Date(fromStr) : null;
    const to = toStr ? new Date(toStr) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return c.json({ error: "需提供有效的 from/to" }, 422);
    }

    const accessible = await listAccessibleCalendars(db, u.id);
    let calIds = accessible.map((a) => a.cal.id);
    const calId = c.req.query("calendarId");
    if (calId) {
      if (!calIds.includes(calId)) return c.json([] satisfies CalendarEvent[]);
      calIds = [calId];
    }
    if (!calIds.length) return c.json([] satisfies CalendarEvent[]);

    const rows = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          inArray(calendarEvents.calendarId, calIds),
          ne(calendarEvents.status, "cancelled"),
          or(
            isNotNull(calendarEvents.rrule),
            and(lt(calendarEvents.startsAt, to), gt(calendarEvents.endsAt, from)),
          ),
        ),
      );

    const out: CalendarEvent[] = [];
    for (const r of rows) {
      const occs = expandOccurrences(
        {
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          timezone: r.timezone,
          rrule: r.rrule,
          exdates: r.exdates,
          allDay: r.allDay,
        },
        from,
        to,
      );
      for (const o of occs) out.push(toEventInstance(r, o));
    }
    return c.json(out);
  })

  /** 单个事件（含参与者），用于详情/编辑 */
  .get("/events/:id", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const ev = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, id) });
    if (!ev) return c.json({ error: "事件不存在" }, 404);
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, ev.calendarId) });
    if (!cal || !(await resolveRole(db, u.id, cal))) return c.json({ error: "无权访问" }, 403);
    const atts = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, id));
    return c.json(
      toEventInstance(ev, { start: ev.startsAt, end: ev.endsAt }, atts.map(toAttendeeDto)),
    );
  })

  .post("/events", zValidator("json", createEventSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const v = c.req.valid("json");

    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, v.calendarId) });
    if (!cal) return c.json({ error: "日历不存在" }, 422);
    const role = await resolveRole(db, u.id, cal);
    if (!role || ROLE_RANK[role] < ROLE_RANK.editor) return c.json({ error: "无权在此日历新建事件" }, 403);

    const org = await primaryAddress(db, u.id, u.email, u.name);
    const domain = org.email.split("@")[1] ?? "mailflare";
    const uid = `${crypto.randomUUID()}@${domain}`;

    const [ev] = await db
      .insert(calendarEvents)
      .values({
        calendarId: v.calendarId,
        userId: u.id,
        uid,
        title: v.title,
        description: v.description ?? null,
        location: v.location ?? null,
        color: v.color ?? null,
        allDay: v.allDay,
        startsAt: new Date(v.startsAt),
        endsAt: new Date(v.endsAt),
        timezone: v.timezone,
        rrule: v.rrule ?? null,
        status: v.status,
        sequence: 0,
        organizerEmail: org.email,
        reminders: v.reminders,
      })
      .returning();

    const attRows = buildAttendeeRows(
      ev!.id,
      { userId: u.id, email: org.email, name: org.name },
      v.attendees,
    );
    await db.insert(eventAttendees).values(attRows).onConflictDoNothing();
    const atts = await db.select().from(eventAttendees).where(eq(eventAttendees.eventId, ev!.id));

    // 发送 .ics 邀请（有外部/其他参与者时）
    const externalTo = atts.filter((a) => !a.isOrganizer).map((a) => a.email);
    if (v.sendInvites && externalTo.length) {
      c.executionCtx.waitUntil(
        sendCalendarIcs(c.env, {
          event: toIcsEvent(ev!, { email: org.email, name: org.name }),
          attendees: attendeesToIcs(atts),
          method: "REQUEST",
          from: { address: org.email, name: org.name },
          to: externalTo,
          now: new Date(),
        }),
      );
    }

    return c.json(
      toEventInstance(ev!, { start: ev!.startsAt, end: ev!.endsAt }, atts.map(toAttendeeDto)),
      201,
    );
  })

  .patch("/events/:id", zValidator("json", updateEventSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const v = c.req.valid("json");

    const ev = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, id) });
    if (!ev) return c.json({ error: "事件不存在" }, 404);
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, ev.calendarId) });
    if (!cal) return c.json({ error: "日历不存在" }, 404);
    const role = await resolveRole(db, u.id, cal);
    if (!role || ROLE_RANK[role] < ROLE_RANK.editor) return c.json({ error: "无权修改" }, 403);

    const patch: Partial<typeof calendarEvents.$inferInsert> = {};
    if (v.title !== undefined) patch.title = v.title;
    if (v.description !== undefined) patch.description = v.description ?? null;
    if (v.location !== undefined) patch.location = v.location ?? null;
    if (v.color !== undefined) patch.color = v.color ?? null;
    if (v.allDay !== undefined) patch.allDay = v.allDay;
    if (v.startsAt !== undefined) patch.startsAt = new Date(v.startsAt);
    if (v.endsAt !== undefined) patch.endsAt = new Date(v.endsAt);
    if (v.timezone !== undefined) patch.timezone = v.timezone;
    if (v.rrule !== undefined) patch.rrule = v.rrule ?? null;
    if (v.status !== undefined) patch.status = v.status;
    if (v.calendarId !== undefined) patch.calendarId = v.calendarId;
    if (v.reminders !== undefined) patch.reminders = v.reminders;

    const occStart = v.occurrenceStart ? new Date(v.occurrenceStart) : null;
    const durationMs = ev.endsAt.getTime() - ev.startsAt.getTime();

    // scope=this / following 仅对重复事件有意义
    if (ev.rrule && occStart && v.scope === "this") {
      // 主事件加 exdate，另建 override 单次
      const exdates = [...(ev.exdates ?? []), occStart.toISOString()];
      await db
        .update(calendarEvents)
        .set({ exdates, updatedAt: new Date() })
        .where(eq(calendarEvents.id, id));
      const start = patch.startsAt ?? occStart;
      const end = patch.endsAt ?? new Date(start.getTime() + durationMs);
      const [override] = await db
        .insert(calendarEvents)
        .values({
          calendarId: patch.calendarId ?? ev.calendarId,
          userId: ev.userId,
          uid: ev.uid,
          title: patch.title ?? ev.title,
          description: patch.description !== undefined ? patch.description : ev.description,
          location: patch.location !== undefined ? patch.location : ev.location,
          color: patch.color !== undefined ? patch.color : ev.color,
          allDay: patch.allDay ?? ev.allDay,
          startsAt: start,
          endsAt: end,
          timezone: patch.timezone ?? ev.timezone,
          rrule: null,
          recurrenceId: occStart,
          status: patch.status ?? ev.status,
          sequence: ev.sequence + 1,
          organizerEmail: ev.organizerEmail,
          reminders: patch.reminders ?? ev.reminders,
        })
        .returning();
      // 复制参与者
      const masterAtts = await db
        .select()
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, id));
      if (masterAtts.length) {
        await db.insert(eventAttendees).values(
          masterAtts.map((a) => ({
            eventId: override!.id,
            userId: a.userId,
            email: a.email,
            displayName: a.displayName,
            role: a.role,
            isOrganizer: a.isOrganizer,
            partstat: a.partstat,
            respondedAt: a.respondedAt,
          })),
        );
      }
      const atts = await db
        .select()
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, override!.id));
      return c.json(
        toEventInstance(override!, { start: override!.startsAt, end: override!.endsAt }, atts.map(toAttendeeDto)),
      );
    }

    if (ev.rrule && occStart && v.scope === "following") {
      // 主事件截断到 occStart 之前，另建新系列
      const newMasterRrule = setRruleUntil(ev.rrule, new Date(occStart.getTime() - 1000));
      await db
        .update(calendarEvents)
        .set({ rrule: newMasterRrule, sequence: ev.sequence + 1, updatedAt: new Date() })
        .where(eq(calendarEvents.id, id));
      const org = await primaryAddress(db, u.id, u.email, u.name);
      const domain = (patch.organizerEmail ?? ev.organizerEmail ?? org.email).split("@")[1] ?? "mailflare";
      const start = patch.startsAt ?? occStart;
      const end = patch.endsAt ?? new Date(start.getTime() + durationMs);
      const [series] = await db
        .insert(calendarEvents)
        .values({
          calendarId: patch.calendarId ?? ev.calendarId,
          userId: ev.userId,
          uid: `${crypto.randomUUID()}@${domain}`,
          title: patch.title ?? ev.title,
          description: patch.description !== undefined ? patch.description : ev.description,
          location: patch.location !== undefined ? patch.location : ev.location,
          color: patch.color !== undefined ? patch.color : ev.color,
          allDay: patch.allDay ?? ev.allDay,
          startsAt: start,
          endsAt: end,
          timezone: patch.timezone ?? ev.timezone,
          rrule: patch.rrule !== undefined ? patch.rrule : ev.rrule,
          status: patch.status ?? ev.status,
          sequence: 0,
          organizerEmail: ev.organizerEmail,
          reminders: patch.reminders ?? ev.reminders,
        })
        .returning();
      const masterAtts = await db
        .select()
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, id));
      if (masterAtts.length) {
        await db.insert(eventAttendees).values(
          masterAtts.map((a) => ({
            eventId: series!.id,
            userId: a.userId,
            email: a.email,
            displayName: a.displayName,
            role: a.role,
            isOrganizer: a.isOrganizer,
            partstat: a.partstat,
            respondedAt: a.respondedAt,
          })),
        );
      }
      const atts = await db
        .select()
        .from(eventAttendees)
        .where(eq(eventAttendees.eventId, series!.id));
      return c.json(
        toEventInstance(series!, { start: series!.startsAt, end: series!.endsAt }, atts.map(toAttendeeDto)),
      );
    }

    // scope=all（或非重复事件）：直接改主事件，SEQUENCE +1
    patch.sequence = ev.sequence + 1;
    patch.updatedAt = new Date();
    const [row] = await db
      .update(calendarEvents)
      .set(patch)
      .where(eq(calendarEvents.id, id))
      .returning();

    // 替换参与者（若提供）
    if (v.attendees !== undefined) {
      const org = await primaryAddress(db, u.id, u.email, u.name);
      await db
        .delete(eventAttendees)
        .where(and(eq(eventAttendees.eventId, id), eq(eventAttendees.isOrganizer, false)));
      const newRows = buildAttendeeRows(
        id,
        { userId: u.id, email: org.email, name: org.name },
        v.attendees,
      ).filter((r) => !r.isOrganizer);
      if (newRows.length) await db.insert(eventAttendees).values(newRows).onConflictDoNothing();
    }

    const atts = await db.select().from(eventAttendees).where(eq(eventAttendees.eventId, id));
    // 重新发送更新邀请
    const externalTo = atts.filter((a) => !a.isOrganizer).map((a) => a.email);
    if (v.sendInvites !== false && externalTo.length && row!.organizerEmail) {
      c.executionCtx.waitUntil(
        sendCalendarIcs(c.env, {
          event: toIcsEvent(row!, {
            email: row!.organizerEmail,
            name: (await primaryAddress(db, u.id, u.email, u.name)).name,
          }),
          attendees: attendeesToIcs(atts),
          method: "REQUEST",
          from: { address: row!.organizerEmail, name: u.name },
          to: externalTo,
          now: new Date(),
        }),
      );
    }

    return c.json(
      toEventInstance(row!, { start: row!.startsAt, end: row!.endsAt }, atts.map(toAttendeeDto)),
    );
  })

  .delete("/events/:id", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const scope = c.req.query("scope") ?? "all";
    const occStr = c.req.query("occurrenceStart");
    const occStart = occStr ? new Date(occStr) : null;

    const ev = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, id) });
    if (!ev) return c.json({ error: "事件不存在" }, 404);
    const cal = await db.query.calendars.findFirst({ where: eq(calendars.id, ev.calendarId) });
    if (!cal) return c.json({ error: "日历不存在" }, 404);
    const role = await resolveRole(db, u.id, cal);
    if (!role || ROLE_RANK[role] < ROLE_RANK.editor) return c.json({ error: "无权删除" }, 403);

    if (ev.rrule && occStart && scope === "this") {
      const exdates = [...(ev.exdates ?? []), occStart.toISOString()];
      await db
        .update(calendarEvents)
        .set({ exdates, updatedAt: new Date() })
        .where(eq(calendarEvents.id, id));
      return c.json({ ok: true });
    }
    if (ev.rrule && occStart && scope === "following") {
      const newRrule = setRruleUntil(ev.rrule, new Date(occStart.getTime() - 1000));
      await db
        .update(calendarEvents)
        .set({ rrule: newRrule, updatedAt: new Date() })
        .where(eq(calendarEvents.id, id));
      return c.json({ ok: true });
    }

    // scope=all：发取消邀请后删除
    const atts = await db.select().from(eventAttendees).where(eq(eventAttendees.eventId, id));
    const externalTo = atts.filter((a) => !a.isOrganizer).map((a) => a.email);
    if (externalTo.length && ev.organizerEmail) {
      c.executionCtx.waitUntil(
        sendCalendarIcs(c.env, {
          event: toIcsEvent({ ...ev, sequence: ev.sequence + 1 }, {
            email: ev.organizerEmail,
            name: u.name,
          }),
          attendees: attendeesToIcs(atts),
          method: "CANCEL",
          from: { address: ev.organizerEmail, name: u.name },
          to: externalTo,
          now: new Date(),
        }),
      );
    }
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    // 同 uid 的 override 行一并删除
    await db.delete(calendarEvents).where(eq(calendarEvents.uid, ev.uid));
    return c.json({ ok: true });
  })

  /** 本人对事件回执（accepted/declined/tentative），并回 REPLY 给组织者 */
  .post("/events/:id/rsvp", zValidator("json", rsvpSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const v = c.req.valid("json");

    const ev = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, id) });
    if (!ev) return c.json({ error: "事件不存在" }, 404);

    // 找到本人的参与者行（按 userId，其次登录邮箱）
    const atts = await db.select().from(eventAttendees).where(eq(eventAttendees.eventId, id));
    const mine =
      atts.find((a) => a.userId === u.id) ??
      atts.find((a) => a.email.toLowerCase() === u.email.toLowerCase());
    if (!mine) return c.json({ error: "你不是该事件的参与者" }, 403);

    const [row] = await db
      .update(eventAttendees)
      .set({ partstat: v.partstat, respondedAt: new Date() })
      .where(eq(eventAttendees.id, mine.id))
      .returning();

    // 回 REPLY 给组织者
    if (ev.organizerEmail && ev.organizerEmail !== mine.email) {
      const org = await primaryAddress(db, u.id, u.email, u.name);
      c.executionCtx.waitUntil(
        sendCalendarIcs(c.env, {
          event: toIcsEvent(ev, { email: ev.organizerEmail, name: null }),
          attendees: [
            { email: mine.email, displayName: mine.displayName, partstat: v.partstat, role: mine.role },
          ],
          method: "REPLY",
          from: { address: org.email, name: org.name },
          to: [ev.organizerEmail],
          now: new Date(),
        }),
      );
    }

    return c.json(toAttendeeDto(row!));
  });
