"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { requestFcmToken } from "@/lib/firebase/messaging-client";

const DISMISS_KEY = "placemint-notif-prompt-dismissed";

export function NotificationPermissionPrompt() {
  const { status } = useSession();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, [status]);

  async function enableNotifications() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        if (isFirebaseConfigured()) {
          const token = await requestFcmToken();
          if (token) {
            await fetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, platform: "web" }),
            });
          }
        }
        setVisible(false);
      } else if (perm === "denied") {
        localStorage.setItem(DISMISS_KEY, "1");
        setVisible(false);
      }
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-primary/40 bg-card/95 backdrop-blur-md p-4 shadow-xl md:bottom-6 md:left-auto md:right-6"
      role="dialog"
      aria-label="Enable notifications"
    >
      <div className="flex gap-3">
        <Bell className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="font-semibold text-sm">Enable reminders on this device</p>
          <p className="text-xs text-muted-foreground">
            Get browser alerts for placement deadlines and due reminders. On iPhone/Android, add
            PlaceMint to your home screen first, then allow notifications.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="glow" disabled={busy} onClick={() => void enableNotifications()}>
              Allow notifications
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={dismiss}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
