import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RegistrationConfig } from "@mailflare/shared";
import { Alert, Panel } from "../components/ui";
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
    <div className="flex h-full items-center justify-center bg-background p-4">
      <Panel className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-primary">注册 MailFlare</h1>
        {loading ? (
          <p className="text-sm text-foreground-500">加载注册配置…</p>
        ) : config && !config.enabled ? (
          <Alert>当前未开放注册，请联系管理员获取邀请。</Alert>
        ) : pending ? (
          <Alert kind="success">注册成功，等待管理员审核后即可登录。</Alert>
        ) : (
          <>
            {config?.defaultDomain && (
              <p className="mb-4 text-sm text-foreground-500">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </TextField>
              <TextField>
                <Label>密码（至少 8 位）</Label>
                <Input
                  type="password"
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
              <Button type="submit" variant="primary" isDisabled={submitting}>
                {submitting ? "注册中…" : "注册"}
              </Button>
              <Link to="/login" className="text-center text-sm text-primary">
                已有账号？去登录
              </Link>
            </form>
          </>
        )}
      </Panel>
    </div>
  );
}
