"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useSession } from "next-auth/react";

export function Hero() {
  const { status } = useSession();

  return (
    <section className="relative min-h-screen overflow-hidden pt-24">
      <motion.div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
      <motion.div className="absolute inset-0 grid-bg opacity-30" />
      <motion.div className="absolute left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px] animate-pulse-glow" />

      <motion.div className="relative mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
        <motion.div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary"
          >
            <Zap className="h-4 w-4" />
            AI-Powered Placement Intelligence
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          >
            Never Miss a <span className="text-gradient">Placement</span> Opportunity Again
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl"
          >
            PlaceMint AI monitors your Telegram placement groups, extracts deadlines with Gemini AI,
            syncs calendars, and keeps you ahead of every application.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Button variant="glow" size="lg" asChild className="glow-border">
              {status === "authenticated" ? (
                <Link href="/dashboard">
                  Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              ) : (
                <Link href="/register">
                  Start Free <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              )}
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="#workflow">
                <Play className="mr-2 h-4 w-4" /> See How It Works
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 w-full max-w-5xl"
          >
            <motion.div className="glass glow-border rounded-2xl border p-1 shadow-glow-lg">
              <motion.div className="rounded-xl bg-card/80 p-4 sm:p-6">
                <motion.div className="mb-4 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="h-3 w-3 rounded-full bg-yellow-500" />
                  <span className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="ml-2 text-xs text-muted-foreground">PlaceMint Dashboard</span>
                </motion.div>
                <motion.div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Upcoming", value: "12", color: "text-primary" },
                    { label: "Applied", value: "8", color: "text-emerald-400" },
                    { label: "Eligible", value: "24", color: "text-blue-400" },
                  ].map((stat) => (
                    <motion.div key={stat.label} className="glass rounded-lg p-4 text-left">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    </motion.div>
                  ))}
                </motion.div>
                <motion.div className="mt-4 h-32 rounded-lg bg-gradient-to-r from-primary/20 via-mint/10 to-transparent" />
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
