import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { DomainDetail, type DomainRow } from "./DomainDetail";

export function Domains() {
  const { data, loading, refetch } = useFetch<DomainRow[]>("/api/admin/domains");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<DomainRow | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/admin/domains", { name });
      setName("");
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: DomainRow) {
    await api.patch(`/api/admin/domains/${row.id}`, {
      status: row.status === "active" ? "disabled" : "active",
    });
    await refetch();
  }

  async function remove(row: DomainRow) {
    if (!confirm(`确认删除域名 ${row.name}？其下邮箱地址将一并删除。`)) return;
    await api.del(`/api/admin/domains/${row.id}`);
    await refetch();
  }

  const cols: Column<DomainRow>[] = [
    { key: "name", header: "域名" },
    {
      key: "status",
      header: "状态",
      render: (r) => (
        <Badge tone={r.status === "active" ? "success" : "default"}>{r.status}</Badge>
      ),
    },
    { key: "addressCount", header: "地址数" },
    { key: "createdAt", header: "创建时间", render: (r) => formatDate(r.createdAt) },
    {
      key: "actions",
      header: "操作",
      render: (r) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
            DNS/Catch-all
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
            {r.status === "active" ? "停用" : "启用"}
          </Button>
          <Button size="sm" variant="danger-soft" onClick={() => remove(r)}>
            删除
          </Button>
        </div>
      ),
    },
  ];

  const selectedFresh = selected ? (data?.find((d) => d.id === selected.id) ?? selected) : null;

  return (
    <div>
      <PageHeader title="域名管理" subtitle="托管用于收发邮件的域名" />
      <Panel className="mb-5">
        <form onSubmit={create} className="flex items-end gap-3">
          <TextField className="flex-1">
            <Label>新增域名</Label>
            <Input
              placeholder="example.com"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </TextField>
          <Button type="submit" variant="primary" isDisabled={busy}>
            添加
          </Button>
        </form>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Panel>
      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有域名" />
      )}
      {selectedFresh && (
        <DomainDetail key={selectedFresh.id} domain={selectedFresh} onChanged={refetch} />
      )}
    </div>
  );
}
