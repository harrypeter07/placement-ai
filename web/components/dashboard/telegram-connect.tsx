"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, LogOut, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TELEGRAM_COUNTRY_OPTIONS } from "@/lib/telegram-phone";

interface AuthStatus {
  connected: boolean;
  apiConfigured?: boolean;
  phoneNumber?: string;
  telegramUsername?: string;
  displayName?: string;
  connectedAt?: string;
}

type Step = "idle" | "code" | "2fa";

const DEFAULT_COUNTRY = "IN";
const RESEND_COOLDOWN_DEFAULT = 45;

export function TelegramConnectCard() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncingWorker, setSyncingWorker] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const country = TELEGRAM_COUNTRY_OPTIONS.find((c) => c.code === countryCode) ?? TELEGRAM_COUNTRY_OPTIONS[0];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/auth/status");
      const data = await res.json();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function startCooldown(sec: number) {
    setResendCooldown(sec);
  }

  async function requestCode(resend = false) {
    if (!localPhone.trim() && !resend) {
      toast.error("Enter your phone number");
      return;
    }
    setSendingCode(true);
    try {
      const countryOpt = TELEGRAM_COUNTRY_OPTIONS.find((c) => c.code === countryCode)!;
      const res = await fetch("/api/telegram/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryDial: countryOpt.dial,
          localNumber: localPhone.trim(),
          resend,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data.retryAfterSec) {
          startCooldown(data.retryAfterSec);
        }
        throw new Error(data.error || "Failed to send code");
      }
      setSentPhone(data.phoneNumber || "");
      setStep("code");
      setCode("");
      setNeeds2fa(false);
      startCooldown(data.retryAfterSec ?? RESEND_COOLDOWN_DEFAULT);
      toast.success(data.message || "Code sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setSendingCode(false);
    }
  }

  async function verifyCode() {
    const digits = code.replace(/\D/g, "");
    if (digits.length < 4) {
      toast.error("Enter the full code from Telegram or SMS");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/telegram/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: digits,
          ...(password ? { password } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needs2fa) {
          setNeeds2fa(true);
          setStep("2fa");
          toast.message("Enter your Telegram 2FA password");
          return;
        }
        if (data.expired) {
          toast.error(data.error || "Code expired — resend a new code");
          setCode("");
          return;
        }
        throw new Error(data.error || "Verification failed");
      }
      toast.success(`Connected as ${data.displayName || data.telegramUsername || "Telegram user"}`);
      setStep("idle");
      setCode("");
      setPassword("");
      setNeeds2fa(false);
      await load();
      try {
        const syncRes = await fetch("/api/telegram/auth/sync-worker-session", { method: "POST" });
        const syncData = await syncRes.json();
        if (syncRes.ok) toast.message("Render worker session synced");
        else if (syncData.error) toast.message(syncData.error);
      } catch {
        /* optional */
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not verify");
    } finally {
      setVerifying(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/telegram/auth/disconnect", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Telegram disconnected");
      setStep("idle");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <Card className="glass">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const apiReady = status?.apiConfigured !== false;

  if (status?.connected) {
    return (
      <Card className="glass border-emerald-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Telegram connected
          </CardTitle>
          <CardDescription>
            Session saved securely. The Render worker will use this account — no terminal login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Connected</Badge>
            {status.displayName && <span className="text-sm font-medium">{status.displayName}</span>}
            {status.telegramUsername && (
              <span className="text-sm text-muted-foreground">@{status.telegramUsername}</span>
            )}
            {status.phoneNumber && (
              <span className="text-xs text-muted-foreground">{status.phoneNumber}</span>
            )}
          </div>
          <div className="rounded-lg border-2 border-primary/40 bg-primary/10 p-3 text-sm">
            <p className="font-semibold text-primary">Required for Render worker</p>
            <p className="text-muted-foreground mt-1">
              If dashboard shows <strong>waiting</strong> / &quot;GramJS-only&quot;, click below once.
              Render connects within ~30s — no redeploy needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LoadingButton
              variant="glow"
              size="sm"
              loading={syncingWorker}
              onClick={async () => {
                setSyncingWorker(true);
                try {
                  const res = await fetch("/api/telegram/auth/sync-worker-session", { method: "POST" });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || data.hint || "Sync failed");
                  toast.success(
                    data.message ||
                      `Synced (${data.telethonLength || "?"} chars). Wait 30s and refresh dashboard.`
                  );
                  await load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Sync failed");
                } finally {
                  setSyncingWorker(false);
                }
              }}
            >
              Sync Render worker session
            </LoadingButton>
            <LoadingButton variant="outline" size="sm" loading={disconnecting} onClick={() => void disconnect()}>
              <LogOut className="h-4 w-4 mr-1" />
              Disconnect
            </LoadingButton>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass glow-border ring-2 ring-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Bot className="h-6 w-6 text-primary" />
          Connect Telegram
        </CardTitle>
        <CardDescription>
          Phone + OTP login. Use the same Telegram account that is in your placement groups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!apiReady && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100/90 flex gap-2">
            <Shield className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Server env missing</p>
              <p className="text-xs mt-1 text-amber-100/80">
                Add <code className="bg-muted px-1 rounded">TELEGRAM_API_ID</code> and{" "}
                <code className="bg-muted px-1 rounded">TELEGRAM_API_HASH</code> on Vercel, then redeploy.
              </p>
            </div>
          </div>
        )}

        {step === "idle" && (
          <>
            <div className="grid sm:grid-cols-[140px_1fr] gap-3">
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={countryCode} onValueChange={setCountryCode} disabled={!apiReady}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TELEGRAM_COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label} (+{c.dial})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tg-phone-local">Phone number</Label>
                <div className="flex gap-2">
                  <span className="inline-flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm shrink-0">
                    +{country.dial}
                  </span>
                  <Input
                    id="tg-phone-local"
                    inputMode="numeric"
                    placeholder="9322909257"
                    value={localPhone}
                    onChange={(e) => setLocalPhone(e.target.value.replace(/[^\d\s]/g, ""))}
                    disabled={!apiReady}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Full number: +{country.dial}
                  {localPhone.replace(/\D/g, "").replace(/^0+/, "") || "…"}
                </p>
              </div>
            </div>
            <LoadingButton
              variant="glow"
              size="lg"
              className="w-full sm:w-auto"
              loading={sendingCode}
              onClick={() => void requestCode(false)}
              disabled={!apiReady || localPhone.replace(/\D/g, "").length < 6}
            >
              Send login code
            </LoadingButton>
          </>
        )}

        {(step === "code" || step === "2fa") && (
          <>
            {sentPhone && (
              <p className="text-sm text-muted-foreground">
                Code sent to <strong className="text-foreground">{sentPhone}</strong>
                {step === "code" && " — enter it right away (codes expire if you wait too long)."}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="tg-code">Login code</Label>
              <Input
                id="tg-code"
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            {(needs2fa || step === "2fa") && (
              <div className="space-y-2">
                <Label htmlFor="tg-2fa">Two-factor password</Label>
                <Input
                  id="tg-2fa"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Telegram 2FA password"
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <LoadingButton
                variant="glow"
                loading={verifying}
                onClick={() => void verifyCode()}
                disabled={code.replace(/\D/g, "").length < 4}
              >
                Verify & connect
              </LoadingButton>
              <LoadingButton
                variant="outline"
                loading={sendingCode}
                disabled={resendCooldown > 0 || !apiReady}
                onClick={() => void requestCode(true)}
              >
                {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend code"}
              </LoadingButton>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("idle");
                  setCode("");
                  setNeeds2fa(false);
                }}
              >
                Change number
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
