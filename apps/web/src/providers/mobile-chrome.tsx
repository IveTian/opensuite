import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface MobileChromeContextValue {
  hideBottomNav: boolean;
  setHideBottomNav: (hide: boolean) => void;
}

const MobileChromeContext = createContext<MobileChromeContextValue>({
  hideBottomNav: false,
  setHideBottomNav: () => {},
});

/** 控制移动端底部导航等 chrome 的显隐（如邮件阅读全屏时隐藏） */
export function MobileChromeProvider({ children }: { children: ReactNode }) {
  const [hideBottomNav, setHideBottomNav] = useState(false);
  const value = useMemo(
    () => ({ hideBottomNav, setHideBottomNav }),
    [hideBottomNav],
  );
  return <MobileChromeContext.Provider value={value}>{children}</MobileChromeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMobileChrome() {
  return useContext(MobileChromeContext);
}
