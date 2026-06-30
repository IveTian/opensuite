/** R2 对象 key 规则（原始 MIME 与附件） */
export const rawKey = (messageId: string) => `raw/${messageId}.eml`;
export const attachmentKey = (messageId: string, attachmentId: string) =>
  `att/${messageId}/${attachmentId}`;

/** 把 postal-mime 的附件内容归一化为可写入 R2 的字节 */
export function toBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === "string") return new TextEncoder().encode(content);
  if (content instanceof Uint8Array) return content;
  return new Uint8Array(content);
}

/** base64 → 字节（Workers 全局 atob） */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
