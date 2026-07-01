import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { domains, emailAddresses, mailboxMembers, user, userQuota } from "@mailflare/db";
import { addMailboxMemberSchema, createAddressSchema } from "@mailflare/shared";
import { z } from "zod";
import type { AppEnv } from "../../env.js";
import { audit } from "../../lib/audit.js";

const updateAddressSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  isPrimary: z.boolean().optional(),
});

export const addressRoutes = new Hono<AppEnv>()
  /** 列出邮箱地址（可按域名/用户过滤） */
  .get("/", async (c) => {
    const domainId = c.req.query("domainId");
    const userId = c.req.query("userId");
    const conds = [];
    if (domainId) conds.push(eq(emailAddresses.domainId, domainId));
    if (userId) conds.push(eq(emailAddresses.userId, userId));

    const rows = await c.var.db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        localPart: emailAddresses.localPart,
        type: emailAddresses.type,
        status: emailAddresses.status,
        isPrimary: emailAddresses.isPrimary,
        usedBytes: emailAddresses.usedBytes,
        domainId: emailAddresses.domainId,
        domain: domains.name,
        userId: emailAddresses.userId,
        ownerEmail: user.email,
        createdAt: emailAddresses.createdAt,
      })
      .from(emailAddresses)
      .innerJoin(domains, eq(emailAddresses.domainId, domains.id))
      .leftJoin(user, eq(emailAddresses.userId, user.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(emailAddresses.createdAt);
    return c.json(rows);
  })

  /** 新建邮箱地址（mailbox / alias） */
  .post("/", zValidator("json", createAddressSchema), async (c) => {
    const db = c.var.db;
    const { domainId, userId, localPart, type, isPrimary, targetAddressId } =
      c.req.valid("json");

    const domain = await db.query.domains.findFirst({ where: eq(domains.id, domainId) });
    if (!domain) return c.json({ error: "域名不存在" }, 404);

    let ownerId: string | null = userId ?? null;

    if (type === "mailbox") {
      // mailbox 必须归属用户，并校验配额内地址数
      if (!userId) return c.json({ error: "mailbox 必须指定归属用户" }, 422);
      const owner = await db.query.user.findFirst({ where: eq(user.id, userId) });
      if (!owner) return c.json({ error: "用户不存在" }, 404);

      const quota = await db.query.userQuota.findFirst({
        where: eq(userQuota.userId, userId),
      });
      const current = await db.$count(emailAddresses, eq(emailAddresses.userId, userId));
      const max = quota?.maxAddresses ?? 1;
      if (current >= max) {
        return c.json({ error: `已达该用户最大邮箱数（${max}）` }, 422);
      }
    } else if (type === "alias") {
      // alias 必须指向一个真实 mailbox；归属随目标用户，便于在用户名下展示
      if (!targetAddressId) return c.json({ error: "别名必须指定目标 mailbox" }, 422);
      const target = await db.query.emailAddresses.findFirst({
        where: eq(emailAddresses.id, targetAddressId),
      });
      if (!target || (target.type !== "mailbox" && target.type !== "shared")) {
        return c.json({ error: "目标地址无效（需为 mailbox）" }, 422);
      }
      ownerId = target.userId;
    } else if (type === "shared") {
      // 公共邮箱：无单一归属，访问权限走 mailbox_members
      ownerId = null;
    }

    const address = `${localPart}@${domain.name}`;
    const dup = await db.query.emailAddresses.findFirst({
      where: eq(emailAddresses.address, address),
    });
    if (dup) return c.json({ error: "该地址已存在" }, 409);

    // 设为主地址时，先清除该用户其它主地址
    if (isPrimary && ownerId) {
      await db
        .update(emailAddresses)
        .set({ isPrimary: false })
        .where(eq(emailAddresses.userId, ownerId));
    }

    const [row] = await db
      .insert(emailAddresses)
      .values({
        domainId,
        userId: ownerId,
        localPart,
        address,
        type,
        isPrimary,
        targetAddressId: type === "alias" ? targetAddressId : null,
      })
      .returning();
    await audit(db, c.var.user!.id, "address.create", "address", row!.id, { address, type });
    return c.json(row, 201);
  })

  /** 公共邮箱成员：列出可访问用户 */
  .get("/:id/members", async (c) => {
    const db = c.var.db;
    const rows = await db
      .select({
        userId: mailboxMembers.userId,
        email: user.email,
        name: user.name,
        canSend: mailboxMembers.canSend,
      })
      .from(mailboxMembers)
      .innerJoin(user, eq(mailboxMembers.userId, user.id))
      .where(eq(mailboxMembers.addressId, c.req.param("id")))
      .orderBy(user.email);
    return c.json(rows);
  })

  /** 公共邮箱成员：授权用户可访问 */
  .post("/:id/members", zValidator("json", addMailboxMemberSchema), async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const { userId, canSend } = c.req.valid("json");
    const addr = await db.query.emailAddresses.findFirst({
      where: eq(emailAddresses.id, id),
    });
    if (!addr) return c.json({ error: "地址不存在" }, 404);
    if (addr.type !== "shared") return c.json({ error: "仅公共邮箱可添加成员" }, 422);
    const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
    if (!target) return c.json({ error: "用户不存在" }, 404);
    await db
      .insert(mailboxMembers)
      .values({ addressId: id, userId, canSend: canSend ?? true })
      .onConflictDoNothing({ target: [mailboxMembers.addressId, mailboxMembers.userId] });
    await audit(db, c.var.user!.id, "mailbox.member.add", "address", id, { userId });
    return c.json({ ok: true }, 201);
  })

  /** 公共邮箱成员：移除授权 */
  .delete("/:id/members/:userId", async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const userId = c.req.param("userId");
    await db
      .delete(mailboxMembers)
      .where(and(eq(mailboxMembers.addressId, id), eq(mailboxMembers.userId, userId)));
    await audit(db, c.var.user!.id, "mailbox.member.remove", "address", id, { userId });
    return c.json({ ok: true });
  })

  /** 修改地址（状态/主地址） */
  .patch("/:id", zValidator("json", updateAddressSchema), async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const patch = c.req.valid("json");

    const existing = await db.query.emailAddresses.findFirst({
      where: eq(emailAddresses.id, id),
    });
    if (!existing) return c.json({ error: "地址不存在" }, 404);

    if (patch.isPrimary && existing.userId) {
      await db
        .update(emailAddresses)
        .set({ isPrimary: false })
        .where(eq(emailAddresses.userId, existing.userId));
    }

    const [row] = await db
      .update(emailAddresses)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(emailAddresses.id, id))
      .returning();
    return c.json(row);
  })

  /** 删除地址 */
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await c.var.db
      .delete(emailAddresses)
      .where(eq(emailAddresses.id, id))
      .returning();
    if (!row) return c.json({ error: "地址不存在" }, 404);
    await audit(c.var.db, c.var.user!.id, "address.delete", "address", id);
    return c.json({ ok: true });
  });
