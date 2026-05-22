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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw } from "lucide-react";

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
};

const defaultOffsetsStr = (arr: number[]) => arr.join(", ");

export default function SettingsPage() {
  const { data: session } = useSession();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [offsetInput, setOffsetInput] = useState("");

  const load = useCallback(() => {
    setLoading(true);
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
        setPrefs({ ...d, telegram: tg });
        setOffsetInput(defaultOffsetsStr(d.reminders?.defaultOffsetsMinutes || []));
      })
      .finally(() => setLoading(false));
  }, []);

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

        <Tabs defaultValue="connect" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="connect" className="data-[state=active]:bg-primary/20">
              Connect Telegram
            </TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="reminders">Reminders</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="placement">Placement</TabsTrigger>
            <TabsTrigger value="telegram">Telegram AI</TabsTrigger>
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
                {(["browser", "email", "telegram", "inApp"] as const).map((ch) => (
                  <div key={ch} className="flex items-center justify-between">
                    <Label className="capitalize">{ch === "inApp" ? "In-app" : ch}</Label>
                    <Switch
                      checked={prefs.notifications[ch]}
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
                  How many recent messages Gemini reads per monitored group. Toggle groups on the Notifications page.
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
                <PrefSwitchRow label="Auto-run insights on monitored groups" checked={prefs.telegram?.autoInsights ?? true} onChange={(v) => nest("telegram", { ...(prefs.telegram || { insightMessageCount: 25, monitoredGroupIds: [] }), autoInsights: v })} />
                <PrefSwitchRow label="Auto-create deadlines from insights" checked={prefs.telegram?.autoCreateDeadlines ?? true} onChange={(v) => nest("telegram", { ...(prefs.telegram || { insightMessageCount: 25, monitoredGroupIds: [] }), autoCreateDeadlines: v })} />
                <PrefSwitchRow label="Auto-create reminders from insights" checked={prefs.telegram?.autoCreateReminders ?? true} onChange={(v) => nest("telegram", { ...(prefs.telegram || { insightMessageCount: 25, monitoredGroupIds: [] }), autoCreateReminders: v })} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          </>
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
