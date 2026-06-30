import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { domains, emailAddresses, plans, user, userQuota } from "@mailflare/db";
import { assignQuotaSchema, updateUserSchema } from "@mailflare/shared";
import type { AppEnv } from "../../env.js";
import { audit } from "../../lib/audit.js";

export const userRoutes = new Hono<AppEnv>()
  /** 用户列表（含配额与地址数） */
  .get("/", async (c) => {
    const rows = await c.var.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        banned: user.banned,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        storageQuotaBytes: userQuota.storageQuotaBytes,
        usedBytes: userQuota.usedBytes,
        maxAddresses: userQuota.maxAddresses,
        addressCount: sql<number>`count(distinct ${emailAddresses.id})::int`,
      })
      .from(user)
      .leftJoin(userQuota, eq(userQuota.userId, user.id))
      .leftJoin(emailAddresses, eq(emailAddresses.userId, user.id))
      .groupBy(user.id, userQuota.userId)
      .orderBy(user.createdAt);
    return c.json(rows);
  })

  /** 用户详情（合并配额 + 地址） */
  .get("/:id", async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const u = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!u) return c.json({ error: "用户不存在" }, 404);

    const quota = await db.query.userQuota.findFirst({
      where: eq(userQuota.userId, id),
    });
    const addresses = await db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        type: emailAddresses.type,
        status: emailAddresses.status,
        isPrimary: emailAddresses.isPrimary,
        domain: domains.name,
      })
      .from(emailAddresses)
      .innerJoin(domains, eq(emailAddresses.domainId, domains.id))
      .where(eq(emailAddresses.userId, id));

    return c.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        approvalStatus: u.approvalStatus,
        banned: u.banned,
        emailVerified: u.emailVerified,
        locale: u.locale,
        createdAt: u.createdAt,
      },
      quota: quota ?? null,
      addresses,
    });
  })

  /** 修改用户业务字段（角色/审核状态/语言） */
  .patch("/:id", zValidator("json", updateUserSchema), async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const [row] = await c.var.db
      .update(user)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    if (!row) return c.json({ error: "用户不存在" }, 404);
    await audit(c.var.db, c.var.user!.id, "user.update", "user", id, patch);
    return c.json({ ok: true });
  })

  /** 审核通过 */
  .post("/:id/approve", async (c) => {
    const id = c.req.param("id");
    const [row] = await c.var.db
      .update(user)
      .set({ approvalStatus: "active", updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    if (!row) return c.json({ error: "用户不存在" }, 404);
    await audit(c.var.db, c.var.user!.id, "user.approve", "user", id);
    return c.json({ ok: true });
  })

  /** 查看用户配额 */
  .get("/:id/quota", async (c) => {
    const quota = await c.var.db.query.userQuota.findFirst({
      where: eq(userQuota.userId, c.req.param("id")),
    });
    return c.json(quota ?? null);
  })

  /** 分配/更新用户配额（upsert） */
  .put("/:id/quota", zValidator("json", assignQuotaSchema), async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const { planId, storageQuotaBytes, maxAddresses, dailySendQuota } =
      c.req.valid("json");

    const u = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!u) return c.json({ error: "用户不存在" }, 404);
    if (planId) {
      const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
      if (!plan) return c.json({ error: "套餐不存在" }, 404);
    }

    const [row] = await db
      .insert(userQuota)
      .values({
        userId: id,
        planId: planId ?? null,
        storageQuotaBytes,
        maxAddresses,
        dailySendQuota: dailySendQuota ?? null,
      })
      .onConflictDoUpdate({
        target: userQuota.userId,
        set: {
          planId: planId ?? null,
          storageQuotaBytes,
          maxAddresses,
          dailySendQuota: dailySendQuota ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    await audit(db, c.var.user!.id, "user.quota.assign", "user", id, {
      storageQuotaBytes,
      maxAddresses,
    });
    return c.json(row);
  });
