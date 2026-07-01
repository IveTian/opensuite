import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { domains, emailAddresses, systemSettings, userQuota, userSettings } from "@mailflare/db";
import type { Role } from "@mailflare/shared";
import {
  SYSTEM_SETTINGS_ID,
  updateMailSettingsSchema,
  updateSenderNameSchema,
  type MeProfile,
} from "@mailflare/shared";
import type { AppEnv } from "../env.js";
import { sanitizeOutboundHtml } from "../lib/sanitize.js";
import { loadUser, requireAuth } from "../middleware/auth.js";
import { messageRoutes } from "./messages.js";

/** 用户自助：需登录 */
export const meRoutes = new Hono<AppEnv>()
  .use("*", loadUser, requireAuth)
  .route("/messages", messageRoutes)

  .get("/", (c) => {
    const u = c.var.user!;
    const profile: MeProfile = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: (u.role as Role) ?? "user",
      emailVerified: u.emailVerified,
    };
    return c.json(profile);
  })

  .get("/quota", async (c) => {
    const u = c.var.user!;
    const quota = await c.var.db.query.userQuota.findFirst({
      where: eq(userQuota.userId, u.id),
    });
    return c.json(quota ?? null);
  })

  .get("/addresses", async (c) => {
    const u = c.var.user!;
    const rows = await c.var.db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        localPart: emailAddresses.localPart,
        type: emailAddresses.type,
        status: emailAddresses.status,
        isPrimary: emailAddresses.isPrimary,
        senderName: emailAddresses.senderName,
        usedBytes: emailAddresses.usedBytes,
        domain: domains.name,
      })
      .from(emailAddresses)
      .innerJoin(domains, eq(emailAddresses.domainId, domains.id))
      .where(eq(emailAddresses.userId, u.id));
    return c.json(rows);
  })

  /** 自定义某个自有邮箱的发信人显示名 */
  .patch("/addresses/:id/sender-name", zValidator("json", updateSenderNameSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const { senderName } = c.req.valid("json");
    const owned = await db.query.emailAddresses.findFirst({
      where: and(eq(emailAddresses.id, id), eq(emailAddresses.userId, u.id)),
    });
    if (!owned) return c.json({ error: "地址不存在或不属于你" }, 404);
    const [row] = await db
      .update(emailAddresses)
      .set({ senderName: senderName?.trim() ? senderName.trim() : null, updatedAt: new Date() })
      .where(eq(emailAddresses.id, id))
      .returning({ id: emailAddresses.id, senderName: emailAddresses.senderName });
    return c.json(row);
  })

  /** 发信设置：个人签名 + 组织签名（组织签名只读，用于撰写时附加） */
  .get("/mail-settings", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const [mine, sys] = await Promise.all([
      db.query.userSettings.findFirst({ where: eq(userSettings.userId, u.id) }),
      db.query.systemSettings.findFirst({ where: eq(systemSettings.id, SYSTEM_SETTINGS_ID) }),
    ]);
    return c.json({
      signatureHtml: mine?.signatureHtml ?? null,
      orgSignatureHtml: sys?.orgSignatureHtml ?? null,
    });
  })

  /** 保存个人签名 */
  .put("/mail-settings", zValidator("json", updateMailSettingsSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const { signatureHtml } = c.req.valid("json");
    const clean = signatureHtml ? sanitizeOutboundHtml(signatureHtml) : null;
    await db
      .insert(userSettings)
      .values({ userId: u.id, signatureHtml: clean })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { signatureHtml: clean, updatedAt: new Date() },
      });
    return c.json({ signatureHtml: clean });
  });
