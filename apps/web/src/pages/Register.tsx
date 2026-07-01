import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RegistrationConfig } from "@mailflare/shared";
import { Alert } from "../components/ui";
import { BrandMark } from "../components/BrandMark";
import { useBranding } from "../providers/branding";
import { useFetch } from "../hooks/useFetch";
import { api, ApiError } from "../lib/api";

export function Register() {
  const { siteName } = useBranding();
  const { data: config, loading } = useFetch<RegistrationConfig>(
    "/api/public/registration-config",
  );
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // bootstrap（系统零用户）：尚无域名，首位管理员用外部邮箱注册；
  // 其余情况用「用户名 + 系统域名」直接开通 username@域名。
  const isBootstrap = config?.bootstrap ?? false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post<{ status?: string }>("/api/public/sign-up", {
        name,
        password,
        inviteCode: inviteCode || undefined,
        ...(isBootstrap ? { email } : { username }),
      });
      if (res?.status === "pending") {
        setPending(true);
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  }

  // 非引导且未配置默认注册域名：注册尚未就绪
  const notReady = Boolean(config) && !isBootstrap && !config?.defaultDomain;

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <BrandMark boxClassName="size-12 rounded-2xl shadow-surface" iconClassName="size-6" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">创建账号</h1>
            <p className="mt-1 text-sm text-muted">加入 {siteName} 邮箱系统</p>
          </div>
        </div>

        <div className="rounded-2xl bg-surface p-7 shadow-surface">
          {loading ? (
            <p className="text-sm text-muted">加载注册配置…</p>
          ) : config && !config.enabled ? (
            <Alert>当前未开放注册，请联系管理员获取邀请。</Alert>
          ) : notReady ? (
            <Alert>注册暂未就绪：管理员尚未配置默认注册域名，请稍后再试或联系管理员。</Alert>
          ) : pending ? (
            <Alert kind="success">注册成功，等待管理员审核后即可登录。</Alert>
          ) : (
            <>
              {isBootstrap && (
                <div className="mb-4">
                  <Alert kind="success">
                    系统尚无用户：首位注册者将成为管理员，无需邀请码。
                  </Alert>
                </div>
              )}
              <form onSubmit={submit} className="flex flex-col gap-4">
                <TextField>
                  <Label>昵称</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </TextField>

                {isBootstrap ? (
                  <TextField>
                    <Label>邮箱</Label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </TextField>
                ) : (
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-foreground">邮箱地址</span>
                    <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-field transition-colors focus-within:border-field-border-focus focus-within:ring-2 focus-within:ring-focus/40">
                      <input
                        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-field-foreground outline-none"
                        placeholder="yourname"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                      <span className="flex items-center whitespace-nowrap border-l border-border bg-surface-secondary px-3 text-muted">
                        @{config?.defaultDomain}
                      </span>
                    </div>
                    <span className="text-xs text-muted">
                      注册后即以 {username || "yourname"}@{config?.defaultDomain}{" "}
                      作为登录账号与收发邮箱。
                    </span>
                  </label>
                )}

                <TextField>
                  <Label>密码（至少 8 位）</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </TextField>
                {config?.requireInviteCode && (
                  <TextField>
                    <Label>邀请码</Label>
                    <Input
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      required
                    />
                  </TextField>
                )}
                {error && <Alert>{error}</Alert>}
                <Button type="submit" variant="primary" fullWidth isDisabled={submitting}>
                  {submitting ? "注册中…" : "注册"}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          已有账号？{" "}
          <Link to="/login" className="font-medium text-accent">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
