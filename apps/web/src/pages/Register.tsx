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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // bootstrap（系统零用户）：尚无域名，首位管理员用外部邮箱注册。
  // 后续用户全部由管理员在用户管理中创建。
  const isBootstrap = config?.bootstrap ?? false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/api/public/sign-up", {
        name,
        email,
        password,
      });
      navigate("/setup");
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
            <Alert>当前系统已有管理员。请联系管理员创建邮箱账号。</Alert>
          ) : (
            <>
              {isBootstrap && (
                <div className="mb-4">
                  <Alert kind="success">
                    系统尚无用户：首位注册者将成为管理员，并进入域名配置向导。
                  </Alert>
                </div>
              )}
              <form onSubmit={submit} className="flex flex-col gap-4">
                <TextField>
                  <Label>昵称</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </TextField>

                <TextField>
                  <Label>管理员外部邮箱</Label>
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
                {error && <Alert>{error}</Alert>}
                <Button type="submit" variant="primary" fullWidth isDisabled={submitting}>
                  {submitting ? "创建中…" : "创建管理员账号"}
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
