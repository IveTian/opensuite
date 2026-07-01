import { Button, Chip } from "@heroui/react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { BulkAction, MailboxAccount } from "@mailflare/shared";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BellIcon,
  CalendarIcon,
  FileIcon,
  InboxIcon,
  KeyboardIcon,
  LayersIcon,
  MailIcon,
  MailOpenIcon,
  MoonIcon,
  PencilIcon,
  PaperclipIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  SlidersIcon,
  StarFilledIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { useMailList } from "../../hooks/useMailList";
import { useMailRealtime } from "../../hooks/useMailRealtime";
import { useOnline } from "../../hooks/useOnline";
import { useIsMobile } from "../../hooks/useIsMobile";
import { cacheMessageDetail } from "../../lib/offline/mail-cache";
import { useMobileChrome } from "../../providers/mobile-chrome";
import { useContactNames } from "../../hooks/useContactNames";
import {
  AdvancedSearch,
  buildSearchQuery,
  hasAnySearch,
  searchSummary,
  type MailSearch,
} from "../../components/AdvancedSearch";
import { api } from "../../lib/api";
import { useMailDisplayMode } from "../../lib/mail-display";
import { buildForwardHtml, buildReplyHtml } from "../../lib/email-html";
import { formatBytes, formatDate } from "../../lib/format";
import { useTheme } from "../../providers/theme";
import { useBranding } from "../../providers/branding";
import { AppSwitcher } from "../../components/AppSwitcher";
import { Select } from "../../components/Select";
import { PersonAvatar, useAvatars } from "../../components/PersonAvatar";
import { useSession } from "../../lib/auth-client";
import { Compose, type ComposeInitial } from "./Compose";
import { MessageView, type MsgDetail } from "./MessageView";

interface MailSettings {
  signatureHtml: string | null;
  orgSignatureHtml: string | null;
}
interface MsgItem {
  id: string;
  direction: string;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[] | null;
  subject: string | null;
  snippet: string | null;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  receivedAt: string | null;
  sentAt: string | null;
  scheduledAt: string | null;
  sendStatus: string | null;
  sendError: string | null;
  createdAt: string;
  hasAttachments?: boolean;
  hasCalendarInvite?: boolean;
}
/** 各文件夹的「未读」计数（侧栏徽标只显示未读） */
interface Counts {
  inbox: number;
  sent: number;
  draft: number;
  scheduled: number;
  trash: number;
  archive: number;
  starred: number;
  all: number;
}
interface Quota {
  usedBytes: number;
  storageQuotaBytes: number;
}

const FOLDERS: {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { key: "inbox", label: "收件箱", icon: InboxIcon },
  { key: "all", label: "全部邮件", icon: LayersIcon },
  { key: "sent", label: "已发送", icon: SendIcon },
  { key: "draft", label: "草稿", icon: FileIcon },
  { key: "scheduled", label: "定时", icon: CalendarIcon },
  { key: "starred", label: "星标", icon: StarIcon },
  { key: "archive", label: "归档", icon: ArchiveIcon },
  { key: "trash", label: "回收站", icon: TrashIcon },
];
const LIMIT = 50;

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "c", desc: "写邮件" },
  { keys: "/", desc: "搜索" },
  { keys: "j / k", desc: "下一封 / 上一封" },
  { keys: "o / Enter", desc: "打开邮件" },
  { keys: "u / Esc", desc: "返回列表" },
  { keys: "x", desc: "勾选当前邮件" },
  { keys: "e", desc: "归档" },
  { keys: "#", desc: "删除（移入回收站）" },
  { keys: "s", desc: "星标 / 取消星标" },
  { keys: "Shift + I", desc: "标为已读" },
  { keys: "Shift + U", desc: "标为未读" },
  { keys: "?", desc: "显示 / 隐藏快捷键" },
];

/** 列表项主体展示名：出站看收件人，入站看发件人；优先用通讯录别名/目录名 */
function displayWho(m: MsgItem, nameOf: (email?: string | null) => string | null): string {
  if (m.direction === "outbound") {
    const to = m.toAddresses ?? [];
    const name = nameOf(to[0]);
    if (name && to.length <= 1) return name;
    return to.join(", ") || "(无收件人)";
  }
  return nameOf(m.fromAddress) || m.fromName || m.fromAddress || "(未知发件人)";
}

