import { Button } from "@heroui/react";
import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
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
const FOLDERS = [
  { key: "inbox", label: "收件箱" },
  { key: "sent", label: "已发送" },
  { key: "draft", label: "草稿" },
  { key: "starred", label: "星标" },
  { key: "trash", label: "回收站" },
] as const;
const LIMIT = 50;

function quote(m: MsgDetail): string {
  return `\n\n---------- 原邮件 ----------\n发件人：${m.fromAddress}\n主题：${m.subject ?? ""}\n\n${m.bodyText ?? ""}`;
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
    <div className="flex h-full">
      {/* 侧栏 */}
      <aside className="flex w-52 flex-col border-r border-default-200 bg-content1 p-3">
        <div className="mb-3 px-2 text-lg font-bold text-primary">MailFlare</div>
        <Button variant="primary" className="mb-3" onClick={newCompose}>
          写邮件
        </Button>
        <nav className="flex flex-1 flex-col gap-0.5">
          {FOLDERS.map((f) => {
            const n = !counts
              ? 0
              : f.key === "inbox"
                ? counts.unread
                : counts[f.key as keyof Counts];
            return (
              <button
                key={f.key}
                onClick={() => switchFolder(f.key)}
                className={
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm " +
                  (folder === f.key
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground-600 hover:bg-default-100")
                }
              >
                <span>{f.label}</span>
                {!!n && (
                  <span className="rounded-full bg-primary px-1.5 text-xs text-white">{n}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* 配额条 */}
        {quota && (
          <div className="mt-3 px-1">
            <div className="mb-1 flex justify-between text-xs text-foreground-500">
              <span>存储</span>
              <span>
                {formatBytes(quota.usedBytes)} / {formatBytes(quota.storageQuotaBytes)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-default-200">
              <div
                className={"h-full " + (usedPct >= 90 ? "bg-danger" : "bg-primary")}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {usedPct >= 90 && (
              <p className="mt-1 text-xs text-danger">容量即将用尽</p>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => navigate("/")}>
            个人中心
          </Button>
          <Button size="sm" variant="ghost" onClick={toggle}>
            {theme === "dark" ? "🌙" : "☀️"}
          </Button>
        </div>
        <Button size="sm" variant="ghost" className="mt-1" onClick={simulate} isDisabled={simBusy}>
          模拟收信
        </Button>
        <a
          href={`${API}/api/me/messages/export`}
          className="mt-1 rounded-lg px-3 py-1.5 text-center text-sm text-foreground-600 hover:bg-default-100"
        >
          导出 .mbox
        </a>
      </aside>

      {/* 列表 */}
      <div className="flex w-80 flex-col border-r border-default-200">
        <div className="border-b border-default-200 p-2">
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder="搜索主题/发件人…"
            className="w-full rounded-lg border border-default-200 bg-default-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-default-100" />
              ))}
            </div>
          ) : !items.length ? (
            <p className="p-4 text-sm text-foreground-400">暂无邮件</p>
          ) : (
            items.map((m) => (
              <button
                key={m.id}
                onClick={() => openItem(m)}
                className={
                  "flex w-full gap-2 border-b border-default-100 px-3 py-3 text-left hover:bg-default-50 " +
                  (selectedId === m.id ? "bg-default-100" : "")
                }
              >
                <span
                  onClick={(e) => toggleStar(m, e)}
                  className={"shrink-0 text-base " + (m.isStarred ? "text-warning" : "text-default-300")}
                >
                  {m.isStarred ? "★" : "☆"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={"truncate text-sm " + (m.isRead ? "text-foreground-600" : "font-semibold")}>
                      {folder === "inbox" || folder === "trash"
                        ? m.fromAddress
                        : (m.toAddresses ?? []).join(", ") || "(无收件人)"}
                    </span>
                    {!m.isRead && folder === "inbox" && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="block truncate text-sm text-foreground">{m.subject || "(无主题)"}</span>
                  <span className="block truncate text-xs text-foreground-400">{m.snippet}</span>
                  <span className="block text-xs text-foreground-400">
                    {formatDate(m.receivedAt ?? m.sentAt ?? m.createdAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        {/* 分页 */}
        {total > LIMIT && (
          <div className="flex items-center justify-between border-t border-default-200 px-3 py-2 text-sm">
            <Button size="sm" variant="ghost" isDisabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span className="text-foreground-500">
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
      <div className="min-w-0 flex-1 overflow-auto p-5">
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
          <div className="flex h-full items-center justify-center text-foreground-400">
            选择一封邮件查看，或点击「写邮件」
          </div>
        )}
      </div>
    </div>
  );
}
