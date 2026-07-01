import type { CalendarEvent } from "@mailflare/shared";

/** 浏览器时区，作为新事件默认时区 */
export const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const pad = (n: number) => String(n).padStart(2, "0");

// ------------------------- 时区换算（与后端 lib/ical.ts 同款「浮动时间」法）-------------------------

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function partsInZone(date: Date, tz: string): Wall {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
  };
}

function offsetMs(date: Date, tz: string): number {
  const p = partsInZone(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - date.getTime();
}

/** 墙上时间字符串（"2026-07-01T09:00"）在 tz 下 → UTC ISO */
export function wallToUtcISO(wall: string, tz: string): string {
  const [datePart, timePart = "00:00"] = wall.split("T");
  const [y, mo, d] = datePart!.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const wallMs = Date.UTC(y!, mo! - 1, d!, h ?? 0, mi ?? 0);
  const off1 = offsetMs(new Date(wallMs), tz);
  let utc = wallMs - off1;
  const off2 = offsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = wallMs - off2;
  return new Date(utc).toISOString();
}

/** UTC ISO → 某时区的 datetime-local 值（"2026-07-01T09:00"） */
export function utcToWall(iso: string, tz: string): string {
  const p = partsInZone(new Date(iso), tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** UTC ISO → 某时区的日期值（"2026-07-01"，全天事件用） */
export function utcToDateStr(iso: string, tz: string): string {
  const p = partsInZone(new Date(iso), tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// ------------------------- 本地网格日期（按浏览器本地时区摆放）-------------------------

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

/** 周一为一周之始 */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const diff = (x.getDay() - 1 + 7) % 7; // 0=周一
  return addDays(x, -diff);
}

/** 月视图 6×7=42 天（含跨月补全） */
export function monthDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** 周视图 7 天 */
export function weekDays(cursor: Date): Date[] {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"];

export function monthTitle(cursor: Date): string {
  return `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;
}
export function dayTitle(cursor: Date): string {
  const wd = ["日", "一", "二", "三", "四", "五", "六"][cursor.getDay()];
  return `${cursor.getMonth() + 1} 月 ${cursor.getDate()} 日 周${wd}`;
}

/** 该事件实例是否与某本地日相交 */
export function eventOnDay(ev: CalendarEvent, day: Date): boolean {
  const s = new Date(ev.occurrenceStart);
  const e = new Date(ev.occurrenceEnd);
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  return s.getTime() < dayEnd && e.getTime() > dayStart;
}

/** 时间显示 HH:MM（本地） */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 起止时间区间显示 */
export function fmtRange(ev: CalendarEvent): string {
  if (ev.allDay) return "全天";
  return `${fmtTime(ev.occurrenceStart)} – ${fmtTime(ev.occurrenceEnd)}`;
}

// ------------------------- RRULE 预设 <-> 字符串 -------------------------

export type Freq = "" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type RecurEnd = "never" | "count" | "until";

export interface RecurrencePreset {
  freq: Freq;
  interval: number;
  byweekday: string[];
  end: RecurEnd;
  count: number;
  until: string; // yyyy-mm-dd
}

export const DEFAULT_RECUR: RecurrencePreset = {
  freq: "",
  interval: 1,
  byweekday: [],
  end: "never",
  count: 10,
  until: "",
};

export const WEEKDAY_KEYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const WEEKDAY_KEY_CN: Record<string, string> = {
  MO: "一",
  TU: "二",
  WE: "三",
  TH: "四",
  FR: "五",
  SA: "六",
  SU: "日",
};

export function buildRrule(p: RecurrencePreset): string | null {
  if (!p.freq) return null;
  const parts = [`FREQ=${p.freq}`];
  if (p.interval > 1) parts.push(`INTERVAL=${p.interval}`);
  if (p.freq === "WEEKLY" && p.byweekday.length) parts.push(`BYDAY=${p.byweekday.join(",")}`);
  if (p.end === "count" && p.count > 0) parts.push(`COUNT=${p.count}`);
  if (p.end === "until" && p.until) parts.push(`UNTIL=${p.until.replace(/-/g, "")}T235959Z`);
  return parts.join(";");
}

export function parseRrule(str: string | null): RecurrencePreset {
  if (!str) return { ...DEFAULT_RECUR };
  const map: Record<string, string> = {};
  for (const kv of str.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = kv.split("=");
    if (k) map[k.toUpperCase()] = v ?? "";
  }
  const freq = (map.FREQ as Freq) ?? "";
  const p: RecurrencePreset = {
    freq: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq) ? freq : "",
    interval: map.INTERVAL ? Number(map.INTERVAL) : 1,
    byweekday: map.BYDAY ? map.BYDAY.split(",") : [],
    end: map.COUNT ? "count" : map.UNTIL ? "until" : "never",
    count: map.COUNT ? Number(map.COUNT) : 10,
    until: map.UNTIL ? `${map.UNTIL.slice(0, 4)}-${map.UNTIL.slice(4, 6)}-${map.UNTIL.slice(6, 8)}` : "",
  };
  return p;
}

/** 人类可读的重复说明 */
export function recurLabel(str: string | null): string {
  if (!str) return "不重复";
  const p = parseRrule(str);
  const freqCn: Record<string, string> = {
    DAILY: "天",
    WEEKLY: "周",
    MONTHLY: "月",
    YEARLY: "年",
  };
  const base = p.interval > 1 ? `每 ${p.interval} ${freqCn[p.freq] ?? ""}` : `每${freqCn[p.freq] ?? ""}`;
  const days = p.byweekday.length
    ? `（周${p.byweekday.map((d) => WEEKDAY_KEY_CN[d] ?? d).join("、")}）`
    : "";
  return base + days;
}

// ------------------------- 提醒预设 -------------------------

export const REMINDER_PRESETS: { minutesBefore: number; label: string }[] = [
  { minutesBefore: 0, label: "事件开始时" },
  { minutesBefore: 5, label: "提前 5 分钟" },
  { minutesBefore: 10, label: "提前 10 分钟" },
  { minutesBefore: 30, label: "提前 30 分钟" },
  { minutesBefore: 60, label: "提前 1 小时" },
  { minutesBefore: 1440, label: "提前 1 天" },
];

/** 事件颜色：事件自定义优先，其次日历色，回退默认紫 */
export function eventColor(ev: CalendarEvent, calColor?: string | null): string {
  return ev.color || calColor || "#7c3aed";
}
