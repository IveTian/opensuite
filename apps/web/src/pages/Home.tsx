import { Button, Input, Label, TextField } from "@heroui/react";
import { Avatar } from "@heroui/react";
import { Suspense, lazy, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Badge, Panel, Table, type Column } from "../components/ui";
import { LogOutIcon, MailIcon, ShieldIcon } from "../components/icons";
import { useFetch } from "../hooks/useFetch";
import { api, ApiError } from "../lib/api";
import { formatBytes } from "../lib/format";
import { signOut, useSession } from "../lib/auth-client";

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

function initials(value?: string | null): string {
  if (!value) return "?";
  const local = value.split("@")[0] ?? value;
  const parts = local.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Home() {
  const { data: session } = useSession();
  const { data: quota } = useFetch<MyQuota | null>("/api/me/quota");
  const { data: addresses, refetch: refetchAddresses } =
    useFetch<MyAddress[]>("/api/me/addresses");
  const { data: mailSettings } = useFetch<MailSettings>("/api/me/mail-settings");
  const navigate = useNavigate();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const mailboxes = (addresses ?? []).filter((a) => a.type === "mailbox");

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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-11 shrink-0">
            <Avatar.Fallback>{initials(session?.user.email)}</Avatar.Fallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              你好，{session?.user.name}
            </h1>
            <p className="text-sm text-muted">{session?.user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate("/mail")}>
            <MailIcon className="size-4" />
            进入邮箱
          </Button>
          {role === "admin" && (
            <Button variant="outline" onClick={() => navigate("/admin")}>
              <ShieldIcon className="size-4" />
              管理后台
            </Button>
          )}
          <Button
            variant="ghost"
            isIconOnly
            aria-label="退出登录"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </div>

      <Panel className="mb-5">
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
                  className={"h-full rounded-full " + (usedPct >= 90 ? "bg-danger" : "bg-accent")}
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

      <div className="mb-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">我的邮箱地址</h2>
        <Table columns={cols} rows={addresses ?? []} empty="暂无邮箱地址" />
      </div>

      {/* 发信设置：发信人名称 + 个人签名 */}
      <Panel className="mb-5">
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

      <Panel className="mb-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">个人签名</h2>
        <p className="mb-4 text-xs text-muted">撰写新邮件、回复、转发时自动插入。</p>
        {mailSettings ? (
          <PersonalSignature
            initial={mailSettings.signatureHtml ?? ""}
            onSaved={() => {}}
          />
        ) : (
          <div className="min-h-40 animate-pulse rounded-xl bg-surface-secondary" />
        )}

        {mailSettings?.orgSignatureHtml && (
          <div className="mt-5 border-t border-separator pt-4">
            <h3 className="mb-1 text-xs font-semibold text-foreground">组织签名（自动附加）</h3>
            <p className="mb-2 text-xs text-muted">由管理员统一设置，会附加在你的个人签名之后。</p>
            <div
              className="rounded-xl bg-surface-secondary p-3 text-sm text-foreground [&_a]:text-accent"
              // 组织签名由管理员设置并已在服务端清洗
              dangerouslySetInnerHTML={{ __html: mailSettings.orgSignatureHtml }}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
