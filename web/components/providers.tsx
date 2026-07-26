"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Automatically recover from Next.js Vercel redeployment ChunkLoadErrors
    const handleError = (e: ErrorEvent) => {
      const msg = e.message || String(e.error || "");
      if (
        msg.includes("ChunkLoadError") ||
        msg.includes("Loading chunk") ||
        msg.includes("Failed to load resource")
      ) {
        console.warn("[Providers] ChunkLoadError detected after deployment. Reloading...");
        const reloaded = sessionStorage.getItem("chunk_reload_attempts");
        if (!reloaded) {
          sessionStorage.setItem("chunk_reload_attempts", "1");
          window.location.reload();
        }
      }
    };

    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <PwaProvider>
          {children}
          <Toaster richColors position="top-right" />
        </PwaProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
