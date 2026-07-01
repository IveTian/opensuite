import { Button, Label, Modal } from "@heroui/react";
import { useMemo, useState } from "react";
import type { Calendar, CalendarMember, DirectoryPayload } from "@mailflare/shared";
import { Alert } from "../../components/ui";
import { TrashIcon, XIcon } from "../../components/icons";
import { PersonAvatar } from "../../components/PersonAvatar";
import { Select } from "../../components/Select";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/auth-client";

/** 日历设置：共享成员管理 + 删除（仅拥有者可见） */
export function CalendarSettingsModal({
  calendar,
  onClose,
  onChanged,
}: {
  calendar: Calendar;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: session } = useSession();
  const myId = session?.user.id;
  const { data: members, refetch } = useFetch<CalendarMember[]>(
    `/api/calendar/calendars/${calendar.id}/members`,
  );
  const { data: directory } = useFetch<DirectoryPayload>("/api/contacts/directory");
  const [pick, setPick] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const memberIds = new Set((members ?? []).map((m) => m.userId));
  const candidates = useMemo(
    () =>
      (directory?.entries ?? []).filter(
        (e) => e.userId !== myId && !memberIds.has(e.userId),
      ),
    [directory, memberIds, myId],
  );

  async function addMember() {
    if (!pick) return;
    setBusy(true);
    setErr("");
    try {
      await api.post(`/api/calendar/calendars/${calendar.id}/members`, { userId: pick, role });
      setPick("");
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    try {
      await api.del(`/api/calendar/calendars/${calendar.id}/members/${userId}`);
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "移除失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCalendar() {
    setBusy(true);
    setErr("");
    try {
      await api.del(`/api/calendar/calendars/${calendar.id}`);
      onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "删除失败");
      setBusy(false);
    }
  }

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <div className="flex items-center justify-between gap-4">
                <Modal.Heading className="text-lg font-semibold text-foreground">
                  「{calendar.name}」设置
                </Modal.Heading>
                <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onPress={onClose}>
                  <XIcon className="size-4" />
                </Button>
              </div>
            </Modal.Header>

            <Modal.Body>
              <div className="flex flex-col gap-4">
                <div>
                  <Label className="mb-1.5 block text-sm text-foreground">共享成员</Label>
                  <div className="flex flex-col gap-1">
                    {(members ?? []).map((m) => (
                      <div key={m.userId} className="flex items-center gap-2 rounded-lg px-1 py-1">
                        <PersonAvatar email={m.email} seed={m.email} className="size-7" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-foreground">{m.name}</div>
                          <div className="truncate text-xs text-muted">{m.email}</div>
                        </div>
                        <span className="text-xs text-muted">
                          {{ viewer: "只读", editor: "可编辑", owner: "拥有者" }[m.role]}
                        </span>
                        <Button size="sm" variant="ghost" isIconOnly aria-label="移除" onPress={() => removeMember(m.userId)} isDisabled={busy}>
                          <XIcon className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    {(members ?? []).length === 0 && (
                      <p className="px-1 py-2 text-sm text-muted">尚未共享给其他人</p>
                    )}
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      label="添加成员"
                      ariaLabel="添加成员"
                      value={pick}
                      onChange={setPick}
                      placeholder="选择同事…"
                      options={candidates.map((e) => ({ value: e.userId, label: `${e.name}（${e.email}）` }))}
                    />
                  </div>
                  <div className="w-28">
                    <Select
                      label="权限"
                      ariaLabel="权限"
                      value={role}
                      onChange={setRole}
                      options={[
                        { value: "viewer", label: "只读" },
                        { value: "editor", label: "可编辑" },
                      ]}
                    />
                  </div>
                  <Button variant="secondary" onPress={addMember} isDisabled={!pick || busy}>
                    添加
                  </Button>
                </div>

                {err && <Alert>{err}</Alert>}
              </div>
            </Modal.Body>

            <Modal.Footer>
              <div className="flex w-full items-center justify-between">
                {!calendar.isDefault ? (
                  <Button variant="ghost" onPress={deleteCalendar} isDisabled={busy}>
                    <TrashIcon className="size-4 text-danger" />
                    删除日历
                  </Button>
                ) : (
                  <span className="text-xs text-muted">默认日历不可删除</span>
                )}
                <Button variant="primary" onPress={onClose}>完成</Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
