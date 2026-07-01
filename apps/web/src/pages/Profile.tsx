import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { Suspense, lazy, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppSwitcher } from "../components/AppSwitcher";
import { Alert, Badge, Panel, Table, type Column } from "../components/ui";
import {
  AtSignIcon,
  LogOutIcon,
  MoonIcon,
  PencilIcon,
  SendIcon,
  ShieldIcon,
  SunIcon,
  UserIcon,
} from "../components/icons";
import {
  PersonAvatar,
  setGravatarEnabled,
  useGravatarEnabled,
} from "../components/PersonAvatar";
import { useFetch } from "../hooks/useFetch";
import { api, ApiError } from "../lib/api";
import { formatBytes } from "../lib/format";
import { signOut, useSession } from "../lib/auth-client";
import { useTheme } from "../providers/theme";

const RichTextEditor = lazy(() => import("../components/RichTextEditor"));

interface MyAddress {
  id: string;
  address: string;
  type: string;
  status: string;
  isPrimary: boolean;
  senderName: string | null;
  usedBytes: number;
  domain: string;
}
interface MyQuota {
  storageQuotaBytes: number;
  usedBytes: number;
  maxAddresses: number;
}
interface MailSettings {
  signatureHtml: string | null;
  orgSignatureHtml: string | null;
}

const SECTIONS = [
  { key: "profile", label: "个人资料", icon: UserIcon },
  { key: "mailboxes", label: "邮箱与配额", icon: AtSignIcon },
  { key: "sending", label: "发信设置", icon: SendIcon },
  { key: "privacy", label: "隐私", icon: ShieldIcon },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

/** 单个邮箱的发信人显示名编辑行 */
function SenderNameRow({ addr, onSaved }: { addr: MyAddress; onSaved: () => void }) {
  const [name, setName] = useState(addr.senderName ?? "");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true);
    setOk(false);
    setErr("");
    try {
      await api.patch(`/api/me/addresses/${addr.id}/sender-name`, { senderName: name });
      setOk(true);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-end gap-2">
      <TextField className="flex-1">
        <Label className="text-xs text-muted">{addr.address}</Label>
        <Input
          value={name}
          placeholder="发信人显示名（如：张三）"
          onChange={(e) => {
            setName(e.target.value);
            setOk(false);
          }}
        />
      </TextField>
      <Button size="sm" variant="outline" isDisabled={busy} onClick={save}>
        {busy ? "保存中…" : ok ? "已保存" : "保存"}
      </Button>
      {err && <span className="pb-2 text-xs text-danger">{err}</span>}
    </div>
  );
}

/** 个人签名编辑器 */
function PersonalSignature({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const [html, setHtml] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true);
    setOk(false);
    setErr("");
    try {
      await api.put("/api/me/mail-settings", { signatureHtml: html || null });
      setOk(true);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-40 flex-col">
        <Suspense
          fallback={<div className="min-h-40 animate-pulse rounded-xl bg-surface-secondary" />}
        >
          <RichTextEditor
            className="min-h-40"
            value={initial}
            placeholder="输入个人签名，撰写邮件时自动插入…"
            onChange={(h) => {
              setHtml(h);
              setOk(false);
            }}
          />
        </Suspense>
      </div>
      {err && <Alert>{err}</Alert>}
      <div>
        <Button size="sm" variant="primary" isDisabled={busy} onClick={save}>
          {busy ? "保存中…" : ok ? "已保存" : "保存签名"}
        </Button>
      </div>
    </div>
  );
}

