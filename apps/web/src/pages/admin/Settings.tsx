import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { useEffect, useState, type FormEvent } from "react";
import type { RegistrationMode } from "@mailflare/shared";
import { NativeSelect } from "../../components/NativeSelect";
import { Alert, PageHeader, Panel } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { bytesToGib, gibToBytes } from "../../lib/format";

interface Settings {
  registrationMode: RegistrationMode;
  requireAdminApproval: boolean;
  defaultStorageQuotaBytes: number;
  defaultMaxAddresses: number;
  defaultPlanId: string | null;
  signupDefaultDomainId: string | null;
}
interface DomainRow {
  id: string;
  name: string;
}
interface PlanRow {
  id: string;
  name: string;
}

export function Settings() {
  const { data: settings } = useFetch<Settings | null>("/api/admin/settings");
  const { data: domains } = useFetch<DomainRow[]>("/api/admin/domains");
  const { data: plans } = useFetch<PlanRow[]>("/api/admin/plans");

  const [mode, setMode] = useState<RegistrationMode>("invite_only");
  const [approval, setApproval] = useState(false);
  const [gib, setGib] = useState("1");
  const [maxAddr, setMaxAddr] = useState("1");
  const [planId, setPlanId] = useState("");
  const [domainId, setDomainId] = useState("");
  const [msg, setMsg] = useState<{ kind: "danger" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setMode(settings.registrationMode);
    setApproval(settings.requireAdminApproval);
    setGib(String(bytesToGib(settings.defaultStorageQuotaBytes)));
    setMaxAddr(String(settings.defaultMaxAddresses));
    setPlanId(settings.defaultPlanId ?? "");
    setDomainId(settings.signupDefaultDomainId ?? "");
  }, [settings]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await api.put("/api/admin/settings", {
        registrationMode: mode,
        requireAdminApproval: approval,
        defaultStorageQuotaBytes: gibToBytes(Number(gib)),
        defaultMaxAddresses: Number(maxAddr),
        defaultPlanId: planId || null,
        signupDefaultDomainId: domainId || null,
      });
      setMsg({ kind: "success", text: "已保存" });
    } catch (err) {
      setMsg({ kind: "danger", text: err instanceof ApiError ? err.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="注册策略" subtitle="控制是否开放注册、邀请码与默认配额" />
      <Panel>
        <form onSubmit={save} className="flex flex-col gap-4">
          <NativeSelect
            label="注册模式"
            value={mode}
            onChange={(e) => setMode(e.target.value as RegistrationMode)}
          >
            <option value="open">开放注册（任何人可注册）</option>
            <option value="invite_only">仅邀请码</option>
            <option value="closed">关闭注册</option>
          </NativeSelect>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="text-sm">注册后需管理员审核</span>
            <Switch isSelected={approval} onChange={setApproval} />
          </div>

          <div className="flex gap-3">
            <TextField className="flex-1">
              <Label>默认存储 (GiB)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={gib}
                onChange={(e) => setGib(e.target.value)}
              />
            </TextField>
            <TextField className="flex-1">
              <Label>默认最大邮箱数</Label>
              <Input
                type="number"
                min={1}
                value={maxAddr}
                onChange={(e) => setMaxAddr(e.target.value)}
              />
            </TextField>
          </div>

          <NativeSelect
            label="默认套餐（可选，优先于上面的默认值）"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="">（不使用套餐）</option>
            {(plans ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            label="公开注册默认域名"
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
          >
            <option value="">（未设置）</option>
            {(domains ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>

          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <Button type="submit" variant="primary" isDisabled={busy}>
            保存设置
          </Button>
        </form>
      </Panel>
    </div>
  );
}
