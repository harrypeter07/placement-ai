"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { TelegramSetupCard } from "@/components/dashboard/telegram-setup";
import { TelegramConnectCard } from "@/components/dashboard/telegram-connect";
import { SystemStatusBar } from "@/components/dashboard/system-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw, Zap, Activity, PhoneCall } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Prefs = {
  timezone: string;
  language: string;
  reminders: {
    defaultOffsetsMinutes: number[];
    sound: boolean;
    vibration?: boolean;
    defaultEscalation?: string;
    smartAiMode?: boolean;
  };
  notifications: {
    browser: boolean;
    email: boolean;
    telegram: boolean;
    inApp: boolean;
    push?: boolean;
    phoneCall?: boolean;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
  calendar: { autoSync: boolean; autoCreateEvents: boolean; autoUpdateEvents: boolean };
  ai: { strictness: string; urgencySensitivity: string; spamSensitivity: string };
  placement: {
    preferredCompanies: string[];
    preferredRoles: string[];
    dreamCompanies: string[];
    minPackageLakh: number | null;
  };
  automation: Record<string, boolean>;
  telegram?: {
    insightMessageCount: number;
    insightSinceDate?: string | Date | null;
    insightsApplyMode?: "preview" | "all" | "none";
    insightPinToOverview?: boolean;
    monitoredGroupIds: string[];
    autoInsights: boolean;
    autoCreateDeadlines: boolean;
    autoCreateReminders: boolean;
  };
  formProfile?: {
    fullName: string;
    email: string;
    phone: string;
    cgpa: string;
    branch: string;
    graduationYear: string;
    resumeLink: string;
    githubLink?: string;
    linkedInLink?: string;
    rollNumber?: string;
    additionalInfo?: string;
  };
  geminiApiKey?: string;
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
  };
};

const defaultOffsetsStr = (arr: number[]) => arr.join(", ");

