import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { auditLog, user } from "@mailflare/db";
import type { AppEnv } from "../../env.js";

/** 审计日志查询（分页 + 可按 action 过滤） */
export const auditRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const db = c.var.db;
  const action = c.req.query("action");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const where = action ? eq(auditLog.action, action) : undefined;
  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
        actorEmail: user.email,
      })
      .from(auditLog)
      .leftJoin(user, eq(auditLog.actorUserId, user.id))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where),
  ]);
  return c.json({ items, total: totalRow[0]?.n ?? 0 });
});
