import { Hono } from "hono";
import type { AppEnv } from "../../env.js";
import { loadUser, requireAdmin } from "../../middleware/auth.js";
import { addressRoutes } from "./addresses.js";
import { auditRoutes } from "./audit.js";
import { domainRoutes } from "./domains.js";
import { inviteRoutes } from "./invites.js";
import { planRoutes } from "./plans.js";
import { settingsRoutes } from "./settings.js";
import { statsRoutes } from "./stats.js";
import { userRoutes } from "./users.js";

/** 管理后台路由：全部要求管理员 */
export const adminRoutes = new Hono<AppEnv>()
  .use("*", loadUser, requireAdmin)
  .route("/stats", statsRoutes)
  .route("/settings", settingsRoutes)
  .route("/domains", domainRoutes)
  .route("/addresses", addressRoutes)
  .route("/users", userRoutes)
  .route("/plans", planRoutes)
  .route("/invite-codes", inviteRoutes)
  .route("/audit", auditRoutes);
