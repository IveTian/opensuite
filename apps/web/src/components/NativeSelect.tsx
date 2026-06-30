import type { SelectHTMLAttributes } from "react";

/**
 * 轻量原生下拉框（套用 HeroUI 设计令牌的样式）。
 * 第一阶段用它替代 HeroUI Select 以确保稳定编译；后续可平滑替换为 HeroUI Select。
 */
export function NativeSelect({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label && <span className="font-medium text-foreground-600">{label}</span>}
      <select
        {...props}
        className={
          "rounded-lg border border-default-200 bg-default-100 px-3 py-2 text-foreground " +
          "focus:outline-none focus:ring-2 focus:ring-primary " +
          (className ?? "")
        }
      >
        {children}
      </select>
    </label>
  );
}
