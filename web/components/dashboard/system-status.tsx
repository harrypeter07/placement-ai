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
      {!workerOk && (
        <div className="mt-3 text-xs text-amber-400/90 space-y-1">
          <p>Worker terminal running but dashboard shows offline? Usually:</p>
          <ul className="list-disc list-inside ml-1">
            <li>
              <code className="bg-muted px-1 rounded">WEB_APP_URL</code> in worker{" "}
              <code className="bg-muted px-1 rounded">.env</code> must match dev server (try{" "}
              <code className="bg-muted px-1 rounded">http://localhost:3001</code> if port 3000 is busy)
            </li>
            <li>
              <code className="bg-muted px-1 rounded">TELEGRAM_WORKER_SECRET</code> must match in{" "}
              <code className="bg-muted px-1 rounded">web/.env</code> and worker{" "}
              <code className="bg-muted px-1 rounded">.env</code>
            </li>
            <li>Restart <code className="bg-muted px-1 rounded">listener.py</code> after changing env</li>
          </ul>
        </div>
      )}
      {workerOk && (
        <p className="mt-2 text-xs text-emerald-400/90">Telegram worker connected and heartbeating.</p>
      )}
    </div>
  );
}
