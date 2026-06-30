import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Panel } from "../components/ui";
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
    <div className="flex h-full items-center justify-center bg-background p-4">
      <Panel className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-primary">MailFlare</h1>
        <p className="mb-6 text-sm text-foreground-500">登录到你的邮箱系统</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField>
            <Label>邮箱</Label>
            <Input
              type="email"
              autoComplete="email"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </TextField>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" isDisabled={loading}>
            {loading ? "登录中…" : "登录"}
          </Button>
          <Link to="/register" className="text-center text-sm text-primary">
            没有账号？去注册
          </Link>
        </form>
      </Panel>
    </div>
  );
}
