import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { formatDate } from "../../lib/format";

interface InviteRow {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  status: string;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function Invites() {
  const { data, loading, refetch } = useFetch<InviteRow[]>("/api/admin/invite-codes");
  const [count, setCount] = useState("1");
  const [maxUses, setMaxUses] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/admin/invite-codes", {
        count: Number(count),
        maxUses: Number(maxUses),
        note: note || undefined,
      });
      setNote("");
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: InviteRow) {
    await api.patch(`/api/admin/invite-codes/${row.id}`, { status: "revoked" });
    await refetch();
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/register?code=${code}`;
    void navigator.clipboard.writeText(url);
  }

  const toneOf = (s: string) =>
    s === "active" ? "success" : s === "revoked" ? "danger" : "default";

  const cols: Column<InviteRow>[] = [
    {
      key: "code",
      header: "邀请码",
      render: (r) => <span className="font-mono">{r.code}</span>,
    },
    { key: "uses", header: "使用", render: (r) => `${r.usedCount}/${r.maxUses}` },
    { key: "note", header: "备注", render: (r) => r.note || "—" },
    {
      key: "expiresAt",
      header: "过期",
      render: (r) => (r.expiresAt ? formatDate(r.expiresAt) : "永久"),
    },
    {
      key: "status",
      header: "状态",
      render: (r) => <Badge tone={toneOf(r.status)}>{r.status}</Badge>,
    },
    {
      key: "actions",
      header: "操作",
      render: (r) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => copyLink(r.code)}>
            复制链接
          </Button>
          {r.status === "active" && (
            <Button size="sm" variant="danger-soft" onClick={() => revoke(r)}>
              撤销
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="邀请码" subtitle="仅邀请码注册模式下用于放行新用户" />
      <Panel className="mb-5">
        <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
          <TextField className="w-28">
            <Label>生成数量</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </TextField>
          <TextField className="w-28">
            <Label>每码可用次数</Label>
            <Input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </TextField>
          <TextField className="flex-1">
            <Label>备注（可选）</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </TextField>
          <Button type="submit" variant="primary" isDisabled={busy}>
            批量生成
          </Button>
        </form>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Panel>
      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有邀请码" />
      )}
    </div>
  );
}
