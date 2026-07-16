"use client";

import { motion } from "framer-motion";
import {
  Bot,
  Calendar,
  Bell,
  Shield,
  FileSearch,
  BarChart3,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Bot, title: "AI Extraction", desc: "Gemini parses Telegram posts into structured placement data automatically." },
  { icon: Calendar, title: "Calendar Sync", desc: "Google Calendar integration with auto-created deadline events." },
  { icon: Bell, title: "Smart Reminders", desc: "1 day, 6 hours, 1 hour, and 15 min reminders across channels." },
  { icon: Shield, title: "Eligibility Checker", desc: "Match your CGPA, branch, and backlogs against every drive." },
  { icon: FileSearch, title: "Resume Analyzer", desc: "ATS score, skill gaps, and company compatibility insights." },
  { icon: BarChart3, title: "Analytics", desc: "Track applications, streaks, and placement productivity scores." },
];

const workflow = [
  { step: "01", title: "Connect Telegram", desc: "Worker monitors your placement groups 24/7" },
  { step: "02", title: "AI Parses Posts", desc: "Gemini extracts company, role, deadline, eligibility" },
  { step: "03", title: "Sync & Remind", desc: "Deadlines sync to dashboard and calendar with alerts" },
];

const testimonials = [
  { name: "Priya S.", role: "CSE '25", text: "Caught 3 Google deadlines I would've missed. Game changer." },
  { name: "Rahul M.", role: "IT '25", text: "Eligibility checker saved hours of reading every post." },
  { name: "Ananya K.", role: "ECE '26", text: "Resume analyzer helped me land my dream internship." },
];

const faqs = [
  { q: "How does Telegram monitoring work?", a: "Our Telethon worker listens to configured placement groups and processes messages in real-time." },
  { q: "Is my data secure?", a: "Yes. Credentials are encrypted and we only store extracted placement metadata." },
  { q: "Can I use without Telegram?", a: "Absolutely. Manually add deadlines or let admins broadcast drives." },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24">
      <motion.div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center mb-16">
          <h2 className="text-3xl font-bold sm:text-4xl">Everything you need to <span className="text-gradient">win placements</span></h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">Built for students who want to stay ahead without drowning in Telegram chaos.</p>
        </motion.div>
        <motion.div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}>
              <Card className="glass glow-border h-full transition-transform hover:-translate-y-1">
                <CardHeader>
                  <f.icon className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>{f.title}</CardTitle>
                  <CardDescription>{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-24 border-t border-white/5">
      <motion.div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div className="text-center mb-16">
          <h2 className="text-3xl font-bold">How PlaceMint <span className="text-gradient">Works</span></h2>
        </motion.div>
        <motion.div className="grid gap-8 md:grid-cols-3">
          {workflow.map((w, i) => (
            <motion.div key={w.step} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} viewport={{ once: true }} className="relative">
              <span className="text-6xl font-bold text-primary/20">{w.step}</span>
              <h3 className="text-xl font-semibold mt-2">{w.title}</h3>
              <p className="text-muted-foreground mt-2">{w.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

export function IntegrationsSection() {
  return (
    <section id="integrations" className="py-24">
      <motion.div className="mx-auto max-w-7xl px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">College <span className="text-gradient">Integrations</span></h2>
        <p className="text-muted-foreground mb-12 max-w-xl mx-auto">Works with Telegram placement groups, Google Calendar, and email notifications.</p>
        <motion.div className="flex flex-wrap justify-center gap-8 opacity-70">
          {["Telegram", "Google Calendar", "Gemini AI", "Supabase DB"].map((name) => (
            <motion.div key={name} className="glass rounded-xl px-8 py-4 font-medium">{name}</motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

export function TestimonialsSection() {
  return (
    <section className="py-24 border-t border-white/5">
      <motion.div className="mx-auto max-w-7xl px-4 grid gap-6 md:grid-cols-3">
        {testimonials.map((t) => (
          <Card key={t.name} className="glass">
            <CardContent className="pt-6">
              <MessageSquare className="h-6 w-6 text-primary mb-4" />
              <p className="text-sm">&ldquo;{t.text}&rdquo;</p>
              <p className="mt-4 font-semibold">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.role}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>
    </section>
  );
}

export function FAQSection() {
  return (
    <section id="faq" className="py-24">
      <motion.div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-center mb-12">FAQ</h2>
        {faqs.map((f) => (
          <details key={f.q} className="glass rounded-lg mb-4 group">
            <summary className="flex cursor-pointer items-center justify-between p-4 font-medium">
              {f.q}
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-4 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </motion.div>
    </section>
  );
}

import { useSession } from "next-auth/react";

export function CTASection() {
  const { status } = useSession();
  return (
    <section className="py-24">
      <motion.div className="mx-auto max-w-4xl px-4 text-center glass-strong rounded-2xl p-12 glow-border">
        <h2 className="text-3xl font-bold">Ready to never miss a drive?</h2>
        <p className="mt-4 text-muted-foreground">Join thousands of students using PlaceMint AI.</p>
        <Button variant="glow" size="lg" className="mt-8" asChild>
          {status === "authenticated" ? (
            <Link href="/dashboard">Go to Dashboard</Link>
          ) : (
            <Link href="/register">Get Started Free</Link>
          )}
        </Button>
      </motion.div>
    </section>
  );
}

export function Footer() {
  const { status } = useSession();
  return (
    <footer className="border-t border-white/5 py-12">
      <motion.div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">© 2026 PlaceMint AI. All rights reserved.</p>
        <motion.div className="flex gap-6 text-sm text-muted-foreground">
          {status === "authenticated" ? (
            <Link href="/dashboard">Dashboard</Link>
          ) : (
            <>
              <Link href="/login">Login</Link>
              <Link href="/register">Register</Link>
            </>
          )}
        </motion.div>
      </motion.div>
    </footer>
  );
}
