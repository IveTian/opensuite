import { useLocation, useNavigate } from "react-router-dom";
import { APPS } from "../pages/Home";
import { useIsMobile } from "../hooks/useIsMobile";
import { useMobileChrome } from "../providers/mobile-chrome";
import { DashboardIcon } from "./icons";

const NAV_ITEMS = [
  ...APPS.filter((a) => !a.adminOnly),
  {
    key: "home",
    name: "应用",
    to: "/",
    Icon: DashboardIcon,
    tile: "bg-surface-secondary text-muted",
  },
];

/** 移动端底部 Tab 导航（邮箱 / 通讯录 / 日历 / 应用中心） */
export function MobileBottomNav() {
  const mobile = useIsMobile();
  const { hideBottomNav } = useMobileChrome();
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname;
  const show =
    mobile &&
    !hideBottomNav &&
    (path === "/" ||
      path === "/mail" ||
      path === "/contacts" ||
      path === "/calendar" ||
      path === "/profile");

  if (!show) return null;

  function activeTab() {
    if (path.startsWith("/mail")) return "mail";
    if (path.startsWith("/contacts")) return "contacts";
    if (path.startsWith("/calendar")) return "calendar";
    if (path === "/profile") return "home";
    return "home";
  }

  const current = activeTab();

  return (
    <nav
      aria-label="主导航"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md sm:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {NAV_ITEMS.map((tab) => {
          const Icon = tab.Icon;
          const active = tab.key === current;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.to)}
              className={
                "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] outline-none " +
                (active ? "text-accent" : "text-muted")
              }
              aria-current={active ? "page" : undefined}
            >
              <Icon className={"size-5 " + (active ? "text-accent" : "")} />
              <span className="truncate">{tab.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
