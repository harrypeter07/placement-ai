"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, CheckCircle, XCircle, Target, Bell, Flame, TrendingUp } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { SystemStatusBar } from "@/components/dashboard/system-status";
import { StatCard } from "@/components/dashboard/stat-card";
import { ApplicationActivityChart, UpcomingDeadlinesChart, StatusPieChart } from "@/components/dashboard/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStats } from "@/types";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [charts, setCharts] = useState<{
    applicationActivity: { date: string; applications: number }[];
    upcomingChart: { company: string; daysLeft: number }[];
    statusBreakdown: { _id: string; count: number }[];
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    fetch("/api/analytics", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          const msg = data.error ?? `Request failed (${r.status})`;
          setAnalyticsError(msg === "Unauthorized" ? "Session expired — sign out and log in again." : msg);
          return;
        }
        setAnalyticsError(null);
        setStats(data.stats ?? null);
        setCharts({
          applicationActivity: data.applicationActivity || [],
          upcomingChart: data.upcomingChart || [],
          statusBreakdown: data.statusBreakdown || [],
        });
      })
      .catch((err) => {
        if (err?.name !== "AbortError") console.warn("[dashboard] analytics fetch failed", err);
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <>
      <DashboardHeader title="Overview" />
      <motion.div className="p-4 lg:p-8 space-y-8">
        <SystemStatusBar />
        {analyticsError && (
          <p className="text-sm text-amber-400/90 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
            {analyticsError}
          </p>
        )}
        {loading ? (
          <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
          >
            <StatCard title="Upcoming Deadlines" value={stats?.upcomingDeadlines ?? 0} icon={Clock} trend="Next 7 days" />
            <StatCard title="Applied" value={stats?.appliedCompanies ?? 0} icon={CheckCircle} />
            <StatCard title="Missed" value={stats?.missedOpportunities ?? 0} icon={XCircle} />
            <StatCard title="Eligible" value={stats?.eligibleCompanies ?? 0} icon={Target} />
            <StatCard title="Reminders" value={stats?.reminderCount ?? 0} icon={Bell} />
          </motion.div>
        )}

        <motion.div className="grid gap-4 sm:grid-cols-2">
          <Card className="glass">
            <CardHeader><CardTitle className="flex items-center gap-2"><Flame className="h-4 w-4 text-orange-400" /> Placement Streak</CardTitle></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gradient">{stats?.placementStreak ?? 0} days</p>
              <p className="text-sm text-muted-foreground mt-1">Keep applying daily!</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Productivity Score</CardTitle></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.productivityScore ?? 0}%</p>
              <p className="text-sm text-muted-foreground mt-1">Based on applications & tracking</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass">
            <CardHeader><CardTitle>Application Activity</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-[280px]" /> : (
                <ApplicationActivityChart data={charts?.applicationActivity || []} />
              )}
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader><CardTitle>Upcoming Deadlines</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-[280px]" /> : (
                <UpcomingDeadlinesChart data={charts?.upcomingChart || []} />
              )}
            </CardContent>
          </Card>
        </motion.div>

        <Card className="glass">
          <CardHeader><CardTitle>Application Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[280px]" /> : (
              <StatusPieChart data={charts?.statusBreakdown || []} />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}
