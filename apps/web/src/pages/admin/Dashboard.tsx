import type { AdminStats } from "@mailflare/shared";
import { Panel, PageHeader, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { formatBytes } from "../../lib/format";

interface UsageRow {
  id: string;
  name: string;
  status: string;
  addressCount: number;
  usedBytes: number;
  messageCount: number;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Panel>
      <div className="text-sm text-foreground-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </Panel>
  );
}

export function Dashboard() {
  const { data: stats, loading, error } = useFetch<AdminStats>("/api/admin/stats");
  const { data: usage } = useFetch<UsageRow[]>("/api/admin/stats/usage");

  const usageCols: Column<UsageRow>[] = [
    { key: "name", header: "域名" },
    { key: "status", header: "状态" },
    { key: "addressCount", header: "地址数" },
    { key: "messageCount", header: "邮件数" },
    { key: "usedBytes", header: "已用容量", render: (r) => formatBytes(r.usedBytes) },
  ];

  return (
    <div>
      <PageHeader title="仪表盘" subtitle="系统概览" />
      {error && <p className="text-danger">{error}</p>}
      {loading || !stats ? (
        <p className="text-foreground-500">加载中…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat label="用户数" value={stats.userCount} />
          <Stat label="域名数" value={stats.domainCount} />
          <Stat label="邮箱地址数" value={stats.addressCount} />
          <Stat label="待审核用户" value={stats.pendingApprovalCount} />
          <Stat label="总配额" value={formatBytes(stats.totalStorageQuotaBytes)} />
          <Stat label="已用容量" value={formatBytes(stats.totalUsedBytes)} />
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">按域名用量</h2>
      <Table columns={usageCols} rows={usage ?? []} empty="暂无域名" />
    </div>
  );
}
