import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuth();

    // 1. Run count queries in parallel via Supabase
    const [
      { count: upcoming },
      { count: applied },
      { count: missed },
      { count: pending },
      { count: reminders }
    ] = await Promise.all([
      supabase
        .from("deadlines")
        .select("id", { count: "exact", head: true })
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .gte("deadline_date", new Date().toISOString())
        .eq("status", "pending"),
      supabase
        .from("deadlines")
        .select("id", { count: "exact", head: true })
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .eq("status", "applied"),
      supabase
        .from("deadlines")
        .select("id", { count: "exact", head: true })
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .eq("status", "missed"),
      supabase
        .from("deadlines")
        .select("id", { count: "exact", head: true })
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .eq("status", "pending"),
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("sent", false),
    ]);

    // 2. Query deadlines list
    const { data: deadlines } = await supabase
      .from("deadlines")
      .select("*")
      .or(`user_id.eq.${user.id},is_global.eq.true`)
      .order("deadline_date", { ascending: true })
      .limit(30);

    const activityByWeek: Record<string, number> = {};
    (deadlines || []).forEach((d) => {
      const week = new Date(d.created_at || new Date()).toISOString().slice(0, 10);
      activityByWeek[week] = (activityByWeek[week] || 0) + 1;
    });

    const applicationActivity = Object.entries(activityByWeek).map(([date, count]) => ({
      date,
      applications: count,
    }));

    const upcomingChart = (deadlines || [])
      .filter((d) => new Date(d.deadline_date) >= new Date())
      .slice(0, 7)
      .map((d) => ({
        company: d.company.slice(0, 12),
        daysLeft: Math.ceil((new Date(d.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }));

    // 3. Compute status breakdown by grouping in JS
    const { data: statuses } = await supabase
      .from("deadlines")
      .select("status")
      .or(`user_id.eq.${user.id},is_global.eq.true`);

    const counts: Record<string, number> = {};
    (statuses || []).forEach((d) => {
      counts[d.status] = (counts[d.status] || 0) + 1;
    });
    const statusBreakdown = Object.entries(counts).map(([_id, count]) => ({
      _id,
      count,
    }));

    const upVal = upcoming || 0;
    const appVal = applied || 0;
    const misVal = missed || 0;
    const penVal = pending || 0;
    const remVal = reminders || 0;

    return NextResponse.json({
      stats: {
        upcomingDeadlines: upVal,
        appliedCompanies: appVal,
        missedOpportunities: misVal,
        eligibleCompanies: penVal,
        reminderCount: remVal,
        placementStreak: 7,
        productivityScore: Math.min(100, appVal * 10 + upVal * 5),
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
