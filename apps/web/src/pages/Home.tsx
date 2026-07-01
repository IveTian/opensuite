import { Button } from "@heroui/react";
import type { ComponentType, SVGProps } from "react";
import { useNavigate } from "react-router-dom";
import { LogOutIcon, MailIcon, MoonIcon, ShieldIcon, SunIcon } from "../components/icons";
import { PersonAvatar } from "../components/PersonAvatar";
import { BrandMark } from "../components/BrandMark";
import { useTheme } from "../providers/theme";
import { useBranding } from "../providers/branding";
import { signOut, useSession } from "../lib/auth-client";

interface AppEntry {
  key: string;
  name: string;
  to: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** 图标磁贴的渐变背景（Launchpad 风格，每个应用一个色系） */
  tile: string;
  adminOnly?: boolean;
}

const APPS: AppEntry[] = [
  {
    key: "mail",
    name: "邮箱",
    to: "/mail",
    Icon: MailIcon,
    tile: "bg-gradient-to-br from-sky-400 to-blue-600",
  },
  {
    key: "admin",
    name: "管理后台",
    to: "/admin",
    Icon: ShieldIcon,
    tile: "bg-gradient-to-br from-slate-500 to-slate-700",
    adminOnly: true,
  },
];

/** 单个应用磁贴：圆角图标 + 名称，点击进入应用 */
function AppTile({ app, onOpen }: { app: AppEntry; onOpen: () => void }) {
  const { Icon } = app;
  return (
    <button
      onClick={onOpen}
      className="group flex w-24 flex-col items-center gap-2.5 outline-none"
      aria-label={app.name}
    >
      <span
        className={
          "flex size-20 items-center justify-center rounded-[22px] text-white shadow-surface " +
          "transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg " +
          "group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-focus/60 " +
          app.tile
        }
      >
        <Icon className="size-10" />
      </span>
      <span className="text-sm text-foreground">{app.name}</span>
    </button>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { siteName } = useBranding();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const image = (session?.user as { image?: string | null } | undefined)?.image ?? null;

  const apps = APPS.filter((a) => !a.adminOnly || role === "admin");

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶栏：品牌 + 主题 / 账户 / 退出 */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <BrandMark />
          <span className="text-sm font-semibold text-foreground">{siteName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
            {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
          </Button>
          <button
            onClick={() => navigate("/account")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
            title="账户设置"
            aria-label="账户设置"
          >
            <PersonAvatar
              url={image}
              email={session?.user.email}
              seed={session?.user.email}
              className="size-9 shrink-0"
            />
          </button>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="退出登录"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </header>

      {/* 应用网格（Launchpad 风格，居中） */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <h1 className="mb-10 text-center text-lg font-medium text-muted">
          你好，{session?.user.name}
        </h1>
        <div className="grid grid-cols-3 gap-x-6 gap-y-8 sm:grid-cols-4 sm:gap-x-10">
          {apps.map((app) => (
            <AppTile key={app.key} app={app} onOpen={() => navigate(app.to)} />
          ))}
        </div>
      </main>
    </div>
  );
}
