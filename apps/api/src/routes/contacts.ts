import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  departments,
  directoryProfiles,
  emailAddresses,
  personalContacts,
  user,
} from "@mailflare/db";
import {
  createPersonalContactSchema,
  updatePersonalContactSchema,
  type ContactNameMap,
  type Department,
  type DirectoryEntry,
  type DirectoryPayload,
  type PersonalContact,
} from "@mailflare/shared";
import type { AppEnv } from "../env.js";
import { loadUser, requireAuth } from "../middleware/auth.js";

/** 通讯录：组织目录（全员可见）+ 个人通讯录（各自维护）。需登录 */
export const contactRoutes = new Hono<AppEnv>()
  .use("*", loadUser, requireAuth)

  /** 组织通讯录：部门 + 成员（= active 用户 + 其组织资料，隐藏者不出现） */
  .get("/directory", async (c) => {
    const db = c.var.db;
    const [depts, rows] = await Promise.all([
      db.select().from(departments).orderBy(departments.sortOrder, departments.name),
      db
        .select({
          userId: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          approvalStatus: user.approvalStatus,
          banned: user.banned,
          departmentId: directoryProfiles.departmentId,
          departmentName: departments.name,
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
        .leftJoin(departments, eq(departments.id, directoryProfiles.departmentId)),
    ]);

    const entries: DirectoryEntry[] = rows
      .filter((r) => r.approvalStatus === "active" && !r.banned && !r.isHidden)
      .map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        image: r.image,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        jobTitle: r.jobTitle,
        phone: r.phone,
        mobile: r.mobile,
        extension: r.extension,
        location: r.location,
      }))
      .sort(
        (a, b) =>
          (a.departmentName ?? "￿").localeCompare(b.departmentName ?? "￿", "zh") ||
          a.name.localeCompare(b.name, "zh"),
      );

    const deptList: Department[] = depts.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      sortOrder: d.sortOrder,
    }));
    const payload: DirectoryPayload = { departments: deptList, entries };
    return c.json(payload);
  })

  /**
   * 邮件视图用：邮箱地址 → 显示名 映射。
   * 个人别名优先，其次组织目录名（用户登录邮箱与其名下邮箱地址）。
   */
  .get("/names", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const [personal, dirByLogin, dirByAddr] = await Promise.all([
      db
        .select({ email: personalContacts.email, name: personalContacts.displayName })
        .from(personalContacts)
        .where(eq(personalContacts.userId, u.id)),
      db
        .select({
          email: user.email,
          name: user.name,
          isHidden: directoryProfiles.isHidden,
          approvalStatus: user.approvalStatus,
        })
        .from(user)
        .leftJoin(directoryProfiles, eq(directoryProfiles.userId, user.id)),
      db
        .select({
          email: emailAddresses.address,
          name: user.name,
          isHidden: directoryProfiles.isHidden,
          approvalStatus: user.approvalStatus,
        })
        .from(emailAddresses)
        .innerJoin(user, eq(emailAddresses.userId, user.id))
        .leftJoin(directoryProfiles, eq(directoryProfiles.userId, user.id)),
    ]);

    const map: ContactNameMap = {};
    // 组织目录名先填；个人别名后填，覆盖组织名
    for (const r of [...dirByLogin, ...dirByAddr]) {
      if (r.approvalStatus === "active" && !r.isHidden && r.name) {
        map[r.email.toLowerCase()] = r.name;
      }
    }
    for (const r of personal) {
      if (r.name) map[r.email.toLowerCase()] = r.name;
    }
    return c.json(map);
  })

  /** 我的个人通讯录 */
  .get("/personal", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const rows = await db
      .select({
        id: personalContacts.id,
        displayName: personalContacts.displayName,
        email: personalContacts.email,
        phone: personalContacts.phone,
        company: personalContacts.company,
        jobTitle: personalContacts.jobTitle,
        notes: personalContacts.notes,
        isFavorite: personalContacts.isFavorite,
      })
      .from(personalContacts)
      .where(eq(personalContacts.userId, u.id))
      .orderBy(desc(personalContacts.isFavorite), personalContacts.displayName);
    return c.json(rows satisfies PersonalContact[]);
  })

  /** 新建/合并联系人（同邮箱幂等 upsert，方便「从邮件加为联系人」） */
  .post("/personal", zValidator("json", createPersonalContactSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const v = c.req.valid("json");
    const [row] = await db
      .insert(personalContacts)
      .values({
        userId: u.id,
        displayName: v.displayName,
        email: v.email,
        phone: v.phone ?? null,
        company: v.company ?? null,
        jobTitle: v.jobTitle ?? null,
        notes: v.notes ?? null,
        isFavorite: v.isFavorite ?? false,
      })
      .onConflictDoUpdate({
        target: [personalContacts.userId, personalContacts.email],
        set: {
          displayName: v.displayName,
          phone: v.phone ?? null,
          company: v.company ?? null,
          jobTitle: v.jobTitle ?? null,
          notes: v.notes ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return c.json(toContact(row!), 201);
  })

  /** 更新联系人（仅本人；只改提供的字段） */
  .patch("/personal/:id", zValidator("json", updatePersonalContactSchema), async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const v = c.req.valid("json");
    const owned = await db.query.personalContacts.findFirst({
      where: and(eq(personalContacts.id, id), eq(personalContacts.userId, u.id)),
    });
    if (!owned) return c.json({ error: "联系人不存在" }, 404);

    const patch: Partial<typeof personalContacts.$inferInsert> = { updatedAt: new Date() };
    if (v.displayName !== undefined) patch.displayName = v.displayName;
    if (v.email !== undefined) patch.email = v.email;
    if (v.phone !== undefined) patch.phone = v.phone ?? null;
    if (v.company !== undefined) patch.company = v.company ?? null;
    if (v.jobTitle !== undefined) patch.jobTitle = v.jobTitle ?? null;
    if (v.notes !== undefined) patch.notes = v.notes ?? null;
    if (v.isFavorite !== undefined) patch.isFavorite = v.isFavorite;

    const [row] = await db
      .update(personalContacts)
      .set(patch)
      .where(eq(personalContacts.id, id))
      .returning();
    return c.json(toContact(row!));
  })

  /** 删除联系人（仅本人） */
  .delete("/personal/:id", async (c) => {
    const db = c.var.db;
    const u = c.var.user!;
    const id = c.req.param("id");
    const [row] = await db
      .delete(personalContacts)
      .where(and(eq(personalContacts.id, id), eq(personalContacts.userId, u.id)))
      .returning({ id: personalContacts.id });
    if (!row) return c.json({ error: "联系人不存在" }, 404);
    return c.json({ ok: true });
  });

function toContact(row: typeof personalContacts.$inferSelect): PersonalContact {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    company: row.company,
    jobTitle: row.jobTitle,
    notes: row.notes,
    isFavorite: row.isFavorite,
  };
}
