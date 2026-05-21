"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, LogOut, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { toast } from "sonner";

interface AuthStatus {
  connected: boolean;
  apiConfigured?: boolean;
  phoneNumber?: string;
  telegramUsername?: string;
  displayName?: string;
  connectedAt?: string;
}

type Step = "idle" | "code" | "2fa";

export function TelegramConnectCard() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);

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

  async function sendCode() {
    setSendingCode(true);
    try {
      const res = await fetch("/api/telegram/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setStep("code");
      toast.success(data.message || "Code sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setSendingCode(false);
    }
  }

  async function verifyCode() {
    setVerifying(true);
    try {
      const res = await fetch("/api/telegram/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
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
        throw new Error(data.error || "Verification failed");
      }
      toast.success(`Connected as ${data.displayName || data.telegramUsername || "Telegram user"}`);
      setStep("idle");
      setCode("");
      setPassword("");
      setNeeds2fa(false);
      await load();
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

  if (!status?.apiConfigured) {
    return (
      <Card className="glass border-amber-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-200">
            <Shield className="h-5 w-5" />
            Telegram API not configured
          </CardTitle>
          <CardDescription>
            Add <code className="text-xs bg-muted px-1 rounded">TELEGRAM_API_ID</code> and{" "}
            <code className="text-xs bg-muted px-1 rounded">TELEGRAM_API_HASH</code> to Vercel (from{" "}
            <a href="https://my.telegram.org" className="text-primary underline" target="_blank" rel="noreferrer">
              my.telegram.org
            </a>
            ) — same values as the Render worker.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status.connected) {
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
          <p className="text-sm text-muted-foreground">
            The Render worker checks every 30s and connects automatically. Then enable groups in{" "}
            <strong>Notifications</strong>.
          </p>
          <LoadingButton variant="outline" size="sm" loading={disconnecting} onClick={() => void disconnect()}>
            <LogOut className="h-4 w-4 mr-1" />
            Disconnect
          </LoadingButton>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass glow-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Connect Telegram
        </CardTitle>
        <CardDescription>
          Log in with your phone and OTP here — the worker on Render cannot ask for codes in the terminal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "idle" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="tg-phone">Phone number</Label>
              <Input
                id="tg-phone"
                placeholder="+919876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Include country code. Use the number of the Telegram account in your placement groups.</p>
            </div>
            <LoadingButton variant="glow" loading={sendingCode} onClick={() => void sendCode()} disabled={!phone.trim()}>
              Send login code
            </LoadingButton>
          </>
        )}

        {(step === "code" || step === "2fa") && (
          <>
            <div className="space-y-2">
              <Label htmlFor="tg-code">Login code</Label>
              <Input
                id="tg-code"
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
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
                />
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <LoadingButton variant="glow" loading={verifying} onClick={() => void verifyCode()} disabled={!code.trim()}>
                Verify & connect
              </LoadingButton>
              <Button variant="ghost" size="sm" onClick={() => { setStep("idle"); setCode(""); setNeeds2fa(false); }}>
                Back
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
