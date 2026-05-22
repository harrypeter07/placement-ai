import type { ReminderPriority } from "@/models/Reminder";
import type { EscalationLevel } from "@/models/NotificationLog";

export const ESCALATION_ORDER: EscalationLevel[] = ["soft", "normal", "urgent", "critical"];

export function priorityToEscalation(priority: ReminderPriority): EscalationLevel {
  if (priority === "critical") return "critical";
  if (priority === "high") return "urgent";
  if (priority === "medium") return "normal";
  return "soft";
}

export function nextEscalation(current: EscalationLevel): EscalationLevel {
  const i = ESCALATION_ORDER.indexOf(current);
  return ESCALATION_ORDER[Math.min(i + 1, ESCALATION_ORDER.length - 1)];
}

/** Minutes until next repeat if user ignores notification */
export function escalationRepeatMinutes(level: EscalationLevel): number {
  switch (level) {
    case "soft":
      return 120;
    case "normal":
      return 60;
    case "urgent":
      return 20;
    case "critical":
      return 10;
  }
}

export function notificationOptionsForLevel(level: EscalationLevel): NotificationOptions {
  const base: NotificationOptions = {
    requireInteraction: false,
    silent: false,
  };
  switch (level) {
    case "soft":
      return { ...base, silent: true };
    case "normal":
      return base;
    case "urgent":
      return { ...base, requireInteraction: true };
    case "critical":
      return { ...base, requireInteraction: true };
  }
}

export function vibratePattern(level: EscalationLevel): number[] | undefined {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return undefined;
  switch (level) {
    case "soft":
      return [80];
    case "normal":
      return [100, 50, 100];
    case "urgent":
      return [200, 100, 200, 100, 200];
    case "critical":
      return [300, 100, 300, 100, 300, 100, 300];
  }
}
