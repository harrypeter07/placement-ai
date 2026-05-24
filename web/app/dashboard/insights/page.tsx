"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Settings2, RefreshCw } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { InsightsAnalysisPanel, type InsightRow } from "@/components/telegram/insights-analysis-panel";
import { insightIdString } from "@/lib/insight-utils";
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
  const autoRan = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/telegram/insights", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setInsights(d);
      })
      .finally(() => setLoading(false));
  }, []);

  const runAnalysis = useCallback(
    async (limitOverride?: number) => {
    setRunning(true);
    try {
      const res = await fetch("/api/telegram/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageLimit: limitOverride ?? messageLimit,
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
      if (data.messagesFetched > 0) {
        toast.message(`Loaded ${data.messagesFetched} message(s) from Telegram`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not analyze");
    } finally {
      setRunning(false);
    }
  },
    [messageLimit, sinceDate]
  );

  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((p) => {
        const limit = p.telegram?.insightMessageCount ?? 25;
        setMessageLimit(limit);
        if (p.telegram?.insightSinceDate) {
          setSinceDate(new Date(p.telegram.insightSinceDate).toISOString().slice(0, 10));
        }
        if (p.telegram?.autoInsights !== false && !autoRan.current) {
          autoRan.current = true;
          void runAnalysis(limit);
        }
      });
  }, [load, runAnalysis]);

  async function setDeadlineIds(ids: string[], pinToOverview: boolean) {
    const clean = ids.map(insightIdString).filter(Boolean);
    if (!clean.length) {
      toast.error("No valid deadlines to set");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/telegram/insights/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightIds: clean,
          createDeadlines: true,
          createReminders: true,
          pinToOverview,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(
        `Set ${data.applied} deadline(s) — ${data.created?.reminders ?? 0} reminder(s)`
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setApplying(false);
    }
  }

  async function dismissIds(ids: string[]) {
    const clean = ids.map(insightIdString).filter(Boolean);
    if (!clean.length) return;
    setApplying(true);
    try {
      const res = await fetch("/api/telegram/insights/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightIds: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dismiss failed");
      toast.message(`Dismissed ${data.dismissed} item(s)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setApplying(false);
    }
  }

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
              <LoadingButton variant="glow" loading={running} onClick={() => void runAnalysis(messageLimit)}>
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
            onSetDeadline={(id, { pinToOverview }) => setDeadlineIds([id], pinToOverview)}
            onSetAllDeadlines={(ids, { pinToOverview }) => setDeadlineIds(ids, pinToOverview)}
            onDismiss={(ids) => dismissIds(ids)}
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
