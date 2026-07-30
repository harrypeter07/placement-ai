"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, MessageSquare, ClipboardList, PhoneCall, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    id: "telegram",
    step: "01",
    title: "Telegram Ingestion",
    subtitle: "Real-time Placement Drive Parser",
    description: "Connect your placement cell Telegram groups. PlaceMint automatically ingests messages, extracts eligibility criteria, CTC details, and deadlines with AI precision.",
    icon: MessageSquare,
    badge: "Auto-Ingest",
    image: "/illustrations/how_it_works_telegram.jpg",
    actionLink: "/dashboard/settings?tab=telegram",
    actionText: "Connect Telegram",
    color: "from-blue-500/20 to-purple-500/20 border-blue-500/30 text-blue-400",
  },
  {
    id: "autofill",
    step: "02",
    title: "1-Click Form Automator",
    subtitle: "Google Form Auto-Fill Engine",
    description: "Paste any Google Form URL. Our engine maps your verified student profile (CGPA, Branch, Work Exp, Resume) and generates an auto-prefilled link ready for 1-click submission.",
    icon: ClipboardList,
    badge: "Form AI",
    image: "/illustrations/how_it_works_autofill.jpg",
    actionLink: "/dashboard/forms",
    actionText: "Auto-Fill Form",
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400",
  },
  {
    id: "voice_call",
    step: "03",
    title: "AI Voice Call Alerts",
    subtitle: "Twilio Phone Escalation",
    description: "Never miss a deadline. Receive automated phone calls before high-priority deadlines with interactive keypad snooze, dynamic speech, and instant confirmation.",
    icon: PhoneCall,
    badge: "Phone AI",
    image: "/illustrations/how_it_works_voice_call.jpg",
    actionLink: "/dashboard/calls",
    actionText: "Configure Calls",
    color: "from-orange-500/20 to-amber-500/20 border-orange-500/30 text-orange-400",
  },
];

export function HowItWorksBento() {
  const [activeTab, setActiveTab] = useState(0);
  const currentStep = STEPS[activeTab];

  return (
    <Card className="glass border-primary/20 overflow-hidden bg-slate-950/80 backdrop-blur-xl relative">
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <CardContent className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
              Automated Placement Workflow
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-300 bg-clip-text text-transparent">
              How PlaceMint AI Works
            </h2>
          </div>

          {/* Tab Selector Buttons */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 shrink-0">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const active = idx === activeTab;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveTab(idx)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{s.title}</span>
                  <span className="md:hidden">0{idx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Visual Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="grid md:grid-cols-12 gap-6 items-center"
          >
            {/* Text Description Column */}
            <div className="md:col-span-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-black text-white/20 font-mono">{currentStep.step}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border bg-opacity-20 ${currentStep.color}`}>
                  {currentStep.badge}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{currentStep.title}</h3>
                <p className="text-xs text-purple-300 font-medium">{currentStep.subtitle}</p>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {currentStep.description}
              </p>
              <div className="pt-2 flex items-center gap-3">
                <Link href={currentStep.actionLink}>
                  <Button variant="glow" size="sm" className="gap-2 font-semibold text-xs bg-purple-600 hover:bg-purple-500">
                    {currentStep.actionText}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  100% Automated
                </div>
              </div>
            </div>

            {/* Illustration Graphic Column */}
            <div className="md:col-span-6">
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-900 shadow-2xl relative group">
                <div className="aspect-[16/9] relative">
                  <Image
                    src={currentStep.image}
                    alt={currentStep.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                </div>
                <div className="p-3 bg-slate-950/90 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-amber-400" />
                    PlaceMint AI Automation Active
                  </span>
                  <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest font-bold">
                    Step {activeTab + 1} of 3
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
