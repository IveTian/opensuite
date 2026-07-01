import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { Suspense, lazy, useState, type FormEvent } from "react";
import { Select } from "../../components/Select";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { formatBytes } from "../../lib/format";

const RichTextEditor = lazy(() => import("../../components/RichTextEditor"));

interface AddressRow {
  id: string;
  address: string;
  type: string;
  status: string;
  isPrimary: boolean;
  usedBytes: number;
  domain: string;
  ownerEmail: string | null;
  senderName: string | null;
  sharedSignatureHtml: string | null;
  sharedDisablePersonalSignature: boolean;
  departmentLinks: {
    departmentId: string;
    departmentName: string;
    defaultCanSend: boolean;
  }[];
}
interface DomainRow {
  id: string;
  name: string;
}
interface UserRow {
  id: string;
  email: string;
}
interface MemberRow {
  userId: string;
  email: string;
  name: string;
  canSend: boolean;
}

type CreateType = "mailbox" | "alias" | "shared";

/** 公共邮箱成员管理面板 */
function MemberManager({
  address,
  users,
  onClose,
}: {
  address: AddressRow;
  users: UserRow[];
  onClose: () => void;
}) {
  const { data: members, refetch } = useFetch<MemberRow[]>(
    `/api/admin/addresses/${address.id}/members`,
  );
  const [addUserId, setAddUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = new Set((members ?? []).map((m) => m.userId));
  const candidates = users.filter((u) => !existing.has(u.id));

  async function add() {
    if (!addUserId) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/addresses/${address.id}/members`, {
        userId: addUserId,
        canSend: true,
      });
      setAddUserId("");
      await refetch();
    } finally {
      setBusy(false);
    }
  }
  async function removeMember(userId: string) {
    await api.del(`/api/admin/addresses/${address.id}/members/${userId}`);
    await refetch();
  }
  async function setCanSend(userId: string, canSend: boolean) {
    await api.patch(`/api/admin/addresses/${address.id}/members/${userId}`, { canSend });
    await refetch();
  }

  return (
    <Panel className="mb-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          公共邮箱成员 · {address.address}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </div>
      <div className="mb-3 flex items-end gap-2">
        <Select
          className="w-64"
          label="添加可发信用户"
          value={addUserId}
          onChange={setAddUserId}
          placeholder="选择用户"
          options={candidates.map((u) => ({ value: u.id, label: u.email }))}
        />
        <Button size="sm" variant="primary" isDisabled={busy || !addUserId} onClick={add}>
          添加
        </Button>
      </div>
      {(members ?? []).length ? (
        <ul className="flex flex-col gap-1">
          {(members ?? []).map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="text-foreground">
                {m.name} <span className="text-muted">{m.email}</span>
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  可发信
                  <Switch
                    isSelected={m.canSend}
                    onChange={(v) => void setCanSend(m.userId, v)}
                  />
                </label>
                <Button
                  size="sm"
                  variant="danger-soft"
                  onClick={() => removeMember(m.userId)}
                >
                  移除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          还没有指定人员。部门授权可提供只读范围；这里添加的人员可单独授予发信权。
        </p>
      )}
    </Panel>
  );
}

function SharedSettings({
  address,
  onClose,
  onSaved,
}: {
  address: AddressRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [senderName, setSenderName] = useState(address.senderName ?? "");
  const [signature, setSignature] = useState(address.sharedSignatureHtml ?? "");
  const [disablePersonal, setDisablePersonal] = useState(
    address.sharedDisablePersonalSignature,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api.patch(`/api/admin/addresses/${address.id}/shared-settings`, {
        senderName: senderName.trim() || null,
        sharedSignatureHtml: signature || null,
        sharedDisablePersonalSignature: disablePersonal,
      });
      setMsg("公共邮箱设置已保存");
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mb-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          公共邮箱设置 · {address.address}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        <TextField>
          <Label>发信人显示名</Label>
          <Input
            value={senderName}
            placeholder="如：客服团队"
            onChange={(e) => setSenderName(e.target.value)}
          />
        </TextField>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-foreground">禁用个人签名</div>
            <div className="text-xs text-muted">
              使用该公共邮箱发信时，只使用公共邮箱签名和组织签名。
            </div>
          </div>
          <Switch isSelected={disablePersonal} onChange={setDisablePersonal} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>公共邮箱签名</Label>
          <Suspense
            fallback={<div className="min-h-40 animate-pulse rounded-xl bg-surface-secondary" />}
          >
            <RichTextEditor
              className="min-h-40"
              value={address.sharedSignatureHtml ?? ""}
              placeholder="输入公共邮箱签名…"
              onChange={(h) => setSignature(h)}
            />
          </Suspense>
        </div>
        {msg && <Alert kind="success">{msg}</Alert>}
        {err && <Alert>{err}</Alert>}
        <div>
          <Button variant="primary" onClick={save} isDisabled={busy}>
            {busy ? "保存中…" : "保存公共邮箱设置"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function Addresses() {
  const { data, loading, refetch } = useFetch<AddressRow[]>("/api/admin/addresses");
  const { data: domains } = useFetch<DomainRow[]>("/api/admin/domains");
  const { data: users } = useFetch<UserRow[]>("/api/admin/users");

  const [domainId, setDomainId] = useState("");
  const [userId, setUserId] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [type, setType] = useState<CreateType>("mailbox");
  const [targetAddressId, setTargetAddressId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [managingRow, setManagingRow] = useState<AddressRow | null>(null);
  const [settingsRow, setSettingsRow] = useState<AddressRow | null>(null);

  const mailboxTargets = (data ?? []).filter(
    (a) => a.type === "mailbox" || a.type === "shared",
  );

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/admin/addresses", {
        domainId,
        ...(type === "mailbox" ? { userId } : {}),
        localPart,
        type,
        isPrimary: false,
        ...(type === "alias" ? { targetAddressId } : {}),
      });
      setLocalPart("");
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: AddressRow) {
    if (!confirm(`删除地址 ${row.address}？`)) return;
    if (managingRow?.id === row.id) setManagingRow(null);
    await api.del(`/api/admin/addresses/${row.id}`);
    await refetch();
  }

  const cols: Column<AddressRow>[] = [
    { key: "address", header: "邮箱地址" },
    {
      key: "type",
      header: "类型",
      render: (r) =>
        r.type === "shared" ? <Badge tone="primary">公共</Badge> : r.type,
    },
    {
      key: "ownerEmail",
      header: "归属/部门",
      render: (r) =>
        r.type === "shared" ? (
          <div className="flex flex-wrap gap-1">
            {r.departmentLinks.length ? (
              r.departmentLinks.map((d) => (
                <Badge key={d.departmentId} tone={d.defaultCanSend ? "primary" : "default"}>
                  {d.departmentName}{d.defaultCanSend ? " 可发" : " 只读"}
                </Badge>
              ))
            ) : (
              <span className="text-muted">未关联部门</span>
            )}
          </div>
        ) : (
          r.ownerEmail || "—"
        ),
    },
    { key: "usedBytes", header: "已用", render: (r) => formatBytes(r.usedBytes) },
    {
      key: "status",
      header: "状态",
      render: (r) => (
        <Badge tone={r.status === "active" ? "success" : "default"}>{r.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "操作",
      render: (r) => (
        <div className="flex gap-2">
          {r.type === "shared" && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setManagingRow(r)}>
                人员权限
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSettingsRow(r)}>
                签名
              </Button>
            </>
          )}
          <Button size="sm" variant="danger-soft" onClick={() => remove(r)}>
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="邮箱地址" subtitle="为用户分配邮箱、创建别名或公共邮箱" />
      <Panel className="mb-5">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <Select
            label="类型"
            className="w-40"
            value={type}
            onChange={(v) => setType(v as CreateType)}
            options={[
              { value: "mailbox", label: "邮箱 mailbox" },
              { value: "alias", label: "别名 alias" },
              { value: "shared", label: "公共邮箱 shared" },
            ]}
          />
          {type === "mailbox" && (
            <Select
              label="归属用户"
              className="w-56"
              value={userId}
              onChange={setUserId}
              placeholder="选择用户"
              isRequired
              options={(users ?? []).map((u) => ({ value: u.id, label: u.email }))}
            />
          )}
          {type === "alias" && (
            <Select
              label="投递到 mailbox"
              className="w-56"
              value={targetAddressId}
              onChange={setTargetAddressId}
              placeholder="选择目标 mailbox"
              isRequired
              options={mailboxTargets.map((a) => ({ value: a.id, label: a.address }))}
            />
          )}
          <TextField className="w-40">
            <Label>邮箱前缀</Label>
            <Input
              placeholder={type === "alias" ? "sales" : type === "shared" ? "support" : "alice"}
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              required
            />
          </TextField>
          <Select
            label="域名"
            className="w-44"
            value={domainId}
            onChange={setDomainId}
            placeholder="选择域名"
            isRequired
            options={(domains ?? []).map((d) => ({ value: d.id, label: `@${d.name}` }))}
          />
          <Button type="submit" variant="primary" isDisabled={busy}>
            {type === "shared" ? "创建公共邮箱" : type === "alias" ? "创建别名" : "创建邮箱"}
          </Button>
        </form>
        {type === "shared" && (
          <p className="mt-2 text-xs text-muted">
          公共邮箱无单一归属，创建后点表格中的「成员」按钮授权用户可读可写。
          </p>
        )}
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
      </Panel>

      {managingRow && (
        <MemberManager
          address={managingRow}
          users={users ?? []}
          onClose={() => setManagingRow(null)}
        />
      )}

      {settingsRow && (
        <SharedSettings
          address={settingsRow}
          onClose={() => setSettingsRow(null)}
          onSaved={() => void refetch()}
        />
      )}

      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有邮箱地址" />
      )}
    </div>
  );
}
