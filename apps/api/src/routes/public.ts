import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  domains,
  driveNodes,
  driveShares,
  inviteCodes,
  systemSettings,
  user,
} from "@mailflare/db";
import type { DriveNode as DriveNodeRow, DriveShare as DriveShareRow } from "@mailflare/db";
import {
  SYSTEM_SETTINGS_ID,
  signUpSchema,
  unlockShareSchema,
  validateInviteSchema,
  type BrandingConfig,
  type InviteValidationResult,
  type PublicShareMeta,
  type RegistrationConfig,
  type RegistrationMode,
} from "@mailflare/shared";
import type { AppEnv } from "../env.js";
import { sha256Hex } from "../lib/drive.js";
import { avatarKey } from "../lib/storage.js";

/** 载入有效分享（未撤销、未过期）+ 节点。 */
async function loadShare(
  db: AppEnv["Variables"]["db"],
  token: string,
): Promise<{ share: DriveShareRow; node: DriveNodeRow; expired: boolean } | null> {
  const share = await db.query.driveShares.findFirst({ where: eq(driveShares.token, token) });
  if (!share || share.revokedAt) return null;
  const node = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, share.nodeId) });
  if (!node || node.isTrashed) return null;
  const expired = !!share.expiresAt && share.expiresAt.getTime() < Date.now();
  return { share, node, expired };
}

function nodeMeta(node: DriveNodeRow): NonNullable<PublicShareMeta["node"]> {
  return {
    id: node.id,
    name: node.name,
    type: node.type as "folder" | "file",
    sizeBytes: node.sizeBytes,
    mimeType: node.mimeType,
  };
}

/** 校验分享密码（无密码则恒通过）。 */
async function checkSharePassword(share: DriveShareRow, password: string | undefined): Promise<boolean> {
  if (!share.passwordHash) return true;
  if (!password) return false;
  return (await sha256Hex(password)) === share.passwordHash;
}

/** nodeId 是否在 rootId 的子树内（含自身）。 */
async function isWithinSubtree(
  db: AppEnv["Variables"]["db"],
  rootId: string,
  nodeId: string,
): Promise<boolean> {
  let cur: string | null = nodeId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === rootId) return true;
    seen.add(cur);
    const n: { parentId: string | null } | undefined = await db.query.driveNodes.findFirst({
      where: eq(driveNodes.id, cur),
      columns: { parentId: true },
    });
    cur = n?.parentId ?? null;
  }
  return false;
}

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

  // ---------- 对外分享（免登录） ----------

  /** 分享落地页元数据：是否需要密码、是否过期、（免密时）节点信息 */
  .get("/drive/shares/:token", async (c) => {
    const found = await loadShare(c.var.db, c.req.param("token"));
    if (!found) return c.json({ error: "分享不存在或已失效" }, 404);
    const { share, node, expired } = found;
    const meta: PublicShareMeta = {
      needsPassword: !!share.passwordHash,
      allowDownload: share.allowDownload,
      expired,
      ...(share.passwordHash || expired ? {} : { node: nodeMeta(node) }),
    };
    return c.json(meta);
  })

  /** 提交密码解锁，返回节点信息 */
  .post("/drive/shares/:token/unlock", zValidator("json", unlockShareSchema), async (c) => {
    const found = await loadShare(c.var.db, c.req.param("token"));
    if (!found) return c.json({ error: "分享不存在或已失效" }, 404);
    const { share, node, expired } = found;
    if (expired) return c.json({ error: "分享已过期" }, 410);
    if (!(await checkSharePassword(share, c.req.valid("json").password))) {
      return c.json({ error: "密码错误" }, 403);
    }
    const meta: PublicShareMeta = {
      needsPassword: true,
      allowDownload: share.allowDownload,
      expired: false,
      node: nodeMeta(node),
    };
    return c.json(meta);
  })

  /** 浏览被分享文件夹的子节点 */
  .get("/drive/shares/:token/nodes", async (c) => {
    const db = c.var.db;
    const found = await loadShare(db, c.req.param("token"));
    if (!found) return c.json({ error: "分享不存在或已失效" }, 404);
    const { share, node, expired } = found;
    if (expired) return c.json({ error: "分享已过期" }, 410);
    if (!(await checkSharePassword(share, c.req.query("password")))) {
      return c.json({ error: "需要密码" }, 403);
    }
    if (node.type !== "folder") return c.json({ items: [] });
    const parentId = c.req.query("parentId") || node.id;
    if (parentId !== node.id && !(await isWithinSubtree(db, node.id, parentId))) {
      return c.json({ error: "越权访问" }, 403);
    }
    const rows = await db
      .select()
      .from(driveNodes)
      .where(
        and(
          eq(driveNodes.parentId, parentId),
          eq(driveNodes.isTrashed, false),
        ),
      )
      .orderBy(driveNodes.type, driveNodes.name);
    return c.json({
      items: rows.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        sizeBytes: n.sizeBytes,
        mimeType: n.mimeType,
        parentId: n.parentId,
      })),
    });
  })

  /** 下载/预览分享中的某个文件（file 必须在分享子树内） */
  .get("/drive/shares/:token/content", async (c) => {
    const db = c.var.db;
    const found = await loadShare(db, c.req.param("token"));
    if (!found) return c.json({ error: "分享不存在或已失效" }, 404);
    const { share, node, expired } = found;
    if (expired) return c.json({ error: "分享已过期" }, 410);
    if (!(await checkSharePassword(share, c.req.query("password")))) {
      return c.json({ error: "需要密码" }, 403);
    }
    const wantDownload = !!c.req.query("download");
    if (wantDownload && !share.allowDownload) return c.json({ error: "该分享禁止下载" }, 403);

    // 目标文件：分享的是文件则取自身；是文件夹则取指定 nodeId（须在子树内）
    let fileNode = node;
    const nid = c.req.query("nodeId");
    if (node.type === "folder") {
      if (!nid) return c.json({ error: "缺少 nodeId" }, 400);
      if (!(await isWithinSubtree(db, node.id, nid))) return c.json({ error: "越权访问" }, 403);
      const f = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, nid) });
      if (!f || f.isTrashed) return c.json({ error: "文件不存在" }, 404);
      fileNode = f;
    }
    if (fileNode.type !== "file" || !fileNode.r2ObjectKey) return c.json({ error: "不是文件" }, 400);
    const obj = await c.env.RAW_EMAILS.get(fileNode.r2ObjectKey);
    if (!obj) return c.json({ error: "文件内容缺失" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": fileNode.mimeType ?? "application/octet-stream",
        "Content-Disposition": `${wantDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileNode.name)}`,
      },
    });
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
