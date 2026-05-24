"use client";

import { useEffect } from "react";
import { PwaInstallBanner } from "@/components/pwa/pwa-install-banner";
import { NotificationPermissionPrompt } from "@/components/pwa/notification-permission-prompt";
import { PushNotificationSetup } from "@/components/pwa/push-notification-setup";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return (
    <>
      {children}
      <PwaInstallBanner />
      <NotificationPermissionPrompt />
      <PushNotificationSetup />
    </>
  );
}