export default function SettingsPage() {
  const { data: session } = useSession();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [offsetInput, setOffsetInput] = useState("");
  const [activeTab, setActiveTab] = useState("connect");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [activeCallStatus, setActiveCallStatus] = useState<string | null>(null);
  const [activeCallTracking, setActiveCallTracking] = useState(false);

  const startSettingsCallPolling = (sid: string) => {
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

  const loadLogs = useCallback(() => {
    setLogsLoading(true);
    fetch("/api/automation", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.logs)) setLogs(d.logs);
      })
      .catch(() => undefined)
      .finally(() => setLogsLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab) setActiveTab(tab);
    }
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    loadLogs();
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        const tg = d.telegram || {
          insightMessageCount: 25,
          monitoredGroupIds: [],
          autoInsights: true,
          autoCreateDeadlines: true,
          autoCreateReminders: true,
        };
        const fp = d.formProfile || {
          fullName: "",
          email: "",
          phone: "",
          cgpa: "",
          branch: "",
          graduationYear: "",
          resumeLink: "",
          githubLink: "",
          linkedInLink: "",
          rollNumber: "",
          additionalInfo: "",
        };
        const tvs = d.twilioVoiceSettings || {
          menuEnabled: true,
          fillViaCallEnabled: true,
          defaultSnoozeMinutes: 60,
          voice: "Polly.Kajal-Neural",
          language: "en-IN",
        };
        setPrefs({
          ...d,
          telegram: tg,
          formProfile: fp,
          geminiApiKey: d.geminiApiKey || "",
          twilioAccountSid: d.twilioAccountSid || "",
          twilioAuthToken: d.twilioAuthToken || "",
          twilioFromPhone: d.twilioFromPhone || "",
          twilioToPhone: d.twilioToPhone || "",
          twilioVoiceSettings: tvs,
        });
        setOffsetInput(defaultOffsetsStr(d.reminders?.defaultOffsetsMinutes || []));
      })
      .finally(() => setLoading(false));
  }, [loadLogs]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    const parts = offsetInput
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n) && n >= 5);
    const body = {
      timezone: prefs.timezone,
      language: prefs.language,
      reminders: {
        ...prefs.reminders,
        defaultOffsetsMinutes: parts.length ? parts : prefs.reminders.defaultOffsetsMinutes,
      },
      notifications: prefs.notifications,
      calendar: prefs.calendar,
      ai: prefs.ai,
      placement: prefs.placement,
      telegram: prefs.telegram,
      formProfile: prefs.formProfile,
      automation: prefs.automation,
      geminiApiKey: prefs.geminiApiKey,
      twilioAccountSid: prefs.twilioAccountSid,
      twilioAuthToken: prefs.twilioAuthToken,
      twilioFromPhone: prefs.twilioFromPhone,
      twilioToPhone: prefs.twilioToPhone,
      twilioVoiceSettings: prefs.twilioVoiceSettings,
    };
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) toast.error("Save failed");
    else {
      toast.success("Saved");
      setDirty(false);
      load();
    }
  }

  async function resetDefaults() {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    setSaving(false);
    if (!res.ok) toast.error("Reset failed");
    else {
      toast.success("Reset to defaults");
      setDirty(false);
      load();
    }
  }

  const [testingCall, setTestingCall] = useState(false);

  async function triggerTestCall() {
    if (!prefs) return;
    const toPhone = prefs.twilioToPhone || prefs.formProfile?.phone || "";
    if (!toPhone) {
      toast.error("Please configure your destination phone number (Twilio To Phone) first!");
      return;
    }

    setTestingCall(true);
    const toastId = toast.loading("Triggering test call via Twilio...");
    try {
      const res = await fetch("/api/reminders/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toPhone }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(`Success! Test call placed. Call SID: ${data.callSid}`, { id: toastId });
        if (data.callSid) {
          startSettingsCallPolling(data.callSid);
        }
      } else {
        toast.error(data.error || "Failed to trigger test call.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error while triggering test call.", { id: toastId });
    } finally {
      setTestingCall(false);
    }
  }

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
    setDirty(true);
  }

  function nest<K extends keyof Prefs>(key: K, partial: Partial<Prefs[K]>) {
    setPrefs((p) => {
      if (!p) return p;
      const prev = p[key] as object;
      return { ...p, [key]: { ...prev, ...partial } } as Prefs;
    });
    setDirty(true);
  }

  return (
    <>
      <DashboardHeader title="Settings" />
      <main className="p-4 lg:p-8 space-y-6 max-w-4xl pb-24">
        <SystemStatusBar />

        {/* Always visible — do not wait for prefs load */}
        <section id="connect-telegram" className="scroll-mt-24">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            Connect Telegram account
            <span className="text-xs font-normal text-muted-foreground">(required for worker)</span>
          </h2>
          <TelegramConnectCard />
        </section>

        <TelegramSetupCard hideConnect />

        {loading || !prefs ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {dirty && <span className="text-amber-400">Unsaved changes</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetDefaults} disabled={saving}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset defaults
            </Button>
            <Button variant="glow" size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="connect" className="data-[state=active]:bg-primary/20">
              Connect Telegram
            </TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="reminders">Reminders</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="placement">Placement</TabsTrigger>
            <TabsTrigger value="telegram">Telegram AI</TabsTrigger>
            <TabsTrigger value="formProfile">Form Automator</TabsTrigger>
            <TabsTrigger value="apiCredentials">API Keys & Twilio</TabsTrigger>
          </TabsList>

          <TabsContent value="connect" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Link the Telegram account that is in your placement groups. Use phone + OTP below, then enable groups in{" "}
              <strong>Notifications</strong>.
            </p>
            <TelegramConnectCard />
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Account from your session</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Name</Label>
                  <Input defaultValue={session?.user?.name || ""} readOnly />
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Email</Label>
                  <Input defaultValue={session?.user?.email || ""} readOnly />
                </fieldset>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span>Theme</span>
                <ThemeToggle />
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle>Regional</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Timezone</Label>
                  <Input value={prefs.timezone} onChange={(e) => update("timezone", e.target.value)} />
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Reminder language</Label>
                  <Input value={prefs.language} onChange={(e) => update("language", e.target.value)} placeholder="en" />
                </fieldset>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reminders" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>Default reminder offsets</CardTitle>
                <CardDescription>Minutes before each deadline (comma-separated)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  value={offsetInput}
                  onChange={(e) => {
                    setOffsetInput(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="1440, 360, 60, 15"
                />
                <div className="flex items-center justify-between">
                  <Label>Reminder sound (browser)</Label>
                  <Switch
                    checked={prefs.reminders.sound}
                    onCheckedChange={(v) => nest("reminders", { sound: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Vibration (mobile)</Label>
                  <Switch
                    checked={prefs.reminders.vibration ?? true}
                    onCheckedChange={(v) => nest("reminders", { vibration: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Smart AI reminder mode</Label>
                  <Switch
                    checked={prefs.reminders.smartAiMode ?? true}
                    onCheckedChange={(v) => nest("reminders", { smartAiMode: v })}
                  />
                </div>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Default escalation level</Label>
                  <Select
                    value={prefs.reminders.defaultEscalation || "normal"}
                    onValueChange={(v) => nest("reminders", { defaultEscalation: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="soft">Soft</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </fieldset>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle>Quiet hours</CardTitle>
                <CardDescription>Soft/normal reminders pause during these hours</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Enable quiet hours</Label>
                  <Switch
                    checked={prefs.notifications.quietHoursEnabled ?? false}
                    onCheckedChange={(v) => nest("notifications", { quietHoursEnabled: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Start (24h)</Label>
                    <Input
                      value={prefs.notifications.quietHoursStart || "22:00"}
                      onChange={(e) => nest("notifications", { quietHoursStart: e.target.value })}
                      placeholder="22:00"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>End (24h)</Label>
                    <Input
                      value={prefs.notifications.quietHoursEnd || "07:00"}
                      onChange={(e) => nest("notifications", { quietHoursEnd: e.target.value })}
                      placeholder="07:00"
                    />
                  </fieldset>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle>Channels</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(["browser", "email", "telegram", "inApp", "phoneCall"] as const).map((ch) => (
                  <div key={ch} className="flex items-center justify-between">
                    <Label className="capitalize">
                      {ch === "inApp" ? "In-app" : ch === "phoneCall" ? "Phone Call (Twilio Voice)" : ch}
                    </Label>
                    <Switch
                      checked={prefs.notifications[ch] ?? false}
                      onCheckedChange={(v) => nest("notifications", { [ch]: v })}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Label>Push notifications (FCM)</Label>
                  <Switch
                    checked={prefs.notifications.push ?? true}
                    onCheckedChange={(v) => nest("notifications", { push: v })}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    if (typeof window === "undefined" || !("Notification" in window)) return;
                    const p = await Notification.requestPermission();
                    toast.message(`Notifications: ${p}`);
                    if (p === "granted") {
                      const { requestFcmToken } = await import("@/lib/firebase/messaging-client");
                      const token = await requestFcmToken();
                      if (token) {
                        await fetch("/api/push/register", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, platform: "web" }),
                        });
                        toast.success("Push token registered");
                      }
                    }
                  }}
                >
                  Enable browser + push notifications
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>Google Calendar</CardTitle>
                <CardDescription>
                  Sign in with Google (same email) grants full calendar access. Tokens are stored on your user record.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button type="button" variant="glow" onClick={() => signIn("google", { callbackUrl: "/dashboard/calendar" })}>
                  Connect / refresh Google
                </Button>
                <div className="flex items-center justify-between">
                  <Label>Auto-sync</Label>
                  <Switch checked={prefs.calendar.autoSync} onCheckedChange={(v) => nest("calendar", { autoSync: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-create events</Label>
                  <Switch
                    checked={prefs.calendar.autoCreateEvents}
                    onCheckedChange={(v) => nest("calendar", { autoCreateEvents: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-update events</Label>
                  <Switch
                    checked={prefs.calendar.autoUpdateEvents}
                    onCheckedChange={(v) => nest("calendar", { autoUpdateEvents: v })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>AI behavior</CardTitle>
                <CardDescription>Controls reminder intelligence and spam filtering tone</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Strictness</Label>
                  <Select
                    value={prefs.ai.strictness}
                    onValueChange={(v) => nest("ai", { strictness: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strict">Strict</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="relaxed">Relaxed</SelectItem>
                    </SelectContent>
                  </Select>
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Urgency sensitivity</Label>
                  <Select
                    value={prefs.ai.urgencySensitivity}
                    onValueChange={(v) => nest("ai", { urgencySensitivity: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0 sm:col-span-2">
                  <Label>Spam filtering</Label>
                  <Select
                    value={prefs.ai.spamSensitivity}
                    onValueChange={(v) => nest("ai", { spamSensitivity: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </fieldset>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary animate-pulse" />
                  AI Automation Engine
                </CardTitle>
                <CardDescription>
                  Control how PlaceMint uses AI, deadlines, and Google Calendar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <PrefSwitchRow
                  label="Master AI automation switch (must be ON to run AI jobs)"
                  checked={prefs.automation?.masterEnabled ?? true}
                  onChange={(v) => nest("automation", { masterEnabled: v })}
                />
                <PrefSwitchRow
                  label="Generate smart suggested reminders using AI confidence levels"
                  checked={prefs.automation?.aiAutoReminders ?? true}
                  onChange={(v) => nest("automation", { aiAutoReminders: v })}
                />
                <PrefSwitchRow
                  label="Sync deadlines automatically to Google Calendar events"
                  checked={prefs.automation?.autoCalendarSync ?? true}
                  onChange={(v) => nest("automation", { autoCalendarSync: v })}
                />
                <PrefSwitchRow
                  label="Calculate reminder priority tiers dynamically"
                  checked={prefs.automation?.autoPriority ?? true}
                  onChange={(v) => nest("automation", { autoPriority: v })}
                />
                <PrefSwitchRow
                  label="Fuzzy merge similar or duplicate deadlines automatically"
                  checked={prefs.automation?.duplicateMerge ?? true}
                  onChange={(v) => nest("automation", { duplicateMerge: v })}
                />
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-primary" />
                  Recent Decisions Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <details className="group cursor-pointer">
                  <summary className="text-xs text-muted-foreground hover:text-foreground transition-colors select-none font-medium">
                    Show latest automation engine logs ({logs.length} items)
                  </summary>
                  <div className="space-y-2 mt-3 pt-3 border-t border-white/5 max-h-60 overflow-y-auto pr-2 text-xs">
                    {logsLoading ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-7 w-full" />
                        <Skeleton className="h-7 w-full" />
                      </div>
                    ) : logs.length === 0 ? (
                      <p className="text-muted-foreground">No recent decisions logged.</p>
                    ) : (
                      logs.slice(0, 8).map((log) => (
                        <div key={log._id} className="flex justify-between items-center gap-4 py-1.5 border-b border-white/[0.02] last:border-0">
                          <div className="space-y-0.5">
                            <span className="font-medium text-foreground">{log.summary}</span>
                            <span className="block text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary uppercase font-bold tracking-wider shrink-0">
                            {log.type}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="placement" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>Placement preferences</CardTitle>
                <CardDescription>Used for future matching and recommendations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Preferred companies (comma-separated)</Label>
                  <Input
                    value={prefs.placement.preferredCompanies.join(", ")}
                    onChange={(e) =>
                      update("placement", {
                        ...prefs.placement,
                        preferredCompanies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Preferred roles</Label>
                  <Input
                    value={prefs.placement.preferredRoles.join(", ")}
                    onChange={(e) =>
                      update("placement", {
                        ...prefs.placement,
                        preferredRoles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Dream companies</Label>
                  <Input
                    value={prefs.placement.dreamCompanies.join(", ")}
                    onChange={(e) =>
                      update("placement", {
                        ...prefs.placement,
                        dreamCompanies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Minimum package (LPA), optional</Label>
                  <Input
                    type="number"
                    value={prefs.placement.minPackageLakh ?? ""}
                    onChange={(e) =>
                      update("placement", {
                        ...prefs.placement,
                        minPackageLakh: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </fieldset>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="telegram" className="space-y-4">
            <TelegramConnectCard />
            <Card className="glass">
              <CardHeader>
                <CardTitle>Telegram AI monitoring</CardTitle>
                <CardDescription>
                  How many recent messages to load and analyze per monitored group. Saving settings applies on the next
                  analysis (messages are fetched from Telegram automatically). Toggle groups on the Notifications page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Messages per group for analysis (5–100)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={prefs.telegram?.insightMessageCount ?? 25}
                    onChange={(e) =>
                      nest("telegram", {
                        ...(prefs.telegram || { monitoredGroupIds: [] }),
                        insightMessageCount: Math.min(100, Math.max(5, Number(e.target.value) || 25)),
                      })
                    }
                  />
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Only analyze messages since (optional)</Label>
                  <Input
                    type="date"
                    value={
                      prefs.telegram?.insightSinceDate
                        ? new Date(prefs.telegram.insightSinceDate as unknown as string)
                            .toISOString()
                            .slice(0, 10)
                        : ""
                    }
                    onChange={(e) =>
                      nest("telegram", {
                        ...(prefs.telegram || { monitoredGroupIds: [] }),
                        insightSinceDate: e.target.value || null,
                      })
                    }
                  />
                </fieldset>
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>After AI analysis</Label>
                  <Select
                    value={prefs.telegram?.insightsApplyMode ?? "preview"}
                    onValueChange={(v) =>
                      nest("telegram", {
                        ...(prefs.telegram || { monitoredGroupIds: [] }),
                        insightsApplyMode: v as "preview" | "all" | "none",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preview">Preview first (recommended)</SelectItem>
                      <SelectItem value="all">Auto-apply all deadlines & reminders</SelectItem>
                      <SelectItem value="none">Insights only (no auto-create)</SelectItem>
                    </SelectContent>
                  </Select>
                </fieldset>
                <PrefSwitchRow
                  label="Pin applied insights on dashboard overview"
                  checked={prefs.telegram?.insightPinToOverview ?? true}
                  onChange={(v) =>
                    nest("telegram", { ...(prefs.telegram || { monitoredGroupIds: [] }), insightPinToOverview: v })
                  }
                />
                <p className="text-xs text-muted-foreground rounded-lg border border-white/10 bg-white/5 p-3">
                  Optional: add <code className="text-primary">GEMINI_API_KEY</code> on Vercel for deeper AI analysis.
                  Without it, built-in smart rules still analyze placement messages.
                </p>
                <PrefSwitchRow label="Auto-run insights on monitored groups" checked={prefs.telegram?.autoInsights ?? true} onChange={(v) => nest("telegram", { ...(prefs.telegram || { insightMessageCount: 25, monitoredGroupIds: [] }), autoInsights: v })} />
                <PrefSwitchRow label="Auto-create deadlines from insights" checked={prefs.telegram?.autoCreateDeadlines ?? true} onChange={(v) => nest("telegram", { ...(prefs.telegram || { insightMessageCount: 25, monitoredGroupIds: [] }), autoCreateDeadlines: v })} />
                <PrefSwitchRow label="Auto-create reminders from insights" checked={prefs.telegram?.autoCreateReminders ?? true} onChange={(v) => nest("telegram", { ...(prefs.telegram || { insightMessageCount: 25, monitoredGroupIds: [] }), autoCreateReminders: v })} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="formProfile" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>Form Automator Profile</CardTitle>
                <CardDescription>
                  Configure your default profile details. These will be fuzzy-matched against form labels to auto-fill Google Forms.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Full Name</Label>
                    <Input
                      value={prefs.formProfile?.fullName || ""}
                      onChange={(e) => nest("formProfile", { fullName: e.target.value })}
                      placeholder="John Doe"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={prefs.formProfile?.email || ""}
                      onChange={(e) => nest("formProfile", { email: e.target.value })}
                      placeholder="john@example.com"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Phone Number</Label>
                    <Input
                      value={prefs.formProfile?.phone || ""}
                      onChange={(e) => nest("formProfile", { phone: e.target.value })}
                      placeholder="+919876543210"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Current CGPA</Label>
                    <Input
                      value={prefs.formProfile?.cgpa || ""}
                      onChange={(e) => nest("formProfile", { cgpa: e.target.value })}
                      placeholder="9.15"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Branch / Stream</Label>
                    <Input
                      value={prefs.formProfile?.branch || ""}
                      onChange={(e) => nest("formProfile", { branch: e.target.value })}
                      placeholder="Computer Science & Engineering"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Graduation Year</Label>
                    <Input
                      value={prefs.formProfile?.graduationYear || ""}
                      onChange={(e) => nest("formProfile", { graduationYear: e.target.value })}
                      placeholder="2027"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0 sm:col-span-2">
                    <Label>Resume Link (Google Drive / public shareable link)</Label>
                    <Input
                      value={prefs.formProfile?.resumeLink || ""}
                      onChange={(e) => nest("formProfile", { resumeLink: e.target.value })}
                      placeholder="https://drive.google.com/..."
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>GitHub Link (optional)</Label>
                    <Input
                      value={prefs.formProfile?.githubLink || ""}
                      onChange={(e) => nest("formProfile", { githubLink: e.target.value })}
                      placeholder="https://github.com/..."
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>LinkedIn Link (optional)</Label>
                    <Input
                      value={prefs.formProfile?.linkedInLink || ""}
                      onChange={(e) => nest("formProfile", { linkedInLink: e.target.value })}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>College Roll Number / registration ID (optional)</Label>
                    <Input
                      value={prefs.formProfile?.rollNumber || ""}
                      onChange={(e) => nest("formProfile", { rollNumber: e.target.value })}
                      placeholder="23CSE102"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Additional Info / Cover Note (optional)</Label>
                    <Input
                      value={prefs.formProfile?.additionalInfo || ""}
                      onChange={(e) => nest("formProfile", { additionalInfo: e.target.value })}
                      placeholder="Highly motivated CS student specialized in AI..."
                    />
                  </fieldset>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="apiCredentials" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>AI Gemini Configuration</CardTitle>
                <CardDescription>
                  Configure your Gemini API key used for job parsing and smart analytics extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset className="space-y-2 border-0 p-0">
                  <Label>Gemini API Key</Label>
                  <Input
                    type="password"
                    value={prefs.geminiApiKey || ""}
                    onChange={(e) => update("geminiApiKey", e.target.value)}
                    placeholder="AIzaSy..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Directly saves to DB. Seeding defaults from Vercel env variable if present.
                  </p>
                </fieldset>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle>Twilio Voice Configuration</CardTitle>
                <CardDescription>
                  Configure your Twilio account details to receive phone call alerts for critical deadlines.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Twilio Account SID</Label>
                    <Input
                      value={prefs.twilioAccountSid || ""}
                      onChange={(e) => update("twilioAccountSid", e.target.value)}
                      placeholder="AC..."
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Twilio Auth Token</Label>
                    <Input
                      type="password"
                      value={prefs.twilioAuthToken || ""}
                      onChange={(e) => update("twilioAuthToken", e.target.value)}
                      placeholder="dacff..."
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Twilio From Phone Number</Label>
                    <Input
                      value={prefs.twilioFromPhone || ""}
                      onChange={(e) => update("twilioFromPhone", e.target.value)}
                      placeholder="+13158563982"
                    />
                  </fieldset>
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Twilio To Phone Number (Default Destination)</Label>
                    <Input
                      value={prefs.twilioToPhone || ""}
                      onChange={(e) => update("twilioToPhone", e.target.value)}
                      placeholder="+91xxxxxxxxxx"
                    />
                  </fieldset>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Verify Connection</p>
                    <p className="text-xs text-muted-foreground">
                      Place a test placement call to your destination phone.
                    </p>
                  </div>
                  <Button
                    variant="glow"
                    size="sm"
                    disabled={testingCall || !prefs.twilioToPhone}
                    onClick={triggerTestCall}
                  >
                    {testingCall && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Place Test Call
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="glass mt-4">
              <CardHeader>
                <CardTitle>Twilio Voice Customization</CardTitle>
                <CardDescription>
                  Configure call-to-actions, automated snooze durations, and speech settings for alerts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Interactive TwiML Menu</Label>
                    <p className="text-xs text-muted-foreground">
                      Offer options to fill forms, snooze, or repeat alerts during the call.
                    </p>
                  </div>
                  <Switch
                    checked={prefs.twilioVoiceSettings?.menuEnabled ?? true}
                    onCheckedChange={(val) => nest("twilioVoiceSettings", { menuEnabled: val })}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Enable &quot;Fill via Call&quot; CTC</Label>
                    <p className="text-xs text-muted-foreground">
                      Allows triggering the Form Automator directly by pressing 1 on your phone.
                    </p>
                  </div>
                  <Switch
                    checked={prefs.twilioVoiceSettings?.fillViaCallEnabled ?? true}
                    onCheckedChange={(val) => nest("twilioVoiceSettings", { fillViaCallEnabled: val })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-white/10">
                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Default Snooze Duration</Label>
                    <Select
                      value={String(prefs.twilioVoiceSettings?.defaultSnoozeMinutes ?? 60)}
                      onValueChange={(val) => nest("twilioVoiceSettings", { defaultSnoozeMinutes: Number(val) })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select snooze duration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour (60 min)</SelectItem>
                        <SelectItem value="180">3 hours (180 min)</SelectItem>
                      </SelectContent>
                    </Select>
                  </fieldset>

                  <fieldset className="space-y-2 border-0 p-0">
                    <Label>Voice Actor (Amazon Polly)</Label>
                    <Select
                      value={prefs.twilioVoiceSettings?.voice ?? "Polly.Kajal-Neural"}
                      onValueChange={(val) => nest("twilioVoiceSettings", { voice: val })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select voice actor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Polly.Kajal-Neural">Kajal (Neural, India)</SelectItem>
                        <SelectItem value="Polly.Aditi-Standard">Aditi (Standard, India)</SelectItem>
                        <SelectItem value="Polly.Joanna-Neural">Joanna (Neural, US)</SelectItem>
                        <SelectItem value="Polly.Ivy-Neural">Ivy (Neural child, US)</SelectItem>
                      </SelectContent>
                    </Select>
                  </fieldset>

                  <fieldset className="space-y-2 border-0 p-0 sm:col-span-2">
                    <Label>Voice Language</Label>
                    <Input
                      value={prefs.twilioVoiceSettings?.language ?? "en-IN"}
                      onChange={(e) => nest("twilioVoiceSettings", { language: e.target.value })}
                      placeholder="en-IN"
                    />
                  </fieldset>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          </>
        )}

        {activeCallTracking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="bg-zinc-950 border border-white/10 rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl text-center">
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

function PrefSwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
