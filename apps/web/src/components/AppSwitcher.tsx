import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBranding } from "../providers/branding";
import { useSession } from "../lib/auth-client";
import { APPS } from "../pages/Home";
import { BrandMark } from "./BrandMark";
import { CheckIcon, ChevronDownIcon, DashboardIcon } from "./icons";

/**
 * 顶部品牌 + 应用切换器：显示「{站点} · {当前应用} ▾」，
 * 点击展开下拉可切到其它应用（邮箱 / 通讯录 / 管理后台）或回应用中心。
 */
export function AppSwitcher({ current, label }: { current: string; label?: string }) {
  const navigate = useNavigate();
  const { siteName } = useBranding();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const apps = APPS.filter((a) => !a.adminOnly || role === "admin");
  const currentApp = apps.find((a) => a.key === current);
  // current 不在 APPS 时（如账户中心）用传入 label 展示
  const currentName = label ?? currentApp?.name;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-full items-center gap-2 rounded-xl px-2 py-2 outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus/50 sm:px-1.5 sm:py-1"
      >
        <BrandMark />
        <span className="truncate text-sm font-semibold text-foreground">{siteName}</span>
        {currentName && (
          <span className="shrink-0 text-sm text-muted">· {currentName}</span>
        )}
        <ChevronDownIcon
          className={"size-4 shrink-0 text-muted transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-overlay">
          <div className="px-2 py-1 text-xs text-muted">切换应用</div>
          {apps.map((a) => {
            const Icon = a.Icon;
            const active = a.key === current;
            return (
              <button
                key={a.key}
                onClick={() => {
                  setOpen(false);
                  if (!active) navigate(a.to);
                }}
                className={
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm " +
                  (active
                    ? "bg-surface-secondary"
                    : "hover:bg-surface-secondary")
                }
              >
                <span className={"flex size-6 shrink-0 items-center justify-center rounded-md text-white " + a.tile}>
                  <Icon className="size-3.5" />
                </span>
                <span className="flex-1 text-left text-foreground">{a.name}</span>
                {active && <CheckIcon className="size-4 shrink-0 text-accent" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-separator" />
          <button
            onClick={() => {
              setOpen(false);
              navigate("/");
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-secondary hover:text-foreground"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-muted">
              <DashboardIcon className="size-3.5" />
            </span>
            <span className="flex-1 text-left">应用中心</span>
          </button>
        </div>
      )}
    </div>
  );
}
