import { and, eq, inArray } from "drizzle-orm";
import {
  departmentMailboxAccess,
  departments,
  directoryProfiles,
  emailAddresses,
  mailboxMembers,
  user,
} from "@mailflare/db";
import type { Database } from "@mailflare/db";
import { isInDepartmentScope, userDepartmentScope } from "./org.js";

export async function readableAddressIds(db: Database, userId: string): Promise<string[]> {
  const deptIds = await userDepartmentScope(db, userId);
  const [owned, explicit, deptAccess] = await Promise.all([
    db.select({ id: emailAddresses.id }).from(emailAddresses).where(eq(emailAddresses.userId, userId)),
    db
      .select({ id: mailboxMembers.addressId })
      .from(mailboxMembers)
      .innerJoin(emailAddresses, eq(mailboxMembers.addressId, emailAddresses.id))
      .where(and(eq(mailboxMembers.userId, userId), eq(emailAddresses.status, "active"))),
    deptIds.length
      ? db
          .select({ id: departmentMailboxAccess.addressId })
          .from(departmentMailboxAccess)
          .innerJoin(emailAddresses, eq(departmentMailboxAccess.addressId, emailAddresses.id))
          .where(
            and(
              inArray(departmentMailboxAccess.departmentId, deptIds),
              eq(emailAddresses.status, "active"),
            ),
          )
      : Promise.resolve([]),
  ]);
  return [...new Set([...owned.map((r) => r.id), ...explicit.map((r) => r.id), ...deptAccess.map((r) => r.id)])];
}

export async function sendableAddressIds(db: Database, userId: string): Promise<string[]> {
  const deptIds = await userDepartmentScope(db, userId);
  const [owned, explicit, deptAccess] = await Promise.all([
    db
      .select({ id: emailAddresses.id })
      .from(emailAddresses)
      .where(
        and(
          eq(emailAddresses.userId, userId),
          eq(emailAddresses.type, "mailbox"),
          eq(emailAddresses.status, "active"),
        ),
      ),
    db
      .select({ id: mailboxMembers.addressId })
      .from(mailboxMembers)
      .innerJoin(emailAddresses, eq(mailboxMembers.addressId, emailAddresses.id))
      .where(
        and(
          eq(mailboxMembers.userId, userId),
          eq(mailboxMembers.canSend, true),
          eq(emailAddresses.status, "active"),
        ),
      ),
    deptIds.length
      ? db
          .select({ id: departmentMailboxAccess.addressId })
          .from(departmentMailboxAccess)
          .innerJoin(emailAddresses, eq(departmentMailboxAccess.addressId, emailAddresses.id))
          .where(
            and(
              inArray(departmentMailboxAccess.departmentId, deptIds),
              eq(departmentMailboxAccess.defaultCanSend, true),
              eq(emailAddresses.status, "active"),
            ),
          )
      : Promise.resolve([]),
  ]);
  return [...new Set([...owned.map((r) => r.id), ...explicit.map((r) => r.id), ...deptAccess.map((r) => r.id)])];
}

/** 公共邮箱入站通知/日历落库目标：显式成员 + 授权部门及其下级部门成员。 */
export async function sharedMailboxRecipientUserIds(
  db: Database,
  addressId: string,
): Promise<string[]> {
  const [explicit, grants, profiles, allDepartments] = await Promise.all([
    db
      .select({ userId: mailboxMembers.userId })
      .from(mailboxMembers)
      .where(eq(mailboxMembers.addressId, addressId)),
    db
      .select({ departmentId: departmentMailboxAccess.departmentId })
      .from(departmentMailboxAccess)
      .where(eq(departmentMailboxAccess.addressId, addressId)),
    db
      .select({
        userId: directoryProfiles.userId,
        departmentId: directoryProfiles.departmentId,
        approvalStatus: user.approvalStatus,
        banned: user.banned,
      })
      .from(directoryProfiles)
      .innerJoin(user, eq(directoryProfiles.userId, user.id)),
    db.select({ id: departments.id, parentId: departments.parentId }).from(departments),
  ]);

  const out = new Set(explicit.map((m) => m.userId));
  const granted = new Set(grants.map((g) => g.departmentId));
  if (granted.size) {
    for (const p of profiles) {
      if (p.approvalStatus !== "active" || p.banned) continue;
      if (isInDepartmentScope(allDepartments, p.departmentId, granted)) out.add(p.userId);
    }
  }
  return [...out];
}
