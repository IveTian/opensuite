/** 离线会话缓存：网络不可用时用上次成功登录的会话信息放行受保护路由 */

const KEY = "offline-session";

export interface CachedSession {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    role?: string;
  };
  cachedAt: number;
}

export function saveSessionCache(session: { user: CachedSession["user"] }) {
  try {
    const payload: CachedSession = { user: session.user, cachedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* 存储失败时静默忽略 */
  }
}

export function loadSessionCache(): CachedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedSession;
  } catch {
    return null;
  }
}

export function clearSessionCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
