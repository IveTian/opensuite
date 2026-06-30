import { Button } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { Badge, Panel, Table, type Column } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { formatBytes } from "../lib/format";
import { signOut, useSession } from "../lib/auth-client";

interface MyAddress {
  id: string;
  address: string;
  type: string;
  status: string;
  isPrimary: boolean;
  usedBytes: number;
  domain: string;
}
interface MyQuota {
  storageQuotaBytes: number;
  usedBytes: number;
  maxAddresses: number;
}

export function Home() {
  const { data: session } = useSession();
  const { data: quota } = useFetch<MyQuota | null>("/api/me/quota");
  const { data: addresses } = useFetch<MyAddress[]>("/api/me/addresses");
  const navigate = useNavigate();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const cols: Column<MyAddress>[] = [
    { key: "address", header: "邮箱地址" },
    {
      key: "isPrimary",
      header: "主地址",
      render: (r) => (r.isPrimary ? <Badge tone="primary">主</Badge> : "—"),
    },
    { key: "usedBytes", header: "已用", render: (r) => formatBytes(r.usedBytes) },
    {
      key: "status",
      header: "状态",
      render: (r) => (
        <Badge tone={r.status === "active" ? "success" : "default"}>{r.status}</Badge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">你好，{session?.user.name}</h1>
          <p className="text-sm text-foreground-500">{session?.user.email}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => navigate("/mail")}>
            进入邮箱
          </Button>
          {role === "admin" && (
            <Button variant="ghost" onClick={() => navigate("/admin")}>
              管理后台
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            退出
          </Button>
        </div>
      </div>

      <Panel className="mb-5">
        <h2 className="mb-3 font-semibold">我的配额</h2>
        {quota ? (
          <div className="flex gap-8 text-sm">
            <div>
              <div className="text-foreground-500">存储</div>
              <div className="text-lg font-medium">
                {formatBytes(quota.usedBytes)} / {formatBytes(quota.storageQuotaBytes)}
              </div>
            </div>
            <div>
              <div className="text-foreground-500">最大邮箱数</div>
              <div className="text-lg font-medium">{quota.maxAddresses}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground-400">尚未分配配额</p>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-3 font-semibold">我的邮箱地址</h2>
        <Table columns={cols} rows={addresses ?? []} empty="暂无邮箱地址" />
      </Panel>
    </div>
  );
}
