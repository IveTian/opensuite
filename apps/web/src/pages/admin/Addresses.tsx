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
          <Select
            label="类型"
            className="w-36"
            value={type}
            onChange={(v) => setType(v as "mailbox" | "alias")}
            options={[
              { value: "mailbox", label: "邮箱 mailbox" },
              { value: "alias", label: "别名 alias" },
            ]}
          />
          {type === "mailbox" ? (
            <Select
              label="归属用户"
              className="w-56"
              value={userId}
              onChange={setUserId}
              placeholder="选择用户"
              isRequired
              options={(users ?? []).map((u) => ({ value: u.id, label: u.email }))}
            />
          ) : (
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
              placeholder={type === "alias" ? "sales" : "alice"}
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
            {type === "alias" ? "创建别名" : "创建邮箱"}
          </Button>
        </form>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Panel>
      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有邮箱地址" />
      )}
    </div>
  );
}
