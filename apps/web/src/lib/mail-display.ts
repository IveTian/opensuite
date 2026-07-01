import { useSyncExternalStore } from "react";

/** 邮箱列表/阅读布局：双栏（列表+阅读窗）或单列（Gmail 行 + 单页阅读） */
export type MailDisplayMode = "split" | "single";

const KEY = "mail-display";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot(): MailDisplayMode {
  try {
    return localStorage.getItem(KEY) === "single" ? "single" : "split";
  } catch {
    return "split";
  }
}

export function useMailDisplayMode(): MailDisplayMode {
  return useSyncExternalStore(subscribe, snapshot, () => "split");
}

export function setMailDisplayMode(mode: MailDisplayMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* 忽略存储失败 */
  }
  listeners.forEach((cb) => cb());
}
