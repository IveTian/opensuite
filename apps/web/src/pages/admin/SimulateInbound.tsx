import { Button } from "@heroui/react";
import { useState } from "react";
import { Select } from "../../components/Select";
import { Alert, PageHeader, Panel } from "../../components/ui";
import { RefreshIcon } from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";

interface AddressRow {
  id: string;
  address: string;
  type: string;
  status: string;
  ownerEmail: string | null;
}

function buildTestMime(to: string): string {
  return [
    "From: 测试人 <tester@example.net>",
    `To: ${to}`,
    `Subject: 测试入站邮件 ${new Date().toLocaleTimeString("zh-CN")}`,
    `Message-ID: <${Math.random().toString(36).slice(2)}@example.net>`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "这是一封用于本地测试的入站邮件，验证收件存储链路。",
  ].join("\r\n");
}

export function SimulateInbound() {
  const { data: addresses, loading } = useFetch<AddressRow[]>("/api/admin/addresses");
  const receivable = (addresses ?? []).filter(
    (a) => a.status === "active" && (a.type === "mailbox" || a.type === "shared"),
  );
  const [addressId, setAddressId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = receivable.find((a) => a.id === addressId) ?? receivable[0];

  async function simulate() {
    const addr = selected;
    if (!addr) return;
    setBusy(true);
    setResult(null);
    try {
      const raw = buildTestMime(addr.address);
      const out = await api.post<{ stored?: boolean; messageId?: string; reason?: string }>(
        "/api/admin/tools/simulate-inbound",
        { addressId: addr.id, raw },
      );
      setResult({
        ok: Boolean(out.stored),
        text: out.stored
          ? `已写入收件箱（messageId: ${out.messageId ?? "—"}）`
          : (out.reason ?? "投递失败"),
      });
    } catch (e) {
      setResult({
        ok: false,
        text: e instanceof ApiError ? e.message : "模拟失败",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="模拟收信"
        subtitle="在未配置 DNS / MX 时本地验证入站邮件存储链路（管理员专用）"
      />

      <Panel className="max-w-xl">
        {loading ? (
          <p className="text-sm text-muted">加载地址列表…</p>
        ) : !receivable.length ? (
          <p className="text-sm text-muted">暂无可收信的邮箱地址</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Select
              ariaLabel="目标邮箱"
              value={addressId || receivable[0]!.id}
              onChange={setAddressId}
              options={receivable.map((a) => ({
                value: a.id,
                label: a.ownerEmail ? `${a.address}（${a.ownerEmail}）` : a.address,
              }))}
            />
            <p className="text-xs text-muted">
              将向所选地址注入一封测试 MIME 邮件，走与真实入站相同的解析与落库流程。
            </p>
            <Button variant="primary" isDisabled={busy} onClick={simulate}>
              <RefreshIcon className="size-4" />
              {busy ? "模拟中…" : "发送测试邮件"}
            </Button>
          </div>
        )}

        {result && (
          <div className="mt-4">
            <Alert kind={result.ok ? "success" : "danger"}>{result.text}</Alert>
          </div>
        )}
      </Panel>
    </div>
  );
}
