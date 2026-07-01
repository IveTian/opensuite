import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Select } from "../../components/Select";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { formatBytes } from "../../lib/format";

interface AddressRow {
  id: string;
  address: string;
  type: string;
  status: string;
  isPrimary: boolean;
  usedBytes: number;
  domain: string;
  ownerEmail: string | null;
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
      await api.post(`/api/admin/addresses/${address.id}/members`, { userId: addUserId });
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
          label="添加可访问用户"
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
              <Button
                size="sm"
                variant="danger-soft"
                onClick={() => removeMember(m.userId)}
              >
                移除
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          还没有成员，添加用户后其可在邮箱页切换到该公共邮箱进行读写。
        </p>
      )}
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
    { key: "ownerEmail", header: "归属用户", render: (r) => r.ownerEmail || "—" },
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
            <Button size="sm" variant="ghost" onClick={() => setManagingRow(r)}>
              成员
            </Button>
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

      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有邮箱地址" />
      )}
    </div>
  );
}
