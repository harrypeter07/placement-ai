"use client";

import { useEffect, useState } from "react";
import { Zap, RefreshCw, Activity } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";

interface Log {
  _id: string;
  type: string;
  summary: string;
  createdAt: string;
}

interface Automation {
  masterEnabled: boolean;
  aiAutoReminders: boolean;
  autoCalendarSync: boolean;
  autoPriority: boolean;
  duplicateMerge: boolean;
}

export default function AutomationPage() {
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/automation", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.automation) setAutomation(d.automation);
        if (Array.isArray(d.logs)) setLogs(d.logs);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  async function patch(partial: Partial<Automation>) {
    setSaving(true);
    const res = await fetch("/api/automation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) toast.error("Could not save");
    else {
      if (data.automation) setAutomation(data.automation);
      toast.success("Saved");
      load();
    }
  }

  return (
    <>
      <DashboardHeader title="Automation" />
      <main className="p-4 lg:p-8 space-y-6 max-w-3xl">
        <p className="text-sm text-muted-foreground">
          Control how PlaceMint uses AI, reminders, and Google Calendar. Logs show recent decisions.
        </p>

        {loading || !automation ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <Card className="glass glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Automation center
              </CardTitle>
              <CardDescription>Master switch disables all automatic behaviors below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-white/10 p-4 bg-muted/20">
                <div>
                  <Label className="text-base">Master automation</Label>
                  <p className="text-xs text-muted-foreground mt-1">AI reminders, calendar sync, priority rules</p>
                </div>
                <Switch
                  checked={automation.masterEnabled}
                  onCheckedChange={(v) => patch({ masterEnabled: v })}
                  disabled={saving}
                />
              </div>

              {(
                [
                  { key: "aiAutoReminders" as const, label: "AI auto-reminder generation", desc: "Suggest timings from placement text" },
                  { key: "autoCalendarSync" as const, label: "Auto Google Calendar sync", desc: "Create/update events when deadlines change" },
                  { key: "autoPriority" as const, label: "Auto priority assignment", desc: "Use AI urgency for reminder priority" },
                  { key: "duplicateMerge" as const, label: "Duplicate merging", desc: "Prefer single calendar event per deadline" },
                ] as const
              ).map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
                  <div>
                    <Label>{row.label}</Label>
                    <p className="text-xs text-muted-foreground">{row.desc}</p>
                  </div>
                  <Switch
                    checked={automation[row.key]}
                    disabled={saving || !automation.masterEnabled}
                    onCheckedChange={(v) => patch({ [row.key]: v })}
                  />
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload logs
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Activity log
            </CardTitle>
            <CardDescription>Recent AI and calendar actions for your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[420px] overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log._id} className="rounded-lg border border-white/5 p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <BadgeMini type={log.type} />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1">{log.summary}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function BadgeMini({ type }: { type: string }) {
  const color =
    type.includes("error") || type.includes("skipped")
      ? "text-amber-400"
      : type.includes("ai")
        ? "text-primary"
        : "text-emerald-400";
  return (
    <span className={cn("text-[10px] font-mono uppercase tracking-wide", color)}>
      {type.replace(/_/g, " ")}
    </span>
  );
}
