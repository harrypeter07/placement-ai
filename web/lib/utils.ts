import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelative(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();

  // Compare using local midnight dates to avoid hour-boundary differences
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = dMidnight.getTime() - nowMidnight.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays}d`;
}

export function getUrgencyLevel(deadline: Date | string): "critical" | "high" | "medium" | "low" {
  const diff = new Date(deadline).getTime() - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 0) return "critical";
  if (hours < 24) return "critical";
  if (hours < 72) return "high";
  if (hours < 168) return "medium";
  return "low";
}
