import type { ReactNode } from "react";

/** 卡片面板（套用 HeroUI 设计令牌的表面） */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border border-default-200 bg-content1 p-5 " + (className ?? "")
      }
    >
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
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-foreground-500">{subtitle}</p>}
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
  const cls =
    kind === "success"
      ? "bg-success/10 text-success"
      : "bg-danger/10 text-danger";
  return <div className={"rounded-lg px-3 py-2 text-sm " + cls}>{children}</div>;
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

/** 通用数据表（HTML + Tailwind，套用 HeroUI 令牌） */
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
    <div className="overflow-x-auto rounded-xl border border-default-200">
      <table className="w-full text-sm">
        <thead className="bg-default-100 text-left text-foreground-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-2.5 font-medium whitespace-nowrap">
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
                className="px-4 py-10 text-center text-foreground-400"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-default-200 hover:bg-default-50">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-2.5 align-middle">
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

/** 状态徽标 */
export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "primary";
}) {
  const map: Record<string, string> = {
    default: "bg-default-200 text-foreground-700",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
    primary: "bg-primary/15 text-primary",
  };
  return (
    <span className={"inline-block rounded-full px-2 py-0.5 text-xs " + map[tone]}>
      {children}
    </span>
  );
}
