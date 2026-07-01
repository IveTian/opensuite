import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface NewMsg {
  id: string;
  addressId: string;
  fromAddress: string | null;
  fromName: string | null;
  subject: string | null;
  createdAt: string;
}

type Perm = "default" | "granted" | "denied" | "unsupported";

function currentPerm(): Perm {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as Perm;
}

const API = import.meta.env.VITE_API_ORIGIN as string;
const WS_URL = `${API.replace(/^http/, "ws")}/api/me/ws`;

/**
 * 邮件实时通道：与后端 Durable Object 建 WebSocket。
 * 收到「new-mail」信号（或连接/重连/页面重新可见）时，拉取新入站邮件：
 *  - 始终回调刷新收件箱（无论是否授予通知权限）；
 *  - 若已授予通知权限，弹浏览器通知。
 * 断线自动重连（指数退避），重连时补拉断线期间的新邮件。
 */
export function useMailRealtime({
  icon,
  onNewMail,
}: {
  icon?: string | null;
  onNewMail?: () => void;
}) {
  const [perm, setPerm] = useState<Perm>(currentPerm);
  // 轮询边界：只对「挂载后」到达的邮件通知，避免历史邮件刷屏
  const sinceRef = useRef<string>(new Date().toISOString());
  const onNewRef = useRef(onNewMail);
  onNewRef.current = onNewMail;
  const iconRef = useRef(icon);
  iconRef.current = icon;

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const res = await Notification.requestPermission();
      setPerm(res as Perm);
    } catch {
      /* 忽略 */
    }
  }, []);

  const checkNew = useCallback(async () => {
    try {
      const res = await api.get<{ items: NewMsg[]; now: string }>(
        `/api/me/messages/new?since=${encodeURIComponent(sinceRef.current)}`,
      );
      if (res.now) sinceRef.current = res.now;
      if (!res.items.length) return;
      onNewRef.current?.(); // 实时刷新收件箱（与通知权限无关）
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const bind = (n: Notification) => {
        n.onclick = () => {
          window.focus();
          n.close();
        };
      };
      if (res.items.length > 3) {
        bind(
          new Notification(`${res.items.length} 封新邮件`, {
            body: res.items
              .slice(0, 3)
              .map((m) => m.fromName || m.fromAddress || "")
              .join("、"),
            icon: iconRef.current ?? undefined,
            tag: "mailflare-batch",
          }),
        );
      } else {
        for (const m of res.items) {
          bind(
            new Notification(m.fromName || m.fromAddress || "新邮件", {
              body: m.subject || "(无主题)",
              icon: iconRef.current ?? undefined,
              tag: m.id,
            }),
          );
        }
      }
    } catch {
      /* 网络抖动忽略 */
    }
  }, []);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
        void checkNew(); // 连接/重连即补拉
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(typeof e.data === "string" ? e.data : "");
          if (data?.type === "new-mail") void checkNew();
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
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkNew();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        ws?.close();
      } catch {
        /* 忽略 */
      }
    };
  }, [checkNew]);

  return { perm, requestPermission };
}
