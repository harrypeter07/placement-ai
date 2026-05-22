"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Settings2, RefreshCw } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { InsightsAnalysisPanel, type InsightRow } from "@/components/telegram/insights-analysis-panel";
import { LoadingButton } from "@/components/ui/loading-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [messageLimit, setMessageLimit] = useState(25);
  const [sinceDate, setSinceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [analyzedCount, setAnalyzedCount] = useState<number | undefined>();

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/telegram/insights", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setInsights(d);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((p) => {
        if (p.telegram?.insightMessageCount) setMessageLimit(p.telegram.insightMessageCount);
        if (p.telegram?.insightSinceDate) {
          setSinceDate(new Date(p.telegram.insightSinceDate).toISOString().slice(0, 10));
        }
      });
  }, [load]);

  async function runAnalysis() {
    setRunning(true);
    try {
      const res = await fetch("/api/telegram/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageLimit,
          sinceDate: sinceDate || undefined,
          applyMode: "preview",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      const list = Array.isArray(data.insights) ? data.insights : [];
      setInsights(list);
      setNotes(data.processingNotes || "");
      setAnalyzedCount(data.analyzedMessageCount);
      toast.success(
        `Generated ${list.length} insight(s) from ${data.analyzedMessageCount ?? "?"} messages — review below`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not analyze");
    } finally {
      setRunning(false);
    }
  }

  async function applyIds(ids: string[], pinToOverview: boolean) {
    setApplying(true);
    try {
      const res = await fetch("/api/telegram/insights/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightIds: ids,
          createDeadlines: true,
          createReminders: true,
          pinToOverview,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      toast.success(
        `Applied ${data.applied} insight(s) — ${data.created?.deadlines ?? 0} deadline(s), ${data.created?.reminders ?? 0} reminder(s)`
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  const draftIds = insights.filter((i) => i.status === "draft").map((i) => i._id);

  return (
    <>
      <DashboardHeader title="AI Insights" />
      <main className="p-4 lg:p-8 space-y-6 max-w-3xl pb-24">
        <p className="text-sm text-muted-foreground">
          Full transparency: see every AI insight, proposed deadlines, and reminder times before you apply.
          Configure defaults in{" "}
          <Link href="/dashboard/settings" className="text-primary underline">
            Settings → Telegram AI
          </Link>
          .
        </p>

        <Card className="glass">
          <CardContent className="pt-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Messages per group to analyze</Label>
                <Input
                  type="number"
                  min={5}
                  max={100}
                  value={messageLimit}
                  onChange={(e) => setMessageLimit(Number(e.target.value) || 25)}
                />
              </div>
              <div className="space-y-2">
                <Label>Only messages since (optional)</Label>
                <Input type="date" value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <LoadingButton variant="glow" loading={running} onClick={() => void runAnalysis()}>
                <Sparkles className="h-4 w-4 mr-1" /> Analyze monitored groups
              </LoadingButton>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh list
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/notifications">
                  <Settings2 className="h-4 w-4 mr-1" /> Notifications / chats
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && !insights.length ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <InsightsAnalysisPanel
            insights={insights}
            analyzedMessageCount={analyzedCount}
            processingNotes={notes}
            applying={applying}
            onApplyAll={({ pinToOverview }) => applyIds(draftIds, pinToOverview)}
            onApplySelected={(ids, { pinToOverview }) => applyIds(ids, pinToOverview)}
          />
        )}

        {!loading && !insights.length && (
          <Card className="glass">
            <CardContent className="py-12 text-center text-muted-foreground">
              No insights yet. Enable monitoring on groups, load messages, then run analysis.
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
