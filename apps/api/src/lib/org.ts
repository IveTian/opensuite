import { eq } from "drizzle-orm";
import { departments, directoryProfiles } from "@mailflare/db";
import type { Database } from "@mailflare/db";

/**
 * 组织架构（部门树）辅助。
 * 邮箱公共授权、网盘部门授权/部门空间共用同一套「部门链」语义：
 * 授权给某部门后，该部门及其所有下级部门成员动态获得权限（用户调岗即时生效）。
 */

/** 从某部门沿 parentId 向上，返回 [自身, 父, 祖父, ...]（防环）。 */
export function ancestorIds(
  all: { id: string; parentId: string | null }[],
  departmentId: string | null,
): string[] {
  if (!departmentId) return [];
  const byId = new Map(all.map((d) => [d.id, d]));
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = departmentId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return out;
}

/** 成员部门（或其祖先）是否落在已授权部门集合内。 */
export function isInDepartmentScope(
  all: { id: string; parentId: string | null }[],
  memberDepartmentId: string | null,
  grantedDepartmentIds: Set<string>,
): boolean {
  return ancestorIds(all, memberDepartmentId).some((id) => grantedDepartmentIds.has(id));
}

/** 拉取全部部门（id + parentId），用于树遍历。 */
export async function loadDepartments(
  db: Database,
): Promise<{ id: string; parentId: string | null }[]> {
  return db.select({ id: departments.id, parentId: departments.parentId }).from(departments);
}

/** 用户的「部门范围」= 用户所在部门 + 其所有祖先部门 id。 */
export async function userDepartmentScope(db: Database, userId: string): Promise<string[]> {
  const profile = await db.query.directoryProfiles.findFirst({
    where: eq(directoryProfiles.userId, userId),
  });
  if (!profile?.departmentId) return [];
  const all = await loadDepartments(db);
  return ancestorIds(all, profile.departmentId);
}
