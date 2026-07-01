import { useCallback, useEffect, useRef, useState } from "react";
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

const MAIL_LIST_CACHE_TTL_MS = 15_000;
const listMemoryCache = new Map<
  string,
  { data: ListResult; updatedAt: number; inflight?: Promise<ListResult> }
>();

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
  const cacheKey = listPath;
  const warm = listMemoryCache.get(cacheKey);
  const online = useOnline();
  const [data, setData] = useState<ListResult | null>(() => warm?.data ?? null);
  const [loading, setLoading] = useState(() => !warm);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const keyRef = useRef(cacheKey);
  useEffect(() => {
    keyRef.current = cacheKey;
  }, [cacheKey]);

  const load = useCallback(
    async ({ force = false, background = false }: { force?: boolean; background?: boolean } = {}) => {
      if (!background) setLoading(true);
      setError(null);

      const memory = listMemoryCache.get(cacheKey);
      const memoryFresh =
        !force && memory && Date.now() - memory.updatedAt < MAIL_LIST_CACHE_TTL_MS;
      if (memoryFresh) {
        if (keyRef.current === cacheKey) {
          setData(memory.data);
          setFromCache(false);
          if (!background) setLoading(false);
        }
        return;
      }

      const loadCache = async (): Promise<boolean> => {
        if (memory && keyRef.current === cacheKey) {
          setData(memory.data);
          setFromCache(false);
          return true;
        }
        if (searchActive && searchQ) {
          const items = await searchCachedMessages(accountId, searchQ);
          if (!items.length) return false;
          if (keyRef.current === cacheKey) {
            setData({ items, total: items.length });
            setFromCache(true);
          }
          return true;
        }
        if (searchActive) return false;
        const cached = await getCachedMessageList(accountId, folder, page);
        if (!cached) return false;
        if (keyRef.current === cacheKey) {
          const cachedData = { items: cached.items, total: cached.total };
          setData(cachedData);
          setFromCache(true);
          listMemoryCache.set(cacheKey, {
            data: cachedData,
            updatedAt: cached.cachedAt,
          });
        }
        return true;
      };

      if (!online) {
        const ok = await loadCache();
        if (!ok && keyRef.current === cacheKey) setError("当前离线，该文件夹尚无本地缓存");
        if (keyRef.current === cacheKey && !background) setLoading(false);
        return;
      }

      try {
        let req = memory?.inflight;
        if (!req || force) {
          req = api.get<ListResult>(listPath);
          listMemoryCache.set(cacheKey, {
            data: memory?.data ?? { items: [], total: 0 },
            updatedAt: memory?.updatedAt ?? 0,
            inflight: req,
          });
        }
        const fresh = await req;
        listMemoryCache.set(cacheKey, { data: fresh, updatedAt: Date.now() });
        if (keyRef.current === cacheKey) {
          setData(fresh);
          setFromCache(false);
        }
        if (!searchActive) {
          await cacheMessageList(accountId, folder, page, fresh.items, fresh.total);
        }
      } catch (e) {
        const ok = await loadCache();
        if (keyRef.current === cacheKey) {
          setError(
            ok
              ? `${e instanceof Error ? e.message : "加载失败"}，已显示缓存`
              : e instanceof Error
                ? e.message
                : "加载失败",
          );
        }
      } finally {
        if (keyRef.current === cacheKey && !background) setLoading(false);
      }
    },
    [accountId, folder, page, searchActive, listPath, searchQ, online, cacheKey],
  );

  useEffect(() => {
    const memory = listMemoryCache.get(cacheKey);
    if (memory) {
      setData(memory.data);
      setLoading(false);
      setFromCache(false);
      setError(null);
    }
    if (memory && online && Date.now() - memory.updatedAt < MAIL_LIST_CACHE_TTL_MS) return;
    void load({ background: Boolean(memory) });
  }, [cacheKey, online, load]);

  const refetch = useCallback(async () => {
    await load({ force: true, background: data !== null });
  }, [load, data]);

  return { data, loading, error, fromCache, refetch, setData };
}
