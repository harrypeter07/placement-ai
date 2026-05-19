"use client";

import { useEffect, useState } from "react";
import { Users, Megaphone, TrendingUp } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
  const [students, setStudents] = useState(0);

  useEffect(() => {
    fetch("/api/admin/students").then((r) => r.json()).then((d) => Array.isArray(d) && setStudents(d.length));
  }, []);

  return (
    <>
      <DashboardHeader title="Admin Overview" />
      <main className="p-4 lg:p-8 space-y-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard title="Students" value={students} icon={Users} />
          <StatCard title="Broadcasts" value="—" icon={Megaphone} />
          <StatCard title="Placement Rate" value="72%" icon={TrendingUp} trend="Campus average" />
        </section>
        <Card className="glass">
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="flex gap-3 flex-wrap">
            <Button asChild variant="glow"><Link href="/admin/broadcasts">Send Broadcast</Link></Button>
            <Button asChild variant="outline"><Link href="/admin/students">Manage Students</Link></Button>
            <Button asChild variant="outline"><Link href="/admin/analytics">View Analytics</Link></Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
