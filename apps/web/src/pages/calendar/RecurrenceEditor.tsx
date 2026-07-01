import { Input, Label, TextField } from "@heroui/react";
import { Select } from "../../components/Select";
import {
  WEEKDAY_KEYS,
  WEEKDAY_KEY_CN,
  type RecurrencePreset,
} from "./lib";

/** 重复规则编辑器：把常用 RRULE（频率/间隔/星期/结束）以表单形式编辑 */
export function RecurrenceEditor({
  value,
  onChange,
}: {
  value: RecurrencePreset;
  onChange: (p: RecurrencePreset) => void;
}) {
  const set = (patch: Partial<RecurrencePreset>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <Select
        ariaLabel="重复频率"
        value={value.freq}
        onChange={(v) => set({ freq: v as RecurrencePreset["freq"] })}
        options={[
          { value: "", label: "不重复" },
          { value: "DAILY", label: "每天" },
          { value: "WEEKLY", label: "每周" },
          { value: "MONTHLY", label: "每月" },
          { value: "YEARLY", label: "每年" },
        ]}
      />

      {value.freq && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">每</span>
            <TextField className="w-20">
              <Input
                type="number"
                min={1}
                value={String(value.interval)}
                onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
              />
            </TextField>
            <span className="text-sm text-muted">
              {value.freq === "DAILY"
                ? "天"
                : value.freq === "WEEKLY"
                  ? "周"
                  : value.freq === "MONTHLY"
                    ? "个月"
                    : "年"}
            </span>
          </div>

          {value.freq === "WEEKLY" && (
            <div>
              <Label className="mb-1.5 block text-sm text-foreground">在这些日子重复</Label>
              <div className="flex gap-1">
                {WEEKDAY_KEYS.map((k) => {
                  const on = value.byweekday.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        set({
                          byweekday: on
                            ? value.byweekday.filter((d) => d !== k)
                            : [...value.byweekday, k],
                        })
                      }
                      className={
                        "flex size-8 items-center justify-center rounded-full text-sm transition-colors " +
                        (on
                          ? "bg-accent text-accent-foreground"
                          : "bg-surface-secondary text-muted hover:text-foreground")
                      }
                    >
                      {WEEKDAY_KEY_CN[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block text-sm text-foreground">结束</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="recur-end"
                  checked={value.end === "never"}
                  onChange={() => set({ end: "never" })}
                />
                永不
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="recur-end"
                  checked={value.end === "count"}
                  onChange={() => set({ end: "count" })}
                />
                重复
                <TextField className="w-20" isDisabled={value.end !== "count"}>
                  <Input
                    type="number"
                    min={1}
                    value={String(value.count)}
                    onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </TextField>
                次后
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="recur-end"
                  checked={value.end === "until"}
                  onChange={() => set({ end: "until" })}
                />
                截止到
                <input
                  type="date"
                  value={value.until}
                  disabled={value.end !== "until"}
                  onChange={(e) => set({ until: e.target.value })}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:opacity-50"
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
