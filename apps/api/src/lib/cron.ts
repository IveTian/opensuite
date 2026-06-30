import { and, eq, isNotNull, lt, ne } from "drizzle-orm";
import { inviteCodes, userQuota } from "@mailflare/db";
import type { Database } from "@mailflare/db";

/**
 * 每日维护（由 Cron 触发）：
 * - 重置每用户发信日计数 sentToday。
 * - 把已过期且仍 active 的邀请码标记为 expired。
 */
export async function runDailyMaintenance(
  db: Database,
  now: Date,
): Promise<{ resetQuotas: number; expiredInvites: number }> {
  const reset = await db
    .update(userQuota)
    .set({ sentToday: 0 })
    .where(ne(userQuota.sentToday, 0))
    .returning({ id: userQuota.userId });

  const expired = await db
    .update(inviteCodes)
    .set({ status: "expired" })
    .where(
      and(
        eq(inviteCodes.status, "active"),
        isNotNull(inviteCodes.expiresAt),
        lt(inviteCodes.expiresAt, now),
      ),
    )
    .returning({ id: inviteCodes.id });

  return { resetQuotas: reset.length, expiredInvites: expired.length };
}
