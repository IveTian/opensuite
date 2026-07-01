import { Button } from "@heroui/react";
import { useOnline } from "../hooks/useOnline";

/** 顶部离线状态条：提示用户当前为离线模式，功能受限 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning-foreground"
    >
      <span>您当前处于离线模式，可查看已缓存的邮件；发送、同步等功能需联网后使用。</span>
    </div>
  );
}
