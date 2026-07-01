import { useMemo } from "react";
import type { DirectoryPayload, PersonalContact } from "@mailflare/shared";
import { useFetch } from "./useFetch";

export interface ContactSuggestion {
  name: string;
  email: string;
  /** 次要信息（部门 / 公司），下拉里灰字展示 */
  sub?: string;
}

/**
 * 写信收件人自动补全的候选来源：合并组织通讯录 + 个人通讯录（同邮箱个人别名优先）。
 */
export function useContactSuggestions(): ContactSuggestion[] {
  const { data: directory } = useFetch<DirectoryPayload>("/api/contacts/directory");
  const { data: personal } = useFetch<PersonalContact[]>("/api/contacts/personal");
  return useMemo(() => {
    const map = new Map<string, ContactSuggestion>();
    for (const e of directory?.entries ?? []) {
      const key = e.email.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: e.name, email: e.email, sub: e.departmentName ?? undefined });
      }
    }
    // 个人通讯录覆盖组织（用户自定义的别名优先）
    for (const c of personal ?? []) {
      map.set(c.email.toLowerCase(), {
        name: c.displayName,
        email: c.email,
        sub: c.company ?? undefined,
      });
    }
    return [...map.values()];
  }, [directory, personal]);
}
