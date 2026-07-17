/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
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

export default function CallAlertsPage() {
  const [calls, setCalls] = useState<CallLogItem[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingCallId, setTestingCallId] = useState<string | null>(null);
  const [rescheduleModalId, setRescheduleModalId] = useState<string | null>(null);
  const [customDateTime, setCustomDateTime] = useState("");

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
      void fetchCallsAndSettings();
    } catch (e: any) {
      toast.error(e.message || "Failed to trigger call");
    } finally {
      setTestingCallId(null);
    }
  };

  const updateCallStatus = async (id: string, updates: Partial<CallLogItem>) => {
    try {
      const res = await fetch("/api/calls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success("Call status updated");
      void fetchCallsAndSettings();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

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
                  {calls.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border border-dashed border-white/10 rounded-lg">
                      <PhoneCall className="h-10 w-10 mx-auto mb-3 opacity-30 text-primary" />
                      <p className="text-sm font-medium">No call alerts scheduled yet.</p>
                      <p className="text-xs max-w-xs mx-auto mt-1 opacity-70">
                        Analyze chat messages or set placement deadlines to schedule calls.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-white/5 bg-black/10">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-white/5 text-xs uppercase text-muted-foreground border-b border-white/5">
                          <tr>
                            <th className="px-4 py-3">Company & Role</th>
                            <th className="px-4 py-3">Call Time</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Call Response</th>
                            <th className="px-4 py-3">Form Fill</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {calls.map((c) => {
                            const dateStr = c.deadline?.deadlineDate
                              ? formatDate(c.deadline.deadlineDate)
                              : formatDate(c.scheduledAt);

                            return (
                              <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3.5">
                                  <div className="font-semibold text-foreground">
                                    {c.deadline?.company || "Custom Alert"}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {c.deadline?.role || c.title}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5 text-primary" />
                                    <span>{c.callTime || "09:00"}</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">{dateStr}</div>
                                </td>
                                <td className="px-4 py-3.5">
                                  {c.callStatus === "called" && (
                                    <Badge variant="success" className="gap-1">
                                      <CheckCircle className="h-3 w-3" /> Called
                                    </Badge>
                                  )}
                                  {c.callStatus === "pending" && (
                                    <Badge variant="warning" className="gap-1">
                                      <Clock className="h-3 w-3" /> Scheduled
                                    </Badge>
                                  )}
                                  {c.callStatus === "missed" && (
                                    <Badge variant="destructive" className="gap-1">
                                      <AlertTriangle className="h-3 w-3" /> Missed
                                    </Badge>
                                  )}
                                  {c.callStatus === "failed" && (
                                    <Badge variant="outline" className="gap-1 border-red-500 text-red-400">
                                      <XCircle className="h-3 w-3" /> Failed
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-4 py-3.5">
                                  {c.callResponse ? (
                                    <Select
                                      value={c.callResponse}
                                      onValueChange={(val) =>
                                        updateCallStatus(c.id, { callResponse: val })
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs bg-transparent border-white/10 w-28">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="acknowledged">Acknowledged</SelectItem>
                                        <SelectItem value="snoozed">Snoozed</SelectItem>
                                        <SelectItem value="fill_form">Fill Form (CTC)</SelectItem>
                                        <SelectItem value="dismiss">Dismissed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5">
                                  {c.callResponse === "fill_form" || c.formFillStatus ? (
                                    <Select
                                      value={c.formFillStatus || "pending"}
                                      onValueChange={(val) =>
                                        updateCallStatus(c.id, { formFillStatus: val as any })
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs bg-transparent border-white/10 w-24">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="filled">Filled</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-right">
                                  <div className="flex justify-end items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
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
                                    <Select
                                      onValueChange={(val) => {
                                        if (val === "custom") {
                                          setRescheduleModalId(c.id);
                                        } else {
                                          void updateCallStatus(c.id, { rescheduleOffsetHours: Number(val) } as any);
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs bg-transparent border-white/10 w-28">
                                        <SelectValue placeholder="Reschedule" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="1">⏳ +1 Hour</SelectItem>
                                        <SelectItem value="2">⏳ +2 Hours</SelectItem>
                                        <SelectItem value="4">⏳ +4 Hours</SelectItem>
                                        <SelectItem value="24">📅 +1 Day</SelectItem>
                                        <SelectItem value="custom">✏️ Custom Time</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </td>
                              </tr>
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
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
        
        {rescheduleModalId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-zinc-950 border border-white/10 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <h3 className="text-lg font-semibold text-foreground">Select Call Reschedule Time</h3>
              <p className="text-xs text-muted-foreground">Choose a specific date and time to trigger this voice alarm reminder.</p>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-medium">Reschedule Date & Time</Label>
                <Input 
                  type="datetime-local" 
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                    void updateCallStatus(rescheduleModalId, { scheduledAt: date.toISOString() } as any);
                    setRescheduleModalId(null);
                    setCustomDateTime("");
                  }}
                >
                  Reschedule
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
