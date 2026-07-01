import { useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_ORIGIN as string;
const WS_URL = `${API.replace(/^http/, "ws")}/api/me/ws`;

export interface CalendarReminder {
  id: string;
  title: string;
  location: string | null;
  occurrenceStart: string;
  allDay: boolean;
}

/**
 * 日历实时通道：复用邮件同款 UserHub WebSocket（/api/me/ws）。
 *  - "calendar-updated"：他人改动/入站邀请到达 → 触发刷新
 *  - "calendar-reminder"：提醒到点 → 回调（站内提示）+ 可选浏览器通知
 * 断线自动重连（指数退避）。
 */
export function useCalendarRealtime({
  onUpdated,
  onReminder,
}: {
  onUpdated?: () => void;
  onReminder?: (r: CalendarReminder) => void;
}) {
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;
  const onReminderRef = useRef(onReminder);
  onReminderRef.current = onReminder;

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function handleReminder(r: CalendarReminder) {
      onReminderRef.current?.(r);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const when = r.allDay ? "全天" : new Date(r.occurrenceStart).toLocaleString();
        const n = new Notification(`提醒：${r.title}`, {
          body: r.location ? `${when} · ${r.location}` : when,
          tag: `cal-${r.id}-${r.occurrenceStart}`,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    }

    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        retry = 0;
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(typeof e.data === "string" ? e.data : "");
          if (data?.type === "calendar-updated") onUpdatedRef.current?.();
          else if (data?.type === "calendar-reminder" && data.event) handleReminder(data.event);
        } catch {
          /* 忽略非 JSON */
        }
      };
      ws.onclose = () => scheduleReconnect();
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* 忽略 */
        }
      };
    }
    function scheduleReconnect() {
      if (closed || timer) return;
      const delay = Math.min(1000 * 2 ** retry, 30_000);
      retry += 1;
      timer = setTimeout(() => {
        timer = undefined;
        connect();
      }, delay);
    }

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* 忽略 */
      }
    };
  }, []);
}
