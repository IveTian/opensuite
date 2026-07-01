import { Avatar } from "@heroui/react";
import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { api } from "../lib/api";

/* ── Gravatar 开关（逐设备，localStorage；关掉则不向第三方查询） ── */
const GRAVATAR_KEY = "gravatar";
const gravatarListeners = new Set<() => void>();
function subscribeGravatar(cb: () => void) {
  gravatarListeners.add(cb);
  return () => gravatarListeners.delete(cb);
}
function gravatarSnapshot(): boolean {
  try {
    return localStorage.getItem(GRAVATAR_KEY) !== "off"; // 默认开启
  } catch {
    return true;
  }
}
/** 读取「是否启用 Gravatar」，跨组件响应式 */
export function useGravatarEnabled(): boolean {
  return useSyncExternalStore(subscribeGravatar, gravatarSnapshot, () => true);
}
/** 设置「是否启用 Gravatar」并广播 */
export function setGravatarEnabled(on: boolean) {
  try {
    localStorage.setItem(GRAVATAR_KEY, on ? "on" : "off");
  } catch {
    /* 忽略存储失败 */
  }
  gravatarListeners.forEach((cb) => cb());
}

/** 邮箱/名称 → 首字母（字母头像兜底） */
export function initials(value?: string | null): string {
  if (!value) return "?";
  const local = value.includes("@") ? (value.split("@")[0] ?? value) : value;
  const parts = local.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// 进程内缓存：email(小写) → 头像 URL；null 表示「已查询但无头像」，避免重复请求
const cache = new Map<string, string | null>();

/** 手动失效某个邮箱的缓存（上传/移除自己头像后调用） */
export function invalidateAvatar(email?: string | null) {
  if (email) cache.delete(email.toLowerCase());
}

/**
 * 按邮箱地址批量解析头像（同 Google 域内目录：拿地址查本系统用户头像）。
 * 返回查询函数 (email) => url | null。
 */
export function useAvatars(
  emails: (string | null | undefined)[],
): (email?: string | null) => string | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const key = emails
    .filter(Boolean)
    .map((e) => e!.toLowerCase())
    .sort()
    .join("|");

  useEffect(() => {
    const uniq = [...new Set(emails.filter(Boolean).map((e) => e!.toLowerCase()))];
    const need = uniq.filter((e) => !cache.has(e));
    if (!need.length) return;
    need.forEach((e) => cache.set(e, null)); // 占位，防并发重复请求
    api
      .post<Record<string, string>>("/api/me/avatars", { emails: need })
      .then((map) => {
        for (const [e, u] of Object.entries(map)) cache.set(e.toLowerCase(), u);
        force();
      })
      .catch(() => {
        /* 静默：保持后续 Gravatar / 字母头像兜底 */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (email) => (email ? (cache.get(email.toLowerCase()) ?? null) : null);
}

// Gravatar URL 缓存：email(小写) → https://gravatar.com/avatar/<sha256>?d=404
const gravatarCache = new Map<string, string>();

/** 计算并缓存某邮箱的 Gravatar URL（SHA-256，d=404 无图则 404 → 回退字母头像） */
async function ensureGravatar(email: string): Promise<string> {
  const key = email.trim().toLowerCase();
  const cached = gravatarCache.get(key);
  if (cached) return cached;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const url = `https://gravatar.com/avatar/${hex}?d=404&s=160`;
  gravatarCache.set(key, url);
  return url;
}

/**
 * 头像：内部上传头像 → Gravatar（外部/未上传，按邮箱哈希）→ 首字母字母头像。
 * url 为本系统目录解析出的头像；email 用于 Gravatar 兜底与字母。
 */
export function PersonAvatar({
  url,
  email,
  seed,
  className = "size-9 shrink-0",
}: {
  url?: string | null;
  /** 提供后会尝试 Gravatar 兜底 */
  email?: string | null;
  seed?: string | null;
  className?: string;
}) {
  const gravOn = useGravatarEnabled();
  const [grav, setGrav] = useState<string | null>(() =>
    email && gravOn ? (gravatarCache.get(email.trim().toLowerCase()) ?? null) : null,
  );
  useEffect(() => {
    if (!email || !gravOn) {
      setGrav(null);
      return;
    }
    let cancelled = false;
    ensureGravatar(email)
      .then((u) => !cancelled && setGrav(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email, gravOn]);

  // 候选来源按优先级：内部头像 → Gravatar
  const candidates = [url, grav].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const listKey = candidates.join("|");
  useEffect(() => setIdx(0), [listKey]); // 候选变化（异步解析到）时从头再试

  const src = candidates[idx];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setIdx((i) => i + 1)}
        className={"shrink-0 rounded-full bg-surface-secondary object-cover " + className}
      />
    );
  }
  return (
    <Avatar className={className}>
      <Avatar.Fallback>{initials(seed)}</Avatar.Fallback>
    </Avatar>
  );
}
