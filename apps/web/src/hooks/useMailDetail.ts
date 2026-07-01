import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  cacheMessageDetail,
  getCachedMessageDetail,
  type CachedMsgDetail,
} from "../lib/offline/mail-cache";
import { useOnline } from "./useOnline";

/** 单封邮件详情：在线拉 API 并缓存，离线读 IndexedDB */
export function useMailDetail(messageId: string) {
  const online = useOnline();
  const [data, setData] = useState<CachedMsgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const loadCache = async (): Promise<boolean> => {
      const cached = await getCachedMessageDetail(messageId);
      if (!cached) return false;
      setData(cached.detail);
      setFromCache(true);
      return true;
    };

    if (!online) {
      const ok = await loadCache();
      if (!ok) setError("当前离线，该邮件尚未缓存");
      setLoading(false);
      return;
    }

    try {
      const fresh = await api.get<CachedMsgDetail>(`/api/me/messages/${messageId}`);
      setData(fresh);
      setFromCache(false);
      await cacheMessageDetail(fresh);
    } catch (e) {
      const ok = await loadCache();
      setError(
        ok
          ? `${e instanceof Error ? e.message : "加载失败"}，已显示缓存`
          : e instanceof Error
            ? e.message
            : "加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, [messageId, online]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, fromCache, refetch: load };
}
