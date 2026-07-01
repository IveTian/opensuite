import type { CalendarEvent } from "@mailflare/shared";
import { WEEKDAY_CN, eventColor, eventOnDay, fmtTime, isToday, sameDay } from "./lib";

/** 月视图：6×7 网格，每格显示当天事件 */
export function MonthView({
  days,
  cursor,
  events,
  colorOf,
  onSelectEvent,
  onCreateAt,
}: {
  days: Date[];
  cursor: Date;
  events: CalendarEvent[];
  colorOf: (ev: CalendarEvent) => string;
  onSelectEvent: (ev: CalendarEvent) => void;
  onCreateAt: (day: Date) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_CN.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center text-xs font-medium text-muted">
            周{w}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((day, i) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayEvents = events
            .filter((e) => eventOnDay(e, day))
            .sort((a, b) => {
              if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
              return a.occurrenceStart.localeCompare(b.occurrenceStart);
            });
          const shown = dayEvents.slice(0, 3);
          const more = dayEvents.length - shown.length;
          return (
            <div
              key={i}
              className={
                "group flex min-h-0 flex-col gap-0.5 border-b border-r border-separator/60 p-1 " +
                (inMonth ? "" : "bg-surface-secondary/40")
              }
              onDoubleClick={() => onCreateAt(day)}
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    "flex size-6 items-center justify-center rounded-full text-xs " +
                    (isToday(day)
                      ? "bg-accent font-semibold text-accent-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted")
                  }
                >
                  {day.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => onCreateAt(day)}
                  className="touch-target text-base text-muted opacity-100 transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="新建事件"
                >
                  +
                </button>
              </div>
              <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                {shown.map((e) => (
                  <button
                    key={e.id + e.occurrenceStart}
                    type="button"
                    onClick={() => onSelectEvent(e)}
                    className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs hover:opacity-90"
                    style={
                      e.allDay
                        ? { backgroundColor: colorOf(e), color: "#fff" }
                        : undefined
                    }
                  >
                    {!e.allDay && (
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorOf(e) }}
                      />
                    )}
                    {!e.allDay && <span className="shrink-0 text-muted">{fmtTime(e.occurrenceStart)}</span>}
                    <span
                      className={
                        "truncate " +
                        (e.status === "cancelled" ? "text-muted line-through" : e.allDay ? "" : "text-foreground")
                      }
                    >
                      {e.title}
                    </span>
                  </button>
                ))}
                {more > 0 && (
                  <span className="px-1 text-xs text-muted">还有 {more} 项</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
