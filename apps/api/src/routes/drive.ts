import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  departments,
  driveNodeGrants,
  driveNodes,
  driveShares,
  driveSpaces,
  user,
} from "@mailflare/db";
import type {
  DriveNode as DriveNodeRow,
  DriveSpace as DriveSpaceRow,
} from "@mailflare/db";
import {
  DRIVE_MAX_UPLOAD_BYTES,
  createFolderSchema,
  createShareSchema,
  moveNodeSchema,
  renameNodeSchema,
  shareInternalSchema,
  type DriveNode as DriveNodeDto,
  type DriveQuota,
  type DriveShare as DriveShareDto,
  type DriveSpace as DriveSpaceDto,
} from "@mailflare/shared";
import type { DriveRole } from "@mailflare/shared";
import type { AppEnv } from "../env.js";
import {
  DriveError,
  addUsage,
  assertQuota,
  breadcrumb,
  effectiveSpaceQuota,
  genShareToken,
  getOrCreatePersonalSpace,
  listAccessibleSpaces,
  listChildren,
  loadDriveCtx,
  resolveNodeRole,
  sha256Hex,
  spaceBaseRole,
} from "../lib/drive.js";
import type { DriveCtx } from "../lib/drive.js";
import { loadUser, requireAuth } from "../middleware/auth.js";
import { driveKey } from "../lib/storage.js";

const RANK: Record<DriveRole, number> = { viewer: 1, editor: 2 };

function toSpaceDto(
  space: DriveSpaceRow,
  role: DriveRole,
  userId: string,
  quotaBytes: number | null,
  departmentName: string | null,
): DriveSpaceDto {
  return {
    id: space.id,
    type: space.type as DriveSpaceDto["type"],
    name: space.name,
    ownerUserId: space.ownerUserId,
    departmentId: space.departmentId,
    departmentName,
    quotaBytes,
    usedBytes: space.usedBytes,
    role,
    isOwner: space.type === "personal" && space.ownerUserId === userId,
  };
}

function toNodeDto(node: DriveNodeRow, role: DriveRole, ownerName: string | null): DriveNodeDto {
  return {
    id: node.id,
    spaceId: node.spaceId,
    parentId: node.parentId,
    type: node.type as DriveNodeDto["type"],
    name: node.name,
    ownerUserId: node.ownerUserId,
    ownerName,
    sizeBytes: node.sizeBytes,
    mimeType: node.mimeType,
    isTrashed: node.isTrashed,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
    role,
  };
}

/** 载入节点 + 空间 + 有效角色，并校验最低权限。 */
async function loadNodeAccess(
  db: AppEnv["Variables"]["db"],
  ctx: DriveCtx,
  nodeId: string,
  min: DriveRole,
): Promise<{ node: DriveNodeRow; space: DriveSpaceRow; role: DriveRole }> {
  const node = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, nodeId) });
  if (!node) throw new DriveError("文件不存在", 404);
  const space = await db.query.driveSpaces.findFirst({ where: eq(driveSpaces.id, node.spaceId) });
  if (!space) throw new DriveError("空间不存在", 404);
  const role = await resolveNodeRole(db, node, ctx, space);
  if (!role) throw new DriveError("无权访问", 403);
  if (RANK[role] < RANK[min]) throw new DriveError("无写入权限（只读）", 403);
  return { node, space, role };
}

/** 批量取用户显示名。 */
async function ownerNameMap(
  db: AppEnv["Variables"]["db"],
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, uniq));
  return new Map(rows.map((r) => [r.id, r.name]));
}

function handleErr(c: Context<AppEnv>, err: unknown) {
  if (err instanceof DriveError) return c.json({ error: err.message }, err.status);
  return c.json({ error: err instanceof Error ? err.message : "操作失败" }, 500);
}

function isAdmin(c: Context<AppEnv>): boolean {
  return (c.var.user?.role as string | undefined) === "admin";
}

