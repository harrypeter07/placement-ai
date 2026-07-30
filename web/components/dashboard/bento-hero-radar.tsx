"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, Trophy, Award, Target, ArrowUpRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BentoHeroRadarProps {
  productivityScore: number;
  placementStreak: number;
  appliedCount: number;
  eligibleCount: number;
}

export function BentoHeroRadar({
  productivityScore,
  placementStreak,
  appliedCount,
  eligibleCount,
}: BentoHeroRadarProps) {
  const capabilityScore = Math.min(100, Math.max(10, Math.round(productivityScore || 78)));

  const SKILL_METRICS = [
    { label: "Form Automator", score: 92, color: "bg-emerald-500" },
    { label: "Drive Tracking", score: 85, color: "bg-purple-500" },
    { label: "Telegram Sync", score: 88, color: "bg-blue-500" },
    { label: "Voice Escalation", score: 76, color: "bg-amber-500" },
  ];

  return (
    <Card className="glass border-primary/30 overflow-hidden bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-900 shadow-2xl relative">
      <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <CardContent className="p-6 md:p-8 space-y-6">
        {/* Header Ribbon */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-widest font-mono">Current Placement Status</p>
              <h2 className="text-2xl font-black text-white font-serif tracking-tight">Placement Ready</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-mono text-xs px-3 py-1 gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              {placementStreak} Day Streak
            </Badge>
            <Link href="/dashboard/profile">
              <Button variant="outline" size="sm" className="text-xs border-white/10 bg-white/5 hover:bg-white/10 gap-1.5">
                Edit Profile
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Bento Inner Grid */}
        <div className="grid md:grid-cols-12 gap-6 items-center">
          {/* Capability Score & Level Progression */}
          <div className="md:col-span-5 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Capability Score</span>
                <span className="text-xs font-mono font-bold text-purple-400">{capabilityScore} / 100</span>
              </div>
              <div className="h-3 rounded-full bg-slate-900 border border-white/10 overflow-hidden p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${capabilityScore}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-emerald-400 to-amber-400 shadow-lg shadow-purple-500/50"
                />
              </div>
            </div>

            {/* Metrics Breakdown Bars */}
            <div className="space-y-3 pt-2">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">Core Metrics Analysis</p>
              <div className="grid grid-cols-2 gap-3">
                {SKILL_METRICS.map((m) => (
                  <div key={m.label} className="p-2.5 rounded-xl border border-white/5 bg-black/40 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-300 font-medium truncate">{m.label}</span>
                      <span className="font-mono font-bold text-white text-[11px]">{m.score}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Hero Cybernetic Graphic */}
          <div className="md:col-span-7">
            <div className="rounded-2xl border border-purple-500/30 overflow-hidden bg-slate-950 shadow-2xl relative group">
              <div className="aspect-[16/9] relative">
                <Image
                  src="/illustrations/bento_hero_ai_radar.jpg"
                  alt="AI Capability Radar"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-mono text-purple-300">
                    <Sparkles className="h-4 w-4 text-emerald-400 animate-spin" />
                    <span>Applied: {appliedCount} Companies</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold bg-black/60 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    {eligibleCount} Eligible Drives
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
