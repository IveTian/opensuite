import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  domains,
  inviteCodes,
  systemSettings,
  user,
} from "@mailflare/db";
import {
  SYSTEM_SETTINGS_ID,
  signUpSchema,
  validateInviteSchema,
  type BrandingConfig,
  type InviteValidationResult,
  type RegistrationConfig,
  type RegistrationMode,
} from "@mailflare/shared";
import type { AppEnv } from "../env.js";
import { avatarKey } from "../lib/storage.js";

export const publicRoutes = new Hono<AppEnv>()
  /** 头像服务（公开，供 <img> 直接加载；低敏感，按 userId 取 R2 对象） */
  .get("/avatars/:userId", async (c) => {
    const obj = await c.env.RAW_EMAILS.get(avatarKey(c.req.param("userId")));
    if (!obj) return c.json({ error: "无头像" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType ?? "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  })

  /** 站点品牌（公开，未登录页也可读） */
  .get("/branding", async (c) => {
    const settings = await c.var.db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });
    const body: BrandingConfig = {
      siteName: settings?.siteName?.trim() || "MailFlare",
      logoUrl: settings?.logoUrl || null,
    };
    return c.json(body);
  })

  /** 注册页读取的公开配置 */
  .get("/registration-config", async (c) => {
    const db = c.var.db;
    const settings = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });
    const mode = (settings?.registrationMode ?? "closed") as RegistrationMode;

    // 零用户：首位注册者将成为管理员。之后所有用户均由管理员创建。
    const bootstrap = (await db.$count(user)) === 0;

    let defaultDomain: string | null = null;
    if (settings?.signupDefaultDomainId) {
      const d = await db.query.domains.findFirst({
        where: eq(domains.id, settings.signupDefaultDomainId),
      });
      defaultDomain = d?.name ?? null;
    }

    const body: RegistrationConfig = {
      enabled: bootstrap,
      mode,
      requireInviteCode: false,
      defaultDomain,
      bootstrap,
    };
    return c.json(body);
  })

  /** 注册前预校验邀请码 */
  .post("/validate-invite", zValidator("json", validateInviteSchema), async (c) => {
    const { code } = c.req.valid("json");
    const invite = await c.var.db.query.inviteCodes.findFirst({
      where: eq(inviteCodes.code, code),
    });
    let result: InviteValidationResult;
    if (!invite) result = { valid: false, reason: "not_found" };
    else if (invite.status === "revoked") result = { valid: false, reason: "revoked" };
    else if (invite.expiresAt && invite.expiresAt < new Date())
      result = { valid: false, reason: "expired" };
    else if (invite.usedCount >= invite.maxUses)
      result = { valid: false, reason: "exhausted" };
    else result = { valid: true };
    return c.json(result);
  })

  /**
   * 首位管理员引导注册。
   * 系统已有任何用户后，普通用户只能由管理员在用户管理中创建。
   */
  .post("/sign-up", zValidator("json", signUpSchema), async (c) => {
    const db = c.var.db;
    const { name, email, password } = c.req.valid("json");

    // 首位用户引导
    const isBootstrap = (await db.$count(user)) === 0;
    if (!isBootstrap) {
      return c.json({ error: "请联系管理员创建账号" }, 403);
    }
    if (!email) {
      return c.json({ error: "请填写邮箱" }, 422);
    }

    // 调 Better Auth 服务端注册（autoSignIn=false，仅创建用户）
    let createdUserId: string;
    try {
      const res = await c.var.auth.api.signUpEmail({
        body: { name, email, password },
        headers: c.req.raw.headers,
      });
      createdUserId = res.user.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败";
      return c.json({ error: message }, 400);
    }

    await db
      .update(user)
      .set({
        role: "admin",
        approvalStatus: "active",
        externalEmail: email,
        updatedAt: new Date(),
      })
      .where(eq(user.id, createdUserId));

    // 正常：显式登录并返回带会话 cookie 的响应
    return c.var.auth.api.signInEmail({
      body: { email, password },
      headers: c.req.raw.headers,
      asResponse: true,
    });
  });
