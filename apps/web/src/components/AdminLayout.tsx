import { Avatar, Button } from "@heroui/react";
import { useState, type ComponentType } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut, useSession } from "../lib/auth-client";
import { useTheme } from "../providers/theme";
import {
  AtSignIcon,
  CreditCardIcon,
  DashboardIcon,
  GlobeIcon,
  LogOutIcon,
  MailIcon,
  MenuIcon,
  MoonIcon,
  ScrollIcon,
  SlidersIcon,
  SunIcon,
  TicketIcon,
  UsersIcon,
  XIcon,
} from "./icons";

const NAV: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}[] = [
  { to: "/admin", label: "仪表盘", icon: DashboardIcon, end: true },
  { to: "/admin/domains", label: "域名管理", icon: GlobeIcon },
  { to: "/admin/users", label: "用户管理", icon: UsersIcon },
  { to: "/admin/addresses", label: "邮箱地址", icon: AtSignIcon },
  { to: "/admin/plans", label: "配额套餐", icon: CreditCardIcon },
  { to: "/admin/invites", label: "邀请码", icon: TicketIcon },
  { to: "/admin/settings", label: "注册策略", icon: SlidersIcon },
  { to: "/admin/audit", label: "审计日志", icon: ScrollIcon },
];

function initials(value?: string | null): string {
  if (!value) return "?";
  const local = value.split("@")[0] ?? value;
  const parts = local.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function AdminLayout() {
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await signOut();
    navigate("/login");
  }

  const sidebar = (
    <div className="flex h-full w-60 flex-col bg-background p-3">
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <MailIcon className="size-4" />
          </div>
          <span className="text-base font-semibold text-foreground">MailFlare</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          aria-label="关闭菜单"
          className="md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <p className="px-3 pb-1 pt-4 text-xs font-medium text-muted">管理后台</p>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((item) => {
          const Ico = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                "flex h-9 items-center gap-3 rounded-xl px-3 text-sm " +
                (isActive
                  ? "bg-surface font-medium text-foreground shadow-surface"
                  : "text-muted hover:bg-surface-secondary hover:text-foreground")
              }
            >
              <Ico className="size-4 shrink-0" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary p-2">
        <Avatar className="size-8 shrink-0">
          <Avatar.Fallback>{initials(session?.user.email)}</Avatar.Fallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {session?.user.name}
          </span>
          <span className="truncate text-xs text-muted">{session?.user.email}</span>
        </div>
        <Button size="sm" variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
          {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
        </Button>
        <Button size="sm" variant="ghost" isIconOnly aria-label="退出登录" onClick={logout}>
          <LogOutIcon className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-background">
      {/* 桌面侧栏 */}
      <aside className="hidden shrink-0 border-r border-border md:block">{sidebar}</aside>

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-backdrop"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 border-r border-border shadow-overlay">
            {sidebar}
          </div>
        </div>
      )}

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="打开菜单"
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon className="size-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <MailIcon className="size-3.5" />
            </div>
            <span className="text-sm font-semibold text-foreground">MailFlare</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-6 pb-10 pt-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
