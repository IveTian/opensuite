import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  driveGroupMembers,
  driveNodeGrants,
  driveNodes,
  driveSpaces,
  systemSettings,
  userQuota,
} from "@mailflare/db";
import type { Database, DriveNode as DriveNodeRow, DriveSpace as DriveSpaceRow } from "@mailflare/db";
import { SYSTEM_SETTINGS_ID } from "@mailflare/shared";
import type { DriveRole } from "@mailflare/shared";
import { userDepartmentScope } from "./org.js";

/** 网盘领域错误，携带 HTTP 状态。 */
export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 413 | 422 = 422,
  ) {
    super(message);
  }
}

const RANK: Record<DriveRole, number> = { viewer: 1, editor: 2 };

function higher(a: DriveRole | null, b: DriveRole | null): DriveRole | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** 访问上下文：一次请求内复用用户的组 / 部门范围，避免重复查询。 */
export interface DriveCtx {
  userId: string;
  groupIds: Set<string>;
  deptScope: Set<string>;
}

export async function loadDriveCtx(db: Database, userId: string): Promise<DriveCtx> {
  const [groups, deptScope] = await Promise.all([
    db
      .select({ groupId: driveGroupMembers.groupId })
      .from(driveGroupMembers)
      .where(eq(driveGroupMembers.userId, userId)),
    userDepartmentScope(db, userId),
  ]);
  return {
    userId,
    groupIds: new Set(groups.map((g) => g.groupId)),
    deptScope: new Set(deptScope),
  };
}

type GrantRow = {
  role: string;
  groupId: string | null;
  departmentId: string | null;
  userId: string | null;
};

/** 从一批授权行中，取当前用户命中的最高角色。 */
function roleFromGrants(rows: GrantRow[], ctx: DriveCtx): DriveRole | null {
  let best: DriveRole | null = null;
  for (const g of rows) {
    const hit =
      (g.userId && g.userId === ctx.userId) ||
      (g.groupId && ctx.groupIds.has(g.groupId)) ||
      (g.departmentId && ctx.deptScope.has(g.departmentId));
    if (hit) best = higher(best, g.role as DriveRole);
  }
  return best;
}

/** 空间根的基础角色（不含节点授权）：个人 owner / 部门成员 → editor；org → null。 */
export function spaceBaseRole(space: DriveSpaceRow, ctx: DriveCtx): DriveRole | null {
  if (space.type === "personal") {
    return space.ownerUserId === ctx.userId ? "editor" : null;
  }
  if (space.type === "department") {
    return space.departmentId && ctx.deptScope.has(space.departmentId) ? "editor" : null;
  }
  return null; // org：完全靠节点授权
}

/** 取某节点自身到根的节点 id 链（含自身）。 */
async function nodeChainIds(db: Database, node: DriveNodeRow): Promise<string[]> {
  const chain: string[] = [node.id];
  let parentId = node.parentId;
  const seen = new Set<string>([node.id]);
  // 深度通常很浅；设安全上限防环
  for (let i = 0; i < 256 && parentId && !seen.has(parentId); i++) {
    const p: { id: string; parentId: string | null } | undefined = await db.query.driveNodes.findFirst(
      {
        where: eq(driveNodes.id, parentId),
        columns: { id: true, parentId: true },
      },
    );
    if (!p) break;
    chain.push(p.id);
    seen.add(p.id);
    parentId = p.parentId;
  }
  return chain;
}

/** 解析用户对某节点的有效权限（沿祖先链聚合三类授权 + 空间基础角色）。 */
export async function resolveNodeRole(
  db: Database,
  node: DriveNodeRow,
  ctx: DriveCtx,
  space?: DriveSpaceRow,
): Promise<DriveRole | null> {
  const sp =
    space ?? (await db.query.driveSpaces.findFirst({ where: eq(driveSpaces.id, node.spaceId) }));
  if (!sp) return null;
  const base = spaceBaseRole(sp, ctx);
  const chain = await nodeChainIds(db, node);
  const grants = await db
    .select({
      role: driveNodeGrants.role,
      groupId: driveNodeGrants.groupId,
      departmentId: driveNodeGrants.departmentId,
      userId: driveNodeGrants.userId,
    })
    .from(driveNodeGrants)
    .where(inArray(driveNodeGrants.nodeId, chain));
  return higher(base, roleFromGrants(grants, ctx));
}

