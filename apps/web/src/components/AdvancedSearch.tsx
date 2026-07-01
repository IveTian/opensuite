import { Button, DateField, Input, Label, Modal, Switch, TextField } from "@heroui/react";
import { useState } from "react";
import { parseDate } from "@internationalized/date";
import { Select } from "./Select";
import { SearchIcon, XIcon } from "./icons";

/** 邮箱搜索条件（普通/高级/通讯录往来共用） */
export interface MailSearch {
  q?: string;
  from?: string;
  to?: string;
  subject?: string;
  /** 与某人往来：发件人=对方 或 收件人/抄送含对方 */
  participant?: string;
  /** 限定文件夹；为空=除草稿与回收站外全部 */
  folder?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  starred?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

const FOLDER_LABELS: Record<string, string> = {
  inbox: "收件箱",
  sent: "已发送",
  archive: "归档",
};

/** 是否存在任一有效搜索条件 */
export function hasAnySearch(s: MailSearch | null | undefined): s is MailSearch {
  if (!s) return false;
  return Object.values(s).some((v) => v !== undefined && v !== "" && v !== false);
}

/** 构造 /api/me/messages/search 查询串 */
export function buildSearchQuery(
  s: MailSearch,
  opts: { limit: number; offset: number; accountId?: string },
): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.from) p.set("from", s.from);
  if (s.to) p.set("to", s.to);
  if (s.subject) p.set("subject", s.subject);
  if (s.participant) p.set("participant", s.participant);
  if (s.folder) p.set("folder", s.folder);
  if (s.hasAttachment) p.set("hasAttachment", "1");
  if (s.unread) p.set("unread", "1");
  if (s.starred) p.set("starred", "1");
  if (s.dateFrom) p.set("dateFrom", s.dateFrom);
  if (s.dateTo) p.set("dateTo", s.dateTo);
  p.set("limit", String(opts.limit));
  p.set("offset", String(opts.offset));
  if (opts.accountId) p.set("addressId", opts.accountId);
  return p.toString();
}

/** 搜索条件的一句话摘要（横幅展示） */
export function searchSummary(s: MailSearch): string {
  const parts: string[] = [];
  if (s.participant) parts.push(`与 ${s.participant} 往来`);
  if (s.q) parts.push(`“${s.q}”`);
  if (s.from) parts.push(`发件人:${s.from}`);
  if (s.to) parts.push(`收件人:${s.to}`);
  if (s.subject) parts.push(`主题:${s.subject}`);
  if (s.hasAttachment) parts.push("有附件");
  if (s.unread) parts.push("未读");
  if (s.starred) parts.push("星标");
  if (s.dateFrom || s.dateTo) parts.push(`${s.dateFrom ?? "…"} ~ ${s.dateTo ?? "…"}`);
  if (s.folder && FOLDER_LABELS[s.folder]) parts.push(FOLDER_LABELS[s.folder]!);
  return parts.join(" · ") || "全部邮件";
}

/** 高级搜索弹窗 */
export function AdvancedSearch({
  initial,
  onApply,
  onClose,
}: {
  initial: MailSearch;
  onApply: (s: MailSearch) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initial.q ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [folder, setFolder] = useState(initial.folder ?? "");
  const [dateFrom, setDateFrom] = useState(initial.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initial.dateTo ?? "");
  const [hasAttachment, setHasAttachment] = useState(initial.hasAttachment ?? false);
  const [unread, setUnread] = useState(initial.unread ?? false);
  const [starred, setStarred] = useState(initial.starred ?? false);

  function apply() {
    const s: MailSearch = { ...(initial.participant ? { participant: initial.participant } : {}) };
    if (q.trim()) s.q = q.trim();
    if (from.trim()) s.from = from.trim();
    if (to.trim()) s.to = to.trim();
    if (subject.trim()) s.subject = subject.trim();
    if (folder) s.folder = folder;
    if (dateFrom) s.dateFrom = dateFrom;
    if (dateTo) s.dateTo = dateTo;
    if (hasAttachment) s.hasAttachment = true;
    if (unread) s.unread = true;
    if (starred) s.starred = true;
    onApply(s);
  }

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <div className="flex items-center justify-between gap-4">
                <Modal.Heading className="text-lg font-semibold text-foreground">
                  高级搜索
                </Modal.Heading>
                <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onPress={onClose}>
                  <XIcon className="size-4" />
                </Button>
              </div>
            </Modal.Header>

            <Modal.Body>
              <div className="flex flex-col gap-3">
                <TextField>
                  <Label>关键词</Label>
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="主题 / 联系人 / 内容" />
                </TextField>
                <div className="grid grid-cols-2 gap-3">
                  <TextField>
                    <Label>发件人</Label>
                    <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="name@example.com" />
                  </TextField>
                  <TextField>
                    <Label>收件人</Label>
                    <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
                  </TextField>
                </div>
                <TextField>
                  <Label>主题包含</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </TextField>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-sm text-foreground">范围</Label>
                    <Select
                      ariaLabel="文件夹范围"
                      value={folder}
                      onChange={setFolder}
                      options={[
                        { value: "", label: "全部邮件" },
                        { value: "inbox", label: "收件箱" },
                        { value: "sent", label: "已发送" },
                        { value: "archive", label: "归档" },
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1 block text-sm text-foreground">起</Label>
                      <DateField.Root
                        aria-label="起始日期"
                        value={dateFrom ? parseDate(dateFrom) : null}
                        onChange={(v) => setDateFrom(v ? v.toString() : "")}
                      >
                        <DateField.Group fullWidth>
                          <DateField.Input>
                            {(segment) => <DateField.Segment segment={segment} />}
                          </DateField.Input>
                        </DateField.Group>
                      </DateField.Root>
                    </div>
                    <div>
                      <Label className="mb-1 block text-sm text-foreground">止</Label>
                      <DateField.Root
                        aria-label="结束日期"
                        value={dateTo ? parseDate(dateTo) : null}
                        onChange={(v) => setDateTo(v ? v.toString() : "")}
                      >
                        <DateField.Group fullWidth>
                          <DateField.Input>
                            {(segment) => <DateField.Segment segment={segment} />}
                          </DateField.Input>
                        </DateField.Group>
                      </DateField.Root>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Switch isSelected={hasAttachment} onChange={setHasAttachment} />
                    有附件
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Switch isSelected={unread} onChange={setUnread} />
                    仅未读
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Switch isSelected={starred} onChange={setStarred} />
                    仅星标
                  </label>
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" onPress={onClose}>
                取消
              </Button>
              <Button variant="primary" onPress={apply}>
                <SearchIcon className="size-4" />
                搜索
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
