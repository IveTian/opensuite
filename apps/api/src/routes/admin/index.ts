import { Hono } from "hono";
import type { AppEnv } from "../../env.js";
import { loadUser, requireAdmin } from "../../middleware/auth.js";
import { addressRoutes } from "./addresses.js";
import { auditRoutes } from "./audit.js";
import { directoryRoutes } from "./directory.js";
import { driveAdminRoutes } from "./drive.js";
import { domainRoutes } from "./domains.js";
import { inviteRoutes } from "./invites.js";
import { oauthAppRoutes } from "./oauth-apps.js";
import { planRoutes } from "./plans.js";
import { settingsRoutes } from "./settings.js";
import { statsRoutes } from "./stats.js";
import { toolsRoutes } from "./tools.js";
import { userRoutes } from "./users.js";

/** 管理后台路由：全部要求管理员 */
export const adminRoutes = new Hono<AppEnv>()
  .use("*", loadUser, requireAdmin)
  .route("/tools", toolsRoutes)
  .route("/stats", statsRoutes)
  .route("/settings", settingsRoutes)
  .route("/domains", domainRoutes)
  .route("/addresses", addressRoutes)
  .route("/directory", directoryRoutes)
  .route("/drive", driveAdminRoutes)
  .route("/users", userRoutes)
  .route("/plans", planRoutes)
  .route("/invite-codes", inviteRoutes)
  .route("/oauth-apps", oauthAppRoutes)
  .route("/audit", auditRoutes);
