import { Button } from "@heroui/react";
import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../../components/ui";
import { PersonAvatar, useAvatars } from "../../components/PersonAvatar";
import {
  ArchiveIcon,
  CalendarIcon,
  ForwardIcon,
  ImageIcon,
  MailOpenIcon,
  PaperclipIcon,
  PlusIcon,
  ReplyIcon,
  StarFilledIcon,
  StarIcon,
  TrashIcon,
} from "../../components/icons";
import { useMailDetail } from "../../hooks/useMailDetail";
import { useOnline } from "../../hooks/useOnline";
import { useContactNames } from "../../hooks/useContactNames";
import { api } from "../../lib/api";
import { formatBytes, formatDate } from "../../lib/format";

const API = import.meta.env.VITE_API_ORIGIN;

interface Attach {
  id: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  contentId?: string | null;
}
interface CalendarInvite {
  attachmentId: string;
  filename: string | null;
  method: string | null;
  uid: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  organizer: string | null;
  myPartstat: "needs-action" | "accepted" | "declined" | "tentative" | null;
  eventId: string | null;
}
export interface MsgDetail {
  id: string;
  addressId: string;
  fromAddress: string | null;
  fromName?: string | null;
  toAddresses: string[] | null;
  ccAddresses?: string[] | null;
  bccAddresses?: string[] | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isStarred: boolean;
  folder: string;
  direction: string;
  sizeBytes: number | null;
  receivedAt: string | null;
  sentAt: string | null;
  scheduledAt: string | null;
  sendStatus: string | null;
  sendError: string | null;
  createdAt: string;
  attachments: Attach[];
  calendarInvites?: CalendarInvite[];
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

const ALLOWED_TAGS = [
  "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5",
  "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "span", "strong", "sub",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "font",
];
const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "width", "height", "align", "valign", "border",
  "cellpadding", "cellspacing", "colspan", "rowspan", "style", "color", "bgcolor",
  "class", "target", "rel",
];

/** 清洗邮件 HTML；返回清洗结果与「是否含远程资源」。showImages=false 时剥离远程图片。 */
function sanitizeEmail(html: string, showImages: boolean): { html: string; hadRemote: boolean } {
  let hadRemote = false;
  const hook = (node: Element) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") ?? "";
      if (/^https?:/i.test(src)) {
        hadRemote = true;
        if (!showImages) {
          node.removeAttribute("src");
          node.setAttribute("data-blocked", "1");
        }
      }
    }
    const style = node.getAttribute?.("style");
    if (style && /url\(\s*['"]?https?:/i.test(style)) {
      hadRemote = true;
      if (!showImages) {
        node.setAttribute("style", style.replace(/url\(\s*['"]?https?:[^)]*\)/gi, "none"));
      }
    }
  };
  DOMPurify.addHook("afterSanitizeAttributes", hook);
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  DOMPurify.removeHook("afterSanitizeAttributes");
  return { html: clean, hadRemote };
}

function normCid(s: string): string {
  return s.replace(/^<|>$/g, "");
}

function HtmlBody({ message }: { message: MsgDetail }) {
  const { bodyHtml, attachments, id } = message;
  const [showImages, setShowImages] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!bodyHtml) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const { html: clean, hadRemote } = sanitizeEmail(bodyHtml, showImages);
      if (!cancelled) setHasRemote(hadRemote);

      let finalHtml = clean;
      const cidAtts = attachments.filter((a) => a.contentId);
      if (cidAtts.length && /cid:/i.test(clean)) {
        const parsed = new DOMParser().parseFromString(clean, "text/html");
        await Promise.all(
          Array.from(parsed.querySelectorAll("img")).map(async (img) => {
            const m = /^cid:(.+)$/i.exec(img.getAttribute("src") ?? "");
            if (!m) return;
            const cid = normCid(m[1] ?? "");
            const att = cidAtts.find((a) => normCid(a.contentId ?? "") === cid);
            if (!att) return;
            try {
              const res = await fetch(`${API}/api/me/messages/${id}/attachments/${att.id}`, {
                credentials: "include",
              });
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              urls.push(url);
              img.setAttribute("src", url);
            } catch {
              img.removeAttribute("src");
            }
          }),
        );
        finalHtml = parsed.body.innerHTML;
      }

      if (cancelled) return;
      setDoc(
        `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>` +
          `html,body{margin:0}body{padding:14px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;word-break:break-word;overflow-wrap:anywhere}` +
          `img{max-width:100%;height:auto}a{color:#2563eb}blockquote{border-left:3px solid #d4d4d8;margin:0 0 0 2px;padding-left:12px;color:#52525b}table{max-width:100%}` +
          `</style></head><body>${finalHtml}</body></html>`,
      );
    })();
    return () => {
      cancelled = true;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [bodyHtml, showImages, attachments, id]);

  function resize() {
    const f = frameRef.current;
    const d = f?.contentDocument;
    if (f && d?.body) f.style.height = d.body.scrollHeight + 8 + "px";
  }

  return (
    <div>
      {hasRemote && !showImages && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-surface-secondary px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted">
            <ImageIcon className="size-4" />
            为保护隐私，已拦截远程图片
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowImages(true)}>
            显示图片
          </Button>
        </div>
      )}
      <iframe
        ref={frameRef}
        title="email-body"
        sandbox="allow-same-origin allow-popups"
        srcDoc={doc ?? ""}
        onLoad={() => {
          resize();
          const imgs = frameRef.current?.contentDocument?.images;
          if (imgs) Array.from(imgs).forEach((im) => im.addEventListener("load", resize));
          setTimeout(resize, 400);
        }}
        className="w-full rounded-xl border-0 bg-white"
        style={{ height: 200 }}
      />
    </div>
  );
}

