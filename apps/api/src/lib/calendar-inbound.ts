import { and, eq } from "drizzle-orm";
import type { Email } from "postal-mime";
import { calendarEvents, calendars, eventAttendees } from "@mailflare/db";
import type { Database } from "@mailflare/db";
import { parseIcs, type ParsedIcs } from "./ical.js";
import { sharedMailboxRecipientUserIds } from "./mailbox-access.js";

/**
 * 入站 .ics 处理：从入站邮件的 text/calendar 附件解析 iCalendar，按 METHOD 分派：
 * - REPLY  ：参与者回执 → 按 uid + email 回写 partstat（组织者是我方用户）。
 * - REQUEST：外部/内部邀请 → 在收件用户默认日历建/更新事件（tentative）。
 * - CANCEL ：取消 → 按 uid 置 status=cancelled。
 *
 * 由 email() 处理器在邮件落库后调用。返回是否产生了日历改动（用于实时广播）。
 */

const PARTSTATS = new Set(["needs-action", "accepted", "declined", "tentative"]);
function normPartstat(v: string | null): string {
  const s = (v ?? "").toLowerCase();
  return PARTSTATS.has(s) ? s : "needs-action";
}

/** 从 postal-mime 附件取出 text/calendar 文本 */
function icsTexts(parsed: Email): string[] {
  const out: string[] = [];
  for (const att of parsed.attachments ?? []) {
    const isCal =
      (att.mimeType && att.mimeType.toLowerCase().includes("text/calendar")) ||
      (att.filename && att.filename.toLowerCase().endsWith(".ics"));
    if (!isCal) continue;
    const c = att.content as string | ArrayBuffer | Uint8Array;
    if (typeof c === "string") out.push(c);
    else out.push(new TextDecoder().decode(c instanceof ArrayBuffer ? new Uint8Array(c) : c));
  }
  return out;
}

/** 懒创建某用户的默认个人日历，返回其 id */
async function defaultCalendarId(db: Database, userId: string): Promise<string> {
  const existing = await db.query.calendars.findFirst({
    where: and(eq(calendars.ownerUserId, userId), eq(calendars.type, "personal")),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(calendars)
    .values({ name: "我的日历", color: "#7c3aed", type: "personal", ownerUserId: userId, isDefault: true })
    .returning({ id: calendars.id });
  return row!.id;
}

async function targetUserIds(
  db: Database,
  deliveredTo: { id: string; userId: string | null; type: string },
): Promise<string[]> {
  if (deliveredTo.userId) return [deliveredTo.userId];
  if (deliveredTo.type === "shared") {
    return sharedMailboxRecipientUserIds(db, deliveredTo.id);
  }
  return [];
}

async function handleReply(db: Database, ics: ParsedIcs): Promise<boolean> {
  if (!ics.uid) return false;
  const events = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(eq(calendarEvents.uid, ics.uid));
  if (!events.length) return false;
  let acted = false;
  for (const ev of events) {
    for (const a of ics.attendees) {
      if (!a.email) continue;
      const res = await db
        .update(eventAttendees)
        .set({ partstat: normPartstat(a.partstat), respondedAt: new Date() })
        .where(and(eq(eventAttendees.eventId, ev.id), eq(eventAttendees.email, a.email)))
        .returning({ id: eventAttendees.id });
      if (res.length) acted = true;
    }
  }
  return acted;
}

async function handleCancel(db: Database, ics: ParsedIcs): Promise<boolean> {
  if (!ics.uid) return false;
  const res = await db
    .update(calendarEvents)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(calendarEvents.uid, ics.uid))
    .returning({ id: calendarEvents.id });
  return res.length > 0;
}

async function handleRequest(
  db: Database,
  ics: ParsedIcs,
  deliveredTo: { id: string; userId: string | null; type: string },
): Promise<boolean> {
  if (!ics.uid || !ics.dtstart || !ics.dtend) return false;
  const users = await targetUserIds(db, deliveredTo);
  if (!users.length) return false;

  let acted = false;
  for (const userId of users) {
    const calId = await defaultCalendarId(db, userId);
    const existing = await db.query.calendarEvents.findFirst({
      where: and(eq(calendarEvents.uid, ics.uid), eq(calendarEvents.calendarId, calId)),
    });

    const fields = {
      title: ics.summary ?? "(无标题)",
      description: ics.description ?? null,
      location: ics.location ?? null,
      allDay: ics.allDay,
      startsAt: ics.dtstart,
      endsAt: ics.dtend,
      timezone: "UTC",
      rrule: ics.rrule,
      status: "tentative",
      organizerEmail: ics.organizer,
      sequence: ics.sequence,
      updatedAt: new Date(),
    } as const;

    if (existing) {
      // 仅当序号更高（更新版）才覆盖
      if (ics.sequence >= existing.sequence) {
        await db.update(calendarEvents).set(fields).where(eq(calendarEvents.id, existing.id));
        acted = true;
      }
      continue;
    }

    const [ev] = await db
      .insert(calendarEvents)
      .values({ calendarId: calId, userId, uid: ics.uid, ...fields })
      .returning({ id: calendarEvents.id });

    // 参与者：组织者 + 各 ATTENDEE（本人默认 needs-action）
    const rows: (typeof eventAttendees.$inferInsert)[] = [];
    if (ics.organizer) {
      rows.push({
        eventId: ev!.id,
        email: ics.organizer,
        displayName: null,
        role: "required",
        isOrganizer: true,
        partstat: "accepted",
      });
    }
    for (const a of ics.attendees) {
      if (!a.email || a.email === ics.organizer) continue;
      rows.push({
        eventId: ev!.id,
        email: a.email,
        displayName: a.displayName,
        role: a.role === "OPT-PARTICIPANT" ? "optional" : "required",
        isOrganizer: false,
        partstat: normPartstat(a.partstat),
      });
    }
    if (rows.length) await db.insert(eventAttendees).values(rows).onConflictDoNothing();
    acted = true;
  }
  return acted;
}

export async function processInboundInvites(
  db: Database,
  parsed: Email,
  deliveredTo: { id: string; userId: string | null; type: string },
): Promise<boolean> {
  let acted = false;
  for (const text of icsTexts(parsed)) {
    const ics = parseIcs(text);
    if (!ics || !ics.method || !ics.uid) continue;
    if (ics.method === "REPLY") acted = (await handleReply(db, ics)) || acted;
    else if (ics.method === "CANCEL") acted = (await handleCancel(db, ics)) || acted;
    else if (ics.method === "REQUEST") acted = (await handleRequest(db, ics, deliveredTo)) || acted;
  }
  return acted;
}
