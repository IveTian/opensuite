import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Select } from "../../components/Select";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { authClient } from "../../lib/auth-client";
import { bytesToGib, formatBytes, gibToBytes } from "../../lib/format";

interface UserRow {
  id: string;
  name: string;
  email: string;
  externalEmail: string | null;
  role: string | null;
  approvalStatus: string;
  banned: boolean | null;
  addressCount: number;
  storageQuotaBytes: number | null;
  usedBytes: number | null;
  maxAddresses: number | null;
}

interface DomainRow {
  id: string;
  name: string;
  status: string;
}

interface CreateUserResult {
  userId: string;
  internalEmail: string;
  externalEmail: string;
  noticeSent: boolean;
  noticeError: string | null;
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function Users() {
  const { data, loading, refetch } = useFetch<UserRow[]>("/api/admin/users");
  const { data: domains } = useFetch<DomainRow[]>("/api/admin/domains");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [gib, setGib] = useState("1");
  const [maxAddr, setMaxAddr] = useState("1");
  const [inviteName, setInviteName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [domainId, setDomainId] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [sendNotice, setSendNotice] = useState(true);
  const [quotaError, setQuotaError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const domainOptions = (domains ?? [])
    .filter((d) => d.status !== "disabled")
    .map((d) => ({ value: d.id, label: `${d.name}${d.status === "active" ? "" : "（未验证）"}` }));
  const selectedDomain =
    (domains ?? []).find((d) => d.id === domainId) ?? (domains ?? []).find((d) => d.status !== "disabled");
  const previewAddress =
    localPart && selectedDomain ? `${localPart.toLowerCase()}@${selectedDomain.name}` : "";

  function openQuota(u: UserRow) {
    setEditing(u);
    setGib(String(bytesToGib(u.storageQuotaBytes ?? 0)));
    setMaxAddr(String(u.maxAddresses ?? 1));
    setQuotaError("");
  }

  async function saveQuota(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setQuotaError("");
    try {
      await api.put(`/api/admin/users/${editing.id}/quota`, {
        storageQuotaBytes: gibToBytes(Number(gib)),
        maxAddresses: Number(maxAddr),
      });
      setEditing(null);
      await refetch();
    } catch (err) {
      setQuotaError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteMsg("");
    setCreating(true);
    try {
      const result = await api.post<CreateUserResult>("/api/admin/users", {
        name: inviteName,
        externalEmail,
        localPart,
        domainId: domainId || selectedDomain?.id,
        password,
        sendNotice,
      });
      setInviteMsg(
        result.noticeSent
          ? `已创建 ${result.internalEmail}，通知已发送到 ${result.externalEmail}。`
          : `已创建 ${result.internalEmail}。${result.noticeError ? `通知未发送：${result.noticeError}` : "未发送通知。"}`,
      );
      setInviteName("");
      setExternalEmail("");
      setLocalPart("");
      setPassword(generatePassword());
      await refetch();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "创建用户失败");
    } finally {
      setCreating(false);
    }
  }

  async function approve(u: UserRow) {
    await api.post(`/api/admin/users/${u.id}/approve`);
    await refetch();
  }

  async function toggleBan(u: UserRow) {
    if (u.banned) await authClient.admin.unbanUser({ userId: u.id });
    else await authClient.admin.banUser({ userId: u.id });
    await refetch();
  }

  async function toggleRole(u: UserRow) {
    const next = u.role === "admin" ? "user" : "admin";
    await authClient.admin.setRole({ userId: u.id, role: next as "user" | "admin" });
    await refetch();
  }

  const cols: Column<UserRow>[] = [
    { key: "email", header: "内部邮箱" },
    {
      key: "externalEmail",
      header: "外部邮箱",
      render: (r) => r.externalEmail || <span className="text-muted">未记录</span>,
    },
    { key: "name", header: "昵称" },
    {
      key: "role",
      header: "角色",
      render: (r) =>
        r.role === "admin" ? <Badge tone="primary">管理员</Badge> : <Badge>用户</Badge>,
    },
    {
      key: "status",
      header: "状态",
      render: (r) =>
        r.banned ? (
          <Badge tone="danger">封禁</Badge>
        ) : r.approvalStatus === "pending" ? (
          <Badge tone="warning">待审核</Badge>
        ) : (
          <Badge tone="success">正常</Badge>
        ),
    },
    {
      key: "quota",
      header: "配额",
      render: (r) =>
        `${formatBytes(r.usedBytes ?? 0)} / ${formatBytes(r.storageQuotaBytes ?? 0)} · ${r.addressCount}/${r.maxAddresses ?? 0} 址`,
    },
    {
      key: "actions",
      header: "操作",
      render: (r) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => openQuota(r)}>
            配额
          </Button>
          {r.approvalStatus === "pending" && (
            <Button size="sm" variant="primary" onClick={() => approve(r)}>
              通过
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => toggleRole(r)}>
            {r.role === "admin" ? "降为用户" : "设为管理员"}
          </Button>
          <Button size="sm" variant="danger-soft" onClick={() => toggleBan(r)}>
            {r.banned ? "解封" : "封禁"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="用户管理" subtitle="管理员创建账号，并通过 notice@域名发送登录信息" />

      <Panel className="mb-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">邀请用户</h2>
          <p className="mt-1 text-sm text-muted">
            内部邮箱用于登录和收发邮件；外部邮箱只用于接收初始登录信息。
          </p>
        </div>
        <form onSubmit={createUser} className="grid gap-3 lg:grid-cols-12 lg:items-end">
          <TextField className="lg:col-span-3">
            <Label>姓名</Label>
            <Input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              required
            />
          </TextField>
          <TextField className="lg:col-span-3">
            <Label>外部邮箱</Label>
            <Input
              type="email"
              placeholder="user@gmail.com"
              value={externalEmail}
              onChange={(e) => setExternalEmail(e.target.value)}
              required
            />
          </TextField>
          <TextField className="lg:col-span-2">
            <Label>内部邮箱前缀</Label>
            <Input
              placeholder="user"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              required
            />
          </TextField>
          <div className="lg:col-span-2">
            <Select
              label="域名"
              value={domainId || selectedDomain?.id || ""}
              onChange={setDomainId}
              options={domainOptions}
              placeholder="选择域名"
            />
          </div>
          <TextField className="lg:col-span-2">
            <Label>初始密码</Label>
            <div className="flex gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="button" variant="ghost" onClick={() => setPassword(generatePassword())}>
                生成
              </Button>
            </div>
          </TextField>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 lg:col-span-5">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">发送通知邮件</div>
              <div className="truncate text-xs text-muted">
                {previewAddress
                  ? `从 notice@${previewAddress.split("@")[1]} 发送到外部邮箱`
                  : "选择域名后可发送通知"}
              </div>
            </div>
            <Switch isSelected={sendNotice} onChange={setSendNotice} />
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm">
              <span className="text-muted">登录账号：</span>
              <span className="font-medium text-foreground">{previewAddress || "待填写"}</span>
            </div>
          </div>
          <div className="lg:col-span-2">
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isDisabled={creating || !selectedDomain}
            >
              {creating ? "创建中…" : "创建并邀请"}
            </Button>
          </div>
        </form>
        {inviteMsg && <div className="mt-3"><Alert kind="success">{inviteMsg}</Alert></div>}
        {inviteError && <div className="mt-3"><Alert>{inviteError}</Alert></div>}
        {!selectedDomain && (
          <div className="mt-3">
            <Alert>请先在域名管理中添加收信域名。</Alert>
          </div>
        )}
      </Panel>

      {editing && (
        <Panel className="mb-5">
          <form onSubmit={saveQuota} className="flex flex-wrap items-end gap-3">
            <div className="text-sm text-muted">
              分配配额：<span className="font-medium">{editing.email}</span>
            </div>
            <TextField className="w-32">
              <Label>存储 (GiB)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={gib}
                onChange={(e) => setGib(e.target.value)}
              />
            </TextField>
            <TextField className="w-32">
              <Label>最大邮箱数</Label>
              <Input
                type="number"
                min={1}
                value={maxAddr}
                onChange={(e) => setMaxAddr(e.target.value)}
              />
            </TextField>
            <Button type="submit" variant="primary" isDisabled={busy}>
              保存
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            {quotaError && <Alert>{quotaError}</Alert>}
          </form>
        </Panel>
      )}

      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有用户" />
      )}
    </div>
  );
}
