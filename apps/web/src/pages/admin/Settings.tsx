import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { Suspense, lazy, useEffect, useState, type FormEvent } from "react";
import type { RegistrationMode } from "@mailflare/shared";
import { Select } from "../../components/Select";
import { MailIcon } from "../../components/icons";
import { Alert, PageHeader, Panel } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { bytesToGib, gibToBytes } from "../../lib/format";

const RichTextEditor = lazy(() => import("../../components/RichTextEditor"));

interface Settings {
  registrationMode: RegistrationMode;
  requireAdminApproval: boolean;
  defaultStorageQuotaBytes: number;
  defaultMaxAddresses: number;
  defaultPlanId: string | null;
  signupDefaultDomainId: string | null;
  orgSignatureHtml: string | null;
  siteName: string | null;
  logoUrl: string | null;
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
  const [orgSig, setOrgSig] = useState("");
  const [siteName, setSiteName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
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
    setOrgSig(settings.orgSignatureHtml ?? "");
    setSiteName(settings.siteName ?? "");
    setLogoUrl(settings.logoUrl ?? "");
  }, [settings]);

  function onLogoFile(file?: File) {
    if (!file) return;
    if (file.size > 200 * 1024) {
      setMsg({ kind: "danger", text: "图片过大，请使用 ≤ 200KB 的图片" });
      return;
    }
    const r = new FileReader();
    r.onload = () => setLogoUrl(typeof r.result === "string" ? r.result : "");
    r.readAsDataURL(file);
  }

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
        orgSignatureHtml: orgSig || null,
        siteName: siteName.trim() || null,
        logoUrl: logoUrl.trim() || null,
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
      <PageHeader title="系统设置" subtitle="站点品牌、注册策略与默认配额" />
      <Panel>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 border-b border-separator pb-4">
            <h2 className="text-sm font-semibold text-foreground">站点品牌</h2>
            <TextField>
              <Label>站点名称</Label>
              <Input
                value={siteName}
                placeholder="MailFlare"
                onChange={(e) => setSiteName(e.target.value)}
              />
            </TextField>
            <div className="flex flex-col gap-1.5">
              <Label>站点 Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo 预览"
                    className="size-10 shrink-0 rounded-lg bg-surface-secondary object-contain"
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <MailIcon className="size-5" />
                  </div>
                )}
                <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary">
                  上传图片
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onLogoFile(e.target.files?.[0])}
                  />
                </label>
                {logoUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLogoUrl("")}>
                    移除
                  </Button>
                )}
              </div>
              <Input
                value={logoUrl.startsWith("data:") ? "" : logoUrl}
                placeholder="或填入图片 URL（https://…）"
                onChange={(e) => setLogoUrl(e.target.value)}
              />
              <p className="text-xs text-muted">
                建议 ≤ 200KB 的方形 PNG / SVG；留空则使用内置图标与名称。
              </p>
            </div>
          </div>

          <Select
            label="注册模式"
            value={mode}
            onChange={(v) => setMode(v as RegistrationMode)}
            options={[
              { value: "open", label: "开放注册（任何人可注册）" },
              { value: "invite_only", label: "仅邀请码" },
              { value: "closed", label: "关闭注册" },
            ]}
          />

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

          <Select
            label="默认套餐（可选，优先于上面的默认值）"
            value={planId}
            onChange={setPlanId}
            options={[
              { value: "", label: "（不使用套餐）" },
              ...(plans ?? []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />

          <Select
            label="公开注册默认域名"
            value={domainId}
            onChange={setDomainId}
            options={[
              { value: "", label: "（未设置）" },
              ...(domains ?? []).map((d) => ({ value: d.id, label: d.name })),
            ]}
          />

          <div className="flex flex-col gap-1.5">
            <Label>组织签名（自动附加到每位用户的发信正文）</Label>
            <p className="text-xs text-muted">
              附加在用户个人签名之后，可用于统一的公司落款或免责声明。
            </p>
            <Suspense
              fallback={<div className="min-h-40 animate-pulse rounded-xl bg-surface-secondary" />}
            >
              <RichTextEditor
                className="min-h-40"
                value={orgSig}
                placeholder="输入组织统一签名…"
                onChange={(h) => setOrgSig(h)}
              />
            </Suspense>
          </div>

          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <Button type="submit" variant="primary" isDisabled={busy}>
            保存设置
          </Button>
        </form>
      </Panel>
    </div>
  );
}
