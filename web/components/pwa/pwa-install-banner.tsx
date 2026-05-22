"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const dismissedAt = localStorage.getItem("pwa-install-dismissed");
    if (dismissedAt) setDismissed(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }

  function dismiss() {
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
    setDismissed(true);
  }

  const show = !installed && !dismissed && (deferred || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-20 lg:bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:max-w-sm z-50 glass glow-border rounded-xl p-4 shadow-2xl border border-primary/30"
        >
          <div className="flex gap-3">
            <Download className="h-8 w-8 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Install PlaceMint</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add to home screen for reminders that work like a native app.
              </p>
              <div className="flex gap-2 mt-3">
                {deferred ? (
                  <Button size="sm" variant="glow" onClick={() => void install()}>
                    Install app
                  </Button>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    Safari: Share → Add to Home Screen · Chrome: menu → Install
                  </p>
                )}
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Later
                </Button>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0 h-8 w-8" onClick={dismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