export const driveRoutes = new Hono<AppEnv>()
  .use("*", loadUser, requireAuth)

  /** 个人网盘配额 */
  .get("/quota", async (c) => {
    const db = c.var.db;
    const space = await getOrCreatePersonalSpace(db, c.var.user!.id);
    const limit = await effectiveSpaceQuota(db, space);
    const out: DriveQuota = { quotaBytes: limit ?? 0, usedBytes: space.usedBytes };
    return c.json(out);
  })

  /** 可访问空间列表（自动懒创建个人空间） */
  .get("/spaces", async (c) => {
    const db = c.var.db;
    const uid = c.var.user!.id;
    await getOrCreatePersonalSpace(db, uid);
    const ctx = await loadDriveCtx(db, uid, isAdmin(c));
    const spaces = await listAccessibleSpaces(db, ctx);
    const deptIds = spaces
      .map((s) => s.space.departmentId)
      .filter((x): x is string => !!x);
    const deptMap = new Map<string, string>();
    if (deptIds.length) {
      const rows = await db
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .where(inArray(departments.id, deptIds));
      for (const r of rows) deptMap.set(r.id, r.name);
    }
    const out: DriveSpaceDto[] = [];
    for (const { space, role } of spaces) {
      const limit = await effectiveSpaceQuota(db, space);
      out.push(toSpaceDto(space, role, uid, limit, space.departmentId ? deptMap.get(space.departmentId) ?? null : null));
    }
    // 个人空间置顶
    out.sort((a, b) => (a.type === "personal" ? -1 : b.type === "personal" ? 1 : a.name.localeCompare(b.name)));
    return c.json(out);
  })

  /** 列目录（父文件夹或空间根） + 面包屑 */
  .get("/spaces/:spaceId/nodes", async (c) => {
    try {
      const db = c.var.db;
      const uid = c.var.user!.id;
      const spaceId = c.req.param("spaceId");
      const parentId = c.req.query("parentId") || null;
      const space = await db.query.driveSpaces.findFirst({ where: eq(driveSpaces.id, spaceId) });
      if (!space) return c.json({ error: "空间不存在" }, 404);
      const ctx = await loadDriveCtx(db, uid, isAdmin(c));
      const children = await listChildren(db, ctx, space, parentId);
      const names = await ownerNameMap(db, children.map((x) => x.node.ownerUserId));
      const items = children.map((x) => toNodeDto(x.node, x.role, x.node.ownerUserId ? names.get(x.node.ownerUserId) ?? null : null));
      const crumb = parentId ? await breadcrumb(db, parentId) : [];
      return c.json({ items, breadcrumb: crumb });
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 新建文件夹 */
  .post("/folders", zValidator("json", createFolderSchema), async (c) => {
    try {
      const db = c.var.db;
      const uid = c.var.user!.id;
      const v = c.req.valid("json");
      const space = await db.query.driveSpaces.findFirst({ where: eq(driveSpaces.id, v.spaceId) });
      if (!space) return c.json({ error: "空间不存在" }, 404);
      const ctx = await loadDriveCtx(db, uid, isAdmin(c));
      await assertContainerWritable(db, ctx, space, v.parentId ?? null);
      const [row] = await db
        .insert(driveNodes)
        .values({
          spaceId: space.id,
          parentId: v.parentId ?? null,
          type: "folder",
          name: v.name,
          ownerUserId: uid,
        })
        .returning();
      return c.json(toNodeDto(row!, "editor", c.var.user!.name), 201);
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 上传文件（原始二进制；headers 传空间/父/文件名/类型） */
  .post("/files", async (c) => {
    try {
      const db = c.var.db;
      const uid = c.var.user!.id;
      const spaceId = c.req.header("x-space-id");
      const parentId = c.req.header("x-parent-id") || null;
      const rawName = c.req.header("x-filename");
      if (!spaceId || !rawName) return c.json({ error: "缺少上传头 x-space-id / x-filename" }, 400);
      const filename = decodeURIComponent(rawName);
      const mimeType = c.req.header("content-type") || "application/octet-stream";
      const declaredLen = Number(c.req.header("content-length") ?? 0);
      if (declaredLen > DRIVE_MAX_UPLOAD_BYTES) {
        return c.json({ error: `单文件不能超过 ${Math.floor(DRIVE_MAX_UPLOAD_BYTES / 1024 / 1024)}MB` }, 413);
      }
      const space = await db.query.driveSpaces.findFirst({ where: eq(driveSpaces.id, spaceId) });
      if (!space) return c.json({ error: "空间不存在" }, 404);
      const ctx = await loadDriveCtx(db, uid, isAdmin(c));
      await assertContainerWritable(db, ctx, space, parentId);

      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const size = bytes.byteLength;
      if (size > DRIVE_MAX_UPLOAD_BYTES) {
        return c.json({ error: `单文件不能超过 ${Math.floor(DRIVE_MAX_UPLOAD_BYTES / 1024 / 1024)}MB` }, 413);
      }
      await assertQuota(db, space, size);

      const [row] = await db
        .insert(driveNodes)
        .values({
          spaceId: space.id,
          parentId,
          type: "file",
          name: filename,
          ownerUserId: uid,
          sizeBytes: size,
          mimeType,
          r2ObjectKey: "pending",
        })
        .returning();
      const key = driveKey(space.id, row!.id);
      await c.env.RAW_EMAILS.put(key, bytes, { httpMetadata: { contentType: mimeType } });
      await db.update(driveNodes).set({ r2ObjectKey: key }).where(eq(driveNodes.id, row!.id));
      await addUsage(db, space, size);
      return c.json(toNodeDto({ ...row!, r2ObjectKey: key }, "editor", c.var.user!.name), 201);
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 节点元数据 */
  .get("/nodes/:id", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node, role } = await loadNodeAccess(db, ctx, c.req.param("id"), "viewer");
      const names = await ownerNameMap(db, [node.ownerUserId]);
      return c.json(toNodeDto(node, role, node.ownerUserId ? names.get(node.ownerUserId) ?? null : null));
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 下载 / 预览文件内容 */
  .get("/nodes/:id/content", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "viewer");
      if (node.type !== "file" || !node.r2ObjectKey) return c.json({ error: "不是文件" }, 400);
      const obj = await c.env.RAW_EMAILS.get(node.r2ObjectKey);
      if (!obj) return c.json({ error: "文件内容缺失" }, 404);
      const disposition = c.req.query("download") ? "attachment" : "inline";
      return new Response(obj.body, {
        headers: {
          "Content-Type": node.mimeType ?? "application/octet-stream",
          "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(node.name)}`,
        },
      });
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 重命名 */
  .patch("/nodes/:id", zValidator("json", renameNodeSchema), async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      const [row] = await db
        .update(driveNodes)
        .set({ name: c.req.valid("json").name, updatedAt: new Date() })
        .where(eq(driveNodes.id, node.id))
        .returning();
      return c.json(toNodeDto(row!, "editor", null));
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 移动到另一文件夹（同空间，禁止移入自身子树） */
  .post("/nodes/:id/move", zValidator("json", moveNodeSchema), async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node, space } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      const targetParentId = c.req.valid("json").parentId;
      if (targetParentId) {
        const target = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, targetParentId) });
        if (!target || target.spaceId !== space.id || target.type !== "folder") {
          return c.json({ error: "目标文件夹无效" }, 422);
        }
        // 禁止移入自身或后代
        const crumb = await breadcrumb(db, targetParentId);
        if (targetParentId === node.id || crumb.some((x) => x.id === node.id)) {
          return c.json({ error: "不能移动到自身或其子文件夹" }, 422);
        }
        await assertContainerWritable(db, ctx, space, targetParentId);
      }
      const [row] = await db
        .update(driveNodes)
        .set({ parentId: targetParentId, updatedAt: new Date() })
        .where(eq(driveNodes.id, node.id))
        .returning();
      return c.json(toNodeDto(row!, "editor", null));
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 移入回收站（软删） */
  .delete("/nodes/:id", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      await db
        .update(driveNodes)
        .set({ isTrashed: true, updatedAt: new Date() })
        .where(eq(driveNodes.id, node.id));
      return c.json({ ok: true });
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 从回收站还原 */
  .post("/nodes/:id/restore", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      await db
        .update(driveNodes)
        .set({ isTrashed: false, updatedAt: new Date() })
        .where(eq(driveNodes.id, node.id));
      return c.json({ ok: true });
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 回收站列表 */
  .get("/spaces/:spaceId/trash", async (c) => {
    try {
      const db = c.var.db;
      const uid = c.var.user!.id;
      const spaceId = c.req.param("spaceId");
      const space = await db.query.driveSpaces.findFirst({ where: eq(driveSpaces.id, spaceId) });
      if (!space) return c.json({ error: "空间不存在" }, 404);
      const ctx = await loadDriveCtx(db, uid, isAdmin(c));
      // 需对空间有基础写权限或为个人 owner 才展示回收站
      const base = spaceBaseRole(space, ctx);
      if (!base) return c.json({ items: [] });
      const rows = await db
        .select()
        .from(driveNodes)
        .where(and(eq(driveNodes.spaceId, spaceId), eq(driveNodes.isTrashed, true)))
        .orderBy(desc(driveNodes.updatedAt));
      const names = await ownerNameMap(db, rows.map((r) => r.ownerUserId));
      return c.json({
        items: rows.map((r) => toNodeDto(r, base, r.ownerUserId ? names.get(r.ownerUserId) ?? null : null)),
      });
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 彻底删除（含子树 + R2 + 回收用量） */
  .delete("/nodes/:id/permanent", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node, space } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      // 收集子树（含自身）
      const toDelete = await collectSubtree(db, node.id);
      const files = toDelete.filter((n) => n.type === "file" && n.r2ObjectKey);
      const totalBytes = files.reduce((s, n) => s + (n.sizeBytes ?? 0), 0);
      const keys = files.map((n) => n.r2ObjectKey!) as string[];
      if (keys.length) await c.env.RAW_EMAILS.delete(keys);
      await db.delete(driveNodes).where(inArray(driveNodes.id, toDelete.map((n) => n.id)));
      if (totalBytes) await addUsage(db, space, -totalBytes);
      return c.json({ ok: true });
    } catch (err) {
      return handleErr(c, err);
    }
  })

  // ---------- 对内分享（直接授权给用户） ----------

  /** 列出节点的授权（需 editor） */
  .get("/nodes/:id/grants", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      const rows = await db
        .select({
          id: driveNodeGrants.id,
          groupId: driveNodeGrants.groupId,
          departmentId: driveNodeGrants.departmentId,
          userId: driveNodeGrants.userId,
          role: driveNodeGrants.role,
          userName: user.name,
        })
        .from(driveNodeGrants)
        .leftJoin(user, eq(driveNodeGrants.userId, user.id))
        .where(eq(driveNodeGrants.nodeId, node.id));
      return c.json(rows);
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 对内分享：把节点授权给某用户 */
  .post("/nodes/:id/share-internal", zValidator("json", shareInternalSchema), async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      const v = c.req.valid("json");
      const [row] = await db
        .insert(driveNodeGrants)
        .values({
          nodeId: node.id,
          userId: v.userId,
          role: v.role,
          createdByUserId: c.var.user!.id,
        })
        .returning();
      return c.json(row, 201);
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 撤销授权 */
  .delete("/grants/:grantId", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const grant = await db.query.driveNodeGrants.findFirst({
        where: eq(driveNodeGrants.id, c.req.param("grantId")),
      });
      if (!grant) return c.json({ error: "授权不存在" }, 404);
      await loadNodeAccess(db, ctx, grant.nodeId, "editor");
      await db.delete(driveNodeGrants).where(eq(driveNodeGrants.id, grant.id));
      return c.json({ ok: true });
    } catch (err) {
      return handleErr(c, err);
    }
  })

  /** 共享给我：直接授权给本人的节点 */
  .get("/shared-with-me", async (c) => {
    const db = c.var.db;
    const uid = c.var.user!.id;
    const rows = await db
      .select({ node: driveNodes, role: driveNodeGrants.role })
      .from(driveNodeGrants)
      .innerJoin(driveNodes, eq(driveNodeGrants.nodeId, driveNodes.id))
      .where(and(eq(driveNodeGrants.userId, uid), eq(driveNodes.isTrashed, false)));
    const names = await ownerNameMap(db, rows.map((r) => r.node.ownerUserId));
    const items = rows.map((r) =>
      toNodeDto(r.node, r.role as DriveRole, r.node.ownerUserId ? names.get(r.node.ownerUserId) ?? null : null),
    );
    return c.json({ items });
  })

  // ---------- 对外分享（公开链接） ----------

  .get("/nodes/:id/shares", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      const rows = await db
        .select()
        .from(driveShares)
        .where(eq(driveShares.nodeId, node.id))
        .orderBy(desc(driveShares.createdAt));
      return c.json(rows.map(toShareDto));
    } catch (err) {
      return handleErr(c, err);
    }
  })

  .post("/nodes/:id/shares", zValidator("json", createShareSchema), async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const { node } = await loadNodeAccess(db, ctx, c.req.param("id"), "editor");
      const v = c.req.valid("json");
      const passwordHash = v.password ? await sha256Hex(v.password) : null;
      const [row] = await db
        .insert(driveShares)
        .values({
          nodeId: node.id,
          token: genShareToken(),
          passwordHash,
          role: v.role,
          allowDownload: v.allowDownload,
          expiresAt: v.expiresAt ?? null,
          createdByUserId: c.var.user!.id,
        })
        .returning();
      return c.json(toShareDto(row!), 201);
    } catch (err) {
      return handleErr(c, err);
    }
  })

  .delete("/shares/:shareId", async (c) => {
    try {
      const db = c.var.db;
      const ctx = await loadDriveCtx(db, c.var.user!.id, isAdmin(c));
      const share = await db.query.driveShares.findFirst({
        where: eq(driveShares.id, c.req.param("shareId")),
      });
      if (!share) return c.json({ error: "分享不存在" }, 404);
      await loadNodeAccess(db, ctx, share.nodeId, "editor");
      await db.delete(driveShares).where(eq(driveShares.id, share.id));
      return c.json({ ok: true });
    } catch (err) {
      return handleErr(c, err);
    }
  });

function toShareDto(row: typeof driveShares.$inferSelect): DriveShareDto {
  return {
    id: row.id,
    nodeId: row.nodeId,
    token: row.token,
    hasPassword: !!row.passwordHash,
    role: row.role as DriveRole,
    allowDownload: row.allowDownload,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

/** 校验用户对某容器（父文件夹或空间根）有写入权限。 */
async function assertContainerWritable(
  db: AppEnv["Variables"]["db"],
  ctx: DriveCtx,
  space: DriveSpaceRow,
  parentId: string | null,
): Promise<void> {
  if (parentId) {
    const parent = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, parentId) });
    if (!parent || parent.spaceId !== space.id) throw new DriveError("父文件夹不存在", 404);
    const role = await resolveNodeRole(db, parent, ctx, space);
    if (!role || RANK[role] < RANK.editor) throw new DriveError("无写入权限", 403);
  } else {
    const base = spaceBaseRole(space, ctx);
    if (!base || RANK[base] < RANK.editor) throw new DriveError("无写入权限（根目录）", 403);
  }
}

/** 收集节点子树（含自身）。 */
async function collectSubtree(
  db: AppEnv["Variables"]["db"],
  rootId: string,
): Promise<DriveNodeRow[]> {
  const root = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, rootId) });
  if (!root) return [];
  const all = await db.select().from(driveNodes).where(eq(driveNodes.spaceId, root.spaceId));
  const childrenOf = new Map<string | null, DriveNodeRow[]>();
  for (const n of all) {
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n);
    childrenOf.set(n.parentId, arr);
  }
  const out: DriveNodeRow[] = [];
  const stack = [root];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    out.push(cur);
    for (const ch of childrenOf.get(cur.id) ?? []) stack.push(ch);
  }
  return out;
}
