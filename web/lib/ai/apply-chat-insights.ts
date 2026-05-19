import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { Reminder } from "@/models/Reminder";
import { PlacementInsight } from "@/models/PlacementInsight";
import { StudentPreferences } from "@/models/StudentPreferences";
import { Notification } from "@/models/Notification";
import { syncDeadlineToGoogleCalendar } from "@/lib/calendar/sync-deadline";
import type { ChatInsightItem } from "@/lib/ai/chat-insights";
import type { IStudentPreferences } from "@/models/StudentPreferences";

export async function applyChatInsightsForUser(
  userId: string,
  insights: ChatInsightItem[],
  prefs: IStudentPreferences | null
) {
  await connectDB();
  const tg = prefs?.telegram;
  const autoDl = tg?.autoCreateDeadlines !== false;
  const autoRm = tg?.autoCreateReminders !== false;
  const master = prefs?.automation?.masterEnabled !== false;

  await PlacementInsight.deleteMany({ userId });

  const created = { deadlines: 0, reminders: 0, insights: 0 };

  for (const item of insights) {
    let deadlineId: string | undefined;

    if (
      autoDl &&
      master &&
      item.extractedDeadline?.company &&
      item.extractedDeadline.deadline
    ) {
      const dlDate = new Date(item.extractedDeadline.deadline);
      if (!Number.isNaN(dlDate.getTime()) && dlDate.getTime() > Date.now() - 86400000) {
        const dup = await Deadline.findOne({
          userId,
          company: new RegExp(`^${item.extractedDeadline.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
          role: new RegExp(`^${item.extractedDeadline.role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        });
        if (!dup) {
          const doc = await Deadline.create({
            userId,
            company: item.extractedDeadline.company,
            role: item.extractedDeadline.role,
            deadline: dlDate,
            eligibility: item.extractedDeadline.eligibility || "",
            type: item.extractedDeadline.type || "full-time",
            links: item.extractedDeadline.links || [],
            status: "pending",
            confidence: item.confidence,
            isGlobal: false,
            notes: `Auto from Telegram insight: ${item.title}`,
          });
          deadlineId = String(doc._id);
          created.deadlines += 1;

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

    let reminderCount = 0;
    if (autoRm && master && prefs?.automation?.aiAutoReminders !== false && deadlineId) {
      const deadline = await Deadline.findById(deadlineId);
      if (deadline) {
        const dl = deadline.deadline.getTime();
        const offsets =
          item.suggestedReminderOffsetsMinutes.length > 0
            ? item.suggestedReminderOffsetsMinutes
            : prefs?.reminders?.defaultOffsetsMinutes || [24 * 60, 6 * 60, 60, 15];

        await Reminder.deleteMany({
          userId,
          deadlineId: deadline._id,
          sent: false,
          aiSuggested: true,
        });

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
            title: item.title.slice(0, 80),
            message: item.summary.slice(0, 400),
            priority:
              item.urgency === "critical"
                ? "critical"
                : item.urgency === "high"
                  ? "high"
                  : "medium",
            status: "active",
            enabled: true,
            aiSuggested: true,
            sent: false,
            repeatRule: "none",
          });
          reminderCount += 1;
        }
        created.reminders += reminderCount;
      }
    }

    await PlacementInsight.create({
      userId,
      groupId: item.groupId,
      groupTitle: item.groupTitle,
      rank: item.rank,
      title: item.title,
      summary: item.summary,
      urgency: item.urgency,
      category: item.category,
      confidence: item.confidence,
      deadlineId,
      reminderCount,
      sourceMessageIds: item.sourceMessageIds,
    });
    created.insights += 1;

    if (item.urgency === "critical" || item.urgency === "high") {
      await Notification.create({
        userId,
        title: item.title,
        message: item.summary,
        type: "placement",
        read: false,
      });
    }
  }

  return created;
}
