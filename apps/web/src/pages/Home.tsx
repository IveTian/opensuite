import { Avatar, Button } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { Badge, Panel, Table, type Column } from "../components/ui";
import { LogOutIcon, MailIcon, ShieldIcon } from "../components/icons";
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

function initials(value?: string | null): string {
  if (!value) return "?";
  const local = value.split("@")[0] ?? value;
  const parts = local.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Home() {
  const { data: session } = useSession();
  const { data: quota } = useFetch<MyQuota | null>("/api/me/quota");
  const { data: addresses } = useFetch<MyAddress[]>("/api/me/addresses");
  const navigate = useNavigate();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const usedPct =
    quota && quota.storageQuotaBytes
      ? Math.min(100, Math.round((quota.usedBytes / quota.storageQuotaBytes) * 100))
      : 0;

  const cols: Column<MyAddress>[] = [
    { key: "address", header: "邮箱地址" },
    {
      key: "isPrimary",
      header: "主地址",
      render: (r) => (r.isPrimary ? <Badge tone="primary">主</Badge> : "—"),
    },
    {
      key: "usedBytes",
      header: "已用",
      render: (r) => <span className="tabular-nums">{formatBytes(r.usedBytes)}</span>,
    },
    {
      key: "status",
      header: "状态",
      render: (r) => (
        <Badge tone={r.status === "active" ? "success" : "default"}>{r.status}</Badge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-11 shrink-0">
            <Avatar.Fallback>{initials(session?.user.email)}</Avatar.Fallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              你好，{session?.user.name}
            </h1>
            <p className="text-sm text-muted">{session?.user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate("/mail")}>
            <MailIcon className="size-4" />
            进入邮箱
          </Button>
          {role === "admin" && (
            <Button variant="outline" onClick={() => navigate("/admin")}>
              <ShieldIcon className="size-4" />
              管理后台
            </Button>
          )}
          <Button
            variant="ghost"
            isIconOnly
            aria-label="退出登录"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </div>

      <Panel className="mb-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">我的配额</h2>
        {quota ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-4">
                <span className="text-sm text-muted">存储用量</span>
                <span className="tabular-nums text-sm text-foreground">
                  {formatBytes(quota.usedBytes)} / {formatBytes(quota.storageQuotaBytes)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-default-soft">
                <div
                  className={"h-full rounded-full " + (usedPct >= 90 ? "bg-danger" : "bg-accent")}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 rounded-xl bg-surface-secondary px-4 py-2.5">
              <div className="text-xs text-muted">最大邮箱数</div>
              <div className="tabular-nums text-lg font-semibold text-foreground">
                {quota.maxAddresses}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">尚未分配配额</p>
        )}
      </Panel>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">我的邮箱地址</h2>
        <Table columns={cols} rows={addresses ?? []} empty="暂无邮箱地址" />
      </div>
    </div>
  );
}
