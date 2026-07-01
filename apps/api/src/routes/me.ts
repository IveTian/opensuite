import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  domains,
  emailAddresses,
  mailboxMembers,
  systemSettings,
  user,
  userQuota,
  userSettings,
} from "@mailflare/db";
import type { Role } from "@mailflare/shared";
import {
  SYSTEM_SETTINGS_ID,
  resolveAvatarsSchema,
  updateAvatarSchema,
  updateMailSettingsSchema,
  updateSenderNameSchema,
  type MailboxAccount,
  type MeProfile,
} from "@mailflare/shared";
import type { AppEnv } from "../env.js";
import { sanitizeOutboundHtml } from "../lib/sanitize.js";
import { avatarKey, base64ToBytes } from "../lib/storage.js";
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

  /** 侧栏账号切换器：自有邮箱 + 被授权的公共邮箱 */
  .get("/accounts", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const [owned, shared] = await Promise.all([
      db
        .select({
          id: emailAddresses.id,
          address: emailAddresses.address,
          isPrimary: emailAddresses.isPrimary,
          senderName: emailAddresses.senderName,
        })
        .from(emailAddresses)
        .where(
          and(
            eq(emailAddresses.userId, u.id),
            eq(emailAddresses.type, "mailbox"),
            eq(emailAddresses.status, "active"),
          ),
        ),
      db
        .select({
          id: emailAddresses.id,
          address: emailAddresses.address,
          senderName: emailAddresses.senderName,
          canSend: mailboxMembers.canSend,
        })
        .from(mailboxMembers)
        .innerJoin(emailAddresses, eq(mailboxMembers.addressId, emailAddresses.id))
        .where(and(eq(mailboxMembers.userId, u.id), eq(emailAddresses.status, "active"))),
    ]);

    const accounts: MailboxAccount[] = [
      ...owned.map((a) => ({
        id: a.id,
        address: a.address,
        kind: "personal" as const,
        isPrimary: a.isPrimary,
        canSend: true,
        senderName: a.senderName,
      })),
      ...shared.map((a) => ({
        id: a.id,
        address: a.address,
        kind: "shared" as const,
        isPrimary: false,
        canSend: a.canSend,
        senderName: a.senderName,
      })),
    ];
    // 主邮箱优先，其余按地址排序
    accounts.sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.address.localeCompare(b.address),
    );
    return c.json(accounts);
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
  })

  /** 上传/更换头像：存 R2，并把 user.image 指向服务地址（带 v= 破缓存） */
  .put("/avatar", zValidator("json", updateAvatarSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const { contentType, imageBase64 } = c.req.valid("json");
    const bytes = base64ToBytes(imageBase64);
    await c.env.RAW_EMAILS.put(avatarKey(u.id), bytes, {
      httpMetadata: { contentType, cacheControl: "public, max-age=86400" },
    });
    const image = `${c.env.API_ORIGIN}/api/public/avatars/${u.id}?v=${crypto.randomUUID().slice(0, 8)}`;
    await db.update(user).set({ image }).where(eq(user.id, u.id));
    return c.json({ image });
  })

  /** 移除头像 */
  .delete("/avatar", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    await c.env.RAW_EMAILS.delete(avatarKey(u.id));
    await db.update(user).set({ image: null }).where(eq(user.id, u.id));
    return c.json({ ok: true });
  })

  /**
   * 头像目录解析：按邮箱地址批量查本系统用户头像（同 Google 域内目录做法）。
   * 命中来源：邮箱地址表（发件/收件地址）或用户登录邮箱。
   */
  .post("/avatars", zValidator("json", resolveAvatarsSchema), async (c) => {
    const db = c.var.db;
    const { emails } = c.req.valid("json");
    const [byLogin, byAddr] = await Promise.all([
      db
        .select({ email: user.email, image: user.image })
        .from(user)
        .where(inArray(user.email, emails)),
      db
        .select({ email: emailAddresses.address, image: user.image })
        .from(emailAddresses)
        .innerJoin(user, eq(emailAddresses.userId, user.id))
        .where(inArray(emailAddresses.address, emails)),
    ]);
    const map: Record<string, string> = {};
    // 地址表命中更具体，放后面覆盖登录邮箱命中
    for (const r of [...byLogin, ...byAddr]) {
      if (r.image) map[r.email.toLowerCase()] = r.image;
    }
    return c.json(map);
  });
