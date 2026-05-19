"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options<T> = {
  key: string;
  fetcher: () => Promise<T>;
  getCached: () => T | null;
  setCached: (data: T) => void;
  isFresh: () => boolean;
  enabled?: boolean;
  /** Background refresh interval (ms). 0 = off */
  pollMs?: number;
};

export function useCachedFetch<T>({
  key,
  fetcher,
  getCached,
  setCached,
  isFresh,
  enabled = true,
  pollMs = 0,
}: Options<T>) {
  const cached = getCached();
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const run = useCallback(
    async (background: boolean) => {
      if (!enabled) return;
      if (!background) setLoading((prev) => (data ? prev : true));
      else setRefreshing(true);
      setError(null);
      try {
        const result = await fetcher();
        if (!mounted.current) return;
        setCached(result);
        setData(result);
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!mounted.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, fetcher, setCached, data]
  );

  const refresh = useCallback(async () => {
    await run(true);
  }, [run]);

  useEffect(() => {
    mounted.current = true;
    const hit = getCached();
    if (hit) setData(hit);

    if (isFresh() && hit) {
      setLoading(false);
      void run(true);
    } else {
      void run(false);
    }

    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key triggers reload
  }, [key, enabled]);

  useEffect(() => {
    if (!pollMs || !enabled) return;
    const id = setInterval(() => void run(true), pollMs);
    return () => clearInterval(id);
  }, [pollMs, enabled, run]);

  return { data, loading, refreshing, error, refresh, setData };
}
