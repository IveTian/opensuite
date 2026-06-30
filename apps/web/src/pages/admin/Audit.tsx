import { Button } from "@heroui/react";
import { useState } from "react";
import { PageHeader, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { formatDate } from "../../lib/format";

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorEmail: string | null;
}
const LIMIT = 50;

export function Audit() {
  const [page, setPage] = useState(0);
  const { data, loading } = useFetch<{ items: AuditRow[]; total: number }>(
    `/api/admin/audit?limit=${LIMIT}&offset=${page * LIMIT}`,
  );
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const cols: Column<AuditRow>[] = [
    { key: "createdAt", header: "时间", render: (r) => formatDate(r.createdAt) },
    { key: "actorEmail", header: "操作者", render: (r) => r.actorEmail || "系统" },
    { key: "action", header: "动作" },
    {
      key: "target",
      header: "对象",
      render: (r) => (r.targetType ? `${r.targetType}:${(r.targetId ?? "").slice(0, 8)}` : "—"),
    },
    {
      key: "metadata",
      header: "详情",
      render: (r) => (
        <code className="text-xs text-muted">
          {r.metadata ? JSON.stringify(r.metadata) : "—"}
        </code>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="审计日志" subtitle="后台关键操作记录" />
      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <>
          <Table columns={cols} rows={items} empty="暂无记录" />
          {total > LIMIT && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <Button size="sm" variant="ghost" isDisabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="text-muted">
                {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} / {total}
              </span>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={(page + 1) * LIMIT >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
