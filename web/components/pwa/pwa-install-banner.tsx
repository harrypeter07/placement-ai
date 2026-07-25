"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
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
  const [manualShow, setManualShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    const dismissedAt = localStorage.getItem("pwa-install-dismissed");
    if (dismissedAt) {
      const elapsedMs = Date.now() - Number(dismissedAt);
      // Expire dismissal after 1 hour (3600000 ms) so prompt isn't lost forever
      if (elapsedMs < 3600000) {
        setDismissed(true);
      } else {
        localStorage.removeItem("pwa-install-dismissed");
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };

    const openHandler = () => {
      setDismissed(false);
      setManualShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    window.addEventListener("open-pwa-install-banner", openHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("open-pwa-install-banner", openHandler);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
    setManualShow(false);
  }

  function dismiss() {
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
    setDismissed(true);
    setManualShow(false);
  }

  const show = !installed && (manualShow || (!dismissed && (!!deferred || true)));

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-20 lg:bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:max-w-sm z-50 glass glow-border rounded-xl p-4 shadow-2xl border border-primary/40 bg-black/90 backdrop-blur-xl"
        >
          <div className="flex gap-3 items-start">
            <div className="p-2 rounded-lg bg-primary/20 text-primary shrink-0 mt-0.5">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="font-semibold text-sm text-foreground">Install PlaceMint App</p>
                <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Install as a native mobile/desktop PWA for guaranteed call alerts & push notifications.
              </p>
              <div className="flex gap-2 mt-3 items-center flex-wrap">
                {deferred ? (
                  <Button size="sm" variant="glow" onClick={() => void install()}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Install Now
                  </Button>
                ) : (
                  <div className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                    Safari/Chrome: Tap <strong>Share / Menu</strong> ➔ <strong>Add to Home Screen</strong>
                  </div>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={dismiss}>
                  Later
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