export function Profile() {
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();
  const { data: quota } = useFetch<MyQuota | null>("/api/me/quota");
  const { data: addresses, refetch: refetchAddresses } =
    useFetch<MyAddress[]>("/api/me/addresses");
  const { data: mailSettings } = useFetch<MailSettings>("/api/me/mail-settings");
  const navigate = useNavigate();
  const [section, setSection] = useState<SectionKey>("profile");
  const mailboxes = (addresses ?? []).filter((a) => a.type === "mailbox");

  // 头像：undefined=沿用会话头像，null=已移除，string=刚上传
  const sessionImage = (session?.user as { image?: string | null } | undefined)?.image ?? null;
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const shownAvatar = avatar === undefined ? sessionImage : avatar;
  const [avatarBusy, setAvatarBusy] = useState(false);
  const gravatarEnabled = useGravatarEnabled();

  async function onAvatarFile(file?: File) {
    if (!file) return;
    if (file.size > 200 * 1024) {
      alert("图片过大，请使用 ≤ 200KB 的图片");
      return;
    }
    setAvatarBusy(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const imageBase64 = dataUrl.split(",")[1] ?? "";
      const out = await api.put<{ image: string }>("/api/me/avatar", {
        contentType: file.type,
        imageBase64,
      });
      setAvatar(out.image);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "上传失败");
    } finally {
      setAvatarBusy(false);
    }
  }
  async function removeAvatar() {
    await api.del("/api/me/avatar");
    setAvatar(null);
  }
  async function logout() {
    await signOut();
    navigate("/login");
  }

  const usedPct =
    quota && quota.storageQuotaBytes
      ? Math.min(100, Math.round((quota.usedBytes / quota.storageQuotaBytes) * 100))
      : 0;

  const cols: Column<MyAddress>[] = [
    { key: "address", header: "邮箱地址" },
    {
      key: "isPrimary",
      header: "主地址",
      render: (r) => (r.isPrimary ? <Badge tone="primary">主</Badge> : "—"),
    },
    {
      key: "usedBytes",
      header: "已用",
      render: (r) => <span className="tabular-nums">{formatBytes(r.usedBytes)}</span>,
    },
    {
      key: "status",
      header: "状态",
      render: (r) => (
        <Badge tone={r.status === "active" ? "success" : "default"}>{r.status}</Badge>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col bg-background mobile-pad-bottom">
      {/* 顶部全宽 Header（与邮箱/通讯录/后台一致） */}
      <header className="safe-top flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 sm:px-6">
        <AppSwitcher current="profile" label="账户" />
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
            {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
          </Button>
          <button
            onClick={() => setSection("profile")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
            title="个人资料"
            aria-label="个人资料"
          >
            <PersonAvatar
              url={shownAvatar}
              email={session?.user.email}
              seed={session?.user.email}
              className="size-8 shrink-0"
            />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧分类栏 */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border p-3 sm:flex">
          <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">账户设置</p>
        <nav className="flex flex-1 flex-col gap-0.5">
          {SECTIONS.map((s) => {
            const Ico = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={
                  "flex h-9 items-center gap-3 rounded-xl px-3 text-sm " +
                  (active
                    ? "bg-surface font-medium text-foreground shadow-surface"
                    : "text-muted hover:bg-surface-secondary hover:text-foreground")
                }
              >
                <Ico className="size-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary p-2">
          <PersonAvatar
            url={shownAvatar}
            email={session?.user.email}
            seed={session?.user.email}
            className="size-8 shrink-0"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {session?.user.name}
            </span>
            <span className="truncate text-xs text-muted">{session?.user.email}</span>
          </div>
          <Button size="sm" variant="ghost" isIconOnly aria-label="退出登录" onClick={logout}>
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </aside>

      {/* 右侧内容区 */}
      <main className="min-w-0 flex-1 overflow-auto">
        {/* 移动端分区切换 */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-3 py-2 sm:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={
                "whitespace-nowrap rounded-full px-3 py-1 text-xs " +
                (section === s.key
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-secondary text-muted")
              }
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          {section === "profile" && (
            <Panel>
              <h2 className="mb-4 text-sm font-semibold text-foreground">个人资料</h2>
              <div className="flex items-center gap-4">
                <label
                  className="relative cursor-pointer"
                  title="点击更换头像"
                  aria-label="更换头像"
                >
                  <PersonAvatar
                    url={shownAvatar}
                    email={avatar === null ? undefined : session?.user.email}
                    seed={session?.user.email}
                    className="size-16 shrink-0"
                  />
                  <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-surface">
                    <PencilIcon className="size-3.5" />
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onAvatarFile(e.target.files?.[0])}
                  />
                </label>
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-foreground">
                    {session?.user.name}
                  </div>
                  <div className="truncate text-sm text-muted">{session?.user.email}</div>
                  {avatarBusy ? (
                    <p className="text-xs text-muted">头像上传中…</p>
                  ) : (
                    shownAvatar && (
                      <button
                        onClick={removeAvatar}
                        className="text-xs text-muted hover:text-danger"
                      >
                        移除头像
                      </button>
                    )
                  )}
                </div>
              </div>
            </Panel>
          )}

          {section === "mailboxes" && (
            <div className="flex flex-col gap-5">
              <Panel>
                <h2 className="mb-4 text-sm font-semibold text-foreground">我的配额</h2>
                {quota ? (
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted">存储用量</span>
                        <span className="tabular-nums text-sm text-foreground">
                          {formatBytes(quota.usedBytes)} / {formatBytes(quota.storageQuotaBytes)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-default-soft">
                        <div
                          className={
                            "h-full rounded-full " + (usedPct >= 90 ? "bg-danger" : "bg-accent")
                          }
                          style={{ width: `${usedPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 rounded-xl bg-surface-secondary px-4 py-2.5">
                      <div className="text-xs text-muted">最大邮箱数</div>
                      <div className="tabular-nums text-lg font-semibold text-foreground">
                        {quota.maxAddresses}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted">尚未分配配额</p>
                )}
              </Panel>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">我的邮箱地址</h2>
                <Table columns={cols} rows={addresses ?? []} empty="暂无邮箱地址" />
              </div>
            </div>
          )}

          {section === "sending" && (
            <div className="flex flex-col gap-5">
              <Panel>
                <h2 className="mb-1 text-sm font-semibold text-foreground">发信人名称</h2>
                <p className="mb-4 text-xs text-muted">
                  对方收到邮件时显示的名称；留空则用你的昵称「{session?.user.name}」。
                </p>
                {mailboxes.length ? (
                  <div className="flex flex-col gap-3">
                    {mailboxes.map((a) => (
                      <SenderNameRow key={a.id} addr={a} onSaved={() => void refetchAddresses()} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">暂无可发信的邮箱</p>
                )}
              </Panel>

              <Panel>
                <h2 className="mb-1 text-sm font-semibold text-foreground">个人签名</h2>
                <p className="mb-4 text-xs text-muted">撰写新邮件、回复、转发时自动插入。</p>
                {mailSettings ? (
                  <PersonalSignature initial={mailSettings.signatureHtml ?? ""} onSaved={() => {}} />
                ) : (
                  <div className="min-h-40 animate-pulse rounded-xl bg-surface-secondary" />
                )}

                {mailSettings?.orgSignatureHtml && (
                  <div className="mt-5 border-t border-separator pt-4">
                    <h3 className="mb-1 text-xs font-semibold text-foreground">
                      组织签名（自动附加）
                    </h3>
                    <p className="mb-2 text-xs text-muted">
                      由管理员统一设置，会附加在你的个人签名之后。
                    </p>
                    <div
                      className="rounded-xl bg-surface-secondary p-3 text-sm text-foreground [&_a]:text-accent"
                      // 组织签名由管理员设置并已在服务端清洗
                      dangerouslySetInnerHTML={{ __html: mailSettings.orgSignatureHtml }}
                    />
                  </div>
                )}
              </Panel>
            </div>
          )}

          {section === "privacy" && (
            <Panel>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">
                    用 Gravatar 显示外部头像
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    开启后会按对方邮箱向 gravatar.com 查询头像（会把联系人邮箱的哈希发给第三方）。
                    本系统内部用户仍优先用其上传的头像；此开关仅本设备生效。
                  </p>
                </div>
                <Switch isSelected={gravatarEnabled} onChange={setGravatarEnabled} />
              </div>
            </Panel>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