function Body({ message }: { message: MsgDetail }) {
  if (message.bodyHtml) return <HtmlBody message={message} />;
  if (message.bodyText)
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">
        {message.bodyText}
      </pre>
    );
  return <p className="text-sm text-muted">（无正文）</p>;
}

function inviteStatusText(s: CalendarInvite["myPartstat"]): string {
  return (
    {
      accepted: "已接受",
      declined: "已拒绝",
      tentative: "不确定",
      "needs-action": "待回复",
    }[s ?? "needs-action"] ?? "待回复"
  );
}

function inviteMethodText(method: string | null): string {
  return (
    {
      REQUEST: "邀请",
      CANCEL: "已取消",
      REPLY: "回执",
    }[method ?? ""] ?? "日历"
  );
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
  const navigate = useNavigate();
  const online = useOnline();
  const { data: m, refetch, loading, error, fromCache } = useMailDetail(messageId);
  const avatarFor = useAvatars(m ? [m.fromAddress] : []);
  const nameOf = useContactNames();
  const [addState, setAddState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState("");

  if (loading) return <p className="text-sm text-muted">加载中…</p>;
  if (!m) return <p className="text-sm text-danger">{error ?? "无法加载邮件"}</p>;
  const isScheduled = m.folder === "scheduled";

  async function star() {
    if (!online) return;
    await api.patch(`/api/me/messages/${m!.id}`, { isStarred: !m!.isStarred });
    await refetch();
    onChanged();
  }
  async function remove() {
    if (!online) return;
    if (m!.folder === "trash" && !confirm("永久删除这封邮件？")) return;
    await api.del(`/api/me/messages/${m!.id}`);
    onChanged();
  }
  async function archive() {
    if (!online) return;
    await api.patch(`/api/me/messages/${m!.id}`, { folder: "archive" });
    onChanged();
  }
  async function markUnread() {
    if (!online) return;
    await api.patch(`/api/me/messages/${m!.id}`, { isRead: false });
    onChanged();
  }
  async function addSender() {
    if (!online || !m!.fromAddress) return;
    setAddState("busy");
    try {
      await api.post("/api/contacts/personal", {
        displayName: m!.fromName || m!.fromAddress,
        email: m!.fromAddress,
      });
      setAddState("done");
    } catch {
      setAddState("error");
    }
  }

  const others: ThreadItem[] = [];
  const senderName = nameOf(m.fromAddress) || m.fromName;

  function createEvent() {
    const attendees = m!.fromAddress
      ? [{ email: m!.fromAddress, displayName: senderName ?? null }]
      : [];
    navigate("/calendar", {
      state: {
        newEvent: {
          title: m!.subject || "",
          description: (m!.bodyText || "").slice(0, 2000),
          attendees,
        },
      },
    });
  }

  async function rsvpInvite(inv: CalendarInvite, partstat: "accepted" | "declined" | "tentative") {
    if (!inv.eventId || inv.method !== "REQUEST") return;
    setInviteErr("");
    setInviteBusy(inv.attachmentId);
    try {
      await api.post(`/api/calendar/events/${inv.eventId}/rsvp`, { partstat });
      await refetch();
    } catch {
      setInviteErr("回执失败，请稍后重试");
    } finally {
      setInviteBusy(null);
    }
  }

  return (
    <div className="relative mx-auto max-w-3xl pb-20 sm:pb-0">
      {fromCache && (
        <p className="mb-3 rounded-xl bg-surface-secondary px-3 py-2 text-xs text-muted">
          离线缓存 · {error ? `${error} · ` : ""}部分操作需联网后可用
        </p>
      )}
      <h1 className="mb-4 text-lg font-semibold text-foreground sm:text-xl">{m.subject || "(无主题)"}</h1>

      {/* 工具菜单栏：标题下方、发件人上方（桌面端；移动端见底部固定栏） */}
      <div className="mb-4 hidden flex-wrap items-center gap-2 sm:flex">
        <Button size="sm" variant="ghost" isIconOnly aria-label={m.isStarred ? "取消星标" : "星标"} onClick={star}>
          {m.isStarred ? (
            <StarFilledIcon className="size-4 text-warning" />
          ) : (
            <StarIcon className="size-4" />
          )}
        </Button>
        {!isScheduled && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onReply(m)}>
              <ReplyIcon className="size-4" />
              回复
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onForward(m)}>
              <ForwardIcon className="size-4" />
              转发
            </Button>
            <Button size="sm" variant="ghost" onClick={createEvent}>
              <CalendarIcon className="size-4" />
              创建事件
            </Button>
            {m.folder !== "archive" && m.folder !== "trash" && (
              <Button size="sm" variant="ghost" onClick={archive}>
                <ArchiveIcon className="size-4" />
                归档
              </Button>
            )}
            <Button size="sm" variant="ghost" isIconOnly aria-label="标为未读" onClick={markUnread}>
              <MailOpenIcon className="size-4" />
            </Button>
            <a
              href={`${API}/api/me/messages/${m.id}/raw`}
              className="self-center px-1 text-sm text-accent"
            >
              原文
            </a>
          </>
        )}
        <Button size="sm" variant="danger-soft" onClick={remove}>
          <TrashIcon className="size-4" />
          {m.folder === "trash" ? "彻底删除" : isScheduled ? "取消定时" : "删除"}
        </Button>
      </div>

      {isScheduled && (
        <div className="mb-4 rounded-2xl bg-surface p-4 text-sm shadow-surface">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <CalendarIcon className="size-4" />
            {m.sendStatus === "failed" ? "定时发送失败" : "计划发送"}
          </div>
          <div className="mt-1 text-muted">
            {m.scheduledAt ? formatDate(m.scheduledAt) : "未设置时间"}
            {m.sendError ? ` · ${m.sendError}` : ""}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-start gap-3">
        <PersonAvatar
          url={avatarFor(m.fromAddress)}
          email={m.fromAddress}
          seed={senderName || m.fromAddress}
          className="size-10 shrink-0"
        />
        <div className="min-w-0 space-y-0.5 text-sm text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <span className="text-foreground">发件人：</span>
              {senderName ? (
                <>
                  {senderName} <span className="text-muted">&lt;{m.fromAddress}&gt;</span>
                </>
              ) : (
                m.fromAddress
              )}
            </span>
            {m.fromAddress &&
              (addState === "done" ? (
                <span className="text-xs text-success-soft-foreground">已加入通讯录</span>
              ) : (
                <button
                  type="button"
                  onClick={addSender}
                  disabled={addState === "busy"}
                  className="inline-flex items-center gap-0.5 text-xs text-accent hover:underline disabled:text-muted"
                >
                  <PlusIcon className="size-3.5" />
                  {addState === "error" ? "重试加入" : "加为联系人"}
                </button>
              ))}
          </div>
          <div>
            <span className="text-foreground">收件人：</span>
            {(m.toAddresses ?? []).join(", ")}
          </div>
          <div className="tabular-nums">
            {formatDate(m.scheduledAt ?? m.receivedAt ?? m.sentAt ?? m.createdAt)} · {formatBytes(m.sizeBytes)}
          </div>
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

      {(m.calendarInvites?.length ?? 0) > 0 && (
        <div className="mb-4 space-y-3">
          {m.calendarInvites!.map((inv) => {
            const canRespond = inv.method === "REQUEST" && Boolean(inv.eventId);
            const busy = inviteBusy === inv.attachmentId;
            return (
              <div key={inv.attachmentId} className="rounded-2xl bg-surface p-4 shadow-surface">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">
                    {inv.summary || inv.filename || "日历邀请"}
                  </div>
                  <Badge>{inviteMethodText(inv.method)}</Badge>
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted">
                  {inv.startsAt && (
                    <div>
                      时间：{formatDate(inv.startsAt)}
                      {inv.endsAt ? ` - ${formatDate(inv.endsAt)}` : ""}
                      {inv.allDay ? "（全天）" : ""}
                    </div>
                  )}
                  {inv.location && <div>地点：{inv.location}</div>}
                  {inv.organizer && <div>组织者：{inv.organizer}</div>}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted">我的状态：{inviteStatusText(inv.myPartstat)}</span>
                  {inv.method === "REQUEST" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => rsvpInvite(inv, "declined")} isDisabled={!canRespond || busy}>
                        拒绝
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => rsvpInvite(inv, "accepted")} isDisabled={!canRespond || busy}>
                        接受
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => rsvpInvite(inv, "tentative")} isDisabled={!canRespond || busy}>
                        不确定
                      </Button>
                    </div>
                  )}
                </div>
                {inv.method === "REQUEST" && !inv.eventId && (
                  <p className="mt-2 text-xs text-muted">该邀请暂未关联到你的日历事件，暂不可回执。</p>
                )}
              </div>
            );
          })}
          {inviteErr && <p className="text-xs text-danger">{inviteErr}</p>}
        </div>
      )}

      <div className="rounded-2xl bg-surface p-5 shadow-surface">
        <Body message={m} />
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

      {/* 移动端底部操作栏（拇指区） */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-surface/95 px-2 py-2 backdrop-blur-md sm:hidden">
        {!isScheduled && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="touch-target flex-col gap-0.5"
              onClick={() => onReply(m)}
              isDisabled={!online}
            >
              <ReplyIcon className="size-5" />
              <span className="text-[10px]">回复</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="touch-target flex-col gap-0.5"
              onClick={() => onForward(m)}
              isDisabled={!online}
            >
              <ForwardIcon className="size-5" />
              <span className="text-[10px]">转发</span>
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="touch-target flex-col gap-0.5"
          isIconOnly={false}
          aria-label={m.isStarred ? "取消星标" : "星标"}
          onClick={star}
          isDisabled={!online}
        >
          {m.isStarred ? (
            <StarFilledIcon className="size-5 text-warning" />
          ) : (
            <StarIcon className="size-5" />
          )}
          <span className="text-[10px]">星标</span>
        </Button>
        {!isScheduled && m.folder !== "archive" && m.folder !== "trash" && (
          <Button
            size="sm"
            variant="ghost"
            className="touch-target flex-col gap-0.5"
            onClick={archive}
            isDisabled={!online}
          >
            <ArchiveIcon className="size-5" />
            <span className="text-[10px]">归档</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="touch-target flex-col gap-0.5 text-danger"
          onClick={remove}
          isDisabled={!online}
        >
          <TrashIcon className="size-5" />
          <span className="text-[10px]">{isScheduled ? "取消" : "删除"}</span>
        </Button>
      </div>
    </div>
  );
}
