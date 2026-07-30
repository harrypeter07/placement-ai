"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Clock, CheckCircle, XCircle, Target, Bell, Flame, TrendingUp, Sparkles,
  ClipboardList, PhoneCall, FileText, ArrowRight, ShieldCheck
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { SystemStatusBar } from "@/components/dashboard/system-status";
import { StatCard } from "@/components/dashboard/stat-card";
import { BentoHeroRadar } from "@/components/dashboard/bento-hero-radar";
import { HowItWorksBento } from "@/components/dashboard/how-it-works-bento";
import { ApplicationActivityChart, UpcomingDeadlinesChart, StatusPieChart } from "@/components/dashboard/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  const [pinnedInsights, setPinnedInsights] = useState<
    { _id: string; title: string; summary: string; urgency: string }[]
  >([]);

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

    fetch("/api/telegram/insights?overview=pinned", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setPinnedInsights(d.slice(0, 5));
      })
      .catch(() => undefined);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <>
      <DashboardHeader title="Overview & Bento Command Center" />
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto"
      >
        {/* System Health Status Bar */}
        <SystemStatusBar />

        {analyticsError && (
          <p className="text-xs text-amber-300 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center justify-between">
            <span>{analyticsError}</span>
            <Link href="/login" className="underline font-bold hover:text-amber-100 ml-2">Re-authenticate &rarr;</Link>
          </p>
        )}

        {/* ── BENTO ROW 1: Hero Capability Radar & Level Progression ── */}
        <BentoHeroRadar
          productivityScore={stats?.productivityScore ?? 85}
          placementStreak={stats?.placementStreak ?? 1}
          appliedCount={stats?.appliedCompanies ?? 0}
          eligibleCount={stats?.eligibleCompanies ?? 0}
        />

        {/* ── BENTO ROW 2: Key Metric Cards Grid ── */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl bg-white/5 border border-white/10" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard title="Upcoming Deadlines" value={stats?.upcomingDeadlines ?? 0} icon={Clock} trend="Next 7 days" />
            <StatCard title="Applied Drives" value={stats?.appliedCompanies ?? 0} icon={CheckCircle} trend="100% Tracked" />
            <StatCard title="Missed Opportunities" value={stats?.missedOpportunities ?? 0} icon={XCircle} />
            <StatCard title="Eligible Companies" value={stats?.eligibleCompanies ?? 0} icon={Target} trend="Match Rate" />
            <StatCard title="Scheduled Reminders" value={stats?.reminderCount ?? 0} icon={Bell} trend="Phone + Web" />
          </div>
        )}

        {/* ── BENTO ROW 3: Interactive How PlaceMint AI Works Visualizer ── */}
        <HowItWorksBento />

        {/* ── BENTO ROW 4: Pinned AI Insights & Activity Grid ── */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Pinned Insights Column */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="glass border-primary/20 bg-slate-950/80 backdrop-blur-xl h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between border-b border-white/10 pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-white">
                  <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />
                  Pinned AI Telegram Insights
                </CardTitle>
                <Link href="/dashboard/insights" className="text-xs text-purple-400 hover:underline flex items-center gap-1 font-semibold">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="p-4 space-y-3 flex-1">
                {pinnedInsights.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                    <p>No pinned insights yet.</p>
                    <p className="text-[11px] text-purple-300/80">Connect Telegram groups in Settings to auto-generate AI insights!</p>
                  </div>
                ) : (
                  pinnedInsights.map((ins) => (
                    <div key={ins._id} className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-3.5 space-y-1.5 hover:border-purple-500/40 transition-all">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-xs text-purple-200">{ins.title}</p>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 uppercase">
                          {ins.urgency || "Normal"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{ins.summary}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity Chart Column */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="glass border-white/10 bg-slate-950/80 backdrop-blur-xl">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                  <span>Application Activity Analytics</span>
                  <span className="text-xs font-mono text-emerald-400 font-normal">Live Tracking</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-6">
                {loading ? <Skeleton className="h-[280px]" /> : (
                  <ApplicationActivityChart data={charts?.applicationActivity || []} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── BENTO ROW 5: Upcoming Deadlines & Breakdown Grid ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass border-white/10 bg-slate-950/80 backdrop-blur-xl">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                <span>Upcoming Placement Deadlines</span>
                <Link href="/dashboard/deadlines" className="text-xs text-purple-400 hover:underline">
                  All Deadlines &rarr;
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-6">
              {loading ? <Skeleton className="h-[260px]" /> : (
                <UpcomingDeadlinesChart data={charts?.upcomingChart || []} />
              )}
            </CardContent>
          </Card>

          <Card className="glass border-white/10 bg-slate-950/80 backdrop-blur-xl">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="text-base font-bold text-white">Application Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-6">
              {loading ? <Skeleton className="h-[260px]" /> : (
                <StatusPieChart data={charts?.statusBreakdown || []} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Quick Action Hub Banner ── */}
        <div className="p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/40 via-slate-900 to-emerald-950/40 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-lg font-bold text-white flex items-center justify-center md:justify-start gap-2">
              <Sparkles className="h-5 w-5 text-emerald-400 animate-pulse" />
              Automate Your Placement Applications Today
            </h3>
            <p className="text-xs text-slate-300">
              Auto-fill Google Forms, set up Twilio phone calls, and sync your Telegram drive announcements in 1-click.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/dashboard/forms">
              <Button variant="glow" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Auto-Fill Google Form
              </Button>
            </Link>
            <Link href="/dashboard/calls">
              <Button variant="outline" size="sm" className="border-white/10 bg-white/5 hover:bg-white/10 text-xs gap-1.5">
                <PhoneCall className="h-3.5 w-3.5 text-orange-400" /> Voice Call Logs
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </>
  );
}
