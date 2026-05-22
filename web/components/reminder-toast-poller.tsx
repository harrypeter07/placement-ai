"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  notificationOptionsForLevel,
  vibratePattern,
} from "@/lib/reminders/escalation";
import type { EscalationLevel } from "@/models/NotificationLog";
import { UrgentAlertOverlay, type UrgentReminderPayload } from "@/components/pwa/urgent-alert-overlay";

type DueReminder = {
  _id: string;
  title?: string;
  message?: string;
  priority?: string;
  escalationLevel?: EscalationLevel;
  aiSummary?: string;
};

/** Polls due reminders with escalation — toasts, browser push, vibration, critical overlay */
export function ReminderToastPoller() {
  const shown = useRef(new Set<string>());
  const [urgent, setUrgent] = useState<UrgentReminderPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/reminders/due", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const list = (await res.json()) as DueReminder[];
        if (!Array.isArray(list)) return;

        const ids: string[] = [];
        for (const r of list) {
          const level = (r.escalationLevel || "normal") as EscalationLevel;
          const dedupeKey = `${r._id}:${level}`;
          if (shown.current.has(dedupeKey)) continue;
          shown.current.add(dedupeKey);
          ids.push(r._id);

          const title = r.title || "Reminder";
          const body = r.aiSummary || r.message || "You have an upcoming placement deadline.";
          const isCritical = level === "critical";
          const isUrgent = level === "urgent" || isCritical;

          toast[isCritical ? "error" : isUrgent ? "warning" : "info"](title, {
            description: body,
            duration: isCritical ? 30_000 : 12_000,
            action: {
              label: "Done",
              onClick: () => void ack([r._id]),
            },
          });

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            const opts = notificationOptionsForLevel(level);
            new Notification(title, {
              body,
              tag: dedupeKey,
              icon: "/icons/icon-192.png",
              ...opts,
              data: { url: "/dashboard/reminders", level },
            });
          }

          const pattern = vibratePattern(level);
          if (pattern && typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(pattern);
          }

          if (isCritical) {
            setUrgent({ id: r._id, title, message: body, escalationLevel: level });
          }
        }

        if (ids.length) {
          await fetch("/api/reminders/due", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, action: "escalate" }),
          });
        }
      } catch {
        /* ignore */
      }
    }

    async function ack(ids: string[]) {
      await fetch("/api/reminders/due", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: "ack" }),
      });
      setUrgent(null);
    }

    const id = setInterval(tick, 45_000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <UrgentAlertOverlay
      reminder={urgent}
      onAck={() => {
        if (!urgent) return;
        void fetch("/api/reminders/due", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [urgent.id], action: "ack" }),
        });
        setUrgent(null);
      }}
      onSnooze={() => {
        if (!urgent) return;
        void fetch("/api/reminders/due", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [urgent.id], action: "snooze", snoozeMinutes: 30 }),
        });
        setUrgent(null);
      }}
    />
  );
}
