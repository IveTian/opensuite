import { Button } from "@heroui/react";
import { Badge } from "../../components/ui";
import {
  ForwardIcon,
  PaperclipIcon,
  ReplyIcon,
  StarFilledIcon,
  StarIcon,
  TrashIcon,
} from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../lib/api";
import { formatBytes, formatDate } from "../../lib/format";

const API = import.meta.env.VITE_API_ORIGIN;

interface Attach {
  id: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
}
export interface MsgDetail {
  id: string;
  addressId: string;
  fromAddress: string | null;
  toAddresses: string[] | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isStarred: boolean;
  folder: string;
  direction: string;
  sizeBytes: number | null;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: Attach[];
}
interface ThreadItem {
  id: string;
  direction: string;
  fromAddress: string | null;
  subject: string | null;
  bodyText: string | null;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

function Body({ text, html }: { text: string | null; html: string | null }) {
  if (text)
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">
        {text}
      </pre>
    );
  if (html)
    return (
      <iframe
        title="email-body"
        sandbox=""
        srcDoc={html}
        className="h-96 w-full rounded-xl border-0 bg-white"
      />
    );
  return <p className="text-sm text-muted">（无正文）</p>;
}

export function MessageView({
  messageId,
  onReply,
  onForward,
  onChanged,
}: {
  messageId: string;
  onReply: (m: MsgDetail) => void;
  onForward: (m: MsgDetail) => void;
  onChanged: () => void;
}) {
  const { data: m, refetch } = useFetch<MsgDetail>(`/api/me/messages/${messageId}`);
  const { data: thread } = useFetch<ThreadItem[]>(`/api/me/messages/${messageId}/thread`);

  if (!m) return <p className="text-sm text-muted">加载中…</p>;

  async function star() {
    await api.patch(`/api/me/messages/${m!.id}`, { isStarred: !m!.isStarred });
    await refetch();
    onChanged();
  }
  async function remove() {
    if (m!.folder === "trash" && !confirm("永久删除这封邮件？")) return;
    await api.del(`/api/me/messages/${m!.id}`);
    onChanged();
  }

  const others = (thread ?? []).filter((t) => t.id !== m.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">{m.subject || "(无主题)"}</h1>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" isIconOnly aria-label={m.isStarred ? "取消星标" : "星标"} onClick={star}>
            {m.isStarred ? (
              <StarFilledIcon className="size-4 text-warning" />
            ) : (
              <StarIcon className="size-4" />
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onReply(m)}>
            <ReplyIcon className="size-4" />
            回复
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onForward(m)}>
            <ForwardIcon className="size-4" />
            转发
          </Button>
          <a
            href={`${API}/api/me/messages/${m.id}/raw`}
            className="self-center px-1 text-sm text-accent"
          >
            原文
          </a>
          <Button size="sm" variant="danger-soft" onClick={remove}>
            <TrashIcon className="size-4" />
            {m.folder === "trash" ? "彻底删除" : "删除"}
          </Button>
        </div>
      </div>

      <div className="mb-4 space-y-0.5 text-sm text-muted">
        <div>
          <span className="text-foreground">发件人：</span>
          {m.fromAddress}
        </div>
        <div>
          <span className="text-foreground">收件人：</span>
          {(m.toAddresses ?? []).join(", ")}
        </div>
        <div className="tabular-nums">
          {formatDate(m.receivedAt ?? m.sentAt ?? m.createdAt)} · {formatBytes(m.sizeBytes)}
        </div>
      </div>

      {m.attachments.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {m.attachments.map((a) => (
            <a
              key={a.id}
              href={`${API}/api/me/messages/${m.id}/attachments/${a.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-surface-secondary px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary/70"
            >
              <PaperclipIcon className="size-4 text-muted" />
              {a.filename ?? a.id}
              <Badge>{formatBytes(a.sizeBytes)}</Badge>
            </a>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-surface p-5 shadow-surface">
        <Body text={m.bodyText} html={m.bodyHtml} />
      </div>

      {others.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-foreground">
            会话中的其它邮件（{others.length}）
          </h3>
          <div className="space-y-2">
            {others.map((t) => (
              <details key={t.id} className="rounded-xl bg-surface-secondary p-3">
                <summary className="cursor-pointer text-sm text-foreground">
                  <Badge tone={t.direction === "outbound" ? "primary" : "default"}>
                    {t.direction === "outbound" ? "发出" : "收到"}
                  </Badge>{" "}
                  {t.fromAddress} ·{" "}
                  <span className="text-muted">
                    {formatDate(t.receivedAt ?? t.sentAt ?? t.createdAt)}
                  </span>
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-muted">
                  {t.bodyText ?? "（无纯文本正文）"}
                </pre>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
