import { Button, Switch } from "@heroui/react";
import { useState } from "react";
import { Select } from "../../components/Select";
import { Badge, Panel } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api } from "../../lib/api";

export interface DomainRow {
  id: string;
  name: string;
  status: string;
  isCatchAllEnabled: boolean;
  catchAllAddressId: string | null;
  mxVerified: boolean;
  spfVerified: boolean;
  dkimVerified: boolean;
  addressCount: number;
  createdAt: string;
}
interface DnsResult {
  expected: {
    mx: { name: string; priority: number; value: string }[];
    spf: { name: string; value: string };
    dmarc: { name: string; value: string };
  };
  check: {
    mx: { ok: boolean; records: string[] };
    spf: { ok: boolean; record: string | null; cloudflare: boolean };
    dmarc: { ok: boolean; record: string | null };
    dkim: { ok: boolean; record: string | null };
  };
}
interface AddrRow {
  id: string;
  address: string;
  type: string;
}

function OkBadge({ ok }: { ok: boolean }) {
  return <Badge tone={ok ? "success" : "warning"}>{ok ? "已检测到" : "缺失"}</Badge>;
}

export function DomainDetail({ domain, onChanged }: { domain: DomainRow; onChanged: () => void }) {
  const { data: dns, loading, refetch } = useFetch<DnsResult>(
    `/api/admin/domains/${domain.id}/dns`,
  );
  const { data: addrs } = useFetch<AddrRow[]>(`/api/admin/addresses?domainId=${domain.id}`);
  const [verifying, setVerifying] = useState(false);
  const [caEnabled, setCaEnabled] = useState(domain.isCatchAllEnabled);
  const [caAddr, setCaAddr] = useState(domain.catchAllAddressId ?? "");
  const [savingCa, setSavingCa] = useState(false);

  const mailboxes = (addrs ?? []).filter((a) => a.type === "mailbox");

  async function verify() {
    setVerifying(true);
    try {
      await api.post(`/api/admin/domains/${domain.id}/verify`);
      await refetch();
      onChanged();
    } finally {
      setVerifying(false);
    }
  }

  async function saveCatchAll() {
    setSavingCa(true);
    try {
      await api.patch(`/api/admin/domains/${domain.id}`, {
        isCatchAllEnabled: caEnabled,
        catchAllAddressId: caEnabled ? caAddr || null : null,
      });
      onChanged();
    } finally {
      setSavingCa(false);
    }
  }

  return (
    <Panel className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">DNS 与投递设置 · {domain.name}</h3>
        <Button size="sm" variant="primary" onClick={verify} isDisabled={verifying}>
          {verifying ? "校验中…" : "校验 DNS"}
        </Button>
      </div>

      {loading || !dns ? (
        <p className="text-sm text-muted">查询 DNS 中…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center gap-2 font-medium">
              MX <OkBadge ok={dns.check.mx.ok} />
            </div>
            <div className="text-muted">应添加（任选其一组）：</div>
            {dns.expected.mx.map((r, i) => (
              <code key={i} className="block text-xs text-muted">
                {r.name} MX {r.priority} {r.value}
              </code>
            ))}
            {!!dns.check.mx.records.length && (
              <div className="mt-1 text-xs text-muted">
                当前：{dns.check.mx.records.join("; ")}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center gap-2 font-medium">
              SPF <OkBadge ok={dns.check.spf.ok} />
              {dns.check.spf.ok && !dns.check.spf.cloudflare && (
                <Badge tone="warning">未包含 Cloudflare</Badge>
              )}
            </div>
            <code className="block text-xs text-muted">
              {dns.expected.spf.name} TXT &quot;{dns.expected.spf.value}&quot;
            </code>
            {dns.check.spf.record && (
              <div className="mt-1 text-xs text-muted">当前：{dns.check.spf.record}</div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center gap-2 font-medium">
              DMARC <OkBadge ok={dns.check.dmarc.ok} />
            </div>
            <code className="block text-xs text-muted">
              {dns.expected.dmarc.name} TXT &quot;{dns.expected.dmarc.value}&quot;
            </code>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 font-medium">
              DKIM <OkBadge ok={dns.check.dkim.ok} />
              <span className="text-xs font-normal text-muted">
                （Cloudflare onboarding 后自动配置 cf2024-1 选择器）
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Catch-all */}
      <div className="mt-4 rounded-lg border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">Catch-all（接收该域下所有未匹配地址）</span>
          <Switch isSelected={caEnabled} onChange={setCaEnabled} />
        </div>
        {caEnabled && (
          <Select
            label="投递到邮箱"
            value={caAddr}
            onChange={setCaAddr}
            placeholder="选择一个 mailbox"
            options={mailboxes.map((a) => ({ value: a.id, label: a.address }))}
          />
        )}
        <Button size="sm" variant="ghost" className="mt-2" onClick={saveCatchAll} isDisabled={savingCa}>
          保存 Catch-all
        </Button>
      </div>
    </Panel>
  );
}
