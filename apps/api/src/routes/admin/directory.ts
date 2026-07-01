import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  departmentMailboxAccess,
  departments,
  directoryProfiles,
  emailAddresses,
  user,
} from "@mailflare/db";
import {
  setDepartmentMailboxSchema,
  updateDirectoryProfileSchema,
  upsertDepartmentSchema,
  updateMailboxMemberSchema,
} from "@mailflare/shared";
import type { AppEnv } from "../../env.js";
import { audit } from "../../lib/audit.js";

/** 组织通讯录管理（admin）：部门 + 成员组织资料 */
export const directoryRoutes = new Hono<AppEnv>()
  /** 部门列表（含成员数） */
  .get("/departments", async (c) => {
    const rows = await c.var.db
      .select({
        id: departments.id,
        name: departments.name,
        parentId: departments.parentId,
        sortOrder: departments.sortOrder,
        memberCount: sql<number>`count(${directoryProfiles.userId})::int`,
      })
      .from(departments)
      .leftJoin(directoryProfiles, eq(directoryProfiles.departmentId, departments.id))
      .groupBy(departments.id)
      .orderBy(departments.sortOrder, departments.name);
    return c.json(rows);
  })

  /** 新建部门 */
  .post("/departments", zValidator("json", upsertDepartmentSchema), async (c) => {
    const v = c.req.valid("json");
    const [row] = await c.var.db
      .insert(departments)
      .values({ name: v.name, parentId: v.parentId ?? null, sortOrder: v.sortOrder ?? 0 })
      .returning();
    await audit(c.var.db, c.var.user!.id, "directory.department.create", "department", row!.id, {
      name: v.name,
    });
    return c.json(row, 201);
  })

  /** 部门已开通的公共邮箱 */
  .get("/departments/:id/mailboxes", async (c) => {
    const departmentId = c.req.param("id");
    const rows = await c.var.db
      .select({
        id: departmentMailboxAccess.id,
        departmentId: departmentMailboxAccess.departmentId,
        addressId: departmentMailboxAccess.addressId,
        address: emailAddresses.address,
        status: emailAddresses.status,
        defaultCanSend: departmentMailboxAccess.defaultCanSend,
      })
      .from(departmentMailboxAccess)
      .innerJoin(emailAddresses, eq(departmentMailboxAccess.addressId, emailAddresses.id))
      .where(eq(departmentMailboxAccess.departmentId, departmentId))
      .orderBy(emailAddresses.address);
    return c.json(rows);
  })

  /** 给部门开通公共邮箱；成员范围由组织架构动态派生 */
  .post(
    "/departments/:id/mailboxes",
    zValidator("json", setDepartmentMailboxSchema),
    async (c) => {
      const db = c.var.db;
      const departmentId = c.req.param("id");
      const { addressId, defaultCanSend } = c.req.valid("json");
      const dept = await db.query.departments.findFirst({
        where: eq(departments.id, departmentId),
      });
      if (!dept) return c.json({ error: "部门不存在" }, 404);
      const addr = await db.query.emailAddresses.findFirst({
        where: eq(emailAddresses.id, addressId),
      });
      if (!addr) return c.json({ error: "邮箱地址不存在" }, 404);
      if (addr.type !== "shared") return c.json({ error: "只能给部门开通公共邮箱" }, 422);
      const [row] = await db
        .insert(departmentMailboxAccess)
        .values({ departmentId, addressId, defaultCanSend })
        .onConflictDoUpdate({
          target: [departmentMailboxAccess.departmentId, departmentMailboxAccess.addressId],
          set: { defaultCanSend, updatedAt: new Date() },
        })
        .returning();
      await audit(db, c.var.user!.id, "directory.department_mailbox.upsert", "department", departmentId, {
        addressId,
        defaultCanSend,
      });
      return c.json(row, 201);
    },
  )

  /** 修改部门公共邮箱的默认权限（全部只读 / 全部可发） */
  .patch(
    "/departments/:id/mailboxes/:addressId",
    zValidator("json", updateMailboxMemberSchema),
    async (c) => {
      const db = c.var.db;
      const departmentId = c.req.param("id");
      const addressId = c.req.param("addressId");
      const { canSend } = c.req.valid("json");
      const [row] = await db
        .update(departmentMailboxAccess)
        .set({ defaultCanSend: canSend, updatedAt: new Date() })
        .where(
          and(
            eq(departmentMailboxAccess.departmentId, departmentId),
            eq(departmentMailboxAccess.addressId, addressId),
          ),
        )
        .returning();
      if (!row) return c.json({ error: "部门公共邮箱未开通" }, 404);
      await audit(db, c.var.user!.id, "directory.department_mailbox.update", "department", departmentId, {
        addressId,
        canSend,
      });
      return c.json(row);
    },
  )

  /** 取消部门公共邮箱 */
  .delete("/departments/:id/mailboxes/:addressId", async (c) => {
    const db = c.var.db;
    const departmentId = c.req.param("id");
    const addressId = c.req.param("addressId");
    const [row] = await db
      .delete(departmentMailboxAccess)
      .where(
        and(
          eq(departmentMailboxAccess.departmentId, departmentId),
          eq(departmentMailboxAccess.addressId, addressId),
        ),
      )
      .returning();
    if (!row) return c.json({ error: "部门公共邮箱未开通" }, 404);
    await audit(db, c.var.user!.id, "directory.department_mailbox.delete", "department", departmentId, {
      addressId,
    });
    return c.json({ ok: true });
  })

  /** 改名/排序 */
  .patch(
    "/departments/:id",
    zValidator("json", upsertDepartmentSchema.partial()),
    async (c) => {
      const id = c.req.param("id");
      const v = c.req.valid("json");
      const patch: Partial<typeof departments.$inferInsert> = { updatedAt: new Date() };
      if (v.name !== undefined) patch.name = v.name;
      if (v.parentId !== undefined) patch.parentId = v.parentId ?? null;
      if (v.sortOrder !== undefined) patch.sortOrder = v.sortOrder;
      const [row] = await c.var.db
        .update(departments)
        .set(patch)
        .where(eq(departments.id, id))
        .returning();
      if (!row) return c.json({ error: "部门不存在" }, 404);
      await audit(c.var.db, c.var.user!.id, "directory.department.update", "department", id, v);
      return c.json(row);
    },
  )

  /** 删除部门（成员的 departmentId 经外键置空） */
  .delete("/departments/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await c.var.db
      .delete(departments)
      .where(eq(departments.id, id))
      .returning({ id: departments.id });
    if (!row) return c.json({ error: "部门不存在" }, 404);
    await audit(c.var.db, c.var.user!.id, "directory.department.delete", "department", id);
    return c.json({ ok: true });
  })

  /** 成员目录：全部用户 + 其组织资料（供后台逐行编辑） */
  .get("/members", async (c) => {
    const rows = await c.var.db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        approvalStatus: user.approvalStatus,
        banned: user.banned,
        departmentId: directoryProfiles.departmentId,
        jobTitle: directoryProfiles.jobTitle,
        phone: directoryProfiles.phone,
        mobile: directoryProfiles.mobile,
        extension: directoryProfiles.extension,
        location: directoryProfiles.location,
        isHidden: directoryProfiles.isHidden,
        sortOrder: directoryProfiles.sortOrder,
      })
      .from(user)
      .leftJoin(directoryProfiles, eq(directoryProfiles.userId, user.id))
      .orderBy(user.name);
    return c.json(
      rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        image: r.image,
        approvalStatus: r.approvalStatus,
        banned: r.banned ?? false,
        departmentId: r.departmentId,
        jobTitle: r.jobTitle,
        phone: r.phone,
        mobile: r.mobile,
        extension: r.extension,
        location: r.location,
        isHidden: r.isHidden ?? false,
        sortOrder: r.sortOrder ?? 0,
      })),
    );
  })

  /** 保存某用户的组织资料（upsert） */
  .put("/members/:userId", zValidator("json", updateDirectoryProfileSchema), async (c) => {
    const db = c.var.db;
    const userId = c.req.param("userId");
    const v = c.req.valid("json");
    const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
    if (!u) return c.json({ error: "用户不存在" }, 404);

    const fields = {
      departmentId: v.departmentId ?? null,
      jobTitle: v.jobTitle ?? null,
      phone: v.phone ?? null,
      mobile: v.mobile ?? null,
      extension: v.extension ?? null,
      location: v.location ?? null,
      sortOrder: v.sortOrder ?? 0,
      isHidden: v.isHidden ?? false,
    };
    const [row] = await db
      .insert(directoryProfiles)
      .values({ userId, ...fields })
      .onConflictDoUpdate({
        target: directoryProfiles.userId,
        set: { ...fields, updatedAt: new Date() },
      })
      .returning();
    await audit(db, c.var.user!.id, "directory.profile.update", "user", userId, v);
    return c.json(row);
  });
