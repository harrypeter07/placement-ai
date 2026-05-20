"use client";

import { useEffect, useState } from "react";
import { Bot, MessageSquare, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

const SAMPLE_MESSAGE = `Google is hiring Software Engineer interns.
Eligibility: CSE/IT, Min CGPA 8.0, 2025 batch, no backlogs.
Apply by 30/06/2026: https://careers.google.com/apply
Package: 45 LPA`;

interface TelegramStatus {
  connected: boolean;
  workerStatus: string;
  groupsMonitored: number;
  telegramDeadlines: number;
  lastIngestedAt: string | null;
  lastCompany: string | null;
  workerConfigured: boolean;
  setup: Record<string, string>;
}

export function TelegramSetupCard() {
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
    <Card className="glass glow-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Telegram Integration
        </CardTitle>
        <CardDescription>
          <code className="text-xs">npm run dev</code> runs the web app and API only. The Telegram worker is a separate process.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Worker status:</span>
          <Badge variant={status?.connected ? "success" : "warning"}>
            {status?.workerStatus ?? "checking…"}
          </Badge>
          {status && (
            <span className="text-xs text-muted-foreground">
              {status.groupsMonitored} groups monitored · {status.telegramDeadlines} posts ingested
            </span>
          )}
        </div>

        {status?.lastIngestedAt && (
          <p className="text-sm text-muted-foreground">
            Last ingest: {formatDate(status.lastIngestedAt)}
            {status.lastCompany ? ` — ${status.lastCompany}` : ""}
          </p>
        )}

        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>Copy <code className="bg-muted px-1 rounded">telegram-worker/.env.example</code> → <code className="bg-muted px-1 rounded">.env</code></li>
          <li>Get API ID/Hash from <a href="https://my.telegram.org" className="text-primary underline" target="_blank" rel="noreferrer">my.telegram.org</a></li>
          <li>Match <code className="bg-muted px-1 rounded">TELEGRAM_WORKER_SECRET</code> in both <code className="bg-muted px-1 rounded">web/.env.local</code> and worker <code className="bg-muted px-1 rounded">.env</code></li>
          <li>Start worker: <code className="bg-muted px-1 rounded">cd telegram-worker && python listener.py</code> — it syncs all your groups automatically</li>
          <li>In <strong>Notifications</strong>, turn <strong>Monitor</strong> ON for each placement group you want</li>
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
  );
}
