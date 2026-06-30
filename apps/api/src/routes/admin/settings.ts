import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { systemSettings } from "@mailflare/db";
import { SYSTEM_SETTINGS_ID, updateSettingsSchema } from "@mailflare/shared";
import type { AppEnv } from "../../env.js";
import { audit } from "../../lib/audit.js";

export const settingsRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const row = await c.var.db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });
    return c.json(row ?? null);
  })

  .put("/", zValidator("json", updateSettingsSchema), async (c) => {
    const db = c.var.db;
    const v = c.req.valid("json");
    const [row] = await db
      .insert(systemSettings)
      .values({
        id: SYSTEM_SETTINGS_ID,
        registrationMode: v.registrationMode,
        requireAdminApproval: v.requireAdminApproval,
        defaultPlanId: v.defaultPlanId ?? null,
        defaultStorageQuotaBytes: v.defaultStorageQuotaBytes,
        defaultMaxAddresses: v.defaultMaxAddresses,
        signupDefaultDomainId: v.signupDefaultDomainId ?? null,
        updatedByUserId: c.var.user!.id,
      })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: {
          registrationMode: v.registrationMode,
          requireAdminApproval: v.requireAdminApproval,
          defaultPlanId: v.defaultPlanId ?? null,
          defaultStorageQuotaBytes: v.defaultStorageQuotaBytes,
          defaultMaxAddresses: v.defaultMaxAddresses,
          signupDefaultDomainId: v.signupDefaultDomainId ?? null,
          updatedAt: new Date(),
          updatedByUserId: c.var.user!.id,
        },
      })
      .returning();
    await audit(db, c.var.user!.id, "settings.update", "settings", SYSTEM_SETTINGS_ID, {
      registrationMode: v.registrationMode,
    });
    return c.json(row);
  });
