import { createDb } from "@mailflare/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { emailHandler } from "./email/handler.js";
import type { AppEnv, Bindings } from "./env.js";
import { runDailyMaintenance } from "./lib/cron.js";
import { contextMiddleware } from "./middleware/context.js";
import { adminRoutes } from "./routes/admin/index.js";
import { meRoutes } from "./routes/me.js";
import { publicRoutes } from "./routes/public.js";

const app = new Hono<AppEnv>();

// 1) CORS：必须先于路由；origin 用具体前端地址（带凭据时不可用 *）
//    WebSocket 升级请求跳过 CORS（其在 101 响应上改 header 可能出错，且 WS 有自身同源模型）
app.use("/api/*", (c, next) => {
  if (c.req.header("Upgrade") === "websocket") return next();
  return cors({
    origin: c.env.WEB_ORIGIN,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  })(c, next);
});

// 2) 每请求注入 db + auth
app.use("/api/*", contextMiddleware);

// 3) 探活（含 Postgres 连通性）
app.get("/api/health", async (c) => {
  await c.var.db.execute("select 1");
  return c.json({ ok: true });
});

// 4) 拦截原生注册端点，强制走带策略校验的 /api/public/sign-up
app.post("/api/auth/sign-up/email", (c) =>
  c.json({ error: "请通过 /api/public/sign-up 注册" }, 403),
);

// 5) Better Auth：处理 /api/auth/*（登录、登出、会话、admin 插件等）
app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw));

// 6) 业务路由
app.route("/api/public", publicRoutes);
app.route("/api/me", meRoutes);
app.route("/api/admin", adminRoutes);

// 导出供前端做 RPC 类型推断
export type AppType = typeof app;

// Durable Object：每用户 WebSocket 中枢（wrangler 需从入口模块找到该导出）
export { UserHub } from "./do/user-hub.js";

export default {
  fetch: app.fetch,
  email: (message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) =>
    emailHandler(message, env, ctx),
  // 每日维护（Cron）
  scheduled: async (_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    const { db, client } = await createDb(env.HYPERDRIVE.connectionString);
    try {
      const r = await runDailyMaintenance(db, new Date());
      console.log("每日维护完成", r);
    } finally {
      ctx.waitUntil(client.end());
    }
  },
} satisfies ExportedHandler<Bindings>;
