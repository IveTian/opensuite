import type { IcalMethod } from "@mailflare/shared";
import type { Bindings } from "../env.js";
import { buildIcs, type IcsAttendee, type IcsEvent } from "./ical.js";

/**
 * 出站日历邮件：把 VEVENT 序列化成 .ics 作为 text/calendar 附件，用 EMAIL.send 发出。
 * - REQUEST：组织者 → 全体参与者（新建/更新邀请）
 * - CANCEL ：组织者 → 全体参与者（取消）
 * - REPLY  ：参与者 → 组织者（RSVP 回执，attendees 只含回执者本人）
 *
 * 复用 apps/api/routes/messages.ts 同款 EMAIL.send 结构化 API（attachments 支持 type/content）。
 * 发信失败不抛出（调用方通常 waitUntil 触发），仅记录日志——邀请是尽力而为。
 */
export interface SendCalendarIcsParams {
  event: IcsEvent;
  attendees: IcsAttendee[];
  method: IcalMethod;
  from: { address: string; name: string | null };
  to: string[];
  now: Date;
}

const SUBJECT_PREFIX: Record<IcalMethod, string> = {
  REQUEST: "邀请",
  CANCEL: "已取消",
  REPLY: "回执",
};

const PARTSTAT_CN: Record<string, string> = {
  accepted: "接受",
  declined: "拒绝",
  tentative: "待定",
  "needs-action": "待回复",
};

export async function sendCalendarIcs(env: Bindings, p: SendCalendarIcsParams): Promise<void> {
  const to = [...new Set(p.to.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return;

  const ics = buildIcs(p.event, p.attendees, p.method, p.now);
  const bytes = new TextEncoder().encode(ics);
  const subject = `${SUBJECT_PREFIX[p.method]}：${p.event.title}`;

  let text: string;
  if (p.method === "REPLY") {
    const r = p.attendees[0];
    const cn = r?.displayName || r?.email || "参与者";
    const st = PARTSTAT_CN[r?.partstat ?? "needs-action"] ?? "已回复";
    text = `${cn} 对「${p.event.title}」的回复：${st}。`;
  } else if (p.method === "CANCEL") {
    text = `事件「${p.event.title}」已取消。`;
  } else {
    const when = p.event.allDay
      ? p.event.startsAt.toISOString().slice(0, 10)
      : p.event.startsAt.toISOString();
    text = `你被邀请参加「${p.event.title}」。\n时间：${when}${p.event.location ? `\n地点：${p.event.location}` : ""}${p.event.description ? `\n\n${p.event.description}` : ""}`;
  }

  try {
    await env.EMAIL.send({
      from: { email: p.from.address, name: p.from.name ?? p.from.address },
      to,
      subject,
      text,
      attachments: [
        {
          disposition: "attachment" as const,
          filename: "invite.ics",
          type: `text/calendar; method=${p.method}; charset=utf-8`,
          content: bytes,
        },
      ],
    });
  } catch (err) {
    console.error("日历 .ics 邮件发送失败", p.method, err);
  }
}

/** 从事件行 + 组织者信息拼出 IcsEvent（供 buildIcs 用） */
export function toIcsEvent(
  row: {
    uid: string;
    sequence: number;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    timezone: string;
    rrule: string | null;
    status: string;
  },
  organizer: { email: string; name: string | null },
): IcsEvent {
  return {
    uid: row.uid,
    sequence: row.sequence,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    allDay: row.allDay,
    timezone: row.timezone,
    rrule: row.rrule,
    status: row.status,
    organizerEmail: organizer.email,
    organizerName: organizer.name,
  };
}

export type { IcsAttendee };
