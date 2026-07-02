import { Button } from "@heroui/react";
import { useState, type ComponentType } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut, useSession } from "../lib/auth-client";
import { useTheme } from "../providers/theme";
import { AppSwitcher } from "./AppSwitcher";
import { PersonAvatar } from "./PersonAvatar";
import {
  AddressBookIcon,
  AtSignIcon,
  CreditCardIcon,
  DashboardIcon,
  GlobeIcon,
  HardDriveIcon,
  InboxIcon,
  LinkIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  RefreshIcon,
  ScrollIcon,
  SlidersIcon,
  SunIcon,
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
  { to: "/admin/directory", label: "通讯录", icon: AddressBookIcon },
  { to: "/admin/drive", label: "网盘管理", icon: HardDriveIcon },
  { to: "/admin/plans", label: "配额套餐", icon: CreditCardIcon },
  { to: "/admin/oauth-apps", label: "应用授权", icon: LinkIcon },
  { to: "/admin/settings", label: "默认设置", icon: SlidersIcon },
  { to: "/admin/audit", label: "审计日志", icon: ScrollIcon },
  { to: "/admin/simulate", label: "模拟收信", icon: RefreshIcon },
];

export function AdminLayout() {
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();
  const avatarImage = (session?.user as { image?: string | null } | undefined)?.image ?? null;
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await signOut();
    navigate("/login");
  }

  const sidebar = (
    <div className="flex h-full w-60 flex-col bg-background p-3">
      {/* 移动抽屉的关闭按钮（桌面隐藏，桌面顶部由全宽 Header 承担） */}
      <div className="mb-1 flex justify-end md:hidden">
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          aria-label="关闭菜单"
          onClick={() => setMobileOpen(false)}
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">管理后台</p>
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

      <button
        onClick={() => {
          setMobileOpen(false);
          navigate("/mail");
        }}
        className="mt-1 flex h-9 items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-surface-secondary hover:text-foreground"
      >
        <InboxIcon className="size-4 shrink-0" />
        返回邮箱
      </button>

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary p-2">
        <PersonAvatar
          url={(session?.user as { image?: string | null } | undefined)?.image}
          email={session?.user.email}
          seed={session?.user.email}
          className="size-8 shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {session?.user.name}
          </span>
          <span className="truncate text-xs text-muted">{session?.user.email}</span>
        </div>
        <Button size="sm" variant="ghost" isIconOnly aria-label="退出登录" onClick={logout}>
          <LogOutIcon className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶部全宽 Header：应用切换 + 主题 + 账户（与邮箱/通讯录一致） */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="打开菜单"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon className="size-5" />
          </Button>
          <AppSwitcher current="admin" />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
            {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
          </Button>
          <button
            onClick={() => navigate("/profile")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
            title="账户设置"
            aria-label="账户设置"
          >
            <PersonAvatar
              url={avatarImage}
              email={session?.user.email}
              seed={session?.user.email}
              className="size-8 shrink-0"
            />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
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
        <main className="min-w-0 flex-1 overflow-auto px-6 pb-10 pt-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
