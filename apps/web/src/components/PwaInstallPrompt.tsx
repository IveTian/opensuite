import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { DownloadIcon, XIcon } from "./icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** 捕获 beforeinstallprompt，引导用户安装 PWA（桌面/移动） */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("pwa-install-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || !deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setInstalled(true);
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem("pwa-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lg sm:left-auto sm:right-6">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <DownloadIcon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">安装 MailFlare</p>
        <p className="text-xs text-muted">添加到主屏幕，像原生应用一样快速打开，并支持离线查看邮件。</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="primary" onClick={install}>
          安装
        </Button>
        <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onClick={dismiss}>
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
