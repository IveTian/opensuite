import { useCallback } from "react";
import type { ContactNameMap } from "@mailflare/shared";
import { useFetch } from "./useFetch";

/**
 * 邮件视图用：返回一个解析器 (email) => 显示名 | null。
 * 命中来源为 /api/contacts/names（个人别名优先，其次组织目录名）。
 */
export function useContactNames(): (email?: string | null) => string | null {
  const { data } = useFetch<ContactNameMap>("/api/contacts/names");
  return useCallback(
    (email?: string | null) => {
      if (!email || !data) return null;
      return data[email.toLowerCase()] ?? null;
    },
    [data],
  );
}
