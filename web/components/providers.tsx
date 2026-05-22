"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-provider";

export function Providers({ children }: { children: React.ReactNode }) {
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
