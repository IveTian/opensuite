import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { domains, emailAddresses, plans, user, userQuota } from "@mailflare/db";
import {
  assignQuotaSchema,
  createManagedUserSchema,
  updateUserSchema,
} from "@mailflare/shared";
import type { AppEnv } from "../../env.js";
import { audit } from "../../lib/audit.js";
import { revokeUserOidcTokens } from "../../lib/oidc.js";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const userRoutes = new Hono<AppEnv>()
  /** 用户列表（含配额与地址数） */
  .get("/", async (c) => {
    const rows = await c.var.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        externalEmail: user.externalEmail,
        role: user.role,
        approvalStatus: user.approvalStatus,
        banned: user.banned,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        storageQuotaBytes: userQuota.storageQuotaBytes,
        usedBytes: userQuota.usedBytes,
        maxAddresses: userQuota.maxAddresses,
        addressCount: sql<number>`count(distinct ${emailAddresses.id})::int`,
      })
      .from(user)
      .leftJoin(userQuota, eq(userQuota.userId, user.id))
      .leftJoin(emailAddresses, eq(emailAddresses.userId, user.id))
      .groupBy(user.id, userQuota.userId)
      .orderBy(user.createdAt);
    return c.json(rows);
  })

  /** 管理员创建/邀请用户：内部邮箱登录，外部邮箱接收一次性通知 */
  .post("/", zValidator("json", createManagedUserSchema), async (c) => {
    const db = c.var.db;
    const { name, externalEmail, domainId, localPart, password, sendNotice, role } =
      c.req.valid("json");

    const domain = await db.query.domains.findFirst({
      where: eq(domains.id, domainId),
    });
    if (!domain) return c.json({ error: "域名不存在" }, 404);
    if (domain.status === "disabled") return c.json({ error: "该域名已停用" }, 422);

    const internalEmail = `${localPart}@${domain.name}`;
    const [existingUser, existingAddress] = await Promise.all([
      db.query.user.findFirst({ where: eq(user.email, internalEmail) }),
      db.query.emailAddresses.findFirst({
        where: eq(emailAddresses.address, internalEmail),
      }),
    ]);
    if (existingUser || existingAddress) {
      return c.json({ error: "该内部邮箱地址已存在" }, 409);
    }

    let createdUserId: string;
    try {
      const res = await c.var.auth.api.signUpEmail({
        body: { name, email: internalEmail, password },
        headers: c.req.raw.headers,
      });
      createdUserId = res.user.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "创建用户失败";
      return c.json({ error: message }, 400);
    }

    await db
      .update(user)
      .set({
        role,
        approvalStatus: "active",
        emailVerified: true,
        externalEmail,
        updatedAt: new Date(),
      })
      .where(eq(user.id, createdUserId));

    const [address] = await db
      .insert(emailAddresses)
      .values({
        domainId: domain.id,
        userId: createdUserId,
        localPart,
        address: internalEmail,
        type: "mailbox",
        isPrimary: true,
        status: "active",
      })
      .returning();

    let noticeSent = false;
    let noticeError: string | null = null;
    if (sendNotice) {
      const from = `notice@${domain.name}`;
      const safeName = escapeHtml(name);
      const safeInternal = escapeHtml(internalEmail);
      const safePassword = escapeHtml(password);
      try {
        await c.env.EMAIL.send({
          from: { email: from, name: "MailFlare Notice" },
          to: [externalEmail],
          subject: `你的 ${domain.name} 邮箱账号已创建`,
          text:
            `${name}，你好：\n\n` +
            `你的邮箱账号已创建。\n` +
            `登录账号：${internalEmail}\n` +
            `初始密码：${password}\n\n` +
            `首次登录后请尽快修改密码。`,
          html:
            `<p>${safeName}，你好：</p>` +
            `<p>你的邮箱账号已创建。</p>` +
            `<p><strong>登录账号：</strong>${safeInternal}<br />` +
            `<strong>初始密码：</strong>${safePassword}</p>` +
            `<p>首次登录后请尽快修改密码。</p>`,
        });
        noticeSent = true;
      } catch (err) {
        noticeError = err instanceof Error ? err.message : "通知发送失败";
      }
    }

    await audit(db, c.var.user!.id, "user.create", "user", createdUserId, {
      internalEmail,
      externalEmail,
      addressId: address!.id,
      noticeSent,
      noticeError,
    });

    return c.json(
      {
        userId: createdUserId,
        internalEmail,
        externalEmail,
        addressId: address!.id,
        noticeSent,
        noticeError,
      },
      201,
    );
  })

  /** 用户详情（合并配额 + 地址） */
  .get("/:id", async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const u = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!u) return c.json({ error: "用户不存在" }, 404);

    const quota = await db.query.userQuota.findFirst({
      where: eq(userQuota.userId, id),
    });
    const addresses = await db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        type: emailAddresses.type,
        status: emailAddresses.status,
        isPrimary: emailAddresses.isPrimary,
        domain: domains.name,
      })
      .from(emailAddresses)
      .innerJoin(domains, eq(emailAddresses.domainId, domains.id))
      .where(eq(emailAddresses.userId, id));

    return c.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        approvalStatus: u.approvalStatus,
        banned: u.banned,
        emailVerified: u.emailVerified,
        externalEmail: u.externalEmail,
        locale: u.locale,
        createdAt: u.createdAt,
      },
      quota: quota ?? null,
      addresses,
    });
  })

  /** 修改用户业务字段（角色/审核状态/语言） */
  .patch("/:id", zValidator("json", updateUserSchema), async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const [row] = await c.var.db
      .update(user)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    if (!row) return c.json({ error: "用户不存在" }, 404);
    // 置为待审核时，撤销其已签发的第三方 OIDC 令牌（与封禁一致，防止绕过审核门禁保持访问）。
    if (patch.approvalStatus === "pending") {
      await revokeUserOidcTokens(c.var.db, id);
    }
    await audit(c.var.db, c.var.user!.id, "user.update", "user", id, patch);
    return c.json({ ok: true });
  })

  /** 审核通过 */
  .post("/:id/approve", async (c) => {
    const id = c.req.param("id");
    const [row] = await c.var.db
      .update(user)
      .set({ approvalStatus: "active", updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    if (!row) return c.json({ error: "用户不存在" }, 404);
    await audit(c.var.db, c.var.user!.id, "user.approve", "user", id);
    return c.json({ ok: true });
  })

  /** 查看用户配额 */
  .get("/:id/quota", async (c) => {
    const quota = await c.var.db.query.userQuota.findFirst({
      where: eq(userQuota.userId, c.req.param("id")),
    });
    return c.json(quota ?? null);
  })

  /** 分配/更新用户配额（upsert） */
  .put("/:id/quota", zValidator("json", assignQuotaSchema), async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const { planId, storageQuotaBytes, maxAddresses, dailySendQuota } =
      c.req.valid("json");

    const u = await db.query.user.findFirst({ where: eq(user.id, id) });
    if (!u) return c.json({ error: "用户不存在" }, 404);
    if (planId) {
      const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
      if (!plan) return c.json({ error: "套餐不存在" }, 404);
    }

    const [row] = await db
      .insert(userQuota)
      .values({
        userId: id,
        planId: planId ?? null,
        storageQuotaBytes,
        maxAddresses,
        dailySendQuota: dailySendQuota ?? null,
      })
      .onConflictDoUpdate({
        target: userQuota.userId,
        set: {
          planId: planId ?? null,
          storageQuotaBytes,
          maxAddresses,
          dailySendQuota: dailySendQuota ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    await audit(db, c.var.user!.id, "user.quota.assign", "user", id, {
      storageQuotaBytes,
      maxAddresses,
    });
    return c.json(row);
  });
