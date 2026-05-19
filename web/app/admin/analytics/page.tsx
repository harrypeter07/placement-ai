"use client";

import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationActivityChart, StatusPieChart } from "@/components/dashboard/charts";

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<{ applicationActivity: { date: string; applications: number }[]; statusBreakdown: { _id: string; count: number }[] } | null>(null);

  useEffect(() => {
    fetch("/api/analytics").then((r) => r.json()).then(setData);
  }, []);

  return (
    <>
      <DashboardHeader title="Placement Analytics" />
      <main className="p-4 lg:p-8 grid gap-6">
        <Card className="glass">
          <CardHeader><CardTitle>Campus Application Activity</CardTitle></CardHeader>
          <CardContent><ApplicationActivityChart data={data?.applicationActivity || []} /></CardContent>
        </Card>
        <Card className="glass">
          <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
          <CardContent><StatusPieChart data={data?.statusBreakdown || []} /></CardContent>
        </Card>
      </main>
    </>
  );
}
