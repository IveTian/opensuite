import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  domains,
  emailAddresses,
  oauthApplication,
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
import { readableAddressIds, sendableAddressIds } from "../lib/mailbox-access.js";
import { sanitizeOutboundHtml } from "../lib/sanitize.js";
import { avatarKey, base64ToBytes } from "../lib/storage.js";
import { loadUser, requireAuth } from "../middleware/auth.js";
import { messageRoutes } from "./messages.js";

/** 用户自助：需登录 */
export const meRoutes = new Hono<AppEnv>()
  .use("*", loadUser, requireAuth)
  .route("/messages", messageRoutes)

  /** 实时通道：升级为 WebSocket 并路由到当前用户的 Durable Object */
  .get("/ws", (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.json({ error: "expected websocket" }, 426);
    }
    const ns = c.env.USER_HUB;
    const stub = ns.get(ns.idFromName(c.var.user!.id));
    return stub.fetch(c.req.raw);
  })

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

  /**
   * 应用中心（Launchpad）的第三方 SSO 磁贴：已启用、且管理员标记 showInLauncher 并配了 launchUrl 的 OIDC 应用。
   * 点击磁贴即跳到应用自身的登录地址，应用再走标准 OIDC 回到 MailFlare（已登录 + 已授权则无感直达）。
   */
  .get("/sso-apps", async (c) => {
    const rows = await c.var.db
      .select({
        clientId: oauthApplication.clientId,
        name: oauthApplication.name,
        icon: oauthApplication.icon,
        disabled: oauthApplication.disabled,
        metadata: oauthApplication.metadata,
      })
      .from(oauthApplication);
    const apps = rows
      .filter((r) => !r.disabled)
      .map((r) => {
        let launchUrl: string | null = null;
        let showInLauncher = false;
        if (r.metadata) {
          try {
            const m = JSON.parse(r.metadata) as { launchUrl?: string; showInLauncher?: boolean };
            launchUrl = typeof m.launchUrl === "string" ? m.launchUrl : null;
            showInLauncher = Boolean(m.showInLauncher);
          } catch {
            /* metadata 非法 JSON 时忽略 */
          }
        }
        return { clientId: r.clientId, name: r.name, icon: r.icon, launchUrl, showInLauncher };
      })
      .filter((a) => a.showInLauncher && a.launchUrl);
    return c.json(apps);
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

  /** OIDC 同意页展示用：按 clientId 取应用名与图标（需登录，不泄露 secret） */
  .get("/oauth-clients/:clientId", async (c) => {
    const app = await c.var.db.query.oauthApplication.findFirst({
      where: eq(oauthApplication.clientId, c.req.param("clientId")),
      columns: { name: true, icon: true, disabled: true },
    });
    if (!app || app.disabled) return c.json({ error: "应用不存在" }, 404);
    return c.json({ name: app.name, icon: app.icon });
  })

  /** 侧栏账号切换器：自有邮箱 + 被授权的公共邮箱 */
  .get("/accounts", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const [owned, readable, sendable] = await Promise.all([
      db
        .select({
          id: emailAddresses.id,
          address: emailAddresses.address,
          isPrimary: emailAddresses.isPrimary,
          senderName: emailAddresses.senderName,
          sharedSignatureHtml: emailAddresses.sharedSignatureHtml,
          sharedDisablePersonalSignature: emailAddresses.sharedDisablePersonalSignature,
        })
        .from(emailAddresses)
        .where(
          and(
            eq(emailAddresses.userId, u.id),
            eq(emailAddresses.type, "mailbox"),
            eq(emailAddresses.status, "active"),
          ),
        ),
      readableAddressIds(db, u.id),
      sendableAddressIds(db, u.id),
    ]);
    const ownedIds = new Set(owned.map((a) => a.id));
    const sharedIds = readable.filter((id) => !ownedIds.has(id));
    const sendableSet = new Set(sendable);
    const shared = sharedIds.length
      ? await db
          .select({
            id: emailAddresses.id,
            address: emailAddresses.address,
            senderName: emailAddresses.senderName,
            sharedSignatureHtml: emailAddresses.sharedSignatureHtml,
            sharedDisablePersonalSignature: emailAddresses.sharedDisablePersonalSignature,
          })
          .from(emailAddresses)
          .where(
            and(
              inArray(emailAddresses.id, sharedIds),
              eq(emailAddresses.type, "shared"),
              eq(emailAddresses.status, "active"),
            ),
          )
      : [];

    const accounts: MailboxAccount[] = [
      ...owned.map((a) => ({
        id: a.id,
        address: a.address,
        kind: "personal" as const,
        isPrimary: a.isPrimary,
        canSend: true,
        senderName: a.senderName,
        sharedSignatureHtml: a.sharedSignatureHtml,
        sharedDisablePersonalSignature: a.sharedDisablePersonalSignature,
      })),
      ...shared.map((a) => ({
        id: a.id,
        address: a.address,
        kind: "shared" as const,
        isPrimary: false,
        canSend: sendableSet.has(a.id),
        senderName: a.senderName,
        sharedSignatureHtml: a.sharedSignatureHtml,
        sharedDisablePersonalSignature: a.sharedDisablePersonalSignature,
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
