import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env.js";

/**
 * 解析当前会话并写入 c.var.user / c.var.session（不强制登录）。
 * 用于 /api/me/* 与 /api/admin/* 分组前置。
 */
export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

/** 要求已登录、未封禁、非待审核 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "未登录" }, 401);
  if (user.approvalStatus === "pending") {
    return c.json({ error: "账号待管理员审核" }, 403);
  }
  if (user.banned) return c.json({ error: "账号已被封禁" }, 403);
  await next();
});

/** 要求管理员角色 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "未登录" }, 401);
  if (user.role !== "admin") return c.json({ error: "需要管理员权限" }, 403);
  await next();
});