/** 列目录：返回可见子节点及其角色。处理 org 空间「根显示顶层被授权节点」的特殊情况。 */
export async function listChildren(
  db: Database,
  ctx: DriveCtx,
  space: DriveSpaceRow,
  parentId: string | null,
): Promise<{ node: DriveNodeRow; role: DriveRole }[]> {
  // 容器角色（父文件夹或空间根）
  let containerRole: DriveRole | null;
  if (parentId) {
    const parent = await db.query.driveNodes.findFirst({ where: eq(driveNodes.id, parentId) });
    if (!parent || parent.spaceId !== space.id) throw new DriveError("文件夹不存在", 404);
    containerRole = await resolveNodeRole(db, parent, ctx, space);
    if (!containerRole) throw new DriveError("无权访问该文件夹", 403);
  } else {
    containerRole = spaceBaseRole(space, ctx);
  }

  // org 空间根：没有基础角色时，展示用户「顶层被授权节点」作为入口
  if (!parentId && !containerRole) {
    return listTopLevelGrantedEntries(db, ctx, space);
  }

  const children = await db
    .select()
    .from(driveNodes)
    .where(
      and(
        eq(driveNodes.spaceId, space.id),
        parentId ? eq(driveNodes.parentId, parentId) : isNull(driveNodes.parentId),
        eq(driveNodes.isTrashed, false),
      ),
    );

  if (!children.length) return [];

  const grants = await db
    .select({
      nodeId: driveNodeGrants.nodeId,
      role: driveNodeGrants.role,
      groupId: driveNodeGrants.groupId,
      departmentId: driveNodeGrants.departmentId,
      userId: driveNodeGrants.userId,
    })
    .from(driveNodeGrants)
    .where(inArray(driveNodeGrants.nodeId, children.map((c) => c.id)));

  const byNode = new Map<string, GrantRow[]>();
  for (const g of grants) {
    const arr = byNode.get(g.nodeId) ?? [];
    arr.push(g);
    byNode.set(g.nodeId, arr);
  }

  const out: { node: DriveNodeRow; role: DriveRole }[] = [];
  for (const c of children) {
    const role = higher(containerRole, roleFromGrants(byNode.get(c.id) ?? [], ctx));
    if (role) out.push({ node: c, role });
  }
  return out;
}

/** org 空间：用户在该空间的「顶层被授权节点」（去掉被祖先授权覆盖者）作为根入口。 */
async function listTopLevelGrantedEntries(
  db: Database,
  ctx: DriveCtx,
  space: DriveSpaceRow,
): Promise<{ node: DriveNodeRow; role: DriveRole }[]> {
  // 该空间内命中当前用户的授权节点
  const grantRows = await db
    .select({
      nodeId: driveNodeGrants.nodeId,
      role: driveNodeGrants.role,
      groupId: driveNodeGrants.groupId,
      departmentId: driveNodeGrants.departmentId,
      userId: driveNodeGrants.userId,
      spaceId: driveNodes.spaceId,
      isTrashed: driveNodes.isTrashed,
    })
    .from(driveNodeGrants)
    .innerJoin(driveNodes, eq(driveNodeGrants.nodeId, driveNodes.id))
    .where(and(eq(driveNodes.spaceId, space.id), eq(driveNodes.isTrashed, false)));

  const roleByNode = new Map<string, DriveRole>();
  for (const g of grantRows) {
    const hit =
      (g.userId && g.userId === ctx.userId) ||
      (g.groupId && ctx.groupIds.has(g.groupId)) ||
      (g.departmentId && ctx.deptScope.has(g.departmentId));
    if (hit) roleByNode.set(g.nodeId, higher(roleByNode.get(g.nodeId) ?? null, g.role as DriveRole)!);
  }
  if (!roleByNode.size) return [];

  // 载入空间节点树以判定「祖先是否也被授权」
  const all = await db
    .select({ id: driveNodes.id, parentId: driveNodes.parentId })
    .from(driveNodes)
    .where(eq(driveNodes.spaceId, space.id));
  const parentOf = new Map(all.map((n) => [n.id, n.parentId] as const));

  const granted = new Set(roleByNode.keys());
  const topIds: string[] = [];
  for (const id of granted) {
    let cur = parentOf.get(id) ?? null;
    let covered = false;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (granted.has(cur)) {
        covered = true;
        break;
      }
      cur = parentOf.get(cur) ?? null;
    }
    if (!covered) topIds.push(id);
  }
  if (!topIds.length) return [];

  const nodes = await db.select().from(driveNodes).where(inArray(driveNodes.id, topIds));
  return nodes.map((n) => ({ node: n, role: roleByNode.get(n.id)! }));
}

