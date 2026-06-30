/**
 * 通过 DNS-over-HTTPS（Cloudflare 1.1.1.1）查询并校验域名的邮件相关记录。
 * Worker 内可直接 fetch，无需额外凭据。
 */

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

async function doh(name: string, type: string): Promise<DohAnswer[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) return [];
  const j = (await res.json()) as { Answer?: DohAnswer[] };
  return j.Answer ?? [];
}

/** 去掉 TXT 记录的引号并合并分片 */
function cleanTxt(data: string): string {
  return data.replace(/^"|"$/g, "").replace(/"\s+"/g, "");
}

export interface DnsCheck {
  mx: { ok: boolean; records: string[] };
  spf: { ok: boolean; record: string | null; cloudflare: boolean };
  dmarc: { ok: boolean; record: string | null };
  dkim: { ok: boolean; record: string | null };
}

export async function checkDomainDns(domain: string): Promise<DnsCheck> {
  const [mxA, txtA, dmarcA, dkimA] = await Promise.all([
    doh(domain, "MX"),
    doh(domain, "TXT"),
    doh(`_dmarc.${domain}`, "TXT"),
    doh(`cf2024-1._domainkey.${domain}`, "TXT"), // Cloudflare 默认 DKIM 选择器
  ]);

  const mxRecords = mxA.map((a) => a.data);
  const txts = txtA.map((a) => cleanTxt(a.data));
  const spf = txts.find((t) => t.toLowerCase().startsWith("v=spf1")) ?? null;
  const dmarc =
    dmarcA.map((a) => cleanTxt(a.data)).find((t) => t.toLowerCase().startsWith("v=dmarc1")) ??
    null;
  const dkim = dkimA.length ? dkimA.map((a) => cleanTxt(a.data)).join("") : null;

  return {
    mx: { ok: mxRecords.length > 0, records: mxRecords },
    spf: {
      ok: !!spf,
      record: spf,
      cloudflare: !!spf && /_spf\.mx\.cloudflare\.net/i.test(spf),
    },
    dmarc: { ok: !!dmarc, record: dmarc },
    dkim: { ok: !!dkim, record: dkim },
  };
}

/** Cloudflare Email Routing/Sending 应配置的记录（用于 UI 提示） */
export function expectedRecords(domain: string) {
  return {
    mx: [
      { name: domain, type: "MX", priority: 13, value: "route1.mx.cloudflare.net" },
      { name: domain, type: "MX", priority: 86, value: "route2.mx.cloudflare.net" },
      { name: domain, type: "MX", priority: 24, value: "route3.mx.cloudflare.net" },
    ],
    spf: { name: domain, type: "TXT", value: "v=spf1 include:_spf.mx.cloudflare.net ~all" },
    dmarc: { name: `_dmarc.${domain}`, type: "TXT", value: "v=DMARC1; p=none; rua=mailto:dmarc@" + domain },
  };
}
