import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import PostalMime from "postal-mime";
import { emailAddresses } from "@mailflare/db";
import { z } from "zod";
import type { AppEnv } from "../../env.js";
import { resolveDelivery, storeInboundEmail } from "../../lib/mail.js";

const simulateSchema = z
  .object({
    addressId: z.string().uuid().optional(),
    to: z.string().email().optional(),
    raw: z.string().min(1),
  })
  .refine((d) => d.addressId || d.to, { message: "需提供 addressId 或 to" });

/** 管理员工具（开发/自测） */
export const toolsRoutes = new Hono<AppEnv>().post(
  "/simulate-inbound",
  zValidator("json", simulateSchema),
  async (c) => {
    const db = c.var.db;
    const { addressId, to, raw } = c.req.valid("json");

    let envelopeTo = to;
    if (!envelopeTo && addressId) {
      const addr = await db.query.emailAddresses.findFirst({
        where: eq(emailAddresses.id, addressId),
      });
      if (!addr) return c.json({ error: "地址不存在" }, 404);
      envelopeTo = addr.address;
    }
    if (!envelopeTo) return c.json({ error: "缺少收件地址" }, 422);

    const target = await resolveDelivery(db, envelopeTo.toLowerCase());
    if (!target) return c.json({ error: "投递目标不存在" }, 422);

    const bytes = new TextEncoder().encode(raw);
    const parsed = await PostalMime.parse(raw);
    const result = await storeInboundEmail(db, c.env, {
      envelopeFrom: parsed.from?.address ?? "unknown@unknown",
      envelopeTo,
      raw: bytes.buffer as ArrayBuffer,
      parsed,
    });
    return c.json(result, result.stored ? 201 : 422);
  },
);
