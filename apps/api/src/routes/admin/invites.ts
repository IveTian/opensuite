import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { inviteCodes } from "@mailflare/db";
import { createInviteCodesSchema } from "@mailflare/shared";
import { z } from "zod";
import type { AppEnv } from "../../env.js";

/** 生成易读的邀请码（去除易混字符） */
function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const revokeSchema = z.object({ status: z.literal("revoked") });

export const inviteRoutes = new Hono<AppEnv>()
  /** 列出邀请码 */
  .get("/", async (c) => {
    const rows = await c.var.db
      .select()
      .from(inviteCodes)
      .orderBy(desc(inviteCodes.createdAt));
    return c.json(rows);
  })

  /** 批量生成邀请码 */
  .post("/", zValidator("json", createInviteCodesSchema), async (c) => {
    const db = c.var.db;
    const { count, maxUses, expiresAt, note, defaultPlanId, allowedDomainId } =
      c.req.valid("json");

    const values = Array.from({ length: count }, () => ({
      code: genCode(),
      createdByUserId: c.var.user!.id,
      maxUses,
      expiresAt: expiresAt ?? null,
      note: note ?? null,
      defaultPlanId: defaultPlanId ?? null,
      allowedDomainId: allowedDomainId ?? null,
    }));
    const rows = await db.insert(inviteCodes).values(values).returning();
    return c.json(rows, 201);
  })

  /** 撤销邀请码 */
  .patch("/:id", zValidator("json", revokeSchema), async (c) => {
    const [row] = await c.var.db
      .update(inviteCodes)
      .set({ status: "revoked" })
      .where(eq(inviteCodes.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "邀请码不存在" }, 404);
    return c.json(row);
  })

  /** 删除邀请码 */
  .delete("/:id", async (c) => {
    const [row] = await c.var.db
      .delete(inviteCodes)
      .where(eq(inviteCodes.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "邀请码不存在" }, 404);
    return c.json({ ok: true });
  });
