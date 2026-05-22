"use client";

import { getFirebaseClientConfig, isFirebaseConfigured } from "@/lib/firebase/config";

let messagingInit: Promise<import("firebase/messaging").Messaging | null> | null = null;

export async function getFirebaseMessaging() {
  if (typeof window === "undefined" || !isFirebaseConfigured()) return null;
  if (!("serviceWorker" in navigator)) return null;

  if (!messagingInit) {
    messagingInit = (async () => {
      const { initializeApp, getApps } = await import("firebase/app");
      const { getMessaging, isSupported } = await import("firebase/messaging");
      const supported = await isSupported();
      if (!supported) return null;

      const cfg = getFirebaseClientConfig()!;
      const app = getApps().length ? getApps()[0] : initializeApp(cfg);
      await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      return getMessaging(app);
    })();
  }
  return messagingInit;
}

export async function requestFcmToken(): Promise<string | null> {
  const cfg = getFirebaseClientConfig();
  if (!cfg?.vapidKey) return null;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  const { getToken } = await import("firebase/messaging");
  const reg = await navigator.serviceWorker.ready;
  return getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
}
