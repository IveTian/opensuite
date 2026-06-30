import { Button } from "@heroui/react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut, useSession } from "../lib/auth-client";
import { useTheme } from "../providers/theme";

const NAV = [
  { to: "/admin", label: "仪表盘", end: true },
  { to: "/admin/domains", label: "域名管理" },
  { to: "/admin/users", label: "用户管理" },
  { to: "/admin/addresses", label: "邮箱地址" },
  { to: "/admin/plans", label: "配额套餐" },
  { to: "/admin/invites", label: "邀请码" },
  { to: "/admin/settings", label: "注册策略" },
  { to: "/admin/audit", label: "审计日志" },
];

export function AdminLayout() {
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      {/* 侧栏 */}
      <aside className="flex w-56 flex-col border-r border-default-200 bg-content1 p-4">
        <div className="mb-6 px-2 text-xl font-bold text-primary">MailFlare</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                "rounded-lg px-3 py-2 text-sm transition-colors " +
                (isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground-600 hover:bg-default-100")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 主区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-default-200 px-6 py-3">
          <div className="text-sm text-foreground-500">管理后台</div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={toggle}>
              {theme === "dark" ? "🌙 深色" : "☀️ 浅色"}
            </Button>
            <span className="text-sm text-foreground-600">{session?.user.email}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              退出
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
