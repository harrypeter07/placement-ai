/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  PhoneCall,
  Clock,
  Settings,
  HelpCircle,
  Play,
  RotateCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  Calendar,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

type CallLogItem = {
  id: string;
  title: string;
  message: string;
  scheduledAt: string;
  priority: string;
  status: string;
  sent: boolean;
  callTime: string;
  callStatus: "pending" | "called" | "missed" | "failed";
  callResponse?: string;
  formFillStatus?: "pending" | "filled" | "failed";
  calledAt?: string;
  deadline?: {
    id: string;
    company: string;
    role: string;
    deadlineDate: string;
    status: string;
  } | null;
};

type Prefs = {
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromPhone?: string;
  twilioToPhone?: string;
  twilioVoiceSettings?: {
    menuEnabled: boolean;
    fillViaCallEnabled: boolean;
    defaultSnoozeMinutes: number;
    voice: string;
    language: string;
    defaultCallTime?: string;
    welcomeMessage?: string;
    defaultCallOffsetDays?: number;
  };
};

type GroupedCallEvent = {
  key: string;
  company: string;
  role: string;
  calls: CallLogItem[];
  nextCallTime: string;
  statusCount: {
    pending: number;
    called: number;
    missed: number;
    failed: number;
  };
};

function formatCallTimeDisplay(item: CallLogItem) {
  if (!item.scheduledAt) return item.callTime || "09:00 AM";
  const d = new Date(item.scheduledAt);
  if (isNaN(d.getTime())) return item.callTime || "09:00 AM";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatCallDateDisplay(item: CallLogItem) {
  const dateVal = item.scheduledAt || item.deadline?.deadlineDate || new Date().toISOString();
  return formatDate(dateVal);
}

export default function CallAlertsPage() {
  const [calls, setCalls] = useState<CallLogItem[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingCallId, setTestingCallId] = useState<string | null>(null);
  const [rescheduleModalId, setRescheduleModalId] = useState<string | null>(null);
  const [customDateTime, setCustomDateTime] = useState("");
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [activeCallStatus, setActiveCallStatus] = useState<string | null>(null);
  const [activeCallTracking, setActiveCallTracking] = useState(false);

  // Group expansion state & Date/Status filter state
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "this_week" | "this_month">("all");
  const [statusFilterTab, setStatusFilterTab] = useState<"all" | "pending" | "completed">("all");

  const startCallPolling = (sid: string) => {
    setActiveCallSid(sid);
    setActiveCallStatus("initiated");
    setActiveCallTracking(true);
    
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(`/api/calls/status?sid=${sid}`);
        if (res.ok) {
          const data = await res.json();
          setActiveCallStatus(data.status);
          if (["completed", "failed", "busy", "no-answer", "canceled"].includes(data.status)) {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Error polling call:", err);
      }
    }, 3000);
  };

  const fetchCallsAndSettings = useCallback(async () => {
    try {
      const [callsRes, settingsRes] = await Promise.all([
        fetch("/api/calls"),
        fetch("/api/settings"),
      ]);
      if (callsRes.ok) {
        const callsData = await callsRes.json();
        setCalls(callsData);
      }
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setPrefs(settingsData);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load calls or settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCallsAndSettings();
  }, [fetchCallsAndSettings]);

  const updateSettingField = (path: string[], value: any) => {
    if (!prefs) return;
    const next = { ...prefs } as any;
    let curr = next;
    for (let i = 0; i < path.length - 1; i++) {
      if (!curr[path[i]]) curr[path[i]] = {};
      curr[path[i]] = { ...curr[path[i]] };
      curr = curr[path[i]];
    }
    curr[path[path.length - 1]] = value;
    setPrefs(next);
  };

  const saveSettings = async () => {
    if (!prefs) return;
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      toast.success("Call configuration updated successfully");
    } catch (e: any) {
      toast.error(e.message || "Failed to update settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const triggerCallAlertTest = async (reminderId: string) => {
    setTestingCallId(reminderId);
    try {
      const res = await fetch("/api/reminders/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger call");
      toast.success("Test call placed successfully!");
      if (data.callSid) {
        startCallPolling(data.callSid);
      }
      void fetchCallsAndSettings();
    } catch (e: any) {
      toast.error(e.message || "Failed to trigger call");
    } finally {
      setTestingCallId(null);
    }
  };

  function toLocalDatetimeString(date: Date): string {
    if (isNaN(date.getTime())) date = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const updateCallStatus = async (id: string, updates: Partial<CallLogItem> & { rescheduleOffsetHours?: number }) => {
    try {
      const res = await fetch("/api/calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update call status");
      toast.success("Call alert updated");
      void fetchCallsAndSettings();
    } catch (e: any) {
      toast.error(e.message || "Failed to update call status");
    }
  };

  const toggleEventExpansion = (key: string) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Time & Status filter logic
  const filteredCalls = calls.filter((item) => {
    if (statusFilterTab === "pending" && item.callStatus === "called") {
      return false;
    }
    if (statusFilterTab === "completed" && item.callStatus !== "called") {
      return false;
    }
    if (timeFilter === "all") return true;
    const targetTime = item.scheduledAt ? new Date(item.scheduledAt).getTime() : 0;
    if (!targetTime) return true;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

    if (timeFilter === "today") {
      return targetTime >= todayStart && targetTime <= todayEnd;
    }

    if (timeFilter === "this_week") {
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
      const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000 - 1;
      return targetTime >= weekStart && targetTime <= weekEnd;
    }

    if (timeFilter === "this_month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
      return targetTime >= monthStart && targetTime <= monthEnd;
    }

    return true;
  });

  // Group calls by Opportunity / Company Name & Sort Date-Wise (Closest Date First)
  const groupedEvents: GroupedCallEvent[] = (() => {
    const map = new Map<string, GroupedCallEvent>();

    for (const c of filteredCalls) {
      const rawCompany = c.deadline?.company || c.title || "Custom Alert";
      // Normalize opportunity name (e.g. "Adobe : Engineer" -> "Adobe")
      const company = rawCompany.split(/[:\-\–]/)[0].trim();
      const role = c.deadline?.role || (c.title.includes(":") ? c.title.split(":")[1].trim() : c.title) || "Call Alert";
      const key = company.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          key,
          company,
          role,
          calls: [],
          nextCallTime: c.scheduledAt,
          statusCount: { pending: 0, called: 0, missed: 0, failed: 0 },
        });
      }

      const group = map.get(key)!;
      group.calls.push(c);
      const st = c.callStatus || "pending";
      group.statusCount[st] = (group.statusCount[st] || 0) + 1;

      // Find earliest scheduled call time for date-wise sorting
      if (new Date(c.scheduledAt).getTime() < new Date(group.nextCallTime).getTime()) {
        group.nextCallTime = c.scheduledAt;
      }
    }

    // Sort calls within each group by scheduledAt (closest call date first)
    for (const group of map.values()) {
      group.calls.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }

    // Sort groups date-wise: closest upcoming call date on top!
    return Array.from(map.values()).sort((a, b) => {
      const tA = new Date(a.nextCallTime).getTime() || 0;
      const tB = new Date(b.nextCallTime).getTime() || 0;
      return tA - tB;
    });
  })();

  return (
    <>
      <DashboardHeader title="Twilio Voice Call Alerts" />
      <main className="flex-1 space-y-6 p-4 lg:p-8 max-w-7xl mx-auto pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading Call Alerts configurations...</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left/Middle Column - Calling Queue & Tracker */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="glass">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <PhoneCall className="h-5 w-5 text-primary" /> Call Logs & Status
                    </CardTitle>
                    <CardDescription>
                      Track upcoming call timings, phone responses, and automatic Form Automator status.
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void fetchCallsAndSettings()}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Time & Status Filter Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">Status:</span>
                      {(
                        [
                          { key: "all", label: "All Calls" },
                          { key: "pending", label: "⏳ Scheduled Only" },
                          { key: "completed", label: "✅ Completed Calls" },
                        ] as const
                      ).map((btn) => (
                        <Button
                          key={btn.key}
                          size="sm"
                          variant={statusFilterTab === btn.key ? "default" : "outline"}
                          className={cn(
                            "h-7 text-xs font-medium px-3",
                            statusFilterTab === btn.key ? "shadow-md bg-primary text-primary-foreground font-semibold" : "border-white/10 hover:bg-white/5"
                          )}
                          onClick={() => setStatusFilterTab(btn.key)}
                        >
                          {btn.label}
                        </Button>
                      ))}
                    </div>
                    
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">Date:</span>
                      {(
                        [
                          { key: "all", label: "All Dates" },
                          { key: "today", label: "Today" },
                          { key: "this_week", label: "This Week" },
                          { key: "this_month", label: "This Month" },
                        ] as const
                      ).map((btn) => (
                        <Button
                          key={btn.key}
                          size="sm"
                          variant={timeFilter === btn.key ? "default" : "outline"}
                          className={cn(
                            "h-7 text-xs font-medium px-3",
                            timeFilter === btn.key ? "shadow-md bg-primary text-primary-foreground font-semibold" : "border-white/10 hover:bg-white/5"
                          )}
                          onClick={() => setTimeFilter(btn.key)}
                        >
                          {btn.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {groupedEvents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border border-dashed border-white/10 rounded-lg">
                      <PhoneCall className="h-10 w-10 mx-auto mb-3 opacity-30 text-primary" />
                      <p className="text-sm font-medium">No call alerts match your filter.</p>
                      <p className="text-xs max-w-xs mx-auto mt-1 opacity-70">
                        Analyze chat messages or set placement deadlines to schedule calls.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-white/5 text-xs uppercase text-muted-foreground border-b border-white/10">
                          <tr>
                            <th className="px-4 py-3">Company & Role</th>
                            <th className="px-4 py-3">Next Call Time</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Schedules</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {groupedEvents.map((group) => {
                            const isExpanded = expandedEventIds.has(group.key);
                            const totalCount = group.calls.length;
                            const pendingCount = group.statusCount.pending || 0;
                            const calledCount = group.statusCount.called || 0;

                            return (
                              <React.Fragment key={group.key}>
                                {/* Top-Level Single Cell Row per Company */}
                                <tr
                                  className={cn(
                                    "hover:bg-white/5 transition-colors cursor-pointer select-none",
                                    isExpanded && "bg-primary/10 border-l-2 border-l-primary"
                                  )}
                                  onClick={() => toggleEventExpansion(group.key)}
                                >
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground shrink-0 p-0 hover:bg-transparent"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="h-4 w-4 text-primary" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </Button>
                                      <div>
                                        <div className="font-semibold text-foreground flex items-center gap-2">
                                          <span>{group.company}</span>
                                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-white/15">
                                            <Layers className="h-2.5 w-2.5 mr-1 text-primary" />
                                            {totalCount} {totalCount === 1 ? "call" : "calls"}
                                          </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {group.role}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                                      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                                      <span>{formatCallTimeDisplay(group.calls[0])}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Calendar className="h-3 w-3 opacity-60 shrink-0" />
                                      <span>{formatCallDateDisplay(group.calls[0])}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    {calledCount > 0 ? (
                                      <Badge variant="success" className="gap-1 text-xs">
                                        <CheckCircle className="h-3 w-3" /> Called ({calledCount}/{totalCount})
                                      </Badge>
                                    ) : (
                                      <Badge variant="warning" className="gap-1 text-xs">
                                        <Clock className="h-3 w-3" /> Scheduled ({pendingCount})
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="text-xs font-semibold text-foreground">
                                      {totalCount} Call {totalCount === 1 ? "Alert" : "Alerts"} Set
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <Button
                                      variant={isExpanded ? "default" : "outline"}
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleEventExpansion(group.key);
                                      }}
                                    >
                                      {isExpanded ? (
                                        <>
                                          <ChevronDown className="h-3 w-3" /> Hide Schedules
                                        </>
                                      ) : (
                                        <>
                                          <ChevronRight className="h-3 w-3" /> View Schedules ({totalCount})
                                        </>
                                      )}
                                    </Button>
                                  </td>
                                </tr>

                                {/* Expanded Sub-Table containing all set call schedules for this company */}
                                {isExpanded && (
                                  <tr className="bg-zinc-950/90 border-b border-white/10">
                                    <td colSpan={5} className="p-4">
                                      <div className="rounded-lg border border-zinc-800 bg-black/60 p-3 space-y-2">
                                        <div className="text-xs font-semibold text-primary flex items-center gap-1.5 pb-1 border-b border-white/10">
                                          <Layers className="h-3.5 w-3.5" />
                                          <span>Multiple Call Timings & Dates Set for {group.company}</span>
                                        </div>
                                        <div className="overflow-x-auto rounded-md border border-white/10">
                                          <table className="w-full text-xs text-left">
                                            <thead className="bg-zinc-900 text-muted-foreground uppercase border-b border-white/10">
                                              <tr>
                                                <th className="px-3 py-2">Call Date & Time</th>
                                                <th className="px-3 py-2">Status</th>
                                                <th className="px-3 py-2">Call Response</th>
                                                <th className="px-3 py-2">Form Fill</th>
                                                <th className="px-3 py-2 text-right">Actions</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                              {group.calls.map((c) => (
                                                <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                                  <td className="px-3 py-2.5">
                                                    <div className="font-medium text-foreground flex items-center gap-1.5">
                                                      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                                                      <span>{formatCallTimeDisplay(c)}</span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                      <Calendar className="h-3 w-3 opacity-60 shrink-0" />
                                                      <span>{formatCallDateDisplay(c)}</span>
                                                    </div>
                                                  </td>
                                                  <td className="px-3 py-2.5">
                                                    {c.callStatus === "called" && (
                                                      <Badge variant="success" className="gap-1 text-[10px]">
                                                        <CheckCircle className="h-3 w-3" /> Called
                                                      </Badge>
                                                    )}
                                                    {c.callStatus === "pending" && (
                                                      <Badge variant="warning" className="gap-1 text-[10px]">
                                                        <Clock className="h-3 w-3" /> Scheduled
                                                      </Badge>
                                                    )}
                                                    {c.callStatus === "missed" && (
                                                      <Badge variant="destructive" className="gap-1 text-[10px]">
                                                        <AlertTriangle className="h-3 w-3" /> Missed
                                                      </Badge>
                                                    )}
                                                    {c.callStatus === "failed" && (
                                                      <Badge variant="outline" className="gap-1 border-red-500 text-red-400 text-[10px]">
                                                        <XCircle className="h-3 w-3" /> Failed
                                                      </Badge>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2.5">
                                                    {c.callResponse ? (
                                                      <Select
                                                        value={c.callResponse}
                                                        onValueChange={(val) =>
                                                          updateCallStatus(c.id, { callResponse: val })
                                                        }
                                                      >
                                                        <SelectTrigger className="h-7 text-xs bg-zinc-900 border-zinc-700 w-28">
                                                          <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-950 border-zinc-800 shadow-2xl z-50">
                                                          <SelectItem value="acknowledged">Acknowledged</SelectItem>
                                                          <SelectItem value="snoozed">Snoozed</SelectItem>
                                                          <SelectItem value="fill_form">Fill Form (CTC)</SelectItem>
                                                          <SelectItem value="dismiss">Dismissed</SelectItem>
                                                        </SelectContent>
                                                      </Select>
                                                    ) : (
                                                      <span className="text-[10px] text-muted-foreground">—</span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2.5">
                                                    {c.callResponse === "fill_form" || c.formFillStatus ? (
                                                      <Select
                                                        value={c.formFillStatus || "pending"}
                                                        onValueChange={(val) =>
                                                          updateCallStatus(c.id, { formFillStatus: val as any })
                                                        }
                                                      >
                                                        <SelectTrigger className="h-7 text-xs bg-zinc-900 border-zinc-700 w-24">
                                                          <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-950 border-zinc-800 shadow-2xl z-50">
                                                          <SelectItem value="pending">Pending</SelectItem>
                                                          <SelectItem value="filled">Filled</SelectItem>
                                                          <SelectItem value="failed">Failed</SelectItem>
                                                        </SelectContent>
                                                      </Select>
                                                    ) : (
                                                      <span className="text-[10px] text-muted-foreground">—</span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2.5 text-right">
                                                    <div className="flex justify-end items-center gap-1.5">
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-xs bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                                                        disabled={testingCallId === c.id}
                                                        onClick={() => triggerCallAlertTest(c.id)}
                                                      >
                                                        {testingCallId === c.id ? (
                                                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                        ) : (
                                                          <Play className="h-3 w-3 mr-1" />
                                                        )}
                                                        Call Now
                                                      </Button>
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-xs bg-zinc-900 border-zinc-700 hover:border-primary/50 hover:bg-primary/10 gap-1 font-medium text-foreground"
                                                        onClick={() => {
                                                          const initTime = c.scheduledAt ? new Date(c.scheduledAt) : new Date(Date.now() + 60 * 60 * 1000);
                                                          setCustomDateTime(toLocalDatetimeString(initTime));
                                                          setRescheduleModalId(c.id);
                                                        }}
                                                      >
                                                        <Calendar className="h-3 w-3 text-primary" />
                                                        Reschedule
                                                      </Button>
                                                    </div>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Labeled numbers desc box */}
              <Card className="glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary" /> Twilio Phone System Guide
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                  <p>
                    <strong className="text-foreground">Twilio From Phone Number</strong> is your leased Twilio
                    virtual number. This acts as the automated voice host that speaks to you.
                  </p>
                  <p>
                    <strong className="text-foreground">Twilio To Phone Number</strong> is your active mobile phone
                    number that receives calls, reads deadline warnings, and captures input DTMF digits.
                  </p>
                  <p>
                    <strong className="text-foreground">Interactive TwiML menu keys:</strong> Pressing{" "}
                    <kbd className="px-1 border rounded bg-white/5 font-mono">1</kbd> triggers Form Automator
                    auto-fill. Pressing <kbd className="px-1 border rounded bg-white/5 font-mono">2</kbd> snoozes the
                    reminder.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Config Form */}
            <div className="space-y-6">
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" /> Call Settings
                  </CardTitle>
                  <CardDescription>
                    Configure default alert schedules, caller IDs, and voice acting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {prefs && (
                    <>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Twilio Account SID</Label>
                        <Input
                          value={prefs.twilioAccountSid || ""}
                          onChange={(e) => updateSettingField(["twilioAccountSid"], e.target.value)}
                          placeholder="AC..."
                        />
                      </fieldset>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Twilio Auth Token</Label>
                        <Input
                          type="password"
                          value={prefs.twilioAuthToken || ""}
                          onChange={(e) => updateSettingField(["twilioAuthToken"], e.target.value)}
                          placeholder="Tokens"
                        />
                      </fieldset>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Twilio Caller ID (From Phone)</Label>
                        <Input
                          value={prefs.twilioFromPhone || ""}
                          onChange={(e) => updateSettingField(["twilioFromPhone"], e.target.value)}
                          placeholder="+1xxxxxxxxxx"
                        />
                      </fieldset>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Alert Destination (To Phone)</Label>
                        <Input
                          value={prefs.twilioToPhone || ""}
                          onChange={(e) => updateSettingField(["twilioToPhone"], e.target.value)}
                          placeholder="+91xxxxxxxxxx"
                        />
                      </fieldset>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Default Daily Call Time</Label>
                        <Input
                          type="time"
                          value={prefs.twilioVoiceSettings?.defaultCallTime || "09:00"}
                          onChange={(e) =>
                            updateSettingField(
                              ["twilioVoiceSettings", "defaultCallTime"],
                              e.target.value
                            )
                          }
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Call alert schedules default to this time on deadline dates.
                        </p>
                      </fieldset>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Call Offset (Days before deadline)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          value={prefs.twilioVoiceSettings?.defaultCallOffsetDays ?? 0}
                          onChange={(e) =>
                            updateSettingField(
                              ["twilioVoiceSettings", "defaultCallOffsetDays"],
                              parseInt(e.target.value) || 0
                            )
                          }
                        />
                        <p className="text-[10px] text-muted-foreground">
                          How many days before the deadline the call alert should ring (0 = same day).
                        </p>
                      </fieldset>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Voice Actor (Polly)</Label>
                        <Select
                          value={prefs.twilioVoiceSettings?.voice || "Polly.Kajal-Neural"}
                          onValueChange={(val) =>
                            updateSettingField(["twilioVoiceSettings", "voice"], val)
                          }
                        >
                          <SelectTrigger className="w-full bg-zinc-900 border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-950 border-zinc-800 shadow-2xl z-50">
                            <SelectItem value="Polly.Kajal-Neural">Kajal (Neural, India)</SelectItem>
                            <SelectItem value="Polly.Aditi-Standard">Aditi (Standard, India)</SelectItem>
                            <SelectItem value="Polly.Joanna-Neural">Joanna (Neural, US)</SelectItem>
                          </SelectContent>
                        </Select>
                      </fieldset>
                      <fieldset className="space-y-2 border-0 p-0">
                        <Label>Custom Welcome Message</Label>
                        <Input
                          value={prefs.twilioVoiceSettings?.welcomeMessage ?? ""}
                          onChange={(e) =>
                            updateSettingField(
                              ["twilioVoiceSettings", "welcomeMessage"],
                              e.target.value
                            )
                          }
                          placeholder="e.g. Welcome to PlaceMint by Hassan."
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Custom greeting played at the beginning of the call.
                        </p>
                      </fieldset>
                      <div className="flex items-center justify-between pt-2">
                        <Label className="text-xs">TwiML Interactive Menu</Label>
                        <Switch
                          checked={prefs.twilioVoiceSettings?.menuEnabled ?? true}
                          onCheckedChange={(val) =>
                            updateSettingField(["twilioVoiceSettings", "menuEnabled"], val)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <Label className="text-xs">Enable Fill-via-Call (1 key)</Label>
                        <Switch
                          checked={prefs.twilioVoiceSettings?.fillViaCallEnabled ?? true}
                          onCheckedChange={(val) =>
                            updateSettingField(["twilioVoiceSettings", "fillViaCallEnabled"], val)
                          }
                        />
                      </div>

                      <Button
                        variant="glow"
                        className="w-full mt-4"
                        disabled={savingSettings}
                        onClick={saveSettings}
                      >
                        {savingSettings ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" /> Save Configuration
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Modern Calendar Picker Reschedule Modal */}
        {rescheduleModalId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in-0">
            <div className="bg-zinc-950/95 border border-primary/30 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20 text-primary">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Reschedule Call Alert</h3>
                    <p className="text-xs text-muted-foreground">Pick a new call date &amp; time in your local timezone.</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setRescheduleModalId(null);
                    setCustomDateTime("");
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Quick Presets</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-zinc-900 border-zinc-800 hover:border-primary/50 hover:bg-primary/10"
                    onClick={() => {
                      const d = new Date(Date.now() + 15 * 60 * 1000);
                      setCustomDateTime(toLocalDatetimeString(d));
                    }}
                  >
                    ⚡ +15 Min
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-zinc-900 border-zinc-800 hover:border-primary/50 hover:bg-primary/10"
                    onClick={() => {
                      const d = new Date(Date.now() + 30 * 60 * 1000);
                      setCustomDateTime(toLocalDatetimeString(d));
                    }}
                  >
                    ⏳ +30 Min
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-zinc-900 border-zinc-800 hover:border-primary/50 hover:bg-primary/10"
                    onClick={() => {
                      const d = new Date(Date.now() + 60 * 60 * 1000);
                      setCustomDateTime(toLocalDatetimeString(d));
                    }}
                  >
                    🕐 +1 Hour
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-zinc-900 border-zinc-800 hover:border-primary/50 hover:bg-primary/10"
                    onClick={() => {
                      const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
                      setCustomDateTime(toLocalDatetimeString(d));
                    }}
                  >
                    ⏳ +2 Hours
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-zinc-900 border-zinc-800 hover:border-primary/50 hover:bg-primary/10"
                    onClick={() => {
                      const tom = new Date();
                      tom.setDate(tom.getDate() + 1);
                      tom.setHours(9, 0, 0, 0);
                      setCustomDateTime(toLocalDatetimeString(tom));
                    }}
                  >
                    📅 Tomorrow 9 AM
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-zinc-900 border-zinc-800 hover:border-primary/50 hover:bg-primary/10"
                    onClick={() => {
                      const d2 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
                      setCustomDateTime(toLocalDatetimeString(d2));
                    }}
                  >
                    📆 +2 Days
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Select Exact Date &amp; Time</Label>
                <Input 
                  type="datetime-local" 
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="w-full bg-zinc-900 border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setRescheduleModalId(null);
                    setCustomDateTime("");
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  variant="glow" 
                  size="sm" 
                  onClick={() => {
                    if (!customDateTime) {
                      toast.error("Please pick a valid date and time");
                      return;
                    }
                    const date = new Date(customDateTime);
                    void updateCallStatus(rescheduleModalId, { scheduledAt: date.toISOString() });
                    setRescheduleModalId(null);
                    setCustomDateTime("");
                  }}
                >
                  Confirm Reschedule
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeCallTracking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl text-center">
              <div className="mx-auto h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 relative">
                <PhoneCall className={cn(
                  "h-8 w-8 text-primary", 
                  ["initiated", "ringing", "in-progress"].includes(activeCallStatus || "") ? "animate-pulse" : ""
                )} />
                {["initiated", "ringing", "in-progress"].includes(activeCallStatus || "") && (
                  <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-75" />
                )}
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">Live Test Call Status</h3>
                <p className="text-xs text-muted-foreground font-mono truncate">SID: {activeCallSid}</p>
              </div>

              <div className="py-2.5 px-4 bg-white/5 rounded-xl flex items-center justify-between border border-white/5">
                <span className="text-xs text-muted-foreground font-medium">Status</span>
                <Badge 
                  variant={
                    activeCallStatus === "completed" ? "success" : 
                    ["failed", "no-answer", "busy", "canceled"].includes(activeCallStatus || "") ? "critical" : 
                    activeCallStatus === "in-progress" ? "warning" : "secondary"
                  }
                  className="capitalize font-mono animate-pulse"
                >
                  {activeCallStatus || "connecting..."}
                </Badge>
              </div>

              <div className="flex justify-center gap-2 pt-2">
                <Button 
                  variant={["completed", "failed", "no-answer", "busy", "canceled"].includes(activeCallStatus || "") ? "glow" : "outline"} 
                  size="sm" 
                  className="w-full"
                  onClick={() => {
                    setActiveCallTracking(false);
                    setActiveCallSid(null);
                    setActiveCallStatus(null);
                  }}
                >
                  {["completed", "failed", "no-answer", "busy", "canceled"].includes(activeCallStatus || "") ? "Close" : "Dismiss Tracking"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
