import type { InsightRow } from "@/components/telegram/insights-analysis-panel";

export function insightIdString(id: unknown): string {
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "_id" in id) {
    return insightIdString((id as { _id: unknown })._id);
  }
  return String(id);
}

export function hasValidExtractedDeadline(ins: Pick<InsightRow, "extractedDeadline">): boolean {
  const ext = ins.extractedDeadline;
  if (!ext?.company?.trim() || !ext.deadline?.trim()) return false;
  const d = new Date(ext.deadline);
  return !Number.isNaN(d.getTime());
}

/** Can create a calendar deadline + reminders */
export function isActionableDeadlineInsight(ins: InsightRow): boolean {
  return hasValidExtractedDeadline(ins);
}

export function isInfoOnlyInsight(ins: InsightRow): boolean {
  return !isActionableDeadlineInsight(ins);
}
