import { useMemo, useState } from "react";
import type { DirectoryPayload, PersonalContact } from "@mailflare/shared";
import { XIcon } from "../../components/icons";
import { PersonAvatar } from "../../components/PersonAvatar";
import { useFetch } from "../../hooks/useFetch";

export interface AttendeeDraft {
  email: string;
  displayName?: string | null;
  userId?: string | null;
}

interface Suggestion {
  email: string;
  name: string;
  userId: string | null;
  image?: string | null;
  sub?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 参与者选择器：从组织通讯录 + 个人通讯录搜索选人，也可直接输入外部邮箱。
 * 复用现有 /api/contacts/directory 与 /api/contacts/personal，无需新端点。
 */
export function AttendeePicker({
  value,
  onChange,
}: {
  value: AttendeeDraft[];
  onChange: (v: AttendeeDraft[]) => void;
}) {
  const { data: directory } = useFetch<DirectoryPayload>("/api/contacts/directory");
  const { data: personal } = useFetch<PersonalContact[]>("/api/contacts/personal");
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);

  const chosen = new Set(value.map((a) => a.email.toLowerCase()));

  const suggestions = useMemo<Suggestion[]>(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return [];
    const out: Suggestion[] = [];
    for (const e of directory?.entries ?? []) {
      if (chosen.has(e.email.toLowerCase())) continue;
      if ([e.name, e.email, e.departmentName, e.jobTitle].filter(Boolean).some((s) => s!.toLowerCase().includes(kw))) {
        out.push({ email: e.email, name: e.name, userId: e.userId, image: e.image, sub: e.departmentName });
      }
    }
    for (const c of personal ?? []) {
      if (chosen.has(c.email.toLowerCase())) continue;
      if ([c.displayName, c.email, c.company].filter(Boolean).some((s) => s!.toLowerCase().includes(kw))) {
        out.push({ email: c.email, name: c.displayName, userId: null, sub: c.company });
      }
    }
    return out.slice(0, 8);
  }, [q, directory, personal, chosen]);

  function add(a: AttendeeDraft) {
    if (chosen.has(a.email.toLowerCase())) return;
    onChange([...value, a]);
    setQ("");
  }
  function addRaw() {
    const email = q.trim().toLowerCase();
    if (EMAIL_RE.test(email) && !chosen.has(email)) {
      add({ email });
    }
  }
  function remove(email: string) {
    onChange(value.filter((a) => a.email !== email));
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((a) => (
            <span
              key={a.email}
              className="flex items-center gap-1.5 rounded-full bg-surface-secondary py-1 pl-1 pr-2 text-sm"
            >
              <PersonAvatar email={a.email} seed={a.email} className="size-5" />
              <span className="text-foreground">{a.displayName || a.email}</span>
              <button
                type="button"
                onClick={() => remove(a.email)}
                className="text-muted hover:text-foreground"
                aria-label={`移除 ${a.email}`}
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions[0]) add(suggestions[0]);
              else addRaw();
            }
          }}
          placeholder="搜索联系人或输入邮箱…"
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
        />
        {focused && (suggestions.length > 0 || (q.trim() && EMAIL_RE.test(q.trim()))) && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-overlay">
            {suggestions.map((s) => (
              <button
                key={s.email + (s.userId ?? "")}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add({ email: s.email, displayName: s.name, userId: s.userId })}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-secondary"
              >
                <PersonAvatar email={s.email} seed={s.email} url={s.image ?? null} className="size-7 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{s.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {s.email}
                    {s.sub ? ` · ${s.sub}` : ""}
                  </span>
                </span>
              </button>
            ))}
            {q.trim() && EMAIL_RE.test(q.trim()) && !chosen.has(q.trim().toLowerCase()) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addRaw}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-accent hover:bg-surface-secondary"
              >
                添加外部邮箱「{q.trim()}」
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
