/** 字节转人类可读 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** GiB 数 → 字节 */
export function gibToBytes(gib: number): number {
  return Math.round(gib * 1024 * 1024 * 1024);
}

/** 字节 → GiB（保留 2 位） */
export function bytesToGib(bytes: number): number {
  return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
}

/** 日期格式化 */
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}
