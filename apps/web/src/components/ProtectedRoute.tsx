import { Spinner } from "@heroui/react";
import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "../lib/auth-client";

/** 受保护路由：未登录跳登录；需要管理员时校验角色 */
export function ProtectedRoute({ requireAdmin }: { requireAdmin?: boolean }) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Spinner />
        加载中…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  const role = (session.user as { role?: string }).role;
  if (requireAdmin && role !== "admin") return <Navigate to="/" replace />;

  return <Outlet />;
}
