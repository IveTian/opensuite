import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/** 极简数据获取 hook：加载/错误/重取 */
const FETCH_CACHE_TTL_MS = 15_000;
const fetchMemoryCache = new Map<
  string,
  { data: unknown; updatedAt: number; inflight?: Promise<unknown> }
>();

export function useFetch<T>(path: string | null) {
  const warm = path ? fetchMemoryCache.get(path) : undefined;
  const [data, setData] = useState<T | null>(() => (warm ? (warm.data as T) : null));
  const [loading, setLoading] = useState(() => Boolean(path && !warm));
  const [error, setError] = useState<string | null>(null);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const fetchData = useCallback(
    async ({ force = false, background = false }: { force?: boolean; background?: boolean } = {}) => {
      if (!path) return;
      if (!background) setLoading(true);
      setError(null);

      const cached = fetchMemoryCache.get(path);
      const isFresh = !force && cached && Date.now() - cached.updatedAt < FETCH_CACHE_TTL_MS;
      if (isFresh) {
        if (pathRef.current === path) {
          setData(cached.data as T);
          if (!background) setLoading(false);
        }
        return;
      }

      try {
        let req = cached?.inflight as Promise<T> | undefined;
        if (!req || force) {
          req = api.get<T>(path);
          fetchMemoryCache.set(path, {
            data: cached?.data ?? null,
            updatedAt: cached?.updatedAt ?? 0,
            inflight: req,
          });
        }

        const fresh = await req;
        fetchMemoryCache.set(path, { data: fresh, updatedAt: Date.now() });
        if (pathRef.current === path) setData(fresh);
      } catch (e) {
        if (pathRef.current === path) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (pathRef.current === path && !background) setLoading(false);
      }
    },
    [path],
  );

  const refetch = useCallback(async () => {
    if (!path) return;
    await fetchData({ force: true, background: data !== null });
  }, [path, fetchData, data]);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const cached = fetchMemoryCache.get(path);
    if (cached) {
      setData(cached.data as T);
      setLoading(false);
      setError(null);
      if (Date.now() - cached.updatedAt >= FETCH_CACHE_TTL_MS) {
        void fetchData({ background: true });
      }
      return;
    }
    void fetchData();
  }, [path, fetchData]);

  return { data, loading, error, refetch, setData };
}
