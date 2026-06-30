/** 邮件 HTML 工具：内联图提取、HTML 引用块构造。仅在浏览器端使用（依赖 DOMParser）。 */

export interface InlineAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
  contentId: string;
  inline: true;
}

export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 把正文里的 data: 图片抽取为内联附件，并将 <img src> 改写为 cid: 引用。
 * 返回改写后的 html 与内联附件列表（用于发送时 disposition:'inline'）。
 */
export function extractInlineImages(html: string): { html: string; inline: InlineAttachment[] } {
  if (!html || !html.includes("data:image")) return { html, inline: [] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const inline: InlineAttachment[] = [];
  let i = 0;
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    const m = /^data:([^;]+);base64,(.*)$/i.exec(src);
    if (!m) return;
    const contentType = m[1] || "image/png";
    const contentBase64 = m[2] ?? "";
    const ext = (contentType.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "") || "png";
    const contentId = `${crypto.randomUUID()}@mailflare`;
    img.setAttribute("src", `cid:${contentId}`);
    inline.push({ filename: `image-${++i}.${ext}`, contentType, contentBase64, contentId, inline: true });
  });
  return { html: doc.body.innerHTML, inline };
}

/** 从 HTML 提取纯文本（用于 multipart/alternative 的 text/plain 兜底） */
export function htmlToText(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export interface QuoteSource {
  fromAddress: string | null;
  subject?: string | null;
  date: string;
  to?: string[] | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
}

function originalBlock(o: QuoteSource): string {
  if (o.bodyHtml) return o.bodyHtml;
  return htmlEscape(o.bodyText ?? "").replace(/\r?\n/g, "<br>");
}

/** 回复：两个空行 + 「在 …，… 写道：」+ blockquote 引用原文 */
export function buildReplyHtml(o: QuoteSource): string {
  const head = `在 ${htmlEscape(o.date)}，${htmlEscape(o.fromAddress ?? "")} 写道：`;
  return `<p></p><p></p><div>${head}</div><blockquote>${originalBlock(o)}</blockquote>`;
}

/** 转发：两个空行 + 转发头 + 原文 */
export function buildForwardHtml(o: QuoteSource): string {
  const lines = [
    "---------- 转发的邮件 ----------",
    `发件人：${htmlEscape(o.fromAddress ?? "")}`,
    o.subject ? `主题：${htmlEscape(o.subject)}` : "",
    `日期：${htmlEscape(o.date)}`,
    o.to?.length ? `收件人：${htmlEscape(o.to.join(", "))}` : "",
  ].filter(Boolean);
  const header = lines.map((l) => `<div>${l}</div>`).join("");
  return `<p></p><p></p>${header}<br>${originalBlock(o)}`;
}
