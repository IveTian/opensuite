import { Spinner } from "@heroui/react";
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useOnline } from "../hooks/useOnline";
import { useSession } from "../lib/auth-client";
import { clearSessionCache, loadSessionCache, saveSessionCache } from "../lib/offline/session-cache";

/** 受保护路由：未登录跳登录；需要管理员时校验角色；离线时允许使用缓存会话 */
export function ProtectedRoute({ requireAdmin }: { requireAdmin?: boolean }) {
  const { data: session, isPending } = useSession();
  const online = useOnline();
  const cached = loadSessionCache();

  useEffect(() => {
    if (session?.user) {
      saveSessionCache({
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          image: (session.user as { image?: string | null }).image ?? null,
          role: (session.user as { role?: string }).role,
        },
      });
    }
  }, [session]);

  if (isPending && online) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Spinner />
        加载中…
      </div>
    );
  }

  const activeSession =
    session ?? (!online && cached ? { user: cached.user } : null);

  if (!activeSession) return <Navigate to="/login" replace />;

  const role = (activeSession.user as { role?: string }).role;
  if (requireAdmin && role !== "admin") return <Navigate to="/" replace />;

  return <Outlet />;
}

/** 登出时清除离线会话缓存 */
export { clearSessionCache } from "../lib/offline/session-cache";
