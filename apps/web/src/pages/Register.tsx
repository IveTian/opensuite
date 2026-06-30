import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RegistrationConfig } from "@mailflare/shared";
import { Alert } from "../components/ui";
import { MailIcon } from "../components/icons";
import { useFetch } from "../hooks/useFetch";
import { api, ApiError } from "../lib/api";

export function Register() {
  const { data: config, loading } = useFetch<RegistrationConfig>(
    "/api/public/registration-config",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post<{ status?: string }>("/api/public/sign-up", {
        name,
        email,
        password,
        inviteCode: inviteCode || undefined,
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

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-surface">
            <MailIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">创建账号</h1>
            <p className="mt-1 text-sm text-muted">加入 MailFlare 邮箱系统</p>
          </div>
        </div>

        <div className="rounded-2xl bg-surface p-7 shadow-surface">
          {loading ? (
            <p className="text-sm text-muted">加载注册配置…</p>
          ) : config && !config.enabled ? (
            <Alert>当前未开放注册，请联系管理员获取邀请。</Alert>
          ) : pending ? (
            <Alert kind="success">注册成功，等待管理员审核后即可登录。</Alert>
          ) : (
            <>
              {config?.bootstrap && (
                <div className="mb-4">
                  <Alert kind="success">
                    系统尚无用户：首位注册者将成为管理员，无需邀请码。
                  </Alert>
                </div>
              )}
              {config?.defaultDomain && (
                <p className="mb-4 text-sm text-muted">
                  注册后将在 @{config.defaultDomain} 下分配邮箱。
                </p>
              )}
              <form onSubmit={submit} className="flex flex-col gap-4">
                <TextField>
                  <Label>昵称</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </TextField>
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
