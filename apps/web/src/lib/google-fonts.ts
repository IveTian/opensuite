/**
 * Google Fonts 支持：拉取字体清单、按需加载 web 字体、生成带 fallback 的 font-family 值。
 *
 * - 配置 `VITE_GOOGLE_FONTS_API_KEY` 时走 Google Fonts Developer API 拉全量字体（按流行度排序）；
 *   未配置或请求失败则回退到内置热门清单，保证功能始终可用。
 * - 邮件客户端多数不会加载 web 字体，故应用到正文的 font-family 一律带通用 fallback，
 *   收件端无法加载时至少能回退到同类系统字体。
 */

export interface FontOption {
  /** 字体族名，如 "Roboto" */
  family: string;
  /** Google 分类：sans-serif / serif / display / handwriting / monospace */
  category?: string;
}

/** 系统安全字体（无需网络加载）。value 为空表示「清除字体」。 */
export const SYSTEM_FONTS: { label: string; value: string }[] = [
  { label: "默认字体", value: "" },
  { label: "系统 Sans", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: "衬线 Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "等宽 Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
];

/** 无 API Key 时的内置热门 Google Fonts 回退清单 */
const FALLBACK_FONTS: FontOption[] = [
  { family: "Roboto", category: "sans-serif" },
  { family: "Open Sans", category: "sans-serif" },
  { family: "Lato", category: "sans-serif" },
  { family: "Montserrat", category: "sans-serif" },
  { family: "Poppins", category: "sans-serif" },
  { family: "Inter", category: "sans-serif" },
  { family: "Nunito", category: "sans-serif" },
  { family: "Raleway", category: "sans-serif" },
  { family: "Work Sans", category: "sans-serif" },
  { family: "Noto Sans SC", category: "sans-serif" },
  { family: "Merriweather", category: "serif" },
  { family: "Playfair Display", category: "serif" },
  { family: "Lora", category: "serif" },
  { family: "PT Serif", category: "serif" },
  { family: "Roboto Slab", category: "serif" },
  { family: "Noto Serif SC", category: "serif" },
  { family: "Roboto Mono", category: "monospace" },
  { family: "Source Code Pro", category: "monospace" },
  { family: "JetBrains Mono", category: "monospace" },
  { family: "Oswald", category: "display" },
  { family: "Bebas Neue", category: "display" },
  { family: "Dancing Script", category: "handwriting" },
  { family: "Pacifico", category: "handwriting" },
];

/** Google 分类 → CSS 通用 fallback 族 */
function fallbackFor(category?: string): string {
  switch (category) {
    case "serif":
      return "serif";
    case "monospace":
      return "monospace";
    case "handwriting":
    case "display":
      return "cursive";
    default:
      return "sans-serif";
  }
}

let cache: FontOption[] | null = null;
let inflight: Promise<FontOption[]> | null = null;

/** 拉取可选字体清单（进程内缓存，重复调用不再请求） */
export function fetchGoogleFonts(): Promise<FontOption[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  const key = import.meta.env.VITE_GOOGLE_FONTS_API_KEY;
  if (!key) {
    cache = FALLBACK_FONTS;
    return Promise.resolve(cache);
  }

  inflight = fetch(`https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${key}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data: { items?: { family: string; category?: string }[] }) => {
      const items = (data.items ?? []).map((f) => ({ family: f.family, category: f.category }));
      cache = items.length ? items : FALLBACK_FONTS;
      return cache;
    })
    .catch(() => {
      cache = FALLBACK_FONTS;
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const loaded = new Set<string>();

/** 把某个 Google 字体的 <link> 注入文档 head，用于编辑器内实时预览（去重） */
export function loadGoogleFont(family: string): void {
  if (!family || loaded.has(family) || typeof document === "undefined") return;
  loaded.add(family);
  const id = "gf-" + family.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=" +
    encodeURIComponent(family).replace(/%20/g, "+") +
    ":wght@400;500;700&display=swap";
  document.head.appendChild(link);
}

/** 生成写入正文的 font-family 值（首选字体 + 通用 fallback） */
export function googleFontCss(family: string, category?: string): string {
  return `'${family}', ${fallbackFor(category)}`;
}

/** 从 font-family 值里取首个字体名（去引号），用于工具栏当前值回显 */
export function primaryFontName(fontFamily: string): string {
  const first = fontFamily.split(",")[0]?.trim() ?? "";
  return first.replace(/^['"]|['"]$/g, "");
}
