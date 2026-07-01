import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { formatDate } from "../../lib/format";

interface OAuthApp {
  id: string;
  clientId: string;
  name: string;
  icon: string | null;
  type: string;
  disabled: boolean;
  redirectUrls: string[];
  launchUrl: string | null;
  showInLauncher: boolean;
  createdAt: string;
}

interface CreatedCredentials {
  clientId: string;
  clientSecret: string | null;
  name: string;
}

const fieldCls =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus/50";

export function OAuthApps() {
  const { data, loading, refetch } = useFetch<OAuthApp[]>("/api/admin/oauth-apps");
  const [name, setName] = useState("");
  const [redirects, setRedirects] = useState("");
  const [icon, setIcon] = useState("");
  const [showInLauncher, setShowInLauncher] = useState(false);
  const [launchUrl, setLaunchUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    const redirectUrls = redirects
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (redirectUrls.length === 0) {
      setError("至少填写一个回调地址");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<CreatedCredentials>("/api/admin/oauth-apps", {
        name,
        redirectUrls,
        icon: icon || undefined,
        showInLauncher,
        launchUrl: showInLauncher && launchUrl ? launchUrl : undefined,
      });
      setCreated(res);
      setName("");
      setRedirects("");
      setIcon("");
      setLaunchUrl("");
      setShowInLauncher(false);
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDisabled(app: OAuthApp) {
    await api.patch(`/api/admin/oauth-apps/${app.id}`, { disabled: !app.disabled });
    await refetch();
  }

  async function remove(app: OAuthApp) {
    if (!window.confirm(`删除应用「${app.name}」？其令牌与授权记录会一并清除。`)) return;
    await api.del(`/api/admin/oauth-apps/${app.id}`);
    await refetch();
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  const cols: Column<OAuthApp>[] = [
    {
      key: "name",
      header: "应用",
      render: (r) => (
        <div className="flex items-center gap-2">
          {r.icon ? (
            <img src={r.icon} alt="" className="size-6 rounded-md object-cover" />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-md bg-surface-secondary text-xs text-muted">
              {r.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="font-medium text-foreground">{r.name}</span>
        </div>
      ),
    },
    {
      key: "clientId",
      header: "Client ID",
      render: (r) => (
        <button
          className="font-mono text-xs text-accent hover:underline"
          onClick={() => copy(r.clientId)}
          title="点击复制"
        >
          {r.clientId.slice(0, 12)}…
        </button>
      ),
    },
    {
      key: "redirectUrls",
      header: "回调地址",
      render: (r) => (
        <div className="flex flex-col gap-0.5 text-xs text-muted">
          {r.redirectUrls.map((u) => (
            <span key={u} className="truncate" title={u}>
              {u}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "launcher",
      header: "应用中心",
      render: (r) =>
        r.showInLauncher && r.launchUrl ? (
          <Badge tone="primary">已展示</Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "status",
      header: "状态",
      render: (r) => (
        <Badge tone={r.disabled ? "danger" : "success"}>{r.disabled ? "已停用" : "启用中"}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "创建",
      render: (r) => formatDate(r.createdAt),
    },
    {
      key: "actions",
      header: "操作",
      render: (r) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => toggleDisabled(r)}>
            {r.disabled ? "启用" : "停用"}
          </Button>
          <Button size="sm" variant="danger-soft" onClick={() => remove(r)}>
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="应用授权（OIDC）"
        subtitle="注册第三方应用，允许它们「用本站账号登录」，并可挂到应用中心一键直达"
      />

      {created && (
        <Panel className="mb-5">
          <Alert kind="success">
            应用「{created.name}」已创建。请立即保存 Client Secret —— 它只显示这一次，之后无法再查看。
          </Alert>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-muted">Client ID</span>
              <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-secondary px-2 py-1 font-mono text-xs">
                {created.clientId}
              </code>
              <Button size="sm" variant="ghost" onClick={() => copy(created.clientId)}>
                复制
              </Button>
            </div>
            {created.clientSecret && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-muted">Client Secret</span>
                <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-secondary px-2 py-1 font-mono text-xs">
                  {created.clientSecret}
                </code>
                <Button size="sm" variant="ghost" onClick={() => copy(created.clientSecret!)}>
                  复制
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              我已保存，关闭
            </Button>
          </div>
        </Panel>
      )}

      <Panel className="mb-5">
        <form onSubmit={create} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField>
              <Label>应用名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </TextField>
            <TextField>
              <Label>图标 URL（可选）</Label>
              <Input
                type="url"
                placeholder="https://example.com/logo.png"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
              />
            </TextField>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>回调地址（每行一个，需完整 URL）</Label>
            <textarea
              value={redirects}
              onChange={(e) => setRedirects(e.target.value)}
              rows={3}
              placeholder={"https://app.example.com/callback\nhttps://app.example.com/oauth/callback"}
              className={fieldCls}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showInLauncher}
                onChange={(e) => setShowInLauncher(e.target.checked)}
                className="size-4 accent-sky-600"
              />
              在应用中心展示磁贴
            </label>
            {showInLauncher && (
              <TextField className="min-w-64 flex-1">
                <Label>启动地址（点击磁贴跳转，通常是应用登录页）</Label>
                <Input
                  type="url"
                  placeholder="https://app.example.com/login"
                  value={launchUrl}
                  onChange={(e) => setLaunchUrl(e.target.value)}
                />
              </TextField>
            )}
          </div>
          {error && <Alert>{error}</Alert>}
          <div>
            <Button type="submit" variant="primary" isDisabled={busy}>
              {busy ? "创建中…" : "注册应用"}
            </Button>
          </div>
        </form>
      </Panel>

      {loading ? (
        <p className="text-muted">加载中…</p>
      ) : (
        <Table columns={cols} rows={data ?? []} empty="还没有注册任何应用" />
      )}
    </div>
  );
}
