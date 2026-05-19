"use client";

import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationActivityChart, UpcomingDeadlinesChart, StatusPieChart } from "@/components/dashboard/charts";

export default function AnalyticsPage() {
  const [data, setData] = useState<{
    applicationActivity: { date: string; applications: number }[];
    upcomingChart: { company: string; daysLeft: number }[];
    statusBreakdown: { _id: string; count: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <DashboardHeader title="Analytics" />
      <main className="p-4 lg:p-8 grid gap-6 lg:grid-cols-2">
        <Card className="glass lg:col-span-2">
          <CardHeader><CardTitle>Application Activity</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[280px]" /> : <ApplicationActivityChart data={data?.applicationActivity || []} />}</CardContent>
        </Card>
        <Card className="glass">
          <CardHeader><CardTitle>Upcoming Deadlines</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[280px]" /> : <UpcomingDeadlinesChart data={data?.upcomingChart || []} />}</CardContent>
        </Card>
        <Card className="glass">
          <CardHeader><CardTitle>Status Breakdown</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[280px]" /> : <StatusPieChart data={data?.statusBreakdown || []} />}</CardContent>
        </Card>
      </main>
    </>
  );
}
