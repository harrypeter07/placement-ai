import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { Reminder } from "@/models/Reminder";
import { PlacementInsight, type IPlacementInsight } from "@/models/PlacementInsight";
import { Notification } from "@/models/Notification";
import { syncDeadlineToGoogleCalendar } from "@/lib/calendar/sync-deadline";
import { priorityToEscalation } from "@/lib/reminders/escalation";
import type { ChatInsightItem } from "@/lib/ai/chat-insights";
import type { IStudentPreferences } from "@/models/StudentPreferences";
import type { ReminderPriority } from "@/models/Reminder";

export type ApplyInsightOptions = {
  createDeadlines?: boolean;
  createReminders?: boolean;
  pinToOverview?: boolean;
  markApplied?: boolean;
};

export type AppliedInsightResult = {
  insightId: string;
  title: string;
  deadlineCreated: boolean;
  deadlineId?: string;
  remindersCreated: number;
  reminderSchedule: { minutesBefore: number; label: string }[];
};

function offsetLabel(minutes: number): string {
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d before`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h before`;
  return `${minutes}m before`;
}

/** Persist AI insight rows (draft) without creating deadlines/reminders */
export async function storeDraftInsights(
  userId: string,
  insights: ChatInsightItem[],
  scopeGroupId?: string
) {
  await connectDB();
  await PlacementInsight.deleteMany({
    userId,
    status: "draft",
    ...(scopeGroupId ? { groupId: scopeGroupId } : {}),
  });

  const docs: IPlacementInsight[] = [];
  for (const item of insights) {
    const preview = item.summary.slice(0, 280);
    const doc = await PlacementInsight.create({
      userId,
      groupId: item.groupId,
      groupTitle: item.groupTitle,
      rank: item.rank,
      title: item.title,
      summary: item.summary,
      whyRanked: item.whyRanked,
      urgency: item.urgency,
      category: item.category,
      confidence: item.confidence,
      status: "draft",
      pinnedToOverview: false,
      extractedDeadline: item.extractedDeadline || undefined,
      suggestedReminderOffsetsMinutes: item.suggestedReminderOffsetsMinutes,
      sourceMessageIds: item.sourceMessageIds,
      sourceMessagePreview: preview,
      reminderCount: 0,
    });
    docs.push(doc);
  }
  return docs;
}