/** 该项用于头像目录解析的对方邮箱：出站取收件人，入站取发件人 */
function whoEmail(m: MsgItem): string | null {
  return m.direction === "outbound" ? (m.toAddresses?.[0] ?? null) : m.fromAddress;
}

export function Mailbox() {
  const { theme, toggle } = useTheme();
  const brand = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const nameOf = useContactNames();
  const online = useOnline();
  const isMobile = useIsMobile();
  const mailDisplay = useMailDisplayMode();
  const isSingleList = mailDisplay === "single";
  const { setHideBottomNav } = useMobileChrome();
  const { data: session } = useSession();
  const avatarImage = (session?.user as { image?: string | null } | undefined)?.image ?? null;
  const { data: accounts } = useFetch<MailboxAccount[]>("/api/me/accounts");
  const { data: mailSettings } = useFetch<MailSettings>("/api/me/mail-settings");
  const { data: quota } = useFetch<Quota | null>("/api/me/quota");

  // 当前选中的邮箱账号（个人或公共），所有视图按其作用域取数
  const [accountId, setAccountId] = useState<string>("");
  useEffect(() => {
    const list = accounts ?? [];
    if (!list.length) return;
    if (!accountId || !list.some((a) => a.id === accountId)) {
      setAccountId((list.find((a) => a.isPrimary) ?? list[0]!).id);
    }
  }, [accounts, accountId]);
  const acctParam = accountId ? `&addressId=${accountId}` : "";

  const { data: counts, refetch: refetchCounts } = useFetch<Counts>(
    `/api/me/messages/counts${accountId ? `?addressId=${accountId}` : ""}`,
  );

  const [folder, setFolder] = useState<string>("inbox");
  const [qInput, setQInput] = useState("");
  const [search, setSearch] = useState<MailSearch | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(0);
  const searchActive = hasAnySearch(search);
  const listPath = searchActive
    ? `/api/me/messages/search?${buildSearchQuery(search, {
        limit: LIMIT,
        offset: page * LIMIT,
        accountId: accountId || undefined,
      })}`
    : `/api/me/messages?folder=${folder}&limit=${LIMIT}&offset=${page * LIMIT}${acctParam}`;
  const {
    data: listData,
    loading,
    error: listError,
    fromCache: listFromCache,
    refetch: refetchList,
  } = useMailList({
    accountId,
    folder,
    page,
    searchActive,
    listPath,
    searchQ: search?.q,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeInitial, setComposeInitial] = useState<ComposeInitial | undefined>();
  const [composeKey, setComposeKey] = useState(0);
  // 批量勾选 + 键盘游标 + 快捷键帮助
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // -1 = 无游标（未用键盘导航时不高亮任何项，避免顶部默认蓝圈）
  const [cursor, setCursor] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const accountList = accounts ?? [];
  const currentAccount = accountList.find((a) => a.id === accountId);
  const sendable = accountList.filter((a) => a.canSend);
  const items = listData?.items ?? [];
  const avatarFor = useAvatars(items.map(whoEmail));
  const total = listData?.total ?? 0;
  const currentFolder = FOLDERS.find((f) => f.key === folder);
  const readerOpen = Boolean(selectedId || composing);

  useEffect(() => {
    setHideBottomNav(isMobile && readerOpen);
    return () => setHideBottomNav(false);
  }, [isMobile, readerOpen, setHideBottomNav]);

  const allSelected = items.length > 0 && items.every((m) => selected.has(m.id));

  /** 打开撰写面板（每次都换 key，确保编辑器以新内容重新挂载） */
  function startCompose(init?: ComposeInitial) {
    setComposeInitial(init);
    setComposeKey((k) => k + 1);
    setComposing(true);
    setSelectedId(null);
  }

  // 从通讯录「写邮件」跳转而来：带 compose 初始值时自动打开撰写面板
  const composeState = (location.state as { compose?: ComposeInitial } | null)?.compose;
  useEffect(() => {
    if (!composeState || !accountList.length) return;
    const from = currentAccount?.canSend ? currentAccount.id : sendable[0]?.id;
    startCompose({ fromAddressId: from, ...composeState });
    // 清掉 history state，避免返回/刷新重复打开
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeState, accountList.length]);

  // 从通讯录「查看全部往来」/「打开某封」跳转而来
  const navSearch = (location.state as { search?: MailSearch; openMessageId?: string } | null);
  useEffect(() => {
    if (!navSearch?.search && !navSearch?.openMessageId) return;
    if (navSearch.search) {
      setSearch(navSearch.search);
      setQInput(navSearch.search.q ?? "");
      setPage(0);
    }
    if (navSearch.openMessageId) setSelectedId(navSearch.openMessageId);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navSearch?.search, navSearch?.openMessageId]);

  function refreshAll() {
    void refetchList();
    void refetchCounts();
  }
  function switchFolder(f: string) {
    setFolder(f);
    setSearch(null);
    setQInput("");
    setPage(0);
    setSelectedId(null);
    setComposing(false);
    setSelected(new Set());
    setCursor(-1);
  }
  /** 切换当前邮箱账号：重置到收件箱与列表 */
  function switchAccount(id: string) {
    setAccountId(id);
    setFolder("inbox");
    setSearch(null);
    setQInput("");
    setPage(0);
    setSelectedId(null);
    setComposing(false);
    setSelected(new Set());
    setCursor(-1);
  }
  /** 顶部搜索框回车：作为关键词搜索（跨文件夹，除草稿/回收站） */
  function applySearch() {
    const t = qInput.trim();
    setSearch(t ? { q: t } : null);
    setPage(0);
    setSelectedId(null);
    setCursor(-1);
  }
  /** 应用高级搜索条件 */
  function runSearch(s: MailSearch) {
    setSearch(hasAnySearch(s) ? s : null);
    setQInput(s.q ?? "");
    setShowAdvanced(false);
    setPage(0);
    setSelectedId(null);
    setCursor(-1);
  }
  /** 退出搜索，回到文件夹视图 */
  function clearSearch() {
    setSearch(null);
    setQInput("");
    setPage(0);
    setSelectedId(null);
    setCursor(-1);
  }
  function backToList() {
    setComposing(false);
    setSelectedId(null);
  }

  async function openItem(item: MsgItem, idx?: number) {
    if (typeof idx === "number") setCursor(idx);
    if (!online && item.folder === "draft") {
      alert("离线模式下无法编辑草稿，请联网后再试");
      return;
    }
    if (item.folder === "draft") {
      const d = await api.get<MsgDetail>(`/api/me/messages/${item.id}`);
      void cacheMessageDetail(d);
      startCompose({
        draftId: d.id,
        fromAddressId: d.addressId,
        to: (d.toAddresses ?? []).join(", "),
        cc: (d.ccAddresses ?? []).join(", "),
        bcc: (d.bccAddresses ?? []).join(", "),
        subject: d.subject ?? "",
        text: d.bodyText ?? "",
        html: d.bodyHtml ?? undefined,
      });
      return;
    }
    setComposing(false);
    setSelectedId(item.id);
    if (online && !item.isRead) {
      await api.patch(`/api/me/messages/${item.id}`, { isRead: true });
      refreshAll();
    }
  }

  async function toggleStar(item: MsgItem, e: MouseEvent) {
    e.stopPropagation();
    if (!online) return;
    await api.patch(`/api/me/messages/${item.id}`, { isStarred: !item.isStarred });
    refreshAll();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((m) => m.id)));
  }

  /** 批量动作：优先勾选集，其次当前打开邮件，最后键盘游标项 */
  async function bulkAction(action: BulkAction) {
    if (!online) return;
    const ids = selected.size
      ? [...selected]
      : selectedId
        ? [selectedId]
        : items[cursor]
          ? [items[cursor]!.id]
          : [];
    if (!ids.length) return;
    await api.post("/api/me/messages/bulk", { ids, action });
    setSelected(new Set());
    if (
      selectedId &&
      ids.includes(selectedId) &&
      (action === "archive" || action === "trash")
    ) {
      setSelectedId(null);
    }
    refreshAll();
  }

  function newCompose() {
    if (!online) {
      alert("离线模式下无法撰写邮件，请联网后再试");
      return;
    }
    // 默认从当前账号发信（不可发则退回首个可发账号）
    const from = currentAccount?.canSend ? currentAccount.id : sendable[0]?.id;
    startCompose({ fromAddressId: from });
  }
  function reply(m: MsgDetail) {
    const date = formatDate(m.receivedAt ?? m.sentAt ?? m.createdAt);
    startCompose({
      fromAddressId: m.addressId,
      to: m.fromAddress ?? "",
      subject: m.subject?.startsWith("Re:") ? m.subject : `Re: ${m.subject ?? ""}`,
      html: buildReplyHtml({
        fromAddress: m.fromAddress,
        date,
        bodyHtml: m.bodyHtml,
        bodyText: m.bodyText,
      }),
      replyToMessageId: m.id,
    });
  }
  function forward(m: MsgDetail) {
    const date = formatDate(m.receivedAt ?? m.sentAt ?? m.createdAt);
    startCompose({
      fromAddressId: m.addressId,
      subject: m.subject?.startsWith("Fwd:") ? m.subject : `Fwd: ${m.subject ?? ""}`,
      html: buildForwardHtml({
        fromAddress: m.fromAddress,
        subject: m.subject,
        date,
        to: m.toAddresses,
        bodyHtml: m.bodyHtml,
        bodyText: m.bodyText,
      }),
    });
  }

  // 新邮件实时通道（WebSocket → Durable Object）：零延迟刷新收件箱 + 可选桌面通知
  const { perm: notifPerm, requestPermission: enableNotifications } = useMailRealtime({
    icon: brand.logoUrl,
    onNewMail: refreshAll,
  });

  // 游标越界纠正 + 滚动到可视
  useEffect(() => {
    if (cursor > items.length - 1) setCursor(items.length ? items.length - 1 : -1);
  }, [items.length, cursor]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`);
    (el as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // 键盘快捷键（Gmail 风格）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 撰写中不拦截（交给编辑器/输入框），仅保留帮助层的关闭
      if (composing && !showHelp) return;

      if (showHelp) {
        if (e.key === "Escape" || e.key === "?") setShowHelp(false);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "c") {
        e.preventDefault();
        newCompose();
        return;
      }
      if (e.key === "Escape" || e.key === "u") {
        backToList();
        return;
      }
      switch (e.key) {
        case "j":
          e.preventDefault();
          setCursor((i) => Math.min(i + 1, items.length - 1));
          break;
        case "k":
          e.preventDefault();
          setCursor((i) => Math.max(i - 1, 0));
          break;
        case "o":
        case "Enter":
          if (items[cursor]) {
            e.preventDefault();
            void openItem(items[cursor]!, cursor);
          }
          break;
        case "x":
          if (items[cursor]) {
            e.preventDefault();
            toggleSelect(items[cursor]!.id);
          }
          break;
        case "e":
          e.preventDefault();
          void bulkAction("archive");
          break;
        case "#":
          e.preventDefault();
          void bulkAction("trash");
          break;
        case "s": {
          e.preventDefault();
          const cur = items.find(
            (m) => m.id === (selectedId ?? items[cursor]?.id),
          );
          void bulkAction(cur?.isStarred ? "unstar" : "star");
          break;
        }
        case "I":
          if (e.shiftKey) {
            e.preventDefault();
            void bulkAction("read");
          }
          break;
        case "U":
          if (e.shiftKey) {
            e.preventDefault();
            void bulkAction("unread");
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cursor, selected, selectedId, showHelp, folder, currentAccount, composing]);

  const usedPct =
    quota && quota.storageQuotaBytes
      ? Math.min(100, Math.round((quota.usedBytes / quota.storageQuotaBytes) * 100))
      : 0;

  return (
    <div className="flex h-full flex-col bg-background mobile-pad-bottom">
      {/* 顶部全宽 Header：应用切换 + 主题 + 账户（与通讯录一致） */}
      <header className="safe-top flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 sm:px-6">
        <AppSwitcher current="mail" />
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
            {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
          </Button>
          <button
            onClick={() => navigate("/profile")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
            title="账户设置"
            aria-label="账户设置"
          >
            <PersonAvatar
              url={avatarImage}
              email={session?.user.email}
              seed={session?.user.email}
              className="size-8 shrink-0"
            />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 侧栏 */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border p-3 sm:flex">
        {/* 账号切换器：个人邮箱 + 被授权的公共邮箱 */}
        {accountList.length > 1 && (
          <div className="px-1 pb-1 pt-2">
            <Select
              ariaLabel="切换邮箱账号"
              value={accountId}
              onChange={switchAccount}
              options={accountList.map((a) => ({
                value: a.id,
                label: a.kind === "shared" ? `${a.address}（公共）` : a.address,
              }))}
            />
          </div>
        )}

        <div className="px-1 py-2">
          <Button variant="primary" fullWidth onClick={newCompose} isDisabled={!online}>
            <PencilIcon className="size-4" />
            {online ? "写邮件" : "离线不可写"}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {FOLDERS.map((f) => {
            const n = counts ? counts[f.key as keyof Counts] : 0;
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
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={() => setShowHelp(true)}
          >
            <KeyboardIcon className="size-4" />
            快捷键
          </Button>
          {notifPerm === "default" && (
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={enableNotifications}
            >
              <BellIcon className="size-4" />
              开启新邮件通知
            </Button>
          )}
          {notifPerm === "granted" && (
            <span className="flex h-8 items-center gap-2 rounded-lg px-3 text-sm text-muted">
              <BellIcon className="size-4" />
              新邮件通知已开启
            </span>
          )}
          {notifPerm === "denied" && (
            <span className="flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-muted">
              <BellIcon className="size-4" />
              通知已被浏览器拒绝
            </span>
          )}
        </div>
      </aside>

      {/* 列表 */}
      <div
        className={
          (readerOpen && isSingleList
            ? "hidden "
            : readerOpen
              ? "hidden sm:flex "
              : "flex ") +
          "w-full shrink-0 flex-col border-r border-border " +
          (isSingleList ? "min-w-0 flex-1" : "sm:w-80 lg:w-96")
        }
      >
        {/* 移动端：文件夹横向切换 + 账号 */}
        <div className="space-y-2 px-3 pt-3 sm:hidden">
          {accountList.length > 1 && (
            <Select
              ariaLabel="切换邮箱账号"
              value={accountId}
              onChange={switchAccount}
              options={accountList.map((a) => ({
                value: a.id,
                label: a.kind === "shared" ? `${a.address}（公共）` : a.address,
              }))}
            />
          )}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FOLDERS.map((f) => {
            const n = counts ? counts[f.key as keyof Counts] : 0;
            const active = folder === f.key;
            return (
            <button
              key={f.key}
              onClick={() => switchFolder(f.key)}
              className={
                "touch-target shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm " +
                (active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "bg-surface-secondary text-muted")
              }
            >
              {f.label}
              {!!n && ` (${n})`}
            </button>
            );
          })}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
                if (e.key === "Escape") e.currentTarget.blur();
              }}
              placeholder="搜索主题 / 联系人 / 内容…"
              aria-label="搜索邮件"
              className="w-full rounded-xl border border-border bg-surface-secondary py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted focus:border-field-border-focus focus:outline-none focus:ring-2 focus:ring-focus/40"
            />
            {(qInput || searchActive) && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="高级搜索"
            onClick={() => setShowAdvanced(true)}
          >
            <SlidersIcon className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="primary"
            isIconOnly
            aria-label="写邮件"
            className="touch-target sm:hidden"
            onClick={newCompose}
            isDisabled={!online}
          >
            <PencilIcon className="size-4" />
          </Button>
        </div>

        {searchActive && (
          <div className="flex items-center gap-2 px-3 pb-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted">
              搜索：{searchSummary(search)} · {total} 封
            </span>
            <button
              type="button"
              onClick={clearSearch}
              className="shrink-0 text-xs text-accent hover:underline"
            >
              退出搜索
            </button>
          </div>
        )}

        {(listFromCache || listError) && (
          <div className="mx-3 mb-2 rounded-xl bg-surface-secondary px-3 py-2 text-xs text-muted">
            {listFromCache && "显示离线缓存"}
            {listFromCache && listError && " · "}
            {listError}
          </div>
        )}

        {/* 工具条：文件夹标题 / 批量操作 */}
        {selected.size > 0 ? (
          <div className="flex items-center gap-0.5 px-3 pb-2">
            <span className="mr-1 text-xs text-muted tabular-nums">已选 {selected.size}</span>
            <Button size="sm" variant="ghost" isIconOnly aria-label="归档" onClick={() => bulkAction("archive")}>
              <ArchiveIcon className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" isIconOnly aria-label="删除" onClick={() => bulkAction("trash")}>
              <TrashIcon className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" isIconOnly aria-label="标已读" onClick={() => bulkAction("read")}>
              <MailOpenIcon className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" isIconOnly aria-label="标未读" onClick={() => bulkAction("unread")}>
              <MailIcon className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" isIconOnly aria-label="星标" onClick={() => bulkAction("star")}>
              <StarIcon className="size-4" />
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" isIconOnly aria-label="取消选择" onClick={() => setSelected(new Set())}>
              <XIcon className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-3 pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="全选"
                className="size-4"
              />
              {currentFolder?.label}
            </label>
            <Button size="sm" variant="ghost" isIconOnly aria-label="刷新" onClick={refreshAll}>
              <RefreshIcon className="size-4" />
            </Button>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-auto px-2 pb-2">
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
              {items.map((m, i) => {
                const active = selectedId === m.id;
                const isCursor = i === cursor;
                const who = displayWho(m, nameOf);
                const unread = !m.isRead && m.direction !== "outbound";
                const checked = selected.has(m.id);
                const when = formatDate(m.scheduledAt ?? m.receivedAt ?? m.sentAt ?? m.createdAt);
                const subject = m.subject || "(无主题)";
                const rowClass =
                  "group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors " +
                  (active
                    ? "bg-surface shadow-surface"
                    : "hover:bg-surface-secondary") +
                  (isCursor && !active ? " ring-1 ring-accent/50" : "") +
                  (checked ? " bg-accent/10" : "");
                const starBtn = (
                  <button
                    aria-label={m.isStarred ? "取消星标" : "星标"}
                    onClick={(e) => toggleStar(m, e)}
                    className={
                      "shrink-0 " +
                      (m.isStarred
                        ? "text-warning"
                        : "text-muted opacity-40 hover:opacity-100")
                    }
                  >
                    {m.isStarred ? (
                      <StarFilledIcon className="size-4" />
                    ) : (
                      <StarIcon className="size-4" />
                    )}
                  </button>
                );
                return (
                  <li key={m.id} data-idx={i}>
                    {isSingleList ? (
                      <div className={rowClass}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(m.id)}
                          aria-label="选择邮件"
                          className="size-4 shrink-0"
                        />
                        <button
                          onClick={() => openItem(m, i)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span
                            className={
                              "w-24 shrink-0 truncate text-sm sm:w-32 " +
                              (unread ? "font-semibold text-foreground" : "text-foreground")
                            }
                          >
                            {who}
                          </span>
                          <span className="flex min-w-0 flex-1 items-baseline gap-1 truncate text-sm">
                            <span
                              className={
                                "shrink-0 " + (unread ? "font-semibold text-foreground" : "text-foreground")
                              }
                            >
                              {subject}
                            </span>
                            {m.sendStatus === "failed" && (
                              <span className="shrink-0 rounded-full bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger">
                                发送失败
                              </span>
                            )}
                            {m.snippet && (
                              <>
                                <span className="shrink-0 text-muted"> — </span>
                                <span className="truncate text-muted">{m.snippet}</span>
                              </>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-muted">
                            {m.hasCalendarInvite && (
                              <CalendarIcon className="size-3.5" aria-label="含日程邀请" />
                            )}
                            {m.hasAttachments && (
                              <PaperclipIcon className="size-3.5" aria-label="含附件" />
                            )}
                            {unread && (
                              <span className="size-1.5 rounded-full bg-accent" aria-label="未读" />
                            )}
                          </span>
                          <span className="w-16 shrink-0 truncate text-right text-xs text-muted sm:w-20">
                            {when}
                          </span>
                        </button>
                        {starBtn}
                      </div>
                    ) : (
                      <div className={rowClass + " items-start rounded-2xl p-2.5"}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(m.id)}
                          aria-label="选择邮件"
                          className="mt-2 size-5 shrink-0 sm:size-4"
                        />
                        <button
                          onClick={() => openItem(m, i)}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <PersonAvatar
                            url={avatarFor(whoEmail(m))}
                            email={whoEmail(m)}
                            seed={who}
                            className="size-9 shrink-0"
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={
                                  "truncate text-sm leading-tight text-foreground " +
                                  (unread ? "font-semibold" : "")
                                }
                              >
                                {who}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <span className="whitespace-nowrap text-xs text-muted">{when}</span>
                                {unread && <span className="size-1.5 rounded-full bg-accent" />}
                              </span>
                            </span>
                            <span
                              className={
                                "truncate text-xs leading-tight " +
                                (unread ? "font-medium text-foreground" : "text-muted")
                              }
                            >
                              {subject}
                            </span>
                            {m.sendStatus === "failed" && (
                              <span className="w-fit rounded-full bg-danger/10 px-1.5 py-0.5 text-[11px] leading-tight text-danger">
                                发送失败
                              </span>
                            )}
                            {(m.hasAttachments || m.hasCalendarInvite) && (
                              <span className="flex items-center gap-2 text-[11px] leading-tight text-muted">
                                {m.hasCalendarInvite && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-accent">
                                    <CalendarIcon className="size-3" />
                                    日程
                                  </span>
                                )}
                                {m.hasAttachments && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-1.5 py-0.5 text-muted">
                                    <PaperclipIcon className="size-3" />
                                    附件
                                  </span>
                                )}
                              </span>
                            )}
                            <span className="truncate text-xs leading-tight text-muted">
                              {m.snippet}
                            </span>
                          </span>
                        </button>
                        <span className="mt-1 shrink-0">{starBtn}</span>
                      </div>
                    )}
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
      <div
        className={
          (isSingleList
            ? readerOpen
              ? "flex "
              : "hidden "
            : readerOpen
              ? "flex "
              : "hidden sm:flex ") + "min-w-0 flex-1 flex-col"
        }
      >
        {readerOpen && (isMobile || isSingleList) && (
          <div className="safe-top flex shrink-0 items-center gap-2 border-b border-border p-2">
            <Button size="sm" variant="ghost" className="touch-target" onClick={backToList}>
              <ArrowLeftIcon className="size-5" />
              返回
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {composing ? (
            <Compose
              key={composeKey}
              addresses={sendable}
              initial={composeInitial}
              personalSignatureHtml={mailSettings?.signatureHtml ?? null}
              onClose={() => {
                setComposing(false);
                refreshAll();
              }}
              onSent={() => {
                setComposing(false);
                switchFolder("sent");
                refreshAll();
              }}
              onScheduled={() => {
                setComposing(false);
                switchFolder("scheduled");
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
              <p className="text-xs text-muted">按 ? 查看快捷键</p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* 高级搜索 */}
      {showAdvanced && (
        <AdvancedSearch
          initial={search ?? {}}
          onApply={runSearch}
          onClose={() => setShowAdvanced(false)}
        />
      )}

      {/* 快捷键帮助 */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <KeyboardIcon className="size-4" />
                键盘快捷键
              </h3>
              <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onClick={() => setShowHelp(false)}>
                <XIcon className="size-4" />
              </Button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{s.desc}</span>
                  <kbd className="rounded-md border border-border bg-surface-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
