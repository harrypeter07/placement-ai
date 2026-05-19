"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Polls due reminders, shows toasts + optional browser notifications */
export function ReminderToastPoller() {
  const notified = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/reminders/due", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const list = (await res.json()) as Array<{
          _id: string;
          title?: string;
          message?: string;
          priority?: string;
        }>;
        if (!Array.isArray(list)) return;

        const ids: string[] = [];
        for (const r of list) {
          if (notified.current.has(r._id)) continue;
          notified.current.add(r._id);
          ids.push(r._id);
          const title = r.title || "Reminder";
          const body = r.message || "You have an upcoming placement deadline.";
          toast.info(title, { description: body, duration: 12_000 });
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body, tag: r._id });
          }
        }
        if (ids.length) {
          await fetch("/api/reminders/due", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
        }
      } catch {
        /* ignore */
      }
    }

    const id = setInterval(tick, 60_000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return null;
}
