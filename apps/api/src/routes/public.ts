import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  domains,
  emailAddresses,
  inviteCodeRedemptions,
  inviteCodes,
  plans,
  systemSettings,
  user,
  userQuota,
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
import type { Database } from "@mailflare/db";

/** 回滚一次邀请码占用（注册失败时） */
async function rollbackInvite(db: Database, inviteId: string) {
  await db
    .update(inviteCodes)
    .set({
      usedCount: sql`GREATEST(${inviteCodes.usedCount} - 1, 0)`,
      status: "active",
    })
    .where(eq(inviteCodes.id, inviteId));
}

export const publicRoutes = new Hono<AppEnv>()
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

    // 零用户：首位注册者将成为管理员，免邀请码、不受 closed 限制
    const bootstrap = (await db.$count(user)) === 0;

    let defaultDomain: string | null = null;
    if (settings?.signupDefaultDomainId) {
      const d = await db.query.domains.findFirst({
        where: eq(domains.id, settings.signupDefaultDomainId),
      });
      defaultDomain = d?.name ?? null;
    }

    const body: RegistrationConfig = {
      enabled: bootstrap || mode !== "closed",
      mode,
      requireInviteCode: !bootstrap && mode === "invite_only",
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
   * 自定义注册包装：强制执行注册策略 + 邀请码原子占用，再调服务端 signUpEmail。
   * 首位用户（系统零用户）自动放行并提升为管理员，解决引导鸡生蛋问题。
   */
  .post("/sign-up", zValidator("json", signUpSchema), async (c) => {
    const db = c.var.db;
    const { name, username, email, password, inviteCode } = c.req.valid("json");

    const settings = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });
    const mode = (settings?.registrationMode ?? "closed") as RegistrationMode;

    // 首位用户引导
    const isBootstrap = (await db.$count(user)) === 0;

    // 邀请码占用（非引导且仅邀请码模式）
    let occupiedInviteId: string | null = null;
    let occupiedPlanId: string | null = null;
    let occupiedDomainId: string | null = null;
    if (!isBootstrap) {
      if (mode === "closed") return c.json({ error: "注册已关闭" }, 403);
      if (mode === "invite_only") {
        if (!inviteCode) return c.json({ error: "需要邀请码" }, 422);
        const now = new Date();
        const occupied = await db
          .update(inviteCodes)
          .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
          .where(
            and(
              eq(inviteCodes.code, inviteCode),
              eq(inviteCodes.status, "active"),
              sql`${inviteCodes.usedCount} < ${inviteCodes.maxUses}`,
              sql`(${inviteCodes.expiresAt} is null or ${inviteCodes.expiresAt} > ${now})`,
            ),
          )
          .returning();
        const row = occupied[0];
        if (!row) return c.json({ error: "邀请码无效或已用尽" }, 422);
        occupiedInviteId = row.id;
        occupiedPlanId = row.defaultPlanId;
        occupiedDomainId = row.allowedDomainId;
        if (row.usedCount >= row.maxUses) {
          await db
            .update(inviteCodes)
            .set({ status: "exhausted" })
            .where(eq(inviteCodes.id, row.id));
        }
      }
    }

    // 解析登录身份与主邮箱：
    // - bootstrap（系统尚无域名）：用外部邮箱登录，暂不分配 mailbox；
    // - 普通用户：用户名 + 注册域名拼成 username@域名，既作登录身份又即时开通主邮箱。
    let loginEmail: string;
    let mailbox: { domainId: string; localPart: string; address: string } | null = null;
    if (isBootstrap) {
      if (!email) {
        if (occupiedInviteId) await rollbackInvite(db, occupiedInviteId);
        return c.json({ error: "请填写邮箱" }, 422);
      }
      loginEmail = email;
    } else {
      if (!username) {
        if (occupiedInviteId) await rollbackInvite(db, occupiedInviteId);
        return c.json({ error: "请填写用户名" }, 422);
      }
      // 域名优先取邀请码限定域名，否则取系统默认注册域名
      const signupDomainId = occupiedDomainId ?? settings?.signupDefaultDomainId ?? null;
      if (!signupDomainId) {
        if (occupiedInviteId) await rollbackInvite(db, occupiedInviteId);
        return c.json({ error: "系统尚未配置注册域名，请联系管理员" }, 422);
      }
      const domain = await db.query.domains.findFirst({
        where: eq(domains.id, signupDomainId),
      });
      if (!domain) {
        if (occupiedInviteId) await rollbackInvite(db, occupiedInviteId);
        return c.json({ error: "注册域名不存在，请联系管理员" }, 422);
      }
      const address = `${username}@${domain.name}`;
      const dup = await db.query.emailAddresses.findFirst({
        where: eq(emailAddresses.address, address),
      });
      if (dup) {
        if (occupiedInviteId) await rollbackInvite(db, occupiedInviteId);
        return c.json({ error: "该邮箱地址已被占用，请换一个用户名" }, 409);
      }
      loginEmail = address;
      mailbox = { domainId: domain.id, localPart: username, address };
    }

    // 调 Better Auth 服务端注册（autoSignIn=false，仅创建用户）
    let createdUserId: string;
    try {
      const res = await c.var.auth.api.signUpEmail({
        body: { name, email: loginEmail, password },
        headers: c.req.raw.headers,
      });
      createdUserId = res.user.id;
    } catch (err) {
      if (occupiedInviteId) await rollbackInvite(db, occupiedInviteId);
      const message = err instanceof Error ? err.message : "注册失败";
      return c.json({ error: message }, 400);
    }

    // 业务收尾
    const willBePending = !isBootstrap && (settings?.requireAdminApproval ?? false);
    const patch: Record<string, unknown> = {};
    if (isBootstrap) {
      patch.role = "admin";
      patch.approvalStatus = "active";
    } else if (willBePending) {
      patch.approvalStatus = "pending";
    }
    if (Object.keys(patch).length > 0) {
      await db.update(user).set(patch).where(eq(user.id, createdUserId));
    }

    if (occupiedInviteId) {
      await db
        .insert(inviteCodeRedemptions)
        .values({ inviteCodeId: occupiedInviteId, userId: createdUserId });
      // 邀请码绑定套餐 → 覆盖默认配额
      if (occupiedPlanId) {
        const plan = await db.query.plans.findFirst({
          where: eq(plans.id, occupiedPlanId),
        });
        if (plan) {
          await db
            .update(userQuota)
            .set({
              planId: plan.id,
              storageQuotaBytes: plan.storageQuotaBytes,
              maxAddresses: plan.maxAddresses,
              dailySendQuota: plan.dailySendQuota,
            })
            .where(eq(userQuota.userId, createdUserId));
        }
      }
    }

    // 普通用户：注册即开通主邮箱（username@域名），无需管理员事后分配
    if (mailbox) {
      await db
        .insert(emailAddresses)
        .values({
          domainId: mailbox.domainId,
          userId: createdUserId,
          localPart: mailbox.localPart,
          address: mailbox.address,
          type: "mailbox",
          isPrimary: true,
          status: "active",
        })
        .onConflictDoNothing({ target: emailAddresses.address });
    }

    // 待审核：不下发会话
    if (willBePending) {
      return c.json({ status: "pending", message: "注册成功，等待管理员审核" }, 201);
    }

    // 正常：显式登录并返回带会话 cookie 的响应
    return c.var.auth.api.signInEmail({
      body: { email: loginEmail, password },
      headers: c.req.raw.headers,
      asResponse: true,
    });
  });
