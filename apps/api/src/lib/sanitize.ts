/**
 * 轻量出站 HTML 清洗（Cloudflare Worker 无 DOM，用正则做纵深防御）。
 * 仅用于撰写产生的出站正文（TipTap 输出，本就不含 script/style）；
 * 入站邮件渲染时由前端 DOMPurify 主清洗。
 */
export function sanitizeOutboundHtml(html: string): string {
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
}
