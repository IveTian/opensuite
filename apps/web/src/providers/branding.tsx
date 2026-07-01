import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { BrandingConfig } from "@mailflare/shared";
import { api } from "../lib/api";

const DEFAULT: BrandingConfig = { siteName: "MailFlare", logoUrl: null };

const BrandingContext = createContext<BrandingConfig>(DEFAULT);

/** 读取本地缓存的品牌，避免刷新时闪烁（登录页也用） */
function cached(): BrandingConfig {
  try {
    const s = localStorage.getItem("branding");
    if (s) return { ...DEFAULT, ...(JSON.parse(s) as Partial<BrandingConfig>) };
  } catch {
    /* 忽略损坏缓存 */
  }
  return DEFAULT;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingConfig>(cached);

  useEffect(() => {
    let cancelled = false;
    api
      .get<BrandingConfig>("/api/public/branding")
      .then((b) => {
        if (cancelled) return;
        const next: BrandingConfig = {
          siteName: b.siteName || "MailFlare",
          logoUrl: b.logoUrl ?? null,
        };
        setBranding(next);
        try {
          localStorage.setItem("branding", JSON.stringify(next));
        } catch {
          /* 忽略存储失败 */
        }
      })
      .catch(() => {
        /* 公开端点失败时静默用缓存/默认 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = branding.siteName;
  }, [branding.siteName]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useBranding = () => useContext(BrandingContext);
