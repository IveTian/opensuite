import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { domains, emailAddresses, userQuota } from "@mailflare/db";
import type { Role } from "@mailflare/shared";
import type { MeProfile } from "@mailflare/shared";
import type { AppEnv } from "../env.js";
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
        usedBytes: emailAddresses.usedBytes,
        domain: domains.name,
      })
      .from(emailAddresses)
      .innerJoin(domains, eq(emailAddresses.domainId, domains.id))
      .where(eq(emailAddresses.userId, u.id));
    return c.json(rows);
  });
