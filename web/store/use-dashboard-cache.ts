import { create } from "zustand";

const DEFAULT_TTL_MS = 90_000;

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

function isFresh(entry: CacheEntry<unknown> | undefined, ttlMs: number) {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ttlMs;
}

type DashboardCacheState = {
  ttlMs: number;
  deadlines: CacheEntry<unknown[]> | null;
  reminders: CacheEntry<unknown[]> | null;
  settings: CacheEntry<Record<string, unknown>> | null;
  telegramGroups: CacheEntry<unknown[]> | null;
  insights: CacheEntry<unknown[]> | null;
  calendarByRange: Record<string, CacheEntry<Record<string, unknown>>>;

  setDeadlines: (data: unknown[]) => void;
  setReminders: (data: unknown[]) => void;
  setSettings: (data: Record<string, unknown>) => void;
  setTelegramGroups: (data: unknown[]) => void;
  setInsights: (data: unknown[]) => void;
  setCalendar: (rangeKey: string, data: Record<string, unknown>) => void;

  getDeadlines: () => unknown[] | null;
  getReminders: () => unknown[] | null;
  getSettings: () => Record<string, unknown> | null;
  getTelegramGroups: () => unknown[] | null;
  getInsights: () => unknown[] | null;
  getCalendar: (rangeKey: string) => Record<string, unknown> | null;

  isDeadlinesFresh: () => boolean;
  isRemindersFresh: () => boolean;
  isTelegramGroupsFresh: () => boolean;
  isInsightsFresh: () => boolean;
  isCalendarFresh: (rangeKey: string) => boolean;
  invalidateDeadlines: () => void;
  invalidateReminders: () => void;
  invalidateCalendar: (rangeKey?: string) => void;
  invalidateAll: () => void;
};

export const useDashboardCache = create<DashboardCacheState>((set, get) => ({
  ttlMs: DEFAULT_TTL_MS,
  deadlines: null,
  reminders: null,
  settings: null,
  telegramGroups: null,
  insights: null,
  calendarByRange: {},

  setDeadlines: (data) => set({ deadlines: { data, fetchedAt: Date.now() } }),
  setReminders: (data) => set({ reminders: { data, fetchedAt: Date.now() } }),
  setSettings: (data) => set({ settings: { data, fetchedAt: Date.now() } }),
  setTelegramGroups: (data) => set({ telegramGroups: { data, fetchedAt: Date.now() } }),
  setInsights: (data) => set({ insights: { data, fetchedAt: Date.now() } }),
  setCalendar: (rangeKey, data) =>
    set((s) => ({
      calendarByRange: { ...s.calendarByRange, [rangeKey]: { data, fetchedAt: Date.now() } },
    })),

  getDeadlines: () => get().deadlines?.data ?? null,
  getReminders: () => get().reminders?.data ?? null,
  getSettings: () => get().settings?.data ?? null,
  getTelegramGroups: () => get().telegramGroups?.data ?? null,
  getInsights: () => get().insights?.data ?? null,
  getCalendar: (rangeKey) => get().calendarByRange[rangeKey]?.data ?? null,

  isDeadlinesFresh: () => isFresh(get().deadlines ?? undefined, get().ttlMs),
  isRemindersFresh: () => isFresh(get().reminders ?? undefined, get().ttlMs),
  isTelegramGroupsFresh: () => isFresh(get().telegramGroups ?? undefined, get().ttlMs),
  isInsightsFresh: () => isFresh(get().insights ?? undefined, get().ttlMs),
  isCalendarFresh: (rangeKey) => isFresh(get().calendarByRange[rangeKey], get().ttlMs),

  invalidateDeadlines: () => set({ deadlines: null }),
  invalidateReminders: () => set({ reminders: null }),
  invalidateCalendar: (rangeKey) => {
    if (!rangeKey) return set({ calendarByRange: {} });
    set((s) => {
      const next = { ...s.calendarByRange };
      delete next[rangeKey];
      return { calendarByRange: next };
    });
  },
  invalidateAll: () =>
    set({
      deadlines: null,
      reminders: null,
      settings: null,
      telegramGroups: null,
      insights: null,
      calendarByRange: {},
    }),
}));
