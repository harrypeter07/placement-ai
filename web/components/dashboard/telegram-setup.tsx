"use client";

import { useEffect, useState } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { TelegramConnectCard } from "@/components/dashboard/telegram-connect";

const SAMPLE_MESSAGE = `Google is hiring Software Engineer interns.
Eligibility: CSE/IT, Min CGPA 8.0, 2025 batch, no backlogs.
Apply by 30/06/2026: https://careers.google.com/apply
Package: 45 LPA`;

interface TelegramStatus {
  connected: boolean;
  telegramAccountConnected?: boolean;
  workerWaiting?: boolean;
  workerLastError?: string;
  workerDetailLog?: string;
  suggestedFix?: string;
  hasTelethonSession?: boolean;
  workerStatus: string;
  groupsMonitored: number;
  telegramDeadlines: number;
  lastIngestedAt: string | null;
  lastCompany: string | null;
  workerConfigured: boolean;
  setup: Record<string, string>;
}

export function TelegramSetupCard({ hideConnect = false }: { hideConnect?: boolean }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [testMsg, setTestMsg] = useState(SAMPLE_MESSAGE);
  const [testing, setTesting] = useState(false);

  const load = () => fetch("/api/telegram/status").then((r) => r.json()).then(setStatus);

  useEffect(() => {
    load();
  }, []);

  async function runTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMsg }),
      });
      const data = await res.json();
      if (res.ok && data.created) {
        toast.success(`Parsed: ${data.deadline?.company} — check Deadlines page`);
        load();
      } else if (data.skipped) {
        toast.warning(data.reason || "Message skipped (low confidence)");
      } else {
        toast.error(data.error || "Test failed");
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!hideConnect && <TelegramConnectCard />}

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Worker & monitoring</CardTitle>
          <CardDescription>
            After connecting above, deploy the Render worker. It loads your session from the database automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Worker heartbeat:</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void load()} title="Refresh status">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Badge
              variant={
                status?.connected ? "success" : status?.workerWaiting ? "secondary" : "warning"
              }
            >
              {status?.workerStatus ?? "checking…"}
            </Badge>
            {status && (
              <span className="text-xs text-muted-foreground">
                {status.groupsMonitored} groups monitored · {status.telegramDeadlines} posts ingested
              </span>
            )}
          </div>

          {status?.telegramAccountConnected === false && (
            <p className="text-sm text-amber-200/90">
              Connect Telegram in the card above (production URL). Worker will pick it up automatically — no redeploy needed.
            </p>
          )}
          {status?.workerWaiting && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 text-sm">
              <p className="font-medium text-amber-200">Worker waiting — why & how to fix</p>
              {status.suggestedFix && (
                <p className="text-foreground">
                  <strong>Fix:</strong> {status.suggestedFix}
                </p>
              )}
              {status.workerLastError && (
                <p className="text-muted-foreground">{status.workerLastError}</p>
              )}
              {status.hasTelethonSession === false && status.telegramAccountConnected && (
                <p className="text-amber-100/90">
                  Telegram is connected for the website but <strong>Render worker session is missing</strong> — use
                  &quot;Sync Render worker session&quot; above.
                </p>
              )}
              {status.workerDetailLog && (
                <pre className="text-[10px] leading-relaxed max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-muted-foreground font-mono">
                  {status.workerDetailLog}
                </pre>
              )}
              <p className="text-xs text-muted-foreground">
                Render logs: Dashboard → your worker → Logs. Health:{" "}
                <code className="bg-muted px-1 rounded">/health</code> shows{" "}
                <code className="bg-muted px-1 rounded">waitReason</code> and{" "}
                <code className="bg-muted px-1 rounded">detailLog</code>.
              </p>
            </div>
          )}

          {status?.lastIngestedAt && (
            <p className="text-sm text-muted-foreground">
              Last ingest: {formatDate(status.lastIngestedAt)}
              {status.lastCompany ? ` — ${status.lastCompany}` : ""}
            </p>
          )}

          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Connect Telegram in the card above (phone + OTP)</li>
            <li>Match <code className="bg-muted px-1 rounded">TELEGRAM_WORKER_SECRET</code> on Vercel and Render</li>
            <li>Redeploy the Render worker — set <code className="bg-muted px-1 rounded">PYTHON_VERSION=3.11.9</code></li>
            <li>In <strong>Notifications</strong>, turn <strong>Monitor</strong> ON for placement groups</li>
          </ol>

          <div className="border-t border-white/10 pt-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Test without Telegram
            </p>
            <Textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} rows={5} className="text-xs" />
            <Button variant="glow" onClick={runTest} disabled={testing}>
              <Send className="h-4 w-4 mr-2" />
              {testing ? "Parsing…" : "Test AI Parser"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
