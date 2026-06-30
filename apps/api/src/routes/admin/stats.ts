import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { domains, emailAddresses, messages, user, userQuota } from "@mailflare/db";
import type { AdminStats } from "@mailflare/shared";
import type { AppEnv } from "../../env.js";

export const statsRoutes = new Hono<AppEnv>()
  .get("/usage", async (c) => {
    const db = c.var.db;
    // 域名 → 地址数 + 已用容量（仅 join addresses，避免 message 行放大求和）
    const dom = await db
      .select({
        id: domains.id,
        name: domains.name,
        status: domains.status,
        addressCount: sql<number>`count(${emailAddresses.id})::int`,
        usedBytes: sql<number>`coalesce(sum(${emailAddresses.usedBytes}), 0)::bigint`,
      })
      .from(domains)
      .leftJoin(emailAddresses, eq(emailAddresses.domainId, domains.id))
      .groupBy(domains.id)
      .orderBy(domains.name);
    // 域名 → 邮件数（单独聚合）
    const msg = await db
      .select({
        domainId: emailAddresses.domainId,
        messageCount: sql<number>`count(${messages.id})::int`,
      })
      .from(emailAddresses)
      .leftJoin(messages, eq(messages.addressId, emailAddresses.id))
      .groupBy(emailAddresses.domainId);
    const msgMap = new Map(msg.map((m) => [m.domainId, m.messageCount]));
    return c.json(
      dom.map((d) => ({
        ...d,
        usedBytes: Number(d.usedBytes),
        messageCount: msgMap.get(d.id) ?? 0,
      })),
    );
  })
  .get("/", async (c) => {
  const db = c.var.db;

  const [userCount, domainCount, addressCount, pendingCount] = await Promise.all([
    db.$count(user),
    db.$count(domains),
    db.$count(emailAddresses),
    db.$count(user, eq(user.approvalStatus, "pending")),
  ]);

  const [agg] = await db
    .select({
      totalQuota: sql<number>`coalesce(sum(${userQuota.storageQuotaBytes}), 0)::bigint`,
      totalUsed: sql<number>`coalesce(sum(${userQuota.usedBytes}), 0)::bigint`,
    })
    .from(userQuota);

  const body: AdminStats = {
    userCount,
    domainCount,
    addressCount,
    pendingApprovalCount: pendingCount,
    totalStorageQuotaBytes: Number(agg?.totalQuota ?? 0),
    totalUsedBytes: Number(agg?.totalUsed ?? 0),
  };
  return c.json(body);
});
