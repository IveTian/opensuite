import { zValidator } from "@hono/zod-validator";
import { eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { plans } from "@mailflare/db";
import { createPlanSchema } from "@mailflare/shared";
import type { AppEnv } from "../../env.js";

export const planRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await c.var.db.select().from(plans).orderBy(plans.createdAt);
    return c.json(rows);
  })

  .post("/", zValidator("json", createPlanSchema), async (c) => {
    const db = c.var.db;
    const v = c.req.valid("json");
    const dup = await db.query.plans.findFirst({ where: eq(plans.name, v.name) });
    if (dup) return c.json({ error: "套餐名已存在" }, 409);
    // 设为默认时，清除其它默认（无 where 即更新所有行）
    if (v.isDefault) {
      await db.update(plans).set({ isDefault: false });
    }
    const [row] = await db
      .insert(plans)
      .values({
        name: v.name,
        storageQuotaBytes: v.storageQuotaBytes,
        maxAddresses: v.maxAddresses,
        dailySendQuota: v.dailySendQuota ?? null,
        isDefault: v.isDefault,
      })
      .returning();
    return c.json(row, 201);
  })

  .patch("/:id", zValidator("json", createPlanSchema.partial()), async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const v = c.req.valid("json");
    if (v.isDefault) {
      await db.update(plans).set({ isDefault: false }).where(ne(plans.id, id));
    }
    const [row] = await db
      .update(plans)
      .set({ ...v, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    if (!row) return c.json({ error: "套餐不存在" }, 404);
    return c.json(row);
  })

  .delete("/:id", async (c) => {
    const [row] = await c.var.db
      .delete(plans)
      .where(eq(plans.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "套餐不存在" }, 404);
    return c.json({ ok: true });
  });
