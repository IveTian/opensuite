import { Button, Input, Label, Modal, Switch, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import type { PersonalContact } from "@mailflare/shared";
import { Alert } from "../../components/ui";
import { XIcon } from "../../components/icons";
import { api, ApiError } from "../../lib/api";

/** 新建 / 编辑个人联系人的弹窗表单 */
export function PersonalContactForm({
  initial,
  onClose,
  onSaved,
}: {
  /** 传入则为编辑，否则新建 */
  initial?: PersonalContact | null;
  onClose: () => void;
  onSaved: (c: PersonalContact) => void;
}) {
  const editing = Boolean(initial?.id);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isFavorite, setIsFavorite] = useState(initial?.isFavorite ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!displayName.trim()) return setErr("请填写名称");
    if (!email.trim()) return setErr("请填写邮箱");
    setBusy(true);
    try {
      const body = {
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        company: company.trim() || null,
        jobTitle: jobTitle.trim() || null,
        notes: notes.trim() || null,
        isFavorite,
      };
      const saved =
        editing && initial
          ? await api.patch<PersonalContact>(`/api/contacts/personal/${initial.id}`, body)
          : await api.post<PersonalContact>("/api/contacts/personal", body);
      onSaved(saved);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog>
            <form onSubmit={save}>
              <Modal.Header>
                <div className="flex items-center justify-between gap-4">
                  <Modal.Heading className="text-lg font-semibold text-foreground">
                    {editing ? "编辑联系人" : "新建联系人"}
                  </Modal.Heading>
                  <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onPress={onClose}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </Modal.Header>

              <Modal.Body>
                <div className="flex flex-col gap-3">
                  <TextField isRequired>
                    <Label>名称（别名）</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="张三" />
                  </TextField>
                  <TextField isRequired>
                    <Label>邮箱</Label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="a@b.com" />
                  </TextField>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField>
                      <Label>电话</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </TextField>
                    <TextField>
                      <Label>公司</Label>
                      <Input value={company} onChange={(e) => setCompany(e.target.value)} />
                    </TextField>
                  </div>
                  <TextField>
                    <Label>职位</Label>
                    <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                  </TextField>
                  <TextField>
                    <Label>备注</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </TextField>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Switch isSelected={isFavorite} onChange={setIsFavorite} />
                    标记为收藏
                  </label>
                  {err && <Alert>{err}</Alert>}
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button type="button" variant="ghost" onPress={onClose}>
                  取消
                </Button>
                <Button type="submit" variant="primary" isDisabled={busy}>
                  {busy ? "保存中…" : "保存"}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
