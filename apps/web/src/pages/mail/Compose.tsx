import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NativeSelect } from "../../components/NativeSelect";
import { Alert } from "../../components/ui";
import { PaperclipIcon, SendIcon, XIcon } from "../../components/icons";
import { api, ApiError } from "../../lib/api";
import { formatBytes } from "../../lib/format";

interface Addr {
  id: string;
  address: string;
}
export interface ComposeInitial {
  fromAddressId?: string;
  to?: string;
  subject?: string;
  text?: string;
  replyToMessageId?: string;
  draftId?: string;
}
interface AttachmentDraft {
  filename: string;
  contentType: string;
  contentBase64: string;
  size: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function Compose({
  addresses,
  initial,
  onClose,
  onSent,
}: {
  addresses: Addr[];
  initial?: ComposeInitial;
  onClose: () => void;
  onSent: () => void;
}) {
  const [fromAddressId, setFromAddressId] = useState(
    initial?.fromAddressId ?? addresses[0]?.id ?? "",
  );
  const [to, setTo] = useState(initial?.to ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [atts, setAtts] = useState<AttachmentDraft[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(initial?.draftId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const touched = useRef(false);

  const recipients = () =>
    to.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);

  // 草稿自动保存（用户编辑后防抖 1.5s）
  useEffect(() => {
    if (!touched.current || !fromAddressId) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.post<{ id: string }>("/api/me/messages/draft", {
          id: draftId,
          fromAddressId,
          to: recipients(),
          subject,
          text,
        });
        setDraftId(res.id);
        setSavedAt(new Date().toLocaleTimeString("zh-CN"));
      } catch {
        /* 静默 */
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, text, fromAddressId]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: AttachmentDraft[] = [];
    for (const f of Array.from(files)) {
      next.push({
        filename: f.name,
        contentType: f.type || "application/octet-stream",
        contentBase64: await fileToBase64(f),
        size: f.size,
      });
    }
    setAtts((a) => [...a, ...next]);
    touched.current = true;
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!recipients().length) return setError("请填写收件人");
    setBusy(true);
    try {
      await api.post("/api/me/messages/send", {
        fromAddressId,
        to: recipients(),
        subject,
        text,
        ...(atts.length
          ? {
              attachments: atts.map((a) => ({
                filename: a.filename,
                contentType: a.contentType,
                contentBase64: a.contentBase64,
              })),
            }
          : {}),
        ...(initial?.replyToMessageId ? { replyToMessageId: initial.replyToMessageId } : {}),
        ...(draftId ? { draftId } : {}),
      });
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="mx-auto flex h-full max-w-3xl flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {initial?.replyToMessageId ? "回复" : "写邮件"}
        </h2>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-muted">已存草稿 {savedAt}</span>}
          <Button type="button" size="sm" variant="ghost" isIconOnly aria-label="关闭" onClick={onClose}>
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
      <NativeSelect
        label="发件地址"
        value={fromAddressId}
        onChange={(e) => {
          setFromAddressId(e.target.value);
          touched.current = true;
        }}
      >
        {addresses.map((a) => (
          <option key={a.id} value={a.id}>
            {a.address}
          </option>
        ))}
      </NativeSelect>
      <TextField>
        <Label>收件人（逗号分隔）</Label>
        <Input
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            touched.current = true;
          }}
          placeholder="a@b.com, c@d.com"
        />
      </TextField>
      <TextField>
        <Label>主题</Label>
        <Input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            touched.current = true;
          }}
        />
      </TextField>
      <TextField className="flex-1">
        <Label>正文</Label>
        <TextArea
          className="min-h-40"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            touched.current = true;
          }}
        />
      </TextField>

      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary">
          <PaperclipIcon className="size-4 text-muted" />
          添加附件
          <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
        {atts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {atts.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 rounded-xl bg-surface-secondary px-2.5 py-1 text-xs text-foreground"
              >
                {a.filename} ({formatBytes(a.size)})
                <button
                  type="button"
                  aria-label="移除附件"
                  className="text-muted hover:text-danger"
                  onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}
                >
                  <XIcon className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={busy || !fromAddressId}>
          <SendIcon className="size-4" />
          {busy ? "发送中…" : "发送"}
        </Button>
      </div>
    </form>
  );
}
