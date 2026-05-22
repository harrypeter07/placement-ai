"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { requestFcmToken } from "@/lib/firebase/messaging-client";

/** Registers FCM token when user is signed in and push is allowed */
export function PushNotificationSetup() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    let cancelled = false;

    (async () => {
      try {
        const prefsRes = await fetch("/api/settings");
        const prefs = await prefsRes.json();
        if (cancelled || prefs.notifications?.push === false) return;

        if (Notification.permission === "default") return;
        if (Notification.permission !== "granted") return;

        if (isFirebaseConfigured()) {
          const token = await requestFcmToken();
          if (token && !cancelled) {
            await fetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, platform: "web" }),
            });
          }
        }
      } catch {
        /* optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
