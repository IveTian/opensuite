import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { authClient } from "../../lib/auth-client";
import { bytesToGib, formatBytes, gibToBytes } from "../../lib/format";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  approvalStatus: string;
  banned: boolean | null;
  addressCount: number;
  storageQuotaBytes: number | null;
  usedBytes: number | null;
  maxAddresses: number | null;
}

export function Users() {
  const { data, loading, refetch } = useFetch<UserRow[]>("/api/admin/users");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [gib, setGib] = useState("1");
  const [maxAddr, setMaxAddr] = useState("1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function openQuota(u: UserRow) {
    setEditing(u);
    setGib(String(bytesToGib(u.storageQuotaBytes ?? 0)));
    setMaxAddr(String(u.maxAddresses ?? 1));
    setError("");
  }

  async function saveQuota(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/admin/users/${editing.id}/quota`, {
        storageQuotaBytes: gibToBytes(Number(gib)),
        maxAddresses: Number(maxAddr),
      });
      setEditing(null);
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setBusy(false);
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
    { key: "email", header: "邮箱" },
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
      <PageHeader title="用户管理" subtitle="角色、审核、封禁与配额分配" />

      {editing && (
        <Panel className="mb-5">
          <form onSubmit={saveQuota} className="flex flex-wrap items-end gap-3">
            <div className="text-sm text-foreground-600">
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
            {error && <Alert>{error}</Alert>}
          </form>
        </Panel>
      )}

      {loading ? (
        <p className="text-foreground-500">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有用户" />
      )}
    </div>
  );
}
