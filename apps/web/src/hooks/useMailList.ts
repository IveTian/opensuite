import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  cacheMessageList,
  getCachedMessageList,
  searchCachedMessages,
  type CachedMsgItem,
} from "../lib/offline/mail-cache";
import { useOnline } from "./useOnline";

interface ListResult {
  items: CachedMsgItem[];
  total: number;
}

/** 邮件列表获取：在线拉 API 并缓存，离线读 IndexedDB */
export function useMailList(opts: {
  accountId: string;
  folder: string;
  page: number;
  searchActive: boolean;
  listPath: string;
  searchQ?: string;
}) {
  const { accountId, folder, page, searchActive, listPath, searchQ } = opts;
  const online = useOnline();
  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const loadCache = async (): Promise<boolean> => {
      if (searchActive && searchQ) {
        const items = await searchCachedMessages(accountId, searchQ);
        if (!items.length) return false;
        setData({ items, total: items.length });
        setFromCache(true);
        return true;
      }
      if (searchActive) return false;
      const cached = await getCachedMessageList(accountId, folder, page);
      if (!cached) return false;
      setData({ items: cached.items, total: cached.total });
      setFromCache(true);
      return true;
    };

    if (!online) {
      const ok = await loadCache();
      if (!ok) setError("当前离线，该文件夹尚无本地缓存");
      setLoading(false);
      return;
    }

    try {
      const fresh = await api.get<ListResult>(listPath);
      setData(fresh);
      setFromCache(false);
      if (!searchActive) {
        await cacheMessageList(accountId, folder, page, fresh.items, fresh.total);
      }
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
  }, [accountId, folder, page, searchActive, listPath, searchQ, online]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, fromCache, refetch: load, setData };
}
