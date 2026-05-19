import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { Application } from "@/models/Application";
import { Reminder } from "@/models/Reminder";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    const userFilter = { $or: [{ userId: user.id }, { isGlobal: true }] };

    const [upcoming, applied, missed, pending, reminders] = await Promise.all([
      Deadline.countDocuments({ ...userFilter, deadline: { $gte: new Date() }, status: "pending" }),
      Deadline.countDocuments({ ...userFilter, status: "applied" }),
      Deadline.countDocuments({ ...userFilter, status: "missed" }),
      Deadline.countDocuments({ ...userFilter, status: "pending" }),
      Reminder.countDocuments({ userId: user.id, sent: false }),
    ]);

    const deadlines = await Deadline.find(userFilter).sort({ deadline: 1 }).limit(30);
    const activityByWeek: Record<string, number> = {};
    deadlines.forEach((d) => {
      const week = new Date(d.createdAt).toISOString().slice(0, 10);
      activityByWeek[week] = (activityByWeek[week] || 0) + 1;
    });

    const applicationActivity = Object.entries(activityByWeek).map(([date, count]) => ({
      date,
      applications: count,
    }));

    const upcomingChart = deadlines
      .filter((d) => d.deadline >= new Date())
      .slice(0, 7)
      .map((d) => ({
        company: d.company.slice(0, 12),
        daysLeft: Math.ceil((d.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }));

    const statusBreakdown = await Deadline.aggregate([
      { $match: userFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    return NextResponse.json({
      stats: {
        upcomingDeadlines: upcoming,
        appliedCompanies: applied,
        missedOpportunities: missed,
        eligibleCompanies: pending,
        reminderCount: reminders,
        placementStreak: 7,
        productivityScore: Math.min(100, applied * 10 + upcoming * 5),
      },
      applicationActivity,
      upcomingChart,
      statusBreakdown,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
