import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { NativeSelect } from "../../components/NativeSelect";
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

export function Addresses() {
  const { data, loading, refetch } = useFetch<AddressRow[]>("/api/admin/addresses");
  const { data: domains } = useFetch<DomainRow[]>("/api/admin/domains");
  const { data: users } = useFetch<UserRow[]>("/api/admin/users");

  const [domainId, setDomainId] = useState("");
  const [userId, setUserId] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [type, setType] = useState<"mailbox" | "alias">("mailbox");
  const [targetAddressId, setTargetAddressId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const mailboxTargets = (data ?? []).filter((a) => a.type === "mailbox");

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
    await api.del(`/api/admin/addresses/${row.id}`);
    await refetch();
  }

  const cols: Column<AddressRow>[] = [
    { key: "address", header: "邮箱地址" },
    { key: "ownerEmail", header: "归属用户", render: (r) => r.ownerEmail || "—" },
    { key: "type", header: "类型" },
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
        <Button size="sm" variant="danger-soft" onClick={() => remove(r)}>
          删除
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="邮箱地址" subtitle="为用户在某域名下分配邮箱" />
      <Panel className="mb-5">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <NativeSelect
            label="类型"
            value={type}
            onChange={(e) => setType(e.target.value as "mailbox" | "alias")}
          >
            <option value="mailbox">邮箱 mailbox</option>
            <option value="alias">别名 alias</option>
          </NativeSelect>
          {type === "mailbox" ? (
            <NativeSelect
              label="归属用户"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            >
              <option value="">选择用户</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <NativeSelect
              label="投递到 mailbox"
              value={targetAddressId}
              onChange={(e) => setTargetAddressId(e.target.value)}
              required
            >
              <option value="">选择目标 mailbox</option>
              {mailboxTargets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.address}
                </option>
              ))}
            </NativeSelect>
          )}
          <TextField className="w-40">
            <Label>邮箱前缀</Label>
            <Input
              placeholder={type === "alias" ? "sales" : "alice"}
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              required
            />
          </TextField>
          <NativeSelect
            label="域名"
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            required
          >
            <option value="">选择域名</option>
            {(domains ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                @{d.name}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="primary" isDisabled={busy}>
            {type === "alias" ? "创建别名" : "创建邮箱"}
          </Button>
        </form>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Panel>
      {loading ? (
        <p className="text-foreground-500">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有邮箱地址" />
      )}
    </div>
  );
}
