import { Button, Input, Label, Modal, Switch, TextField } from "@heroui/react";
import { useMemo, useState, type FormEvent } from "react";
import type { Calendar, CalendarEvent } from "@mailflare/shared";
import { Alert } from "../../components/ui";
import { TrashIcon, XIcon } from "../../components/icons";
import { Select } from "../../components/Select";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/auth-client";
import { AttendeePicker, type AttendeeDraft } from "./AttendeePicker";
import { RecurrenceEditor } from "./RecurrenceEditor";
import {
  BROWSER_TZ,
  DEFAULT_RECUR,
  REMINDER_PRESETS,
  buildRrule,
  parseRrule,
  utcToDateStr,
  utcToWall,
  wallToUtcISO,
} from "./lib";

type ReminderDraft = { minutesBefore: number; method: "popup" | "email" };

const TZ_OPTIONS = [
  ...new Set([
    BROWSER_TZ,
    "Asia/Shanghai",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "UTC",
  ]),
];

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00");
  d.setDate(d.getDate() + n);
  return toDateInput(d);
}

const fieldCls =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus/50";

/** 新建 / 编辑事件弹窗 */
export function EventModal({
  editableCalendars,
  defaultCalendarId,
  event,
  prefill,
  onClose,
  onSaved,
  onDeleted,
}: {
  editableCalendars: Calendar[];
  defaultCalendarId?: string;
  event?: CalendarEvent | null;
  prefill?: {
    date?: Date;
    title?: string;
    description?: string;
    attendees?: AttendeeDraft[];
  } | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const editing = Boolean(event?.id);
  const { data: session } = useSession();
  const myEmail = session?.user.email?.toLowerCase();

  const tz = event?.timezone || BROWSER_TZ;

  // 初值：编辑取事件（时间取本次实例），新建取 prefill
  const init = useMemo(() => {
    if (event) {
      const allDay = event.allDay;
      const start = new Date(event.occurrenceStart);
      const end = new Date(event.occurrenceEnd);
      return {
        calendarId: event.calendarId,
        title: event.title,
        description: event.description ?? "",
        location: event.location ?? "",
        allDay,
        startLocal: utcToWall(event.occurrenceStart, tz),
        endLocal: utcToWall(event.occurrenceEnd, tz),
        startDate: utcToDateStr(event.occurrenceStart, tz),
        endDate: utcToDateStr(new Date(end.getTime() - 1).toISOString(), tz),
        color: event.color ?? "",
        recur: parseRrule(event.rrule),
        attendees: (event.attendees ?? [])
          .filter((a) => !a.isOrganizer)
          .map((a) => ({ email: a.email, displayName: a.displayName, userId: a.userId })),
        reminders: (event.reminders ?? []) as ReminderDraft[],
        _start: start,
      };
    }
    const base = prefill?.date ?? new Date();
    const start = new Date(base);
    if (!prefill?.date) start.setHours(start.getHours() + 1, 0, 0, 0);
    else start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      calendarId: defaultCalendarId ?? editableCalendars[0]?.id ?? "",
      title: prefill?.title ?? "",
      description: prefill?.description ?? "",
      location: "",
      allDay: false,
      startLocal: toLocalInput(start),
      endLocal: toLocalInput(end),
      startDate: toDateInput(start),
      endDate: toDateInput(start),
      color: "",
      recur: { ...DEFAULT_RECUR },
      attendees: prefill?.attendees ?? [],
      reminders: [{ minutesBefore: 10, method: "popup" }] as ReminderDraft[],
      _start: start,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [calendarId, setCalendarId] = useState(init.calendarId);
  const [title, setTitle] = useState(init.title);
  const [description, setDescription] = useState(init.description);
  const [location, setLocation] = useState(init.location);
  const [allDay, setAllDay] = useState(init.allDay);
  const [startLocal, setStartLocal] = useState(init.startLocal);
  const [endLocal, setEndLocal] = useState(init.endLocal);
  const [startDate, setStartDate] = useState(init.startDate);
  const [endDate, setEndDate] = useState(init.endDate);
  const [timezone, setTimezone] = useState(tz);
  const [recur, setRecur] = useState(init.recur);
  const [attendees, setAttendees] = useState<AttendeeDraft[]>(init.attendees);
  const [reminders, setReminders] = useState<ReminderDraft[]>(init.reminders);
  const [scope, setScope] = useState<"this" | "following" | "all">("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isRecurring = Boolean(event?.rrule);
  const myAttendee = event?.attendees?.find(
    (a) => a.email.toLowerCase() === myEmail && !a.isOrganizer,
  );

  function computeTimes(): { startsAt: string; endsAt: string } {
    if (allDay) {
      return {
        startsAt: wallToUtcISO(`${startDate}T00:00`, timezone),
        endsAt: wallToUtcISO(`${addDaysStr(endDate, 1)}T00:00`, timezone),
      };
    }
    return {
      startsAt: wallToUtcISO(startLocal, timezone),
      endsAt: wallToUtcISO(endLocal, timezone),
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) return setErr("请填写标题");
    if (!calendarId) return setErr("请选择日历");
    const { startsAt, endsAt } = computeTimes();
    if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
      return setErr("结束时间不能早于开始时间");
    }
    setBusy(true);
    try {
      const body = {
        calendarId,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        color: init.color || null,
        allDay,
        startsAt,
        endsAt,
        timezone,
        rrule: buildRrule(recur),
        attendees: attendees.map((a) => ({
          email: a.email,
          displayName: a.displayName ?? null,
          userId: a.userId ?? null,
          role: "required" as const,
        })),
        reminders,
        sendInvites: true,
      };
      if (editing && event) {
        await api.patch(`/api/calendar/events/${event.id}`, {
          ...body,
          scope: isRecurring ? scope : "all",
          occurrenceStart: event.occurrenceStart,
        });
      } else {
        await api.post("/api/calendar/events", body);
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    setBusy(true);
    setErr("");
    try {
      const q = isRecurring
        ? `?scope=${scope}&occurrenceStart=${encodeURIComponent(event.occurrenceStart)}`
        : "";
      await api.del(`/api/calendar/events/${event.id}${q}`);
      onDeleted();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "删除失败");
      setBusy(false);
    }
  }

  async function rsvp(partstat: "accepted" | "declined" | "tentative") {
    if (!event) return;
    setBusy(true);
    try {
      await api.post(`/api/calendar/events/${event.id}/rsvp`, { partstat });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "回执失败");
      setBusy(false);
    }
  }

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <form onSubmit={save}>
              <Modal.Header>
                <div className="flex items-center justify-between gap-4">
                  <Modal.Heading className="text-lg font-semibold text-foreground">
                    {editing ? "编辑事件" : "新建事件"}
                  </Modal.Heading>
                  <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onPress={onClose}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </Modal.Header>

              <Modal.Body>
                <div className="flex max-h-[65vh] flex-col gap-3.5 overflow-y-auto px-0.5">
                  <TextField isRequired>
                    <Label>标题</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="事件标题" />
                  </TextField>

                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="日历"
                      ariaLabel="日历"
                      value={calendarId}
                      onChange={setCalendarId}
                      options={editableCalendars.map((c) => ({ value: c.id, label: c.name }))}
                    />
                    <Select
                      label="时区"
                      ariaLabel="时区"
                      value={timezone}
                      onChange={setTimezone}
                      options={TZ_OPTIONS.map((z) => ({ value: z, label: z }))}
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Switch isSelected={allDay} onChange={setAllDay} />
                    全天
                  </label>

                  {allDay ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 block text-sm text-foreground">开始</Label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldCls} />
                      </div>
                      <div>
                        <Label className="mb-1 block text-sm text-foreground">结束</Label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fieldCls} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 block text-sm text-foreground">开始</Label>
                        <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={fieldCls} />
                      </div>
                      <div>
                        <Label className="mb-1 block text-sm text-foreground">结束</Label>
                        <input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} className={fieldCls} />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="mb-1.5 block text-sm text-foreground">重复</Label>
                    <RecurrenceEditor value={recur} onChange={setRecur} />
                  </div>

                  <TextField>
                    <Label>地点</Label>
                    <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="会议室 / 链接" />
                  </TextField>

                  <div>
                    <Label className="mb-1.5 block text-sm text-foreground">参与者</Label>
                    <AttendeePicker value={attendees} onChange={setAttendees} />
                  </div>

                  <div>
                    <Label className="mb-1.5 block text-sm text-foreground">提醒</Label>
                    <div className="flex flex-col gap-2">
                      {reminders.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Select
                            ariaLabel="提醒时间"
                            className="flex-1"
                            value={String(r.minutesBefore)}
                            onChange={(v) =>
                              setReminders((rs) =>
                                rs.map((x, j) => (j === i ? { ...x, minutesBefore: Number(v) } : x)),
                              )
                            }
                            options={REMINDER_PRESETS.map((p) => ({
                              value: String(p.minutesBefore),
                              label: p.label,
                            }))}
                          />
                          <Select
                            ariaLabel="提醒方式"
                            className="w-28"
                            value={r.method}
                            onChange={(v) =>
                              setReminders((rs) =>
                                rs.map((x, j) => (j === i ? { ...x, method: v as "popup" | "email" } : x)),
                              )
                            }
                            options={[
                              { value: "popup", label: "站内" },
                              { value: "email", label: "邮件" },
                            ]}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="删除提醒"
                            onPress={() => setReminders((rs) => rs.filter((_, j) => j !== i))}
                          >
                            <XIcon className="size-4" />
                          </Button>
                        </div>
                      ))}
                      {reminders.length < 5 && (
                        <button
                          type="button"
                          onClick={() =>
                            setReminders((rs) => [...rs, { minutesBefore: 10, method: "popup" }])
                          }
                          className="self-start text-sm text-accent hover:underline"
                        >
                          + 添加提醒
                        </button>
                      )}
                    </div>
                  </div>

                  <TextField>
                    <Label>描述</Label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className={fieldCls}
                    />
                  </TextField>

                  {myAttendee && (
                    <div className="rounded-xl bg-surface-secondary p-3">
                      <div className="mb-2 text-sm text-foreground">
                        你的回执：
                        <span className="ml-1 text-muted">
                          {{ accepted: "已接受", declined: "已拒绝", tentative: "待定", "needs-action": "待回复" }[myAttendee.partstat]}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onPress={() => rsvp("accepted")} isDisabled={busy}>接受</Button>
                        <Button size="sm" variant="secondary" onPress={() => rsvp("tentative")} isDisabled={busy}>待定</Button>
                        <Button size="sm" variant="ghost" onPress={() => rsvp("declined")} isDisabled={busy}>拒绝</Button>
                      </div>
                    </div>
                  )}

                  {editing && isRecurring && (
                    <Select
                      label="应用范围（重复事件）"
                      ariaLabel="应用范围"
                      value={scope}
                      onChange={(v) => setScope(v as typeof scope)}
                      options={[
                        { value: "all", label: "所有事件" },
                        { value: "this", label: "仅此事件" },
                        { value: "following", label: "此后所有事件" },
                      ]}
                    />
                  )}

                  {err && <Alert>{err}</Alert>}
                </div>
              </Modal.Body>

              <Modal.Footer>
                <div className="flex w-full items-center justify-between gap-2">
                  <div>
                    {editing && (
                      <Button type="button" variant="ghost" onPress={remove} isDisabled={busy}>
                        <TrashIcon className="size-4" />
                        删除
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" onPress={onClose}>取消</Button>
                    <Button type="submit" variant="primary" isDisabled={busy}>
                      {busy ? "保存中…" : "保存"}
                    </Button>
                  </div>
                </div>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
