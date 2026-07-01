import ICAL from "ical.js";
import { RRule } from "rrule";
import type { IcalMethod } from "@mailflare/shared";

/**
 * iCalendar 工具：RRULE 展开（时区感知）+ .ics 构建（出站邀请）+ .ics 解析（入站回执）。
 *
 * 时区策略（无 luxon 的「浮动时间」法）：
 * - DB 存 UTC instant + IANA `timezone`。展开重复时先把起点转成事件时区的「墙上时间」，
 *   用 rrule 在浮动空间展开，再逐个 occurrence 按事件时区换回真实 UTC——这样跨 DST 时
 *   「每周一 9:00」始终是当地 9:00。中国区（Asia/Shanghai 无 DST）恒等，欧美区也正确。
 */

// ------------------------- 时区助手 -------------------------

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** 把某 UTC instant 在指定时区里的「墙上时间」各分量取出 */
function partsInZone(date: Date, tz: string): Wall {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // 部分实现午夜会给 24
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** 该 instant 在 tz 的偏移（毫秒）= 当地墙上时间 - UTC */
function zoneOffsetMs(date: Date, tz: string): number {
  const p = partsInZone(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** 墙上时间（打包成「当作 UTC」的毫秒）在 tz 下 → 真实 UTC instant */
function wallToUtc(wallMs: number, tz: string): Date {
  const off1 = zoneOffsetMs(new Date(wallMs), tz);
  let utc = wallMs - off1;
  const off2 = zoneOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = wallMs - off2; // DST 跳变时二次校正
  return new Date(utc);
}

/** 真实 UTC instant → 墙上时间毫秒（各分量打包成「当作 UTC」的毫秒，供 rrule 浮动展开） */
function utcToWallMs(date: Date, tz: string): number {
  const p = partsInZone(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// ------------------------- RRULE 展开 -------------------------

export interface OccurrenceInput {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  rrule: string | null;
  exdates: string[] | null;
  allDay: boolean;
}

export interface Occurrence {
  start: Date;
  end: Date;
}

/**
 * 把事件展开为 [from, to) 窗口内、与窗口有交叠的 occurrence 实例。
 * 非重复事件返回 0 或 1 个；重复事件按 rrule 展开并剔除 exdates。
 */
export function expandOccurrences(
  ev: OccurrenceInput,
  from: Date,
  to: Date,
  cap = 2000,
): Occurrence[] {
  const durationMs = Math.max(0, ev.endsAt.getTime() - ev.startsAt.getTime());

  if (!ev.rrule) {
    if (ev.endsAt.getTime() > from.getTime() && ev.startsAt.getTime() < to.getTime()) {
      return [{ start: ev.startsAt, end: ev.endsAt }];
    }
    return [];
  }

  const tz = ev.timezone || "UTC";
  const rruleStr = ev.rrule.replace(/^RRULE:/i, "").trim();
  let rule: RRule;
  try {
    const opts = RRule.parseString(rruleStr);
    opts.dtstart = new Date(utcToWallMs(ev.startsAt, tz)); // 浮动起点
    rule = new RRule(opts);
  } catch {
    // rrule 解析失败：退化为单次
    if (ev.endsAt.getTime() > from.getTime() && ev.startsAt.getTime() < to.getTime()) {
      return [{ start: ev.startsAt, end: ev.endsAt }];
    }
    return [];
  }

  // 查询窗口转浮动空间；起点向前挪一个时长，纳入「早于窗口但仍交叠」的 occurrence
  const floatingFrom = new Date(utcToWallMs(from, tz) - durationMs);
  const floatingTo = new Date(utcToWallMs(to, tz));
  const exset = new Set((ev.exdates ?? []).map((s) => new Date(s).getTime()));

  const out: Occurrence[] = [];
  const floatOccs = rule.between(floatingFrom, floatingTo, true);
  for (const f of floatOccs) {
    // f 是浮动 Date（UTC 分量即墙上时间），换回真实 UTC
    const wallMs = Date.UTC(
      f.getUTCFullYear(),
      f.getUTCMonth(),
      f.getUTCDate(),
      f.getUTCHours(),
      f.getUTCMinutes(),
      f.getUTCSeconds(),
    );
    const start = ev.allDay ? new Date(wallMs) : wallToUtc(wallMs, tz);
    if (exset.has(start.getTime())) continue;
    const end = new Date(start.getTime() + durationMs);
    if (end.getTime() <= from.getTime() || start.getTime() >= to.getTime()) continue;
    out.push({ start, end });
    if (out.length >= cap) break;
  }
  return out;
}

// ------------------------- .ics 构建（出站） -------------------------

export interface IcsAttendee {
  email: string;
  displayName?: string | null;
  role?: string; // required/optional
  partstat?: string; // needs-action/accepted/...
  isOrganizer?: boolean;
}

export interface IcsEvent {
  uid: string;
  sequence: number;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  rrule?: string | null;
  status: string; // confirmed/tentative/cancelled
  organizerEmail: string;
  organizerName?: string | null;
}

/** 文本转义（RFC 5545 §3.3.11） */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC 时间 → 20260701T010000Z */
function fmtUtc(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
}

/** 全天事件的日期（按事件时区取墙上日期）→ 20260701 */
function fmtDate(d: Date, tz: string): string {
  const p = partsInZone(d, tz);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}${mm}${dd}`;
}

/** 行折叠：>75 字节处折行（保守按字符折在 73，前置空格续行） */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let s = line;
  chunks.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length > 74) {
    chunks.push(" " + s.slice(0, 74));
    s = s.slice(74);
  }
  if (s.length) chunks.push(" " + s);
  return chunks.join("\r\n");
}

const ICAL_STATUS: Record<string, string> = {
  confirmed: "CONFIRMED",
  tentative: "TENTATIVE",
  cancelled: "CANCELLED",
};

/**
 * 构建一封 .ics（单 VEVENT）。method=REQUEST/CANCEL 用于邀请/取消，REPLY 用于回执。
 * REPLY 时 attendees 只应包含回执者本人（带其 partstat）。
 */
export function buildIcs(
  ev: IcsEvent,
  attendees: IcsAttendee[],
  method: IcalMethod,
  now: Date,
): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//MailFlare//Calendar//CN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push(`METHOD:${method}`);
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${ev.uid}`);
  lines.push(`SEQUENCE:${ev.sequence}`);
  lines.push(`DTSTAMP:${fmtUtc(now)}`);

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(ev.startsAt, ev.timezone)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(ev.endsAt, ev.timezone)}`);
  } else {
    lines.push(`DTSTART:${fmtUtc(ev.startsAt)}`);
    lines.push(`DTEND:${fmtUtc(ev.endsAt)}`);
  }

  if (ev.rrule) lines.push(`RRULE:${ev.rrule.replace(/^RRULE:/i, "").trim()}`);

  lines.push(`SUMMARY:${esc(ev.title)}`);
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);

  const orgName = ev.organizerName ? `;CN=${esc(ev.organizerName)}` : "";
  lines.push(`ORGANIZER${orgName}:mailto:${ev.organizerEmail}`);

  for (const a of attendees) {
    const params: string[] = [];
    if (a.displayName) params.push(`CN=${esc(a.displayName)}`);
    params.push(`ROLE=${a.role === "optional" ? "OPT-PARTICIPANT" : "REQ-PARTICIPANT"}`);
    params.push(`PARTSTAT=${(a.partstat ?? "needs-action").toUpperCase()}`);
    if (method === "REQUEST") params.push("RSVP=TRUE");
    lines.push(`ATTENDEE;${params.join(";")}:mailto:${a.email}`);
  }

  const status = method === "CANCEL" ? "CANCELLED" : (ICAL_STATUS[ev.status] ?? "CONFIRMED");
  lines.push(`STATUS:${status}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map(fold).join("\r\n") + "\r\n";
}

// ------------------------- .ics 解析（入站） -------------------------

export interface ParsedIcsAttendee {
  email: string;
  displayName: string | null;
  partstat: string | null;
  role: string | null;
}

export interface ParsedIcs {
  method: string | null;
  uid: string | null;
  sequence: number;
  recurrenceId: Date | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  dtstart: Date | null;
  dtend: Date | null;
  allDay: boolean;
  rrule: string | null;
  status: string | null;
  organizer: string | null;
  attendees: ParsedIcsAttendee[];
}

function stripMailto(v: unknown): string {
  return String(v ?? "")
    .replace(/^mailto:/i, "")
    .trim()
    .toLowerCase();
}

/** 解析一封 .ics 文本（取第一个 VEVENT）。失败返回 null。 */
export function parseIcs(text: string): ParsedIcs | null {
  try {
    const jcal = ICAL.parse(text);
    const comp = new ICAL.Component(jcal);
    const method = (comp.getFirstPropertyValue("method") as string | null) ?? null;
    const vevent = comp.getFirstSubcomponent("vevent");
    if (!vevent) return null;

    const event = new ICAL.Event(vevent);
    const uid = event.uid ?? null;
    const sequence = Number(vevent.getFirstPropertyValue("sequence") ?? 0);

    const startDate = event.startDate ?? null;
    const endDate = event.endDate ?? null;
    const dtstart = startDate ? startDate.toJSDate() : null;
    const dtend = endDate ? endDate.toJSDate() : null;
    const allDay = startDate ? startDate.isDate : false;

    const rruleProp = vevent.getFirstPropertyValue("rrule");
    const rrule = rruleProp ? String(rruleProp.toString()) : null;

    const recProp = vevent.getFirstProperty("recurrence-id");
    let recurrenceId: Date | null = null;
    if (recProp) {
      const rv = recProp.getFirstValue() as { toJSDate?: () => Date } | null;
      recurrenceId = rv?.toJSDate ? rv.toJSDate() : null;
    }

    const organizer = vevent.getFirstPropertyValue("organizer")
      ? stripMailto(vevent.getFirstPropertyValue("organizer"))
      : null;

    const attendees: ParsedIcsAttendee[] = vevent.getAllProperties("attendee").map((p) => {
      const partstat = p.getParameter("partstat");
      const role = p.getParameter("role");
      const cn = p.getParameter("cn");
      return {
        email: stripMailto(p.getFirstValue()),
        displayName: cn ? String(cn) : null,
        partstat: partstat ? String(partstat).toLowerCase() : null,
        role: role ? String(role) : null,
      };
    });

    return {
      method: method ? String(method).toUpperCase() : null,
      uid,
      sequence,
      recurrenceId,
      summary: (vevent.getFirstPropertyValue("summary") as string | null) ?? null,
      description: (vevent.getFirstPropertyValue("description") as string | null) ?? null,
      location: (vevent.getFirstPropertyValue("location") as string | null) ?? null,
      dtstart,
      dtend,
      allDay,
      rrule,
      status: (vevent.getFirstPropertyValue("status") as string | null) ?? null,
      organizer,
      attendees,
    };
  } catch {
    return null;
  }
}
