import { createDb } from "@mailflare/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { emailHandler } from "./email/handler.js";
import type { AppEnv, Bindings } from "./env.js";
import { runCalendarReminders } from "./lib/calendar-reminders.js";
import { runDailyMaintenance } from "./lib/cron.js";
import { runScheduledMail } from "./lib/outbound-mail.js";
import { loadUser } from "./middleware/auth.js";
import { contextMiddleware } from "./middleware/context.js";
import { adminRoutes } from "./routes/admin/index.js";
import { calendarRoutes } from "./routes/calendar.js";
import { contactRoutes } from "./routes/contacts.js";
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

// 3.1) OIDC 发现文档的「颁发者根路径」别名：
//   Better Auth 的发现端点在 /api/auth/.well-known/openid-configuration，
//   但严格的第三方客户端会按 issuer 根去 {API_ORIGIN}/.well-known/openid-configuration 取。
//   这里补一个顶层别名（公开元数据，允许跨域），复用插件生成的同一份配置。
app.get("/.well-known/openid-configuration", contextMiddleware, async (c) => {
  const config = await c.var.auth.api.getOpenIdConfig();
  return c.json(config, 200, { "access-control-allow-origin": "*" });
});

// 4) 拦截原生注册端点，强制走带策略校验的 /api/public/sign-up
app.post("/api/auth/sign-up/email", (c) =>
  c.json({ error: "请通过 /api/public/sign-up 注册" }, 403),
);

// 4.1) OIDC 授权前置守卫：待审核 / 已封禁用户即便有会话，也不得为第三方应用签发令牌。
//   （requireAuth 只挂在业务路由上，授权端点由 Better Auth 直接处理，故在此单独拦截。）
app.use("/api/auth/oauth2/authorize", loadUser, async (c, next) => {
  const u = c.var.user;
  if (u && (u.approvalStatus === "pending" || u.banned)) {
    return c.json({ error: "账号待管理员审核或已被封禁，无法授权第三方应用" }, 403);
  }
  await next();
});

// 5) Better Auth：处理 /api/auth/*（登录、登出、会话、admin / jwt / oidc 插件等）
app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw));

// 6) 业务路由
app.route("/api/public", publicRoutes);
app.route("/api/me", meRoutes);
app.route("/api/contacts", contactRoutes);
app.route("/api/calendar", calendarRoutes);
app.route("/api/admin", adminRoutes);

// 导出供前端做 RPC 类型推断
export type AppType = typeof app;

// Durable Object：每用户 WebSocket 中枢（wrangler 需从入口模块找到该导出）
export { UserHub } from "./do/user-hub.js";

export default {
  fetch: app.fetch,
  email: (message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) =>
    emailHandler(message, env, ctx),
  // Cron：按触发表达式分派（每日维护 / 日历提醒）
  scheduled: async (controller: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    const { db, client } = await createDb(env.HYPERDRIVE.connectionString);
    try {
      if (controller.cron === "*/5 * * * *") {
        const now = new Date(controller.scheduledTime);
        const reminders = await runCalendarReminders(db, env, now);
        const scheduledMail = await runScheduledMail(db, env, now);
        console.log("五分钟任务完成", { reminders, scheduledMail });
      } else {
        const r = await runDailyMaintenance(db, new Date(controller.scheduledTime));
        console.log("每日维护完成", r);
      }
    } finally {
      ctx.waitUntil(client.end());
    }
  },
} satisfies ExportedHandler<Bindings>;
