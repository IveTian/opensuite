import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { formatBytes, gibToBytes } from "../../lib/format";

interface PlanRow {
  id: string;
  name: string;
  storageQuotaBytes: number;
  maxAddresses: number;
  dailySendQuota: number | null;
  isDefault: boolean;
}

export function Plans() {
  const { data, loading, refetch } = useFetch<PlanRow[]>("/api/admin/plans");
  const [name, setName] = useState("");
  const [gib, setGib] = useState("1");
  const [maxAddresses, setMaxAddresses] = useState("1");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/admin/plans", {
        name,
        storageQuotaBytes: gibToBytes(Number(gib)),
        maxAddresses: Number(maxAddresses),
        isDefault,
      });
      setName("");
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: PlanRow) {
    if (!confirm(`删除套餐 ${row.name}？`)) return;
    await api.del(`/api/admin/plans/${row.id}`);
    await refetch();
  }

  const cols: Column<PlanRow>[] = [
    { key: "name", header: "套餐名" },
    {
      key: "storageQuotaBytes",
      header: "存储配额",
      render: (r) => formatBytes(r.storageQuotaBytes),
    },
    { key: "maxAddresses", header: "最大邮箱数" },
    {
      key: "isDefault",
      header: "默认",
      render: (r) => (r.isDefault ? <Badge tone="primary">默认</Badge> : "—"),
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
      <PageHeader title="配额套餐" subtitle="预设存储与邮箱数，便于批量分配" />
      <Panel className="mb-5">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <TextField className="w-40">
            <Label>套餐名</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </TextField>
          <TextField className="w-32">
            <Label>存储 (GiB)</Label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={gib}
              onChange={(e) => setGib(e.target.value)}
              required
            />
          </TextField>
          <TextField className="w-32">
            <Label>最大邮箱数</Label>
            <Input
              type="number"
              min={1}
              value={maxAddresses}
              onChange={(e) => setMaxAddresses(e.target.value)}
              required
            />
          </TextField>
          <div className="flex items-center gap-2 pb-2">
            <Switch isSelected={isDefault} onChange={setIsDefault}>
              设为默认
            </Switch>
          </div>
          <Button type="submit" variant="primary" isDisabled={busy}>
            新建套餐
          </Button>
        </form>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Panel>
      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有套餐" />
      )}
    </div>
  );
}
