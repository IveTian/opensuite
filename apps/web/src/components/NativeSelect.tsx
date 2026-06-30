import type { SelectHTMLAttributes } from "react";
import { ChevronRightIcon } from "./icons";

/**
 * 轻量原生下拉框（套用 HeroUI v3 field 设计令牌）。
 */
export function NativeSelect({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label && <span className="font-medium text-foreground">{label}</span>}
      <div className="relative">
        <select
          {...props}
          className={
            "w-full appearance-none rounded-xl border border-border bg-field px-3 py-2 pr-9 text-field-foreground " +
            "transition-colors hover:border-field-border-hover focus:border-field-border-focus focus:outline-none focus:ring-2 focus:ring-focus/40 " +
            (className ?? "")
          }
        >
          {children}
        </select>
        <ChevronRightIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted" />
      </div>
    </label>
  );
}