/** 用户可访问的空间列表（个人 + 部门成员空间 + 有授权的 org/部门空间）。 */
export async function listAccessibleSpaces(
  db: Database,
  ctx: DriveCtx,
): Promise<{ space: DriveSpaceRow; role: DriveRole }[]> {
  const [personal, orgDeptSpaces, grantSpaceRows] = await Promise.all([
    db.query.driveSpaces.findFirst({
      where: and(eq(driveSpaces.type, "personal"), eq(driveSpaces.ownerUserId, ctx.userId)),
    }),
    db
      .select()
      .from(driveSpaces)
      .where(inArray(driveSpaces.type, ["org", "department"])),
    // 用户被授权的节点所在空间
    db
      .selectDistinct({ spaceId: driveNodes.spaceId })
      .from(driveNodeGrants)
      .innerJoin(driveNodes, eq(driveNodeGrants.nodeId, driveNodes.id))
      .where(grantMatchesUser(ctx)),
  ]);

  const grantSpaceIds = new Set(grantSpaceRows.map((r) => r.spaceId));
  const out: { space: DriveSpaceRow; role: DriveRole }[] = [];
  if (personal) out.push({ space: personal, role: "editor" });
  for (const sp of orgDeptSpaces) {
    const base = spaceBaseRole(sp, ctx);
    if (base) out.push({ space: sp, role: base });
    else if (grantSpaceIds.has(sp.id)) out.push({ space: sp, role: "viewer" });
  }
  return out;
}

function grantMatchesUser(ctx: DriveCtx) {
  const parts = [eq(driveNodeGrants.userId, ctx.userId)];
  if (ctx.groupIds.size) parts.push(inArray(driveNodeGrants.groupId, [...ctx.groupIds]));
  if (ctx.deptScope.size) parts.push(inArray(driveNodeGrants.departmentId, [...ctx.deptScope]));
  return parts.length === 1 ? parts[0] : or(...parts);
}

/** 懒创建用户个人空间。 */
export async function getOrCreatePersonalSpace(
  db: Database,
  userId: string,
): Promise<DriveSpaceRow> {
  const existing = await db.query.driveSpaces.findFirst({
    where: and(eq(driveSpaces.type, "personal"), eq(driveSpaces.ownerUserId, userId)),
  });
  if (existing) return existing;
  const [row] = await db
    .insert(driveSpaces)
    .values({ type: "personal", ownerUserId: userId, name: "我的网盘" })
    .returning();
  return row!;
}

/** 空间的有效容量上限（字节）；null 表示不限。 */
export async function effectiveSpaceQuota(
  db: Database,
  space: DriveSpaceRow,
): Promise<number | null> {
  if (space.type === "personal") {
    const q = await db.query.userQuota.findFirst({
      where: eq(userQuota.userId, space.ownerUserId!),
    });
    if (q?.driveQuotaBytes != null) return q.driveQuotaBytes;
    const s = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
    });
    return s?.defaultDriveQuotaBytes ?? null;
  }
  return space.quotaBytes ?? null;
}

/** 上传前配额校验。 */
export async function assertQuota(
  db: Database,
  space: DriveSpaceRow,
  addBytes: number,
): Promise<void> {
  const limit = await effectiveSpaceQuota(db, space);
  if (limit != null && space.usedBytes + addBytes > limit) {
    throw new DriveError("空间容量已满，无法上传", 413);
  }
}

/** 增减空间用量（个人空间同步 user_quota.driveUsedBytes 供管理端展示）。 */
export async function addUsage(db: Database, space: DriveSpaceRow, delta: number): Promise<void> {
  await db
    .update(driveSpaces)
    .set({
      usedBytes: sql`GREATEST(0, ${driveSpaces.usedBytes} + ${delta})`,
      updatedAt: new Date(),
    })
    .where(eq(driveSpaces.id, space.id));
  if (space.type === "personal" && space.ownerUserId) {
    await db
      .update(userQuota)
      .set({ driveUsedBytes: sql`GREATEST(0, ${userQuota.driveUsedBytes} + ${delta})` })
      .where(eq(userQuota.userId, space.ownerUserId));
  }
}

/** 计算面包屑（从根到当前文件夹）。 */
export async function breadcrumb(
  db: Database,
  nodeId: string | null,
): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let cur = nodeId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n: { id: string; name: string; parentId: string | null } | undefined =
      await db.query.driveNodes.findFirst({
        where: eq(driveNodes.id, cur),
        columns: { id: true, name: true, parentId: true },
      });
    if (!n) break;
    out.unshift({ id: n.id, name: n.name });
    cur = n.parentId;
  }
  return out;
}

/** SHA-256 hex（分享密码）。 */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 生成随机分享 token。 */
export function genShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}
