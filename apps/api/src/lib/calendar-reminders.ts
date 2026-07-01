import { and, eq, isNotNull, ne } from "drizzle-orm";
import {
  calendarEvents,
  calendarReminderDispatch,
  emailAddresses,
  user,
} from "@mailflare/db";
import type { Database } from "@mailflare/db";
import type { Bindings } from "../env.js";
import { expandOccurrences } from "./ical.js";

/**
 * 日历提醒扫描（由高频 Cron 每 5 分钟触发）。
 * 对每个含提醒的事件展开近期 occurrence，算出触发时刻，对刚到期且未派发过的：
 * - popup：向事件拥有者的 UserHub 广播 { type: "calendar-reminder" }（站内实时弹窗）
 * - email：给拥有者主邮箱发一封提醒邮件
 * calendar_reminder_dispatch 唯一索引保证幂等——即便某次 Cron 漏跑、下次补扫也不会重复发。
 */

// 回看窗口：容忍 Cron 抖动/漏跑（去重表兜底，重复扫描不会重复发）
const LOOKBACK_MS = 15 * 60 * 1000;

interface Reminder {
  minutesBefore: number;
  method: string;
}

async function ownerMailbox(
  db: Database,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!u) return null;
  const rows = await db
    .select({ address: emailAddresses.address, isPrimary: emailAddresses.isPrimary })
    .from(emailAddresses)
    .where(
      and(
        eq(emailAddresses.userId, userId),
        eq(emailAddresses.status, "active"),
        eq(emailAddresses.type, "mailbox"),
      ),
    );
  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  if (!primary) return null;
  return { email: primary.address, name: u.name };
}

async function broadcastReminder(
  env: Bindings,
  userId: string,
  payload: unknown,
): Promise<void> {
  const stub = env.USER_HUB.get(env.USER_HUB.idFromName(userId));
  await stub.fetch("https://user-hub/broadcast", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function runCalendarReminders(
  db: Database,
  env: Bindings,
  now: Date,
): Promise<{ scanned: number; sent: number }> {
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(ne(calendarEvents.status, "cancelled"), isNotNull(calendarEvents.reminders)));

  let sent = 0;
  for (const ev of rows) {
    const reminders = (ev.reminders ?? []) as Reminder[];
    if (!reminders.length || !ev.userId) continue;

    const maxBefore = Math.max(...reminders.map((r) => r.minutesBefore));
    const windowStart = new Date(now.getTime() - LOOKBACK_MS);
    const windowEnd = new Date(now.getTime() + maxBefore * 60_000 + 60_000);
    const occs = expandOccurrences(
      {
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        timezone: ev.timezone,
        rrule: ev.rrule,
        exdates: ev.exdates,
        allDay: ev.allDay,
      },
      windowStart,
      windowEnd,
    );

    for (const occ of occs) {
      for (const r of reminders) {
        const fire = occ.start.getTime() - r.minutesBefore * 60_000;
        if (fire > now.getTime() || fire <= now.getTime() - LOOKBACK_MS) continue;

        // 幂等占位：插入成功才派发
        const claim = await db
          .insert(calendarReminderDispatch)
          .values({
            eventId: ev.id,
            occurrenceStart: occ.start,
            minutesBefore: r.minutesBefore,
            method: r.method,
          })
          .onConflictDoNothing()
          .returning({ id: calendarReminderDispatch.id });
        if (!claim.length) continue;

        if (r.method === "popup") {
          await broadcastReminder(env, ev.userId, {
            type: "calendar-reminder",
            event: {
              id: ev.id,
              title: ev.title,
              location: ev.location,
              occurrenceStart: occ.start.toISOString(),
              allDay: ev.allDay,
            },
          }).catch((e) => console.error("提醒广播失败", e));
          sent++;
        } else if (r.method === "email") {
          const mb = await ownerMailbox(db, ev.userId);
          if (mb) {
            const when = ev.allDay
              ? occ.start.toISOString().slice(0, 10)
              : occ.start.toISOString();
            await env.EMAIL.send({
              from: { email: mb.email, name: mb.name },
              to: [mb.email],
              subject: `提醒：${ev.title}`,
              text: `事件「${ev.title}」即将开始。\n时间：${when}${ev.location ? `\n地点：${ev.location}` : ""}`,
            }).catch((e) => console.error("提醒邮件发送失败", e));
            sent++;
          }
        }
      }
    }
  }
  return { scanned: rows.length, sent };
}
