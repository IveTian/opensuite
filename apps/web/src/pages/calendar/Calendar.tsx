import { Button, Input, Label, Modal, TextField } from "@heroui/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Calendar as Cal, CalendarEvent } from "@mailflare/shared";
import { AppSwitcher } from "../../components/AppSwitcher";
import { PersonAvatar } from "../../components/PersonAvatar";
import { Select } from "../../components/Select";
import { Alert } from "../../components/ui";
import {
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoonIcon,
  PlusIcon,
  SlidersIcon,
  SunIcon,
  XIcon,
} from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { useCalendarRealtime, type CalendarReminder } from "../../hooks/useCalendarRealtime";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/auth-client";
import { useTheme } from "../../providers/theme";
import { CalendarSettingsModal } from "./CalendarSettingsModal";
import { EventModal } from "./EventModal";
import { MonthView } from "./MonthView";
import { TimeGrid } from "./TimeGrid";
import {
  addDays,
  dayTitle,
  eventColor,
  fmtTime,
  monthDays,
  monthTitle,
  startOfDay,
  weekDays,
} from "./lib";

type View = "month" | "week" | "day";

const HIDDEN_KEY = "mf-cal-hidden";

export function Calendar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();
  const image = (session?.user as { image?: string | null } | undefined)?.image ?? null;

  const [view, setView] = useState<View>(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? "day" : "month"));
  const [calPanelOpen, setCalPanelOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [modal, setModal] = useState<
    | { mode: "create"; prefill?: Parameters<typeof EventModal>[0]["prefill"] }
    | { mode: "edit"; event: CalendarEvent }
    | null
  >(null);
  const [newCalOpen, setNewCalOpen] = useState(false);
  const [settingsCal, setSettingsCal] = useState<Cal | null>(null);
  const [reminders, setReminders] = useState<CalendarReminder[]>([]);
  const [err, setErr] = useState("");

  const { data: calendars, refetch: refetchCalendars } =
    useFetch<Cal[]>("/api/calendar/calendars");

  // 可见窗口 [from, to)
  const [gridDays, from, to] = useMemo<[Date[], Date, Date]>(() => {
    if (view === "month") {
      const days = monthDays(cursor);
      return [days, days[0]!, addDays(days[41]!, 1)];
    }
    if (view === "week") {
      const days = weekDays(cursor);
      return [days, days[0]!, addDays(days[6]!, 1)];
    }
    return [[cursor], startOfDay(cursor), addDays(startOfDay(cursor), 1)];
  }, [view, cursor]);

  const eventsPath = `/api/calendar/events?from=${encodeURIComponent(
    from.toISOString(),
  )}&to=${encodeURIComponent(to.toISOString())}`;
  const { data: events, refetch: refetchEvents } = useFetch<CalendarEvent[]>(eventsPath);

  // 实时：入站邀请/他人改动刷新；提醒到点弹站内提示
  useCalendarRealtime({
    onUpdated: () => void refetchEvents(),
    onReminder: (r) => {
      setReminders((prev) => [...prev.filter((x) => x.id + x.occurrenceStart !== r.id + r.occurrenceStart), r]);
      setTimeout(
        () => setReminders((prev) => prev.filter((x) => x.id + x.occurrenceStart !== r.id + r.occurrenceStart)),
        20000,
      );
    },
  });

  const calById = useMemo(
    () => new Map((calendars ?? []).map((c) => [c.id, c])),
    [calendars],
  );
  const editableCalendars = (calendars ?? []).filter((c) => c.role !== "viewer");
  const groups = {
    mine: (calendars ?? []).filter((c) => c.role === "owner" && c.type !== "department"),
    dept: (calendars ?? []).filter((c) => c.type === "department"),
    shared: (calendars ?? []).filter((c) => c.role !== "owner" && c.type !== "department"),
  };

  const visibleEvents = useMemo(
    () => (events ?? []).filter((e) => !hidden.has(e.calendarId)),
    [events, hidden],
  );

  const colorOf = (ev: CalendarEvent) => eventColor(ev, calById.get(ev.calendarId)?.color);

  // 来自通讯录 / 邮件的「新建事件」预填（navigate state）
  useEffect(() => {
    const st = location.state as { newEvent?: NonNullable<Parameters<typeof EventModal>[0]["prefill"]> } | null;
    if (st?.newEvent) {
      setModal({ mode: "create", prefill: st.newEvent });
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function toggleHidden(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function go(delta: number) {
    if (view === "month") setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
    else if (view === "week") setCursor((c) => addDays(c, delta * 7));
    else setCursor((c) => addDays(c, delta));
  }

  async function openEdit(instance: CalendarEvent) {
    try {
      const full = await api.get<CalendarEvent>(`/api/calendar/events/${instance.id}`);
      setModal({
        mode: "edit",
        event: { ...full, occurrenceStart: instance.occurrenceStart, occurrenceEnd: instance.occurrenceEnd },
      });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "加载事件失败");
    }
  }

  function afterMutation() {
    setModal(null);
    void refetchEvents();
  }

  const defaultCalId =
    editableCalendars.find((c) => c.isDefault)?.id ?? editableCalendars[0]?.id;

  const title = view === "month" ? monthTitle(cursor) : view === "day" ? dayTitle(cursor) : monthTitle(cursor);

  return (
    <div className="flex h-full flex-col bg-background mobile-pad-bottom">
      {/* 顶部全宽 Header */}
      <header className="safe-top flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 sm:px-6">
        <AppSwitcher current="calendar" />
        <div className="flex items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            className="touch-target sm:hidden"
            onPress={() => setModal({ mode: "create" })}
            isDisabled={!defaultCalId}
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
            {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
          </Button>
          <button
            onClick={() => navigate("/profile")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
            aria-label="账户设置"
          >
            <PersonAvatar url={image} email={session?.user.email} seed={session?.user.email} className="size-8" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧栏 */}
        <aside className="hidden w-56 shrink-0 flex-col gap-4 border-r border-border p-3 sm:flex">
          <Button variant="primary" onPress={() => setModal({ mode: "create" })} isDisabled={!defaultCalId}>
            <PlusIcon className="size-4" />
            新建事件
          </Button>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <CalendarGroup
              title="我的日历"
              items={groups.mine}
              hidden={hidden}
              onToggle={toggleHidden}
              onSettings={setSettingsCal}
              onAdd={() => setNewCalOpen(true)}
            />
            {groups.dept.length > 0 && (
              <CalendarGroup
                title="部门日历"
                items={groups.dept}
                hidden={hidden}
                onToggle={toggleHidden}
                onSettings={setSettingsCal}
              />
            )}
            {groups.shared.length > 0 && (
              <CalendarGroup
                title="共享给我的"
                items={groups.shared}
                hidden={hidden}
                onToggle={toggleHidden}
                onSettings={setSettingsCal}
              />
            )}
          </div>
        </aside>

        {/* 主区 */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* 工具条 */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-1 sm:gap-2">
              <Button size="sm" variant="secondary" onPress={() => setCursor(startOfDay(new Date()))}>
                今天
              </Button>
              <div className="flex items-center">
                <Button size="sm" variant="ghost" isIconOnly aria-label="上一页" onPress={() => go(-1)}>
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" isIconOnly aria-label="下一页" onPress={() => go(1)}>
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
              <span className="truncate text-sm font-semibold text-foreground">{title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                className="touch-target sm:hidden"
                aria-label="日历列表"
                onPress={() => setCalPanelOpen(true)}
              >
                <SlidersIcon className="size-4" />
              </Button>
              <div className="w-20 sm:w-28">
                <Select
                  ariaLabel="视图"
                  value={view}
                  onChange={(v) => setView(v as View)}
                  options={[
                    { value: "month", label: "月" },
                    { value: "week", label: "周" },
                    { value: "day", label: "日" },
                  ]}
                />
              </div>
            </div>
          </div>

          {err && (
            <div className="px-3 pt-2">
              <Alert>{err}</Alert>
            </div>
          )}

          {view === "month" ? (
            <MonthView
              days={gridDays}
              cursor={cursor}
              events={visibleEvents}
              colorOf={colorOf}
              onSelectEvent={openEdit}
              onCreateAt={(day) =>
                setModal({ mode: "create", prefill: { date: day } })
              }
            />
          ) : (
            <TimeGrid
              days={gridDays}
              events={visibleEvents}
              colorOf={colorOf}
              onSelectEvent={openEdit}
              onCreateAt={(day, hour) => {
                const d = new Date(day);
                d.setHours(hour, 0, 0, 0);
                setModal({ mode: "create", prefill: { date: d } });
              }}
            />
          )}
        </main>
      </div>

      {modal?.mode === "create" && defaultCalId && (
        <EventModal
          editableCalendars={editableCalendars}
          defaultCalendarId={defaultCalId}
          prefill={modal.prefill}
          onClose={() => setModal(null)}
          onSaved={afterMutation}
          onDeleted={afterMutation}
        />
      )}
      {modal?.mode === "edit" && (
        <EventModal
          editableCalendars={editableCalendars}
          event={modal.event}
          onClose={() => setModal(null)}
          onSaved={afterMutation}
          onDeleted={afterMutation}
        />
      )}
      {newCalOpen && (
        <NewCalendarModal
          onClose={() => setNewCalOpen(false)}
          onSaved={() => {
            setNewCalOpen(false);
            void refetchCalendars();
          }}
        />
      )}
      {settingsCal && (
        <CalendarSettingsModal
          calendar={settingsCal}
          onClose={() => setSettingsCal(null)}
          onChanged={() => void refetchCalendars()}
        />
      )}

      {/* 移动端：日历可见性面板 */}
      {calPanelOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCalPanelOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-overlay">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">我的日历</h3>
              <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onPress={() => setCalPanelOpen(false)}>
                <XIcon className="size-4" />
              </Button>
            </div>
            <Button
              variant="primary"
              className="mb-4 w-full"
              onPress={() => {
                setCalPanelOpen(false);
                setModal({ mode: "create" });
              }}
              isDisabled={!defaultCalId}
            >
              <PlusIcon className="size-4" />
              新建事件
            </Button>
            <div className="flex flex-col gap-4">
              <CalendarGroup
                title="我的日历"
                items={groups.mine}
                hidden={hidden}
                onToggle={toggleHidden}
                onSettings={setSettingsCal}
                onAdd={() => {
                  setCalPanelOpen(false);
                  setNewCalOpen(true);
                }}
              />
              {groups.dept.length > 0 && (
                <CalendarGroup
                  title="部门日历"
                  items={groups.dept}
                  hidden={hidden}
                  onToggle={toggleHidden}
                  onSettings={setSettingsCal}
                />
              )}
              {groups.shared.length > 0 && (
                <CalendarGroup
                  title="共享给我的"
                  items={groups.shared}
                  hidden={hidden}
                  onToggle={toggleHidden}
                  onSettings={setSettingsCal}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 站内提醒 */}
      {reminders.length > 0 && (
        <div className="fixed bottom-[calc(var(--mobile-nav-height)+var(--safe-bottom)+1rem)] right-4 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 sm:bottom-4">
          {reminders.map((r) => (
            <div
              key={r.id + r.occurrenceStart}
              className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3 shadow-overlay"
            >
              <BellIcon className="mt-0.5 size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{r.title}</div>
                <div className="text-xs text-muted">
                  {r.allDay ? "全天" : fmtTime(r.occurrenceStart)}
                  {r.location ? ` · ${r.location}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setReminders((prev) =>
                    prev.filter((x) => x.id + x.occurrenceStart !== r.id + r.occurrenceStart),
                  )
                }
                className="text-muted hover:text-foreground"
                aria-label="关闭提醒"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 侧栏日历分组（我的 / 部门 / 共享） */
function CalendarGroup({
  title,
  items,
  hidden,
  onToggle,
  onSettings,
  onAdd,
}: {
  title: string;
  items: Cal[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onSettings: (c: Cal) => void;
  onAdd?: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted">{title}</span>
        {onAdd && (
          <button type="button" onClick={onAdd} className="text-muted hover:text-foreground" aria-label="新建日历">
            <PlusIcon className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((c) => (
          <div key={c.id} className="group flex items-center rounded-lg pr-1 hover:bg-surface-secondary">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={!hidden.has(c.id)}
                onChange={() => onToggle(c.id)}
                style={{ accentColor: c.color ?? "#7c3aed" }}
              />
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? "#7c3aed" }} />
              <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
            </label>
            {c.role === "owner" ? (
              <button
                type="button"
                onClick={() => onSettings(c)}
                className="shrink-0 text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                aria-label="日历设置"
              >
                <SlidersIcon className="size-3.5" />
              </button>
            ) : c.departmentName ? (
              <span className="shrink-0 pr-1 text-xs text-muted">{c.departmentName}</span>
            ) : null}
          </div>
        ))}
        {items.length === 0 && <p className="px-2 py-1 text-xs text-muted">暂无</p>}
      </div>
    </div>
  );
}

/** 简易新建日历弹窗（个人日历） */
function NewCalendarModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7c3aed");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("请填写名称");
    setBusy(true);
    try {
      await api.post("/api/calendar/calendars", { name: name.trim(), color, type: "personal" });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "创建失败");
      setBusy(false);
    }
  }

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <form onSubmit={save}>
              <Modal.Header>
                <div className="flex items-center justify-between gap-4">
                  <Modal.Heading className="text-lg font-semibold text-foreground">新建日历</Modal.Heading>
                  <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onPress={onClose}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </Modal.Header>
              <Modal.Body>
                <div className="flex flex-col gap-3">
                  <TextField isRequired>
                    <Label>名称</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="工作 / 个人" />
                  </TextField>
                  <div className="flex items-center gap-2">
                    <Label>颜色</Label>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-8 w-12 cursor-pointer rounded border border-border bg-surface"
                    />
                  </div>
                  {err && <Alert>{err}</Alert>}
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button type="button" variant="ghost" onPress={onClose}>取消</Button>
                <Button type="submit" variant="primary" isDisabled={busy}>
                  {busy ? "创建中…" : "创建"}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
