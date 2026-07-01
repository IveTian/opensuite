import { Button } from "@heroui/react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert } from "../components/ui";
import { BrandMark } from "../components/BrandMark";
import { PersonAvatar } from "../components/PersonAvatar";
import { CheckIcon, ShieldIcon } from "../components/icons";
import { useFetch } from "../hooks/useFetch";
import { authClient, useSession } from "../lib/auth-client";
import { useBranding } from "../providers/branding";

/** 各 scope 的中文说明（授权页展示给用户看它将获得哪些权限） */
const SCOPE_LABELS: Record<string, string> = {
  openid: "验证你的身份",
  profile: "读取你的基本资料（姓名、头像、语言）",
  email: "读取你的邮箱地址",
  offline_access: "在你离线时保持访问（长期令牌）",
};

/**
 * OIDC 授权同意页（IdP 侧）。
 * 由 authorize 端点在需要同意时重定向到此，URL 带 consent_code / client_id / scope。
 * 用户点「同意」→ 调 /oauth2/consent，服务端返回带授权码的 redirectURI，前端跳回第三方应用。
 */
export function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { siteName } = useBranding();
  const { data: session } = useSession();

  const consentCode = params.get("consent_code") ?? undefined;
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "openid").split(" ").filter(Boolean);

  const { data: client } = useFetch<{ name: string; icon: string | null }>(
    clientId ? `/api/me/oauth-clients/${encodeURIComponent(clientId)}` : null,
  );

  const [busy, setBusy] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState("");

  const appName = client?.name ?? clientId;
  const image = (session?.user as { image?: string | null } | undefined)?.image ?? null;

  async function decide(accept: boolean) {
    setError("");
    setBusy(accept ? "accept" : "deny");
    const { data, error } = await authClient.oauth2.consent({
      accept,
      ...(consentCode ? { consent_code: consentCode } : {}),
    });
    if (error) {
      setBusy(null);
      setError(error.message || "授权失败，请重试");
      return;
    }
    const redirectURI = (data as { redirectURI?: string } | undefined)?.redirectURI;
    if (redirectURI) {
      window.location.href = redirectURI;
      return;
    }
    // 没有回调地址（异常）时回到应用中心
    navigate("/");
  }

  if (!clientId) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <Alert>缺少授权参数，无法继续。</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <BrandMark boxClassName="size-11 rounded-2xl shadow-surface" iconClassName="size-6" />
            <span className="text-muted">→</span>
            {client?.icon ? (
              <img
                src={client.icon}
                alt={appName}
                className="size-11 rounded-2xl object-cover shadow-surface"
              />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-surface">
                <ShieldIcon className="size-5" />
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">授权 {appName}</h1>
            <p className="mt-1 text-sm text-muted">
              使用你的 {siteName} 账号登录 {appName}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-surface p-6 shadow-surface">
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface-secondary p-3">
            <PersonAvatar
              url={image}
              email={session?.user.email}
              seed={session?.user.email}
              className="size-9 shrink-0"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">
                {session?.user.name}
              </span>
              <span className="truncate text-xs text-muted">{session?.user.email}</span>
            </div>
          </div>

          <p className="mb-2 text-sm text-muted">
            <span className="font-medium text-foreground">{appName}</span> 请求以下权限：
          </p>
          <ul className="mb-5 flex flex-col gap-2">
            {scopes.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-foreground">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{SCOPE_LABELS[s] ?? s}</span>
              </li>
            ))}
          </ul>

          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              fullWidth
              isDisabled={busy !== null}
              onClick={() => decide(false)}
            >
              {busy === "deny" ? "处理中…" : "拒绝"}
            </Button>
            <Button
              type="button"
              variant="primary"
              fullWidth
              isDisabled={busy !== null}
              onClick={() => decide(true)}
            >
              {busy === "accept" ? "处理中…" : "同意授权"}
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          授权后 {appName} 将能按上述范围访问你的账号信息，你可随时在管理员处撤销。
        </p>
      </div>
    </div>
  );
}
