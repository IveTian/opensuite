import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { domains, emailAddresses } from "@mailflare/db";
import { createDomainSchema, updateDomainSchema } from "@mailflare/shared";
import type { AppEnv } from "../../env.js";
import { audit } from "../../lib/audit.js";
import { checkDomainDns, expectedRecords } from "../../lib/dns.js";

export const domainRoutes = new Hono<AppEnv>()
  /** 列出域名（含地址数） */
  .get("/", async (c) => {
    const rows = await c.var.db
      .select({
        id: domains.id,
        name: domains.name,
        status: domains.status,
        isCatchAllEnabled: domains.isCatchAllEnabled,
        catchAllAddressId: domains.catchAllAddressId,
        mxVerified: domains.mxVerified,
        spfVerified: domains.spfVerified,
        dkimVerified: domains.dkimVerified,
        createdAt: domains.createdAt,
        addressCount: sql<number>`count(${emailAddresses.id})::int`,
      })
      .from(domains)
      .leftJoin(emailAddresses, eq(emailAddresses.domainId, domains.id))
      .groupBy(domains.id)
      .orderBy(domains.createdAt);
    return c.json(rows);
  })

  /** 新增域名 */
  .post("/", zValidator("json", createDomainSchema), async (c) => {
    const { name } = c.req.valid("json");
    const existing = await c.var.db.query.domains.findFirst({
      where: eq(domains.name, name),
    });
    if (existing) return c.json({ error: "域名已存在" }, 409);
    const [row] = await c.var.db.insert(domains).values({ name }).returning();
    await audit(c.var.db, c.var.user!.id, "domain.create", "domain", row!.id, { name });
    return c.json(row, 201);
  })

  /** 修改域名状态 */
  .patch("/:id", zValidator("json", updateDomainSchema), async (c) => {
    const id = c.req.param("id");
    const patch = c.req.valid("json");
    const [row] = await c.var.db
      .update(domains)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(domains.id, id))
      .returning();
    if (!row) return c.json({ error: "域名不存在" }, 404);
    return c.json(row);
  })

  /** 删除域名（级联删除其下地址） */
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await c.var.db.delete(domains).where(eq(domains.id, id)).returning();
    if (!row) return c.json({ error: "域名不存在" }, 404);
    await audit(c.var.db, c.var.user!.id, "domain.delete", "domain", id);
    return c.json({ ok: true });
  })

  /** 应配置的 DNS 记录 + 实时查询状态（不落库） */
  .get("/:id/dns", async (c) => {
    const domain = await c.var.db.query.domains.findFirst({
      where: eq(domains.id, c.req.param("id")),
    });
    if (!domain) return c.json({ error: "域名不存在" }, 404);
    const check = await checkDomainDns(domain.name);
    return c.json({ expected: expectedRecords(domain.name), check });
  })

  /** 校验 DNS 并落库状态；MX+SPF 通过则置 active */
  .post("/:id/verify", async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const domain = await db.query.domains.findFirst({ where: eq(domains.id, id) });
    if (!domain) return c.json({ error: "域名不存在" }, 404);

    const check = await checkDomainDns(domain.name);
    const active = check.mx.ok && check.spf.ok;
    const [row] = await db
      .update(domains)
      .set({
        mxVerified: check.mx.ok,
        spfVerified: check.spf.ok,
        dkimVerified: check.dkim.ok,
        status: active ? "active" : "verifying",
        updatedAt: new Date(),
      })
      .where(eq(domains.id, id))
      .returning();
    await audit(db, c.var.user!.id, "domain.verify", "domain", id, {
      mx: check.mx.ok,
      spf: check.spf.ok,
      dkim: check.dkim.ok,
    });
    return c.json({ domain: row, check });
  });