/** Apply one stored insight or raw item — deadlines + reminders */
export async function applySingleInsight(
  userId: string,
  item: ChatInsightItem | IPlacementInsight,
  prefs: IStudentPreferences | null,
  opts: ApplyInsightOptions = {}
): Promise<AppliedInsightResult> {
  await connectDB();
  const createDeadlines = opts.createDeadlines !== false;
  const createReminders = opts.createReminders !== false;
  const master = prefs?.automation?.masterEnabled !== false;
  const autoDl = prefs?.telegram?.autoCreateDeadlines !== false;
  const autoRm = prefs?.telegram?.autoCreateReminders !== false;

  const title = item.title;
  const summary = item.summary;
  const urgency = item.urgency;
  const extracted =
    "extractedDeadline" in item && item.extractedDeadline
      ? item.extractedDeadline
      : null;
  const offsets =
    ("suggestedReminderOffsetsMinutes" in item &&
      item.suggestedReminderOffsetsMinutes?.length) ||
    prefs?.reminders?.defaultOffsetsMinutes ||
    [24 * 60, 6 * 60, 60, 15];

  let deadlineId: string | undefined;
  let deadlineCreated = false;
  let remindersCreated = 0;
  const reminderSchedule: { minutesBefore: number; label: string }[] = [];

  if (
    createDeadlines &&
    master &&
    autoDl &&
    extracted?.company &&
    extracted.deadline
  ) {
    const dlDate = new Date(extracted.deadline);
    if (!Number.isNaN(dlDate.getTime()) && dlDate.getTime() > Date.now() - 86400000) {
      const dup = await Deadline.findOne({
        userId,
        company: new RegExp(
          `^${extracted.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
        role: new RegExp(
          `^${(extracted.role || "Role").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
      });
      if (!dup) {
        const doc = await Deadline.create({
          userId,
          company: extracted.company,
          role: extracted.role || "Role TBD",
          deadline: dlDate,
          eligibility: extracted.eligibility || "",
          type: extracted.type || "full-time",
          links: extracted.links || [],
          status: "pending",
          confidence: "confidence" in item ? item.confidence : 0.7,
          isGlobal: false,
          notes: `From Telegram insight: ${title}`,
        });
        deadlineId = String(doc._id);
        deadlineCreated = true;
        if (prefs?.calendar?.autoSync !== false && prefs?.calendar?.autoCreateEvents !== false) {
          try {
            await syncDeadlineToGoogleCalendar(userId, doc);
          } catch {
            /* optional */
          }
        }
      } else {
        deadlineId = String(dup._id);
      }
    }
  }

  if (createReminders && master && autoRm && prefs?.automation?.aiAutoReminders !== false && deadlineId) {
    const deadline = await Deadline.findById(deadlineId);
    if (deadline) {
      const dl = deadline.deadline.getTime();
      await Reminder.deleteMany({
        userId,
        deadlineId: deadline._id,
        sent: false,
        aiSuggested: true,
      });

      const priority = (
        urgency === "critical" ? "critical" : urgency === "high" ? "high" : "medium"
      ) as ReminderPriority;

      for (const minutes of offsets) {
        const scheduledAt = new Date(dl - minutes * 60 * 1000);
        if (scheduledAt <= new Date()) continue;
        await Reminder.create({
          userId,
          deadlineId: deadline._id,
          scheduledAt,
          minutesBeforeDeadline: minutes,
          offset: "custom",
          channels: ["browser", "dashboard"],
          title: title.slice(0, 80),
          message: summary.slice(0, 400),
          aiSummary: summary.slice(0, 200),
          priority,
          status: "active",
          enabled: true,
          aiSuggested: true,
          sent: false,
          repeatRule: "none",
          escalationLevel: priorityToEscalation(priority),
          escalationCount: 0,
          reminderStyle: priority === "critical" || priority === "high" ? "aggressive" : "balanced",
        });
        remindersCreated += 1;
        reminderSchedule.push({ minutesBefore: minutes, label: offsetLabel(minutes) });
      }
    }
  }

  if (urgency === "critical" || urgency === "high") {
    await Notification.create({
      userId,
      title,
      message: summary,
      type: "placement",
      read: false,
    });
  }

  const insightId =
    "_id" in item && item._id
      ? String(item._id)
      : new mongoose.Types.ObjectId().toString();

  if ("_id" in item && item._id) {
    await PlacementInsight.updateOne(
      { _id: item._id, userId },
      {
        $set: {
          status: opts.markApplied === false ? "draft" : "applied",
          deadlineId: deadlineId ? new mongoose.Types.ObjectId(deadlineId) : undefined,
          reminderCount: remindersCreated,
          pinnedToOverview: opts.pinToOverview ?? false,
        },
      }
    );
  }

  return {
    insightId,
    title,
    deadlineCreated,
    deadlineId,
    remindersCreated,
    reminderSchedule,
  };
}

export async function applyChatInsightsForUser(
  userId: string,
  insights: ChatInsightItem[],
  prefs: IStudentPreferences | null,
  scopeGroupId?: string,
  opts?: ApplyInsightOptions
) {
  await connectDB();
  await PlacementInsight.deleteMany({
    userId,
    ...(scopeGroupId ? { groupId: scopeGroupId } : {}),
    status: { $in: ["draft", "applied"] },
  });

  const created = { deadlines: 0, reminders: 0, insights: 0 };
  const results: AppliedInsightResult[] = [];

  for (const item of insights) {
    const doc = await PlacementInsight.create({
      userId,
      groupId: item.groupId,
      groupTitle: item.groupTitle,
      rank: item.rank,
      title: item.title,
      summary: item.summary,
      whyRanked: item.whyRanked,
      urgency: item.urgency,
      category: item.category,
      confidence: item.confidence,
      status: "draft",
      extractedDeadline: item.extractedDeadline || undefined,
      suggestedReminderOffsetsMinutes: item.suggestedReminderOffsetsMinutes,
      sourceMessageIds: item.sourceMessageIds,
      sourceMessagePreview: item.summary.slice(0, 280),
    });

    const applied = await applySingleInsight(userId, doc, prefs, {
      ...opts,
      markApplied: true,
      pinToOverview: opts?.pinToOverview,
    });
    results.push(applied);
    if (applied.deadlineCreated) created.deadlines += 1;
    created.reminders += applied.remindersCreated;
    created.insights += 1;
  }

  return { ...created, results };
}
