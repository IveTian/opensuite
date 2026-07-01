import type { CalendarEvent } from "@mailflare/shared";
import { addDays, eventOnDay, fmtTime, isToday, startOfDay } from "./lib";

const HOUR_H = 48; // 每小时像素高
const TOTAL = HOUR_H * 24;

/** 周/日视图共用的时间网格：顶部全天行 + 可滚动 24 小时时间轴 */
export function TimeGrid({
  days,
  events,
  colorOf,
  onSelectEvent,
  onCreateAt,
}: {
  days: Date[];
  events: CalendarEvent[];
  colorOf: (ev: CalendarEvent) => string;
  onSelectEvent: (ev: CalendarEvent) => void;
  onCreateAt: (day: Date, hour: number) => void;
}) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 日期表头 */}
      <div className="flex border-b border-border pr-3">
        <div className="w-14 shrink-0" />
        {days.map((d, i) => (
          <div key={i} className="flex-1 py-1.5 text-center">
            <div className="text-xs text-muted">周{["日", "一", "二", "三", "四", "五", "六"][d.getDay()]}</div>
            <div
              className={
                "mx-auto flex size-7 items-center justify-center rounded-full text-sm " +
                (isToday(d) ? "bg-accent font-semibold text-accent-foreground" : "text-foreground")
              }
            >
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* 全天行 */}
      <div className="flex border-b border-border pr-3">
        <div className="flex w-14 shrink-0 items-center justify-end pr-2 text-xs text-muted">全天</div>
        {days.map((d, i) => {
          const allDayEvents = events.filter((e) => e.allDay && eventOnDay(e, d));
          return (
            <div key={i} className="flex-1 space-y-0.5 border-l border-separator/60 p-0.5">
              {allDayEvents.map((e) => (
                <button
                  key={e.id + e.occurrenceStart}
                  type="button"
                  onClick={() => onSelectEvent(e)}
                  className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-white"
                  style={{ backgroundColor: colorOf(e) }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* 时间轴 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex pr-3" style={{ height: TOTAL }}>
          {/* 小时刻度 */}
          <div className="w-14 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative" style={{ height: HOUR_H }}>
                <span className="absolute -top-2 right-2 text-xs text-muted">
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* 各天列 */}
          {days.map((day, di) => {
            const dayStart = startOfDay(day).getTime();
            const nextDay = addDays(startOfDay(day), 1).getTime();
            const timed = events.filter((e) => !e.allDay && eventOnDay(e, day));
            return (
              <div key={di} className="relative flex-1 border-l border-separator/60">
                {/* 小时格（点击新建） */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="border-b border-separator/40 hover:bg-surface-secondary/40"
                    style={{ height: HOUR_H }}
                    onClick={() => onCreateAt(day, h)}
                  />
                ))}

                {/* 当前时间线 */}
                {isToday(day) && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 border-t border-danger"
                    style={{ top: (nowMin / 1440) * TOTAL }}
                  >
                    <span className="absolute -left-1 -top-1 size-2 rounded-full bg-danger" />
                  </div>
                )}

                {/* 事件块 */}
                {timed.map((e) => {
                  const s = Math.max(new Date(e.occurrenceStart).getTime(), dayStart);
                  const en = Math.min(new Date(e.occurrenceEnd).getTime(), nextDay);
                  const startMin = (s - dayStart) / 60000;
                  const endMin = (en - dayStart) / 60000;
                  const top = (startMin / 1440) * TOTAL;
                  const height = Math.max(16, ((endMin - startMin) / 1440) * TOTAL);
                  return (
                    <button
                      key={e.id + e.occurrenceStart}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectEvent(e);
                      }}
                      className="absolute left-0.5 right-0.5 z-[5] overflow-hidden rounded px-1 py-0.5 text-left text-xs text-white shadow-sm"
                      style={{ top, height, backgroundColor: colorOf(e) }}
                    >
                      <span className={"block truncate font-medium " + (e.status === "cancelled" ? "line-through" : "")}>
                        {e.title}
                      </span>
                      {height > 28 && <span className="block truncate opacity-90">{fmtTime(e.occurrenceStart)}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
