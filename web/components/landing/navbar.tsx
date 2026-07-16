"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { ThemeToggle } from "@/components/theme-toggle";

import { useSession } from "next-auth/react";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { status } = useSession();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 z-50 w-full border-b border-white/5 bg-background/60 backdrop-blur-xl"
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-lg font-bold">
            Place<span className="text-gradient">Mint</span> AI
          </span>
        </Link>
 
        <div className="hidden items-center gap-8 md:flex">
          {siteConfig.nav.main.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.title}
            </Link>
          ))}
        </div>
 
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          {status === "authenticated" ? (
            <Button variant="glow" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button variant="glow" asChild>
                <Link href="/register">Get Started</Link>
              </Button>
            </>
          )}
        </div>
 
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </nav>
 
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 bg-background/95 md:hidden"
          >
            <div className="flex flex-col gap-4 p-4">
              {siteConfig.nav.main.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="text-sm">
                  {item.title}
                </Link>
              ))}
              {status === "authenticated" ? (
                <Button variant="glow" asChild>
                  <Link href="/dashboard" onClick={() => setOpen(false)}>Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" asChild>
                    <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
                  </Button>
                  <Button variant="glow" asChild>
                    <Link href="/register" onClick={() => setOpen(false)}>Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
