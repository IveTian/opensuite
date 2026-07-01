import { Button, Input, Label, TextField } from "@heroui/react";
import { Suspense, lazy, useEffect, useRef, useState, type FormEvent } from "react";
import { Select } from "../../components/Select";
import { RecipientInput } from "../../components/RecipientInput";
import { Alert } from "../../components/ui";
import { CalendarIcon, PaperclipIcon, SendIcon, XIcon } from "../../components/icons";
import { useContactSuggestions } from "../../hooks/useContactSuggestions";
import { api, ApiError } from "../../lib/api";
import { extractInlineImages, htmlEscape, htmlToText } from "../../lib/email-html";
import { formatBytes } from "../../lib/format";

const RichTextEditor = lazy(() => import("../../components/RichTextEditor"));

interface Addr {
  id: string;
  address: string;
  senderName?: string | null;
  sharedSignatureHtml?: string | null;
  sharedDisablePersonalSignature?: boolean;
}
export interface ComposeInitial {
  fromAddressId?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
  html?: string;
  replyToMessageId?: string;
  draftId?: string;
  scheduledAt?: string;
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

function splitRecipients(s: string): string[] {
  return s
    .split(/[,\s;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function toLocalDateTimeValue(value?: string): string {
  const d = value ? new Date(value) : new Date(Date.now() + 10 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function Compose({
  addresses,
  initial,
  personalSignatureHtml,
  onClose,
  onSent,
  onScheduled,
}: {
  addresses: Addr[];
  initial?: ComposeInitial;
  /** 个人签名会在编辑器中显示；组织/公共邮箱签名由后端发送时追加 */
  personalSignatureHtml?: string | null;
  onClose: () => void;
  onSent: () => void;
  onScheduled?: () => void;
}) {
  const initialFromAddressId = initial?.fromAddressId ?? addresses[0]?.id ?? "";
  const initialAddress = addresses.find((a) => a.id === initialFromAddressId);
  const initialSignatureParts = [
    initialAddress?.sharedDisablePersonalSignature ? null : personalSignatureHtml,
  ].filter(Boolean);
  const initialSignatureHtml = initialSignatureParts.join("<br>");
  const baseHtml =
    initial?.html ??
    (initial?.text ? `<p>${htmlEscape(initial.text).replace(/\r?\n/g, "<br>")}</p>` : "");
  const sig = initialSignatureHtml?.trim();
  const initialHtml =
    sig && !initial?.draftId ? `<p></p>${sig}${baseHtml}` : baseHtml;

  const [fromAddressId, setFromAddressId] = useState(initialFromAddressId);
  const [to, setTo] = useState(initial?.to ?? "");
  const [cc, setCc] = useState(initial?.cc ?? "");
  const [bcc, setBcc] = useState(initial?.bcc ?? "");
  const [showCc, setShowCc] = useState(Boolean(initial?.cc || initial?.bcc));
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [html, setHtml] = useState(initialHtml);
  const [text, setText] = useState(initial?.text ?? "");
  const [atts, setAtts] = useState<AttachmentDraft[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(initial?.draftId);
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTimeValue(initial?.scheduledAt));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const touched = useRef(false);
  const suggestions = useContactSuggestions();

  // 草稿自动保存（用户编辑后防抖 1.5s）
  useEffect(() => {
    if (!touched.current || !fromAddressId) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.post<{ id: string }>("/api/me/messages/draft", {
          id: draftId,
          fromAddressId,
          to: splitRecipients(to),
          cc: splitRecipients(cc),
          bcc: splitRecipients(bcc),
          subject,
          text: text || htmlToText(html),
          html,
        });
        setDraftId(res.id);
        setSavedAt(new Date().toLocaleTimeString("zh-CN"));
      } catch {
        /* 静默 */
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, html, fromAddressId]);

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

  function buildPayload() {
    setError("");
    const recipients = splitRecipients(to);
    if (!recipients.length) {
      setError("请填写收件人");
      return null;
    }

    // 抽取正文内联图片为 inline 附件，正文 <img> 改写为 cid:
    const { html: outHtml, inline } = extractInlineImages(html);
    const plain = text.trim() || htmlToText(outHtml);
    const fileAttachments = atts.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      contentBase64: a.contentBase64,
    }));
    const attachments = [...fileAttachments, ...inline];

    return {
      fromAddressId,
      to: recipients,
      ...(cc.trim() ? { cc: splitRecipients(cc) } : {}),
      ...(bcc.trim() ? { bcc: splitRecipients(bcc) } : {}),
      subject,
      ...(plain ? { text: plain } : {}),
      ...(outHtml ? { html: outHtml } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(initial?.replyToMessageId ? { replyToMessageId: initial.replyToMessageId } : {}),
      ...(draftId ? { draftId } : {}),
    };
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setBusy(true);
    try {
      await api.post("/api/me/messages/send", payload);
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    const payload = buildPayload();
    if (!payload) return;
    const when = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(when.getTime())) return setError("请选择定时发送时间");
    if (when.getTime() <= Date.now()) return setError("定时发送时间必须晚于当前时间");

    setBusy(true);
    try {
      await api.post("/api/me/messages/schedule", {
        ...payload,
        scheduledAt: when.toISOString(),
      });
      onScheduled?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "定时发送失败");
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

      <Select
        label="发件地址"
        value={fromAddressId}
        onChange={(v) => {
          setFromAddressId(v);
          touched.current = true;
        }}
        options={addresses.map((a) => ({
          value: a.id,
          label: a.senderName ? `${a.senderName} <${a.address}>` : a.address,
        }))}
      />

      <RecipientInput
        label="收件人（逗号分隔）"
        placeholder="输入姓名或邮箱，可从通讯录联想"
        value={to}
        suggestions={suggestions}
        onChange={(v) => {
          setTo(v);
          touched.current = true;
        }}
        labelRight={
          <button
            type="button"
            onClick={() => setShowCc((v) => !v)}
            className="text-xs text-accent"
          >
            抄送 / 密送
          </button>
        }
      />

      {showCc && (
        <>
          <RecipientInput
            label="抄送 CC"
            placeholder="抄送收件人"
            value={cc}
            suggestions={suggestions}
            onChange={(v) => {
              setCc(v);
              touched.current = true;
            }}
          />
          <RecipientInput
            label="密送 BCC"
            placeholder="密送收件人"
            value={bcc}
            suggestions={suggestions}
            onChange={(v) => {
              setBcc(v);
              touched.current = true;
            }}
          />
        </>
      )}

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

      <div className="flex min-h-64 flex-1 flex-col">
        <Label className="mb-1.5">正文</Label>
        <Suspense
          fallback={<div className="min-h-48 flex-1 animate-pulse rounded-xl bg-surface-secondary" />}
        >
          <RichTextEditor
            className="flex-1"
            value={initialHtml}
            autoFocus={!initial?.replyToMessageId}
            onChange={(h, t) => {
              setHtml(h);
              setText(t);
              touched.current = true;
            }}
          />
        </Suspense>
      </div>

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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" isDisabled={busy || !fromAddressId}>
          <SendIcon className="size-4" />
          {busy ? "发送中…" : "发送"}
        </Button>
        <TextField className="min-w-52">
          <Label className="sr-only">定时发送时间</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => {
              setScheduledAt(e.target.value);
              touched.current = true;
            }}
            disabled={busy}
          />
        </TextField>
        <Button
          type="button"
          variant="secondary"
          onClick={schedule}
          isDisabled={busy || !fromAddressId}
        >
          <CalendarIcon className="size-4" />
          定时发送
        </Button>
      </div>
    </form>
  );
}
