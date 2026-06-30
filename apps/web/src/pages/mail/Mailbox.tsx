import { Avatar, Button, Chip } from "@heroui/react";
import { useState, type ComponentType, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  DownloadIcon,
  FileIcon,
  InboxIcon,
  MailIcon,
  MoonIcon,
  PencilIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  StarFilledIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
} from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../lib/api";
import { formatBytes, formatDate } from "../../lib/format";
import { useTheme } from "../../providers/theme";
import { Compose, type ComposeInitial } from "./Compose";
import { MessageView, type MsgDetail } from "./MessageView";

interface Addr {
  id: string;
  address: string;
  type: string;
}
interface MsgItem {
  id: string;
  fromAddress: string | null;
  toAddresses: string[] | null;
  subject: string | null;
  snippet: string | null;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}
interface Counts {
  inbox: number;
  sent: number;
  draft: number;
  trash: number;
  starred: number;
  unread: number;
}
interface Quota {
  usedBytes: number;
  storageQuotaBytes: number;
}

const API = import.meta.env.VITE_API_ORIGIN;
const FOLDERS: { key: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "inbox", label: "收件箱", icon: InboxIcon },
  { key: "sent", label: "已发送", icon: SendIcon },
  { key: "draft", label: "草稿", icon: FileIcon },
  { key: "starred", label: "星标", icon: StarIcon },
  { key: "trash", label: "回收站", icon: TrashIcon },
];
const LIMIT = 50;

function quote(m: MsgDetail): string {
  return `\n\n---------- 原邮件 ----------\n发件人：${m.fromAddress}\n主题：${m.subject ?? ""}\n\n${m.bodyText ?? ""}`;
}

