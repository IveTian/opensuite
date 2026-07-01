import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ContactSuggestion } from "../hooks/useContactSuggestions";

/** 拆出已填入的邮箱（小写），用于在候选中排除已选 */
function chosenEmails(value: string): Set<string> {
  return new Set(
    value
      .split(/[,\s;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * 收件人输入框：保持「逗号分隔字符串」模型，附带通讯录联想下拉。
 * 只对最后一个未完成的 token 做匹配；选中即把邮箱追加进字符串。
 */
export function RecipientInput({
  label,
  labelRight,
  placeholder,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  labelRight?: ReactNode;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: ContactSuggestion[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastSep = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  const token = value.slice(lastSep + 1).trim().toLowerCase();
  const already = chosenEmails(value);

  const matches =
    token.length >= 1
      ? suggestions
          .filter(
            (s) =>
              !already.has(s.email.toLowerCase()) &&
              (s.name.toLowerCase().includes(token) ||
                s.email.toLowerCase().includes(token)),
          )
          .slice(0, 6)
      : [];
  const showList = open && matches.length > 0;

  function choose(s: ContactSuggestion) {
    const head = value.slice(0, lastSep + 1);
    onChange((head ? head + " " : "") + s.email + ", ");
    setActive(0);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      // 有候选时拦截回车：选中而不是提交表单
      e.preventDefault();
      const pick = matches[Math.min(active, matches.length - 1)];
      if (pick) choose(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        {labelRight}
      </div>
      <div className="relative">
        <input
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-field-border-focus focus:outline-none focus:ring-2 focus:ring-focus/40"
        />
        {showList && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface p-1 shadow-overlay">
            {matches.map((s, i) => (
              <li key={s.email}>
                <button
                  type="button"
                  // onMouseDown 先于 input 的 blur 触发，保证点击生效
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    choose(s);
                  }}
                  className={
                    "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm " +
                    (i === active ? "bg-surface-secondary" : "hover:bg-surface-secondary")
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{s.name}</span>
                    <span className="block truncate text-xs text-muted">{s.email}</span>
                  </span>
                  {s.sub && (
                    <span className="shrink-0 text-xs text-muted">{s.sub}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
