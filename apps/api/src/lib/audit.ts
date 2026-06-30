import { auditLog } from "@mailflare/db";
import type { Database } from "@mailflare/db";

/** 轻量审计：记录后台关键操作 */
export async function audit(
  db: Database,
  actorUserId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId,
    action,
    targetType,
    targetId,
    metadata,
  });
}
