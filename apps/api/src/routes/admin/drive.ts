import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  departments,
  driveGroupMembers,
  driveNodeGrants,
  driveNodes,
  drivePermissionGroups,
  driveSpaces,
  user,
} from "@mailflare/db";
import {
  addGroupMemberSchema,
  createGroupSchema,
  createSpaceSchema,
  grantNodeSchema,
  updateGroupSchema,
  updateSpaceSchema,
  type DriveGrant,
  type DriveGroupMember,
  type DrivePermissionGroup,
} from "@mailflare/shared";
import type { DriveRole } from "@mailflare/shared";
import type { AppEnv } from "../../env.js";
import { audit } from "../../lib/audit.js";

/** 网盘管理（admin）：组织/部门空间、权限组、成员、节点授权 */
export const driveAdminRoutes = new Hono<AppEnv>()
  // ---------- 空间（org / department） ----------
  .get("/spaces", async (c) => {
    const rows = await c.var.db
      .select({
        id: driveSpaces.id,
        type: driveSpaces.type,
        name: driveSpaces.name,
        ownerUserId: driveSpaces.ownerUserId,
        departmentId: driveSpaces.departmentId,
        departmentName: departments.name,
        quotaBytes: driveSpaces.quotaBytes,
        usedBytes: driveSpaces.usedBytes,
        createdAt: driveSpaces.createdAt,
      })
      .from(driveSpaces)
      .leftJoin(departments, eq(driveSpaces.departmentId, departments.id))
      .where(inArray(driveSpaces.type, ["org", "department"]))
      .orderBy(driveSpaces.createdAt);
    return c.json(rows);
  })

  .post("/spaces", zValidator("json", createSpaceSchema), async (c) => {
    const db = c.var.db;
    const v = c.req.valid("json");
    if (v.type === "department" && v.departmentId) {
      const dept = await db.query.departments.findFirst({
        where: eq(departments.id, v.departmentId),
      });
      if (!dept) return c.json({ error: "部门不存在" }, 404);
      const dup = await db.query.driveSpaces.findFirst({
        where: and(eq(driveSpaces.type, "department"), eq(driveSpaces.departmentId, v.departmentId)),
      });
      if (dup) return c.json({ error: "该部门已有部门空间" }, 409);
    }
    const [row] = await db
      .insert(driveSpaces)
      .values({
        type: v.type,
        name: v.name,
        departmentId: v.type === "department" ? v.departmentId! : null,
        quotaBytes: v.quotaBytes ?? null,
      })
      .returning();
    await audit(db, c.var.user!.id, "drive.space.create", "drive_space", row!.id, {
      type: v.type,
      name: v.name,
    });
    return c.json(row, 201);
  })

  .patch("/spaces/:id", zValidator("json", updateSpaceSchema), async (c) => {
    const db = c.var.db;
    const v = c.req.valid("json");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (v.name !== undefined) patch.name = v.name;
    if (v.quotaBytes !== undefined) patch.quotaBytes = v.quotaBytes;
    const [row] = await db
      .update(driveSpaces)
      .set(patch)
      .where(eq(driveSpaces.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "空间不存在" }, 404);
    await audit(db, c.var.user!.id, "drive.space.update", "drive_space", row.id, patch);
    return c.json(row);
  })

  .delete("/spaces/:id", async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const space = await db.query.driveSpaces.findFirst({ where: eq(driveSpaces.id, id) });
    if (!space) return c.json({ error: "空间不存在" }, 404);
    if (space.type === "personal") return c.json({ error: "不能删除个人空间" }, 422);
    // 删除该空间下所有文件的 R2 对象
    const files = await db
      .select({ key: driveNodes.r2ObjectKey })
      .from(driveNodes)
      .where(and(eq(driveNodes.spaceId, id), eq(driveNodes.type, "file")));
    const keys = files.map((f) => f.key).filter((k): k is string => !!k && k !== "pending");
    if (keys.length) await c.env.RAW_EMAILS.delete(keys);
    await db.delete(driveSpaces).where(eq(driveSpaces.id, id));
    await audit(db, c.var.user!.id, "drive.space.delete", "drive_space", id);
    return c.json({ ok: true });
  })

  /** 空间内的节点树（供 admin 授权时选择文件/文件夹） */
  .get("/spaces/:id/nodes", async (c) => {
    const rows = await c.var.db
      .select({
        id: driveNodes.id,
        parentId: driveNodes.parentId,
        type: driveNodes.type,
        name: driveNodes.name,
      })
      .from(driveNodes)
      .where(and(eq(driveNodes.spaceId, c.req.param("id")), eq(driveNodes.isTrashed, false)))
      .orderBy(driveNodes.type, driveNodes.name);
    return c.json(rows);
  })

  // ---------- 权限组 ----------
  .get("/groups", async (c) => {
    const rows = await c.var.db
      .select({
        id: drivePermissionGroups.id,
        name: drivePermissionGroups.name,
        description: drivePermissionGroups.description,
        memberCount: sql<number>`count(${driveGroupMembers.userId})::int`,
      })
      .from(drivePermissionGroups)
      .leftJoin(driveGroupMembers, eq(driveGroupMembers.groupId, drivePermissionGroups.id))
      .groupBy(drivePermissionGroups.id)
      .orderBy(drivePermissionGroups.name);
    return c.json(rows satisfies DrivePermissionGroup[]);
  })

  .post("/groups", zValidator("json", createGroupSchema), async (c) => {
    const db = c.var.db;
    const v = c.req.valid("json");
    const dup = await db.query.drivePermissionGroups.findFirst({
      where: eq(drivePermissionGroups.name, v.name),
    });
    if (dup) return c.json({ error: "权限组名已存在" }, 409);
    const [row] = await db
      .insert(drivePermissionGroups)
      .values({ name: v.name, description: v.description ?? null })
      .returning();
    await audit(db, c.var.user!.id, "drive.group.create", "drive_group", row!.id, { name: v.name });
    return c.json(row, 201);
  })

  .patch("/groups/:id", zValidator("json", updateGroupSchema), async (c) => {
    const db = c.var.db;
    const v = c.req.valid("json");
    const [row] = await db
      .update(drivePermissionGroups)
      .set({ ...v, updatedAt: new Date() })
      .where(eq(drivePermissionGroups.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "权限组不存在" }, 404);
    return c.json(row);
  })

  .delete("/groups/:id", async (c) => {
    const db = c.var.db;
    const [row] = await db
      .delete(drivePermissionGroups)
      .where(eq(drivePermissionGroups.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "权限组不存在" }, 404);
    await audit(db, c.var.user!.id, "drive.group.delete", "drive_group", row.id);
    return c.json({ ok: true });
  })

  /** 权限组成员 */
  .get("/groups/:id/members", async (c) => {
    const rows = await c.var.db
      .select({ userId: user.id, name: user.name, email: user.email })
      .from(driveGroupMembers)
      .innerJoin(user, eq(driveGroupMembers.userId, user.id))
      .where(eq(driveGroupMembers.groupId, c.req.param("id")))
      .orderBy(user.name);
    return c.json(rows satisfies DriveGroupMember[]);
  })

  .post("/groups/:id/members", zValidator("json", addGroupMemberSchema), async (c) => {
    const db = c.var.db;
    const groupId = c.req.param("id");
    const v = c.req.valid("json");
    const target = await db.query.user.findFirst({ where: eq(user.id, v.userId) });
    if (!target) return c.json({ error: "用户不存在" }, 404);
    await db
      .insert(driveGroupMembers)
      .values({ groupId, userId: v.userId })
      .onConflictDoNothing({ target: [driveGroupMembers.groupId, driveGroupMembers.userId] });
    await audit(db, c.var.user!.id, "drive.group.member.add", "drive_group", groupId, {
      userId: v.userId,
    });
    return c.json({ ok: true }, 201);
  })

  .delete("/groups/:id/members/:userId", async (c) => {
    const db = c.var.db;
    const groupId = c.req.param("id");
    const userId = c.req.param("userId");
    await db
      .delete(driveGroupMembers)
      .where(and(eq(driveGroupMembers.groupId, groupId), eq(driveGroupMembers.userId, userId)));
    await audit(db, c.var.user!.id, "drive.group.member.remove", "drive_group", groupId, { userId });
    return c.json({ ok: true });
  })

  // ---------- 节点授权（主体：组 / 部门 / 用户） ----------
  .get("/nodes/:id/grants", async (c) => {
    const db = c.var.db;
    const nodeId = c.req.param("id");
    const rows = await db
      .select({
        id: driveNodeGrants.id,
        nodeId: driveNodeGrants.nodeId,
        groupId: driveNodeGrants.groupId,
        departmentId: driveNodeGrants.departmentId,
        userId: driveNodeGrants.userId,
        role: driveNodeGrants.role,
        groupName: drivePermissionGroups.name,
        departmentName: departments.name,
        userName: user.name,
      })
      .from(driveNodeGrants)
      .leftJoin(drivePermissionGroups, eq(driveNodeGrants.groupId, drivePermissionGroups.id))
      .leftJoin(departments, eq(driveNodeGrants.departmentId, departments.id))
      .leftJoin(user, eq(driveNodeGrants.userId, user.id))
      .where(eq(driveNodeGrants.nodeId, nodeId));
    const out: DriveGrant[] = rows.map((r) => ({
      id: r.id,
      nodeId: r.nodeId,
      subject: r.groupId ? "group" : r.departmentId ? "department" : "user",
      groupId: r.groupId,
      departmentId: r.departmentId,
      userId: r.userId,
      label: r.groupName ?? r.departmentName ?? r.userName ?? "未知",
      role: r.role as DriveRole,
    }));
    return c.json(out);
  })

  .post("/nodes/:id/grants", zValidator("json", grantNodeSchema), async (c) => {
    const db = c.var.db;
    const nodeId = c.req.param("id");
    const v = c.req.valid("json");
    const node = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, nodeId) });
    if (!node) return c.json({ error: "节点不存在" }, 404);
    const [row] = await db
      .insert(driveNodeGrants)
      .values({
        nodeId,
        groupId: v.groupId ?? null,
        departmentId: v.departmentId ?? null,
        userId: v.userId ?? null,
        role: v.role,
        createdByUserId: c.var.user!.id,
      })
      .returning();
    await audit(db, c.var.user!.id, "drive.grant.create", "drive_node", nodeId, {
      groupId: v.groupId,
      departmentId: v.departmentId,
      userId: v.userId,
      role: v.role,
    });
    return c.json(row, 201);
  })

  .delete("/grants/:grantId", async (c) => {
    const db = c.var.db;
    const [row] = await db
      .delete(driveNodeGrants)
      .where(eq(driveNodeGrants.id, c.req.param("grantId")))
      .returning();
    if (!row) return c.json({ error: "授权不存在" }, 404);
    await audit(db, c.var.user!.id, "drive.grant.delete", "drive_node", row.nodeId);
    return c.json({ ok: true });
  });
