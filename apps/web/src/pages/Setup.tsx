import { Button, Input, Label, TextField } from "@heroui/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Alert, Badge, Panel } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { api, ApiError } from "../lib/api";
import { useBranding } from "../providers/branding";
import { DomainDetail, type DomainRow } from "./admin/DomainDetail";

export function Setup() {
  const { siteName } = useBranding();
  const navigate = useNavigate();
  const { data: domains, loading, refetch } = useFetch<DomainRow[]>("/api/admin/domains");
  const [domainName, setDomainName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => {
    if (!domains?.length) return null;
    return domains.find((d) => d.id === selectedId) ?? domains[0]!;
  }, [domains, selectedId]);

  useEffect(() => {
    if (!selectedId && domains?.[0]) setSelectedId(domains[0].id);
  }, [domains, selectedId]);

  async function createDomain(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const row = await api.post<DomainRow>("/api/admin/domains", { name: domainName });
      setDomainName("");
      setSelectedId(row.id);
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加域名失败");
    } finally {
      setBusy(false);
    }
  }

  const hasDomain = Boolean(domains?.length);
  const domainReady = Boolean(selected?.mxVerified && selected.spfVerified);

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark boxClassName="size-10 rounded-xl" iconClassName="size-5" />
            <div>
              <p className="text-sm font-semibold text-foreground">{siteName}</p>
              <p className="text-xs text-muted">首次配置</p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => navigate("/admin")}>
            进入管理后台
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">配置收信域名</h1>
          <p className="mt-1 text-sm text-muted">
            添加组织域名，按提示配置 DNS，验证通过后再邀请用户。
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <Panel>
              <div className="mb-3 flex items-center gap-2">
                <Badge tone={hasDomain ? "success" : "primary"}>1</Badge>
                <h2 className="font-semibold text-foreground">添加域名</h2>
              </div>
              <form onSubmit={createDomain} className="flex flex-col gap-3">
                <TextField>
                  <Label>收信域名</Label>
                  <Input
                    placeholder="example.com"
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value)}
                    required
                  />
                </TextField>
                <Button type="submit" variant="primary" isDisabled={busy}>
                  {busy ? "添加中…" : "添加域名"}
                </Button>
              </form>
              {error && <div className="mt-3"><Alert>{error}</Alert></div>}
            </Panel>

            <Panel>
              <div className="mb-3 flex items-center gap-2">
                <Badge tone={domainReady ? "success" : hasDomain ? "primary" : "default"}>2</Badge>
                <h2 className="font-semibold text-foreground">验证收信能力</h2>
              </div>
              <p className="text-sm text-muted">
                MX 和 SPF 通过后，该域名会标记为 active。DKIM/DMARC 状态也会在验证区域展示。
              </p>
            </Panel>

            <Panel>
              <div className="mb-3 flex items-center gap-2">
                <Badge tone={domainReady ? "primary" : "default"}>3</Badge>
                <h2 className="font-semibold text-foreground">邀请用户</h2>
              </div>
              <p className="mb-3 text-sm text-muted">
                在用户管理中录入外部邮箱、内部邮箱地址和初始密码，可从 notice@域名 发送登录信息。
              </p>
              <Button
                variant="primary"
                isDisabled={!hasDomain}
                onClick={() => navigate("/admin/users")}
              >
                去邀请用户
              </Button>
            </Panel>
          </div>

          <div>
            {loading ? (
              <Panel>
                <p className="text-sm text-muted">加载域名配置…</p>
              </Panel>
            ) : selected ? (
              <>
                {domains && domains.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {domains.map((d) => (
                      <Button
                        key={d.id}
                        size="sm"
                        variant={d.id === selected.id ? "primary" : "ghost"}
                        onClick={() => setSelectedId(d.id)}
                      >
                        {d.name}
                      </Button>
                    ))}
                  </div>
                )}
                <DomainDetail domain={selected} onChanged={refetch} />
              </>
            ) : (
              <Panel>
                <p className="text-sm text-muted">先添加当前要收信的域名。</p>
              </Panel>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
