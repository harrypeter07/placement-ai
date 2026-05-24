"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlarmClock, Calendar, Check, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { cn, formatDate } from "@/lib/utils";
import {
  insightIdString,
  isActionableDeadlineInsight,
  isInfoOnlyInsight,
} from "@/lib/insight-utils";

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
  onSetDeadline,
  onSetAllDeadlines,
  onDismiss,
  applying,
}: {
  insights: InsightRow[];
  analyzedMessageCount?: number;
  processingNotes?: string;
  onSetDeadline: (id: string, opts: { pinToOverview: boolean }) => Promise<void>;
  onSetAllDeadlines: (ids: string[], opts: { pinToOverview: boolean }) => Promise<void>;
  onDismiss?: (ids: string[]) => Promise<void>;
  applying?: boolean;
}) {
  const [pinOverview, setPinOverview] = useState(true);

  const drafts = useMemo(
    () =>
      insights.filter((i) => i.status !== "applied" && i.status !== "dismissed"),
    [insights]
  );

  const deadlineDrafts = useMemo(
    () => drafts.filter((i) => isActionableDeadlineInsight(i)),
    [drafts]
  );

  const infoDrafts = useMemo(() => drafts.filter((i) => isInfoOnlyInsight(i)), [drafts]);

  const deadlineIds = deadlineDrafts.map((i) => insightIdString(i._id)).filter(Boolean);

  if (!insights.length) return null;

  return (
    <div className="space-y-4">
      <Card className="glass border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Sparkles className="h-5 w-5 text-primary" />
            {insights.length} result{insights.length !== 1 ? "s" : ""}
            {analyzedMessageCount != null && (
              <span className="text-xs font-normal text-muted-foreground">
                from {analyzedMessageCount} message{analyzedMessageCount !== 1 ? "s" : ""}
              </span>
            )}
          </CardTitle>
          {processingNotes && (
            <p className="text-xs text-muted-foreground">{processingNotes}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {deadlineDrafts.length > 0
              ? `${deadlineDrafts.length} with deadlines — use Set deadline to add to your calendar.`
              : "No deadlines detected in this batch."}
            {infoDrafts.length > 0 &&
              ` ${infoDrafts.length} info-only (no deadline to set).`}
          </p>
        </CardHeader>
        {deadlineDrafts.length > 0 && (
          <CardContent className="flex flex-wrap gap-2 items-center pt-0">
            <LoadingButton
              size="sm"
              variant="glow"
              loading={applying}
              onClick={() => void onSetAllDeadlines(deadlineIds, { pinToOverview: pinOverview })}
            >
              <Calendar className="h-4 w-4 mr-1" />
              Set all deadlines ({deadlineDrafts.length})
            </LoadingButton>
            <div className="flex items-center gap-2 text-xs ml-auto">
              <Switch id="pin-overview" checked={pinOverview} onCheckedChange={setPinOverview} />
              <Label htmlFor="pin-overview" className="cursor-pointer">
                Pin to overview
              </Label>
            </div>
          </CardContent>
        )}
      </Card>

      {deadlineDrafts.map((ins, idx) => (
        <InsightCard
          key={insightIdString(ins._id) || `dl-${idx}`}
          ins={ins}
          idx={idx}
          applying={applying}
          pinOverview={pinOverview}
          variant="deadline"
          onSetDeadline={onSetDeadline}
        />
      ))}

      {infoDrafts.map((ins, idx) => (
        <InsightCard
          key={insightIdString(ins._id) || `info-${idx}`}
          ins={ins}
          idx={idx}
          applying={applying}
          pinOverview={pinOverview}
          variant="info"
          onDismiss={onDismiss}
        />
      ))}

      {insights
        .filter((i) => i.status === "applied" || i.status === "dismissed")
        .map((ins, idx) => (
          <InsightCard
            key={insightIdString(ins._id) || `done-${idx}`}
            ins={ins}
            idx={idx}
            variant="done"
          />
        ))}
    </div>
  );
}

function InsightCard({
  ins,
  idx,
  variant,
  applying,
  pinOverview,
  onSetDeadline,
  onDismiss,
}: {
  ins: InsightRow;
  idx: number;
  variant: "deadline" | "info" | "done";
  applying?: boolean;
  pinOverview?: boolean;
  onSetDeadline?: (id: string, opts: { pinToOverview: boolean }) => Promise<void>;
  onDismiss?: (ids: string[]) => Promise<void>;
}) {
  const id = insightIdString(ins._id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
    >
      <Card
        className={cn(
          "glass overflow-hidden",
          ins.status === "applied" && "border-green-500/30",
          variant === "info" && "border-white/10"
        )}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">#{ins.rank}</span>
            <h3 className="font-semibold flex-1 min-w-0">{ins.title}</h3>
            <Badge className={cn("text-[10px]", urgencyClass[ins.urgency] || urgencyClass.medium)}>
              {ins.urgency}
            </Badge>
            {ins.status === "applied" && (
              <Badge variant="success" className="text-[10px]">
                <Check className="h-3 w-3 mr-0.5" /> Saved
              </Badge>
            )}
            {ins.status === "dismissed" && (
              <Badge variant="outline" className="text-[10px]">
                Dismissed
              </Badge>
            )}
            {variant === "info" && ins.status === "draft" && (
              <Badge variant="outline" className="text-[10px]">
                Info
              </Badge>
            )}
          </div>

          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{ins.summary}</p>

          {ins.whyRanked && variant === "deadline" && (
            <p className="text-xs text-primary/80">
              <strong>Why:</strong> {ins.whyRanked}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground">
            {ins.groupTitle || ins.groupId}
          </p>

          {variant === "deadline" && ins.extractedDeadline?.company && (
            <div className="rounded-lg bg-primary/10 p-3 text-sm space-y-1">
              <p className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {ins.extractedDeadline.company} — {ins.extractedDeadline.role || "Role"}
              </p>
              <p className="text-muted-foreground">
                Due: {formatDate(ins.extractedDeadline.deadline)}
              </p>
              {(ins.suggestedReminderOffsetsMinutes?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <AlarmClock className="h-3.5 w-3.5 text-amber-400" />
                  {ins.suggestedReminderOffsetsMinutes!.map((m) => (
                    <Badge key={m} variant="outline" className="text-[10px]">
                      {offsetLabel(m)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {variant === "deadline" && ins.status === "draft" && onSetDeadline && id && (
            <LoadingButton
              size="sm"
              variant="glow"
              loading={applying}
              className="w-full sm:w-auto"
              onClick={() => void onSetDeadline(id, { pinToOverview: pinOverview ?? true })}
            >
              <Calendar className="h-4 w-4 mr-1" /> Set deadline
            </LoadingButton>
          )}

          {variant === "info" && ins.status === "draft" && onDismiss && id && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={applying}
              onClick={() => void onDismiss([id])}
            >
              <X className="h-4 w-4 mr-1" /> Dismiss
            </Button>
          )}

          {(ins.reminderCount ?? 0) > 0 && ins.status === "applied" && (
            <p className="text-xs text-green-400">
              {ins.reminderCount} reminder(s) scheduled
              {ins.deadlineId ? " · on Deadlines page" : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
