"use client";

import { useEffect, useState } from "react";
import { Server, Database, Bot, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HealthData {
  web: string;
  api: string;
  database: "online" | "offline" | "misconfigured";
  env: Record<string, boolean>;
}

interface TelegramData {
  connected: boolean;
  workerStatus: string;
  workerWaiting?: boolean;
  workerLastError?: string;
  workerDetailLog?: string;
  suggestedFix?: string;
  telegramAccountConnected?: boolean;
  hasTelethonSession?: boolean;
  groupsMonitored: number;
  telegramDeadlines: number;
  workerConfigured?: boolean;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-red-400"
      )}
    />
  );
}

export function SystemStatusBar() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [telegram, setTelegram] = useState<TelegramData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const load = async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else setInitialLoading(true);
    setHealthError(null);
    try {
      const [hRes, tRes] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/telegram/status", { cache: "no-store" }),
      ]);

      if (hRes.ok) {
        const hData = await hRes.json().catch(() => null);
        if (hData) setHealth(hData);
        else setHealthError("Invalid response from /api/health");
      } else {
        setHealthError(`Health check failed (${hRes.status})`);
      }

      if (tRes.ok) {
        setTelegram(await tRes.json());
      } else if (tRes.status === 401) {
        setHealthError((e) => e || "Sign in required for full status");
      }
    } catch {
      setHealthError("Could not reach the server");
    } finally {
      if (isBackground) setRefreshing(false);
      else setInitialLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, []);

  const dbOk = health?.database === "online";
  const apiOk = health !== null && (health.api === "online" || health.web === "online");
  const workerOk = telegram?.connected ?? false;
  const statusLoading = initialLoading && health === null;

  return (
    <div className="glass rounded-xl border p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold">System Status</h2>
        <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={initialLoading || refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-1", (initialLoading || refreshing) && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <StatusDot ok={apiOk} />
          <span>Web + API</span>
          <Badge variant={apiOk ? "success" : "critical"}>
            {statusLoading ? "Checking…" : apiOk ? "Running" : "Check server"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <StatusDot ok={dbOk} />
          <span>MongoDB</span>
          <Badge variant={dbOk ? "success" : "critical"}>
            {statusLoading ? "Checking…" : health?.database ?? "offline"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <StatusDot ok={workerOk} />
          <span>Telegram Worker</span>
          <Badge variant={workerOk ? "success" : "warning"}>
            {telegram?.workerStatus ?? "offline"}
          </Badge>
          {telegram && telegram.groupsMonitored > 0 && (
            <span className="text-xs text-muted-foreground">
              ({telegram.groupsMonitored} group{telegram.groupsMonitored > 1 ? "s" : ""})
            </span>
          )}
        </div>
      </div>
      {healthError && (
        <p className="mt-2 text-xs text-muted-foreground">{healthError}</p>
      )}
      {telegram?.workerWaiting && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2 text-xs">
          <p className="font-semibold text-amber-200">Why status is &quot;waiting&quot;</p>
          {telegram.suggestedFix && (
            <p>
              <strong className="text-foreground">Fix:</strong> {telegram.suggestedFix}
            </p>
          )}
          {telegram.workerLastError && (
            <p className="text-muted-foreground">{telegram.workerLastError}</p>
          )}
          {telegram.hasTelethonSession === false && telegram.telegramAccountConnected && (
            <p className="text-amber-100">
              Website has Telegram login but <strong>Render needs Telethon session</strong> → Settings →
              &quot;Sync Render worker session&quot;.
            </p>
          )}
          {telegram.workerDetailLog ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 font-mono text-[10px] text-muted-foreground">
              {telegram.workerDetailLog}
            </pre>
          ) : (
            <p className="text-muted-foreground">
              Deploy latest Vercel + Render, then click Refresh above. Open your Render URL +{" "}
              <code className="bg-muted px-1 rounded">/health</code> — read{" "}
              <code className="bg-muted px-1 rounded">waitReason</code> and{" "}
              <code className="bg-muted px-1 rounded">detailLog</code>.
            </p>
          )}
          <p className="text-muted-foreground">
            Full details: <strong>Settings</strong> → Worker & monitoring (scroll down). Render: Logs with{" "}
            <code className="bg-muted px-1 rounded">[session]</code> lines.
          </p>
        </div>
      )}
      {!workerOk && !telegram?.workerWaiting && (
        <div className="mt-3 text-xs text-amber-400/90 space-y-1">
          <p>Worker offline? Check Render deploy + matching secrets.</p>
        </div>
      )}
      {workerOk && (
        <p className="mt-2 text-xs text-emerald-400/90">Telegram worker connected and heartbeating.</p>
      )}
    </div>
  );
}
