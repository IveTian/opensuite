import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useOnline } from "./useOnline";

interface OfflineFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  cachedAt: number | null;
  refetch: () => Promise<void>;
  setData: (v: T | null) => void;
}

/**
 * 带离线回退的数据获取：在线时走 API 并写入缓存；离线或请求失败时读缓存。
 */
export function useOfflineFetch<T>(
  path: string | null,
  options: {
    cacheKey?: string;
    onFetched?: (data: T) => void | Promise<void>;
    getCached?: () => Promise<T | null>;
    enabled?: boolean;
  } = {},
): OfflineFetchState<T> {
  const online = useOnline();
  const { cacheKey, onFetched, getCached, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const refetch = useCallback(async () => {
    if (!path || !enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const tryCache = async () => {
      if (!getCached) return false;
      const cached = await getCached();
      if (cached == null) return false;
      setData(cached);
      setFromCache(true);
      return true;
    };

    if (!online) {
      const ok = await tryCache();
      if (!ok) setError("当前离线，且无本地缓存");
      setLoading(false);
      return;
    }

    try {
      const fresh = await api.get<T>(path);
      setData(fresh);
      setFromCache(false);
      setCachedAt(Date.now());
      if (onFetched) await onFetched(fresh);
    } catch (e) {
      const ok = await tryCache();
      if (ok) {
        setError(e instanceof Error ? e.message : "加载失败，已显示缓存");
      } else {
        setError(e instanceof Error ? e.message : "加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, [path, enabled, online, getCached, onFetched, cacheKey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, fromCache, cachedAt, refetch, setData };
}