function initials(value: string | null): string {
  if (!value) return "?";
  const local = value.split("@")[0] ?? value;
  const parts = local.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Mailbox() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { data: addresses } = useFetch<Addr[]>("/api/me/addresses");
  const { data: quota } = useFetch<Quota | null>("/api/me/quota");
  const { data: counts, refetch: refetchCounts } = useFetch<Counts>(
    "/api/me/messages/counts",
  );

  const [folder, setFolder] = useState<string>("inbox");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(0);
  const {
    data: listData,
    loading,
    refetch: refetchList,
  } = useFetch<{ items: MsgItem[]; total: number }>(
    `/api/me/messages?folder=${folder}&q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=${page * LIMIT}`,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeInitial, setComposeInitial] = useState<ComposeInitial | undefined>();
  const [simBusy, setSimBusy] = useState(false);

  const mailboxes = (addresses ?? []).filter((a) => a.type === "mailbox");
  const items = listData?.items ?? [];
  const total = listData?.total ?? 0;
  const currentFolder = FOLDERS.find((f) => f.key === folder);

  function refreshAll() {
    void refetchList();
    void refetchCounts();
  }
  function switchFolder(f: string) {
    setFolder(f);
    setPage(0);
    setSelectedId(null);
    setComposing(false);
  }
  function applySearch() {
    setQ(qInput.trim());
    setPage(0);
    setSelectedId(null);
  }

  async function openItem(item: MsgItem) {
    if (folder === "draft") {
      const d = await api.get<MsgDetail>(`/api/me/messages/${item.id}`);
      setComposeInitial({
        draftId: d.id,
        fromAddressId: d.addressId,
        to: (d.toAddresses ?? []).join(", "),
        subject: d.subject ?? "",
        text: d.bodyText ?? "",
      });
      setComposing(true);
      setSelectedId(null);
      return;
    }
    setComposing(false);
    setSelectedId(item.id);
    if (!item.isRead) {
      await api.patch(`/api/me/messages/${item.id}`, { isRead: true });
      refreshAll();
    }
  }

  async function toggleStar(item: MsgItem, e: MouseEvent) {
    e.stopPropagation();
    await api.patch(`/api/me/messages/${item.id}`, { isStarred: !item.isStarred });
    refreshAll();
  }

  function newCompose() {
    setComposeInitial({ fromAddressId: mailboxes[0]?.id });
    setComposing(true);
    setSelectedId(null);
  }
  function reply(m: MsgDetail) {
    setComposeInitial({
      fromAddressId: m.addressId,
      to: m.fromAddress ?? "",
      subject: m.subject?.startsWith("Re:") ? m.subject : `Re: ${m.subject ?? ""}`,
      text: quote(m),
      replyToMessageId: m.id,
    });
    setComposing(true);
    setSelectedId(null);
  }
  function forward(m: MsgDetail) {
    setComposeInitial({
      fromAddressId: m.addressId,
      subject: m.subject?.startsWith("Fwd:") ? m.subject : `Fwd: ${m.subject ?? ""}`,
      text: quote(m),
    });
    setComposing(true);
    setSelectedId(null);
  }

  async function simulate() {
    const addr = mailboxes[0];
    if (!addr) return alert("请先让管理员为你分配一个邮箱地址");
    setSimBusy(true);
    const raw = [
      "From: 测试人 <tester@example.net>",
      `To: ${addr.address}`,
      `Subject: 测试入站邮件 ${new Date().toLocaleTimeString("zh-CN")}`,
      `Message-ID: <${Math.random().toString(36).slice(2)}@example.net>`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      "这是一封用于本地测试的入站邮件，验证收件存储链路。",
    ].join("\r\n");
    try {
      await api.post("/api/me/messages/simulate-inbound", { addressId: addr.id, raw });
      switchFolder("inbox");
      refreshAll();
    } finally {
      setSimBusy(false);
    }
  }

  const usedPct =
    quota && quota.storageQuotaBytes
      ? Math.min(100, Math.round((quota.usedBytes / quota.storageQuotaBytes) * 100))
      : 0;

  return (
    <div className="flex h-full bg-background">
      {/* 侧栏 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border p-3 sm:flex">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <MailIcon className="size-4" />
          </div>
          <span className="text-base font-semibold text-foreground">MailFlare</span>
        </div>

        <div className="px-1 py-2">
          <Button variant="primary" fullWidth onClick={newCompose}>
            <PencilIcon className="size-4" />
            写邮件
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {FOLDERS.map((f) => {
            const n = !counts
              ? 0
              : f.key === "inbox"
                ? counts.unread
                : counts[f.key as keyof Counts];
            const active = folder === f.key;
            const Ico = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => switchFolder(f.key)}
                className={
                  "flex h-9 items-center gap-3 rounded-xl px-3 text-sm " +
                  (active
                    ? "bg-surface font-medium text-foreground shadow-surface"
                    : "text-muted hover:bg-surface-secondary hover:text-foreground")
                }
              >
                <Ico className="size-4 shrink-0" />
                <span className="flex-1 text-left">{f.label}</span>
                {!!n && (
                  <Chip color="accent" variant="soft" size="sm">
                    {n}
                  </Chip>
                )}
              </button>
            );
          })}
        </nav>

        {/* 配额条 */}
        {quota && (
          <div className="mt-3 rounded-xl bg-surface-secondary p-3">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted">存储用量</span>
              <span className="tabular-nums text-foreground">
                {formatBytes(quota.usedBytes)} / {formatBytes(quota.storageQuotaBytes)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-default-soft">
              <div
                className={"h-full rounded-full " + (usedPct >= 90 ? "bg-danger" : "bg-accent")}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {usedPct >= 90 && <p className="mt-1.5 text-xs text-danger">容量即将用尽</p>}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-1">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 justify-start"
              onClick={() => navigate("/")}
            >
              <UserIcon className="size-4" />
              个人中心
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="切换主题"
              onClick={toggle}
            >
              {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={simulate}
            isDisabled={simBusy}
          >
            <RefreshIcon className="size-4" />
            {simBusy ? "模拟中…" : "模拟收信"}
          </Button>
          <a
            href={`${API}/api/me/messages/export`}
            className="flex h-8 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface-secondary hover:text-foreground"
          >
            <DownloadIcon className="size-4" />
            导出 .mbox
          </a>
        </div>
      </aside>

      {/* 列表 */}
      <div className="flex w-full shrink-0 flex-col border-r border-border sm:w-80 lg:w-96">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="搜索主题 / 发件人…"
              aria-label="搜索邮件"
              className="w-full rounded-xl border border-border bg-surface-secondary py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-field-border-focus focus:outline-none focus:ring-2 focus:ring-focus/40"
            />
          </div>
        </div>

        <div className="px-3 pb-2">
          <h2 className="text-sm font-semibold text-foreground">{currentFolder?.label}</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {loading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-secondary" />
              ))}
            </div>
          ) : !items.length ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted">
              <MailIcon className="size-8 opacity-40" />
              <p className="text-sm">暂无邮件</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {items.map((m) => {
                const active = selectedId === m.id;
                const who =
                  folder === "inbox" || folder === "trash"
                    ? m.fromAddress
                    : (m.toAddresses ?? []).join(", ") || "(无收件人)";
                const unread = !m.isRead && folder === "inbox";
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => openItem(m)}
                      className={
                        "relative flex w-full items-start gap-3 rounded-2xl p-3 text-left " +
                        (active
                          ? "bg-surface shadow-surface"
                          : "hover:bg-surface-secondary")
                      }
                    >
                      <Avatar className="size-9 shrink-0">
                        <Avatar.Fallback>{initials(who)}</Avatar.Fallback>
                      </Avatar>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={
                              "truncate text-sm leading-tight " +
                              (unread ? "font-semibold text-foreground" : "text-foreground")
                            }
                          >
                            {who}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="whitespace-nowrap text-xs text-muted">
                              {formatDate(m.receivedAt ?? m.sentAt ?? m.createdAt)}
                            </span>
                            {unread && <span className="size-1.5 rounded-full bg-accent" />}
                          </span>
                        </span>
                        <span
                          className={
                            "truncate text-xs leading-tight " +
                            (unread ? "font-medium text-foreground" : "text-muted")
                          }
                        >
                          {m.subject || "(无主题)"}
                        </span>
                        <span className="truncate pr-6 text-xs leading-tight text-muted">
                          {m.snippet}
                        </span>
                      </span>
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={m.isStarred ? "取消星标" : "星标"}
                        onClick={(e) => toggleStar(m, e)}
                        className={
                          "absolute bottom-3 right-3 " +
                          (m.isStarred ? "text-warning" : "text-muted opacity-50 hover:opacity-100")
                        }
                      >
                        {m.isStarred ? (
                          <StarFilledIcon className="size-4" />
                        ) : (
                          <StarIcon className="size-4" />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 分页 */}
        {total > LIMIT && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
            <Button size="sm" variant="ghost" isDisabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span className="tabular-nums text-muted">
              {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} / {total}
            </span>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={(page + 1) * LIMIT >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </div>

      {/* 阅读 / 写信 */}
      <div className="hidden min-w-0 flex-1 overflow-auto p-6 sm:block">
        {composing ? (
          <Compose
            addresses={mailboxes}
            initial={composeInitial}
            onClose={() => {
              setComposing(false);
              refreshAll();
            }}
            onSent={() => {
              setComposing(false);
              switchFolder("sent");
              refreshAll();
            }}
          />
        ) : selectedId ? (
          <MessageView
            key={selectedId}
            messageId={selectedId}
            onReply={reply}
            onForward={forward}
            onChanged={() => {
              setSelectedId(null);
              refreshAll();
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-secondary">
              <MailIcon className="size-7 opacity-60" />
            </div>
            <p className="text-sm">选择一封邮件查看，或点击「写邮件」</p>
          </div>
        )}
      </div>
    </div>
  );
}
