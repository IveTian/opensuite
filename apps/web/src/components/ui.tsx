import { Chip } from "@heroui/react";
import type { ReactNode } from "react";
import { AlertTriangleIcon, CheckIcon } from "./icons";

/** 卡片面板（HeroUI v3 surface 表面 + 内置阴影） */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-surface p-5 shadow-surface ${className}`}>
      {children}
    </div>
  );
}

/** 页头：标题 + 右侧操作区 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 简单提示条 */
export function Alert({
  kind = "danger",
  children,
}: {
  kind?: "danger" | "success";
  children: ReactNode;
}) {
  const styles =
    kind === "success"
      ? "bg-success-soft text-success-soft-foreground"
      : "bg-danger-soft text-danger-soft-foreground";
  const Icon = kind === "success" ? CheckIcon : AlertTriangleIcon;
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${styles}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

/** 通用数据表（HeroUI v3 令牌） */
export function Table<T>({
  columns,
  rows,
  empty = "暂无数据",
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-surface">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-separator">
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-muted"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-separator/60 last:border-0 transition-colors hover:bg-surface-secondary"
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3 align-middle">
                    {c.render
                      ? c.render(row)
                      : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type BadgeTone = "default" | "success" | "warning" | "danger" | "primary";

/** 状态徽标（基于 HeroUI Chip 的 soft 变体） */
export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  const color = tone === "primary" ? "accent" : tone;
  return (
    <Chip color={color} variant="soft" size="sm">
      {children}
    </Chip>
  );
}
