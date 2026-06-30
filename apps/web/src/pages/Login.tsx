import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "../components/ui";
import { MailIcon } from "../components/icons";
import { signIn } from "../lib/auth-client";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message || "登录失败");
      return;
    }
    navigate("/");
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-surface">
            <MailIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">欢迎回来</h1>
            <p className="mt-1 text-sm text-muted">登录到你的 MailFlare 邮箱系统</p>
          </div>
        </div>

        <div className="rounded-2xl bg-surface p-7 shadow-surface">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <TextField>
              <Label>邮箱</Label>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </TextField>
            <TextField>
              <Label>密码</Label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </TextField>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" variant="primary" fullWidth isDisabled={loading}>
              {loading ? "登录中…" : "登录"}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          没有账号？{" "}
          <Link to="/register" className="font-medium text-accent">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
