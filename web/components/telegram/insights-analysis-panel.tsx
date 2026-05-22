"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlarmClock,
  Calendar,
  Check,
  CheckSquare,
  Sparkles,
  Square,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn, formatDate } from "@/lib/utils";

export type InsightRow = {
  _id: string;
  groupId: string;
  groupTitle?: string;
  rank: number;
  title: string;
  summary: string;
  whyRanked?: string;
  urgency: string;
  category: string;
  confidence: number;
  status?: string;
  extractedDeadline?: {
    company: string;
    role: string;
    deadline: string;
    eligibility?: string;
  };
  suggestedReminderOffsetsMinutes?: number[];
  sourceMessagePreview?: string;
  deadlineId?: string;
  reminderCount?: number;
};

function offsetLabel(minutes: number) {
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d before`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h before`;
  return `${minutes}m before`;
}

const urgencyClass: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300",
  high: "bg-amber-500/20 text-amber-300",
  medium: "bg-blue-500/20 text-blue-300",
  low: "bg-slate-500/20 text-slate-300",
};

export function InsightsAnalysisPanel({
  insights,
  analyzedMessageCount,
  processingNotes,
  onApplySelected,
  onApplyAll,
  applying,
}: {
  insights: InsightRow[];
  analyzedMessageCount?: number;
  processingNotes?: string;
  onApplySelected: (ids: string[], opts: { pinToOverview: boolean }) => Promise<void>;
  onApplyAll: (opts: { pinToOverview: boolean }) => Promise<void>;
  applying?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pinOverview, setPinOverview] = useState(true);

  const drafts = useMemo(
    () => insights.filter((i) => i.status !== "applied" && i.status !== "dismissed"),
    [insights]
  );

  const allIds = drafts.map((i) => i._id);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allIds));
  }

  if (!insights.length) return null;

  return (
    <div className="space-y-4">
      <Card className="glass border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {insights.length} insight{insights.length !== 1 ? "s" : ""} generated
            {analyzedMessageCount != null && (
              <span className="text-xs font-normal text-muted-foreground">
                from {analyzedMessageCount} message{analyzedMessageCount !== 1 ? "s" : ""}
              </span>
            )}
          </CardTitle>
          {processingNotes && (
            <p className="text-xs text-muted-foreground">{processingNotes}</p>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Button
            size="sm"
            variant="glow"
            disabled={applying || !drafts.length}
            onClick={() => void onApplyAll({ pinToOverview: pinOverview })}
          >
            <Check className="h-4 w-4 mr-1" /> Apply all ({drafts.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={applying || selected.size === 0}
            onClick={() => void onApplySelected([...selected], { pinToOverview: pinOverview })}
          >
            Apply selected ({selected.size})
          </Button>
          <Button size="sm" variant="ghost" onClick={selectAll}>
            Select all
          </Button>
          <div className="flex items-center gap-2 text-xs ml-auto">
            <Switch id="pin-overview" checked={pinOverview} onCheckedChange={setPinOverview} />
            <Label htmlFor="pin-overview" className="cursor-pointer">
              Pin to overview
            </Label>
          </div>
        </CardContent>
      </Card>

      {insights.map((ins, idx) => (
        <motion.div
          key={ins._id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.04 }}
        >
          <Card
            className={cn(
              "glass overflow-hidden",
              ins.status === "applied" && "border-green-500/30",
              selected.has(ins._id) && "ring-1 ring-primary/50"
            )}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-3">
                {ins.status === "draft" && (
                  <button
                    type="button"
                    className="mt-1 shrink-0 text-muted-foreground hover:text-primary"
                    onClick={() => toggle(ins._id)}
                    aria-label="Select insight"
                  >
                    {selected.has(ins._id) ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{ins.rank}</span>
                    <h3 className="font-semibold">{ins.title}</h3>
                    <Badge className={cn("text-[10px]", urgencyClass[ins.urgency] || urgencyClass.medium)}>
                      {ins.urgency}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {ins.category}
                    </Badge>
                    {ins.status === "applied" && (
                      <Badge variant="success" className="text-[10px]">
                        Applied
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm mt-2 whitespace-pre-wrap">{ins.summary}</p>
                  {ins.whyRanked && (
                    <p className="text-xs text-primary/80 mt-2">
                      <strong>Why ranked:</strong> {ins.whyRanked}
                    </p>
                  )}
                  {ins.sourceMessagePreview && (
                    <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-primary/30 pl-2">
                      From chat: {ins.sourceMessagePreview}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {ins.groupTitle || ins.groupId} · confidence {(ins.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              {ins.extractedDeadline?.company && (
                <div className="rounded-lg bg-primary/10 p-3 text-sm space-y-1">
                  <p className="font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Proposed deadline
                  </p>
                  <p>
                    {ins.extractedDeadline.company} — {ins.extractedDeadline.role || "Role"}
                  </p>
                  <p className="text-muted-foreground">
                    Due: {formatDate(ins.extractedDeadline.deadline)}
                    {ins.extractedDeadline.eligibility
                      ? ` · ${ins.extractedDeadline.eligibility}`
                      : ""}
                  </p>
                </div>
              )}

              {(ins.suggestedReminderOffsetsMinutes?.length ?? 0) > 0 && (
                <div className="rounded-lg bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium flex items-center gap-2 mb-2">
                    <AlarmClock className="h-4 w-4 text-amber-400" />
                    Reminder schedule (if applied)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ins.suggestedReminderOffsetsMinutes!.map((m) => (
                      <Badge key={m} variant="outline" className="text-[10px]">
                        {offsetLabel(m)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(ins.reminderCount ?? 0) > 0 && ins.status === "applied" && (
                <p className="text-xs text-green-400">
                  ✓ {ins.reminderCount} reminder(s) created
                  {ins.deadlineId ? " · deadline linked" : ""}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
