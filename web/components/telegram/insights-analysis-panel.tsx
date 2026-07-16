"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Check, Sparkles, X, PhoneCall, CheckSquare, Square, ChevronRight } from "lucide-react";
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
  onSetDeadline: (id: string, opts: { pinToOverview: boolean; callTimes?: Record<string, string>; enablePhoneCalls?: Record<string, boolean> }) => Promise<void>;
  onSetAllDeadlines: (ids: string[], opts: { pinToOverview: boolean; callTimes?: Record<string, string>; enablePhoneCalls?: Record<string, boolean> }) => Promise<void>;
  onDismiss?: (ids: string[]) => Promise<void>;
  applying?: boolean;
}) {
  const [pinOverview, setPinOverview] = useState(true);

  // Filter lists
  const drafts = useMemo(
    () => insights.filter((i) => i.status !== "applied" && i.status !== "dismissed"),
    [insights]
  );
  const deadlineDrafts = useMemo(
    () => drafts.filter((i) => isActionableDeadlineInsight(i)),
    [drafts]
  );
  const infoDrafts = useMemo(() => drafts.filter((i) => isInfoOnlyInsight(i)), [drafts]);

  // States for selection and custom call settings
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    deadlineDrafts.forEach((d) => {
      const id = insightIdString(d._id);
      if (id) initial.add(id);
    });
    return initial;
  });

  const [callTimes, setCallTimes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    deadlineDrafts.forEach((d) => {
      const id = insightIdString(d._id);
      if (id) initial[id] = "09:00";
    });
    return initial;
  });

  const [enablePhoneCalls, setEnablePhoneCalls] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    deadlineDrafts.forEach((d) => {
      const id = insightIdString(d._id);
      if (id) initial[id] = true;
    });
    return initial;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allCleanIds = deadlineDrafts.map((d) => insightIdString(d._id)).filter(Boolean) as string[];
    if (selectedIds.size === allCleanIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allCleanIds));
    }
  };

  const handleBulkApply = async () => {
    const idsToApply = Array.from(selectedIds);
    if (!idsToApply.length) return;
    await onSetAllDeadlines(idsToApply, {
      pinToOverview: pinOverview,
      callTimes,
      enablePhoneCalls,
    });
  };

  const handleSingleApply = async (id: string) => {
    await onSetDeadline(id, {
      pinToOverview: pinOverview,
      callTimes,
      enablePhoneCalls,
    });
  };

  if (!insights.length) return null;

  const isAllSelected = deadlineDrafts.length > 0 && selectedIds.size === deadlineDrafts.length;

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
              ? `${deadlineDrafts.length} with deadlines — select deadlines to add to your calendar & schedule calls.`
              : "No deadlines detected in this batch."}
            {infoDrafts.length > 0 &&
              ` ${infoDrafts.length} info-only (no deadline to set).`}
          </p>
        </CardHeader>
        {deadlineDrafts.length > 0 && (
          <CardContent className="flex flex-wrap gap-4 items-center pt-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-white/10 hover:bg-white/5"
                onClick={toggleSelectAll}
              >
                {isAllSelected ? (
                  <>
                    <CheckSquare className="h-3.5 w-3.5 mr-1 text-primary" /> Deselect All
                  </>
                ) : (
                  <>
                    <Square className="h-3.5 w-3.5 mr-1" /> Select All
                  </>
                )}
              </Button>
              <LoadingButton
                size="sm"
                variant="glow"
                loading={applying}
                disabled={selectedIds.size === 0}
                onClick={handleBulkApply}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Set Selected ({selectedIds.size})
              </LoadingButton>
            </div>
            <div className="flex items-center gap-2 text-xs ml-auto">
              <Switch id="pin-overview" checked={pinOverview} onCheckedChange={setPinOverview} />
              <Label htmlFor="pin-overview" className="cursor-pointer">
                Pin to overview
              </Label>
            </div>
          </CardContent>
        )}
      </Card>

      {deadlineDrafts.map((ins, idx) => {
        const id = insightIdString(ins._id);
        const isSelected = id ? selectedIds.has(id) : false;

        return (
          <InsightCard
            key={id || `dl-${idx}`}
            ins={ins}
            idx={idx}
            applying={applying}
            variant="deadline"
            isSelected={isSelected}
            onToggleSelect={id ? () => toggleSelect(id) : undefined}
            callTime={id ? callTimes[id] || "09:00" : "09:00"}
            onCallTimeChange={id ? (val) => setCallTimes(p => ({ ...p, [id]: val })) : undefined}
            enablePhoneCall={id ? enablePhoneCalls[id] !== false : true}
            onTogglePhoneCall={id ? (val) => setEnablePhoneCalls(p => ({ ...p, [id]: val })) : undefined}
            onSetDeadline={id ? () => handleSingleApply(id) : undefined}
          />
        );
      })}

      {infoDrafts.map((ins, idx) => (
        <InsightCard
          key={insightIdString(ins._id) || `info-${idx}`}
          ins={ins}
          idx={idx}
          applying={applying}
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
  isSelected,
  onToggleSelect,
  callTime,
  onCallTimeChange,
  enablePhoneCall,
  onTogglePhoneCall,
  onSetDeadline,
  onDismiss,
}: {
  ins: InsightRow;
  idx: number;
  variant: "deadline" | "info" | "done";
  applying?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  callTime?: string;
  onCallTimeChange?: (val: string) => void;
  enablePhoneCall?: boolean;
  onTogglePhoneCall?: (val: boolean) => void;
  onSetDeadline?: () => Promise<void>;
  onDismiss?: (ids: string[]) => Promise<void>;
}) {
  const id = insightIdString(ins._id);
  const [isExpanded, setIsExpanded] = useState(false);

  const cleanTitle = useMemo(() => {
    if (!ins.title) return "Opportunity details";
    if (ins.title.startsWith("http")) {
      return ins.extractedDeadline?.company
        ? `${ins.extractedDeadline.company} Link Details`
        : "Opportunity details";
    }
    return ins.title;
  }, [ins.title, ins.extractedDeadline]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
    >
      <Card
        className={cn(
          "glass overflow-hidden transition-all duration-300 border-white/5 hover:border-white/10",
          ins.status === "applied" && "border-green-500/20 bg-green-500/[0.01]",
          isSelected && "border-primary/50 shadow-[0_0_15px_rgba(99,102,241,0.15)] bg-primary/5"
        )}
      >
        {/* Collapsed thin cell row header */}
        <div
          className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {variant === "deadline" && ins.status === "draft" && onToggleSelect && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect();
                }}
                className="h-4.5 w-4.5 rounded border-white/20 bg-white/5 text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
              />
            )}
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{ins.rank}</span>
            <h3 className="font-semibold text-sm text-foreground truncate min-w-0 flex-1">{cleanTitle}</h3>
            
            <Badge className={cn("text-[9px] py-0.5 shrink-0 uppercase tracking-wider font-semibold", urgencyClass[ins.urgency] || urgencyClass.medium)}>
              {ins.urgency}
            </Badge>

            {ins.status === "applied" && (
              <Badge variant="success" className="text-[9px] py-0.5 shrink-0 bg-green-500/20 text-green-300">
                <Check className="h-2.5 w-2.5 mr-0.5" /> Applied
              </Badge>
            )}
            {ins.status === "dismissed" && (
              <Badge variant="outline" className="text-[9px] py-0.5 shrink-0">
                Dismissed
              </Badge>
            )}
            {variant === "info" && ins.status === "draft" && (
              <Badge variant="outline" className="text-[9px] py-0.5 shrink-0">
                Info
              </Badge>
            )}
          </div>
          
          <div className="text-muted-foreground flex items-center gap-2 shrink-0">
            {ins.extractedDeadline?.deadline && (
              <span className="text-[11px] bg-white/5 px-2.5 py-0.5 rounded text-primary-foreground font-semibold">
                Due: {formatDate(ins.extractedDeadline.deadline)}
              </span>
            )}
            <ChevronRight className={cn("h-4 w-4 transition-transform duration-300 text-muted-foreground/60", isExpanded && "rotate-90 text-foreground")} />
          </div>
        </div>

        {/* Expanded Details Body */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-4 bg-white/[0.01]">
            <p className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed pt-2">
              {ins.summary}
            </p>

            {ins.whyRanked && variant === "deadline" && (
              <p className="text-xs text-primary/85 bg-primary/5 px-2.5 py-1.5 rounded-md border border-primary/10">
                <strong>Analysis Context:</strong> {ins.whyRanked}
              </p>
            )}

            <div className="flex justify-between items-center text-[10px] text-muted-foreground">
              <span>Source Channel: {ins.groupTitle || ins.groupId}</span>
            </div>

            {variant === "deadline" && ins.extractedDeadline?.company && (
              <div className="rounded-lg bg-primary/10 p-3.5 text-sm space-y-3 border border-primary/20">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold flex items-center gap-2 text-foreground">
                    <Calendar className="h-4 w-4 text-primary" />
                    {ins.extractedDeadline.company} — {ins.extractedDeadline.role || "Role"}
                  </p>
                  <span className="text-xs bg-white/5 px-2 py-0.5 rounded text-primary-foreground font-medium">
                    Form Deadline: {formatDate(ins.extractedDeadline.deadline)}
                  </span>
                </div>

                {ins.status === "draft" && onCallTimeChange && onTogglePhoneCall && (
                  <div className="pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-medium text-foreground">Twilio Voice Alert</span>
                      <Switch
                        checked={enablePhoneCall}
                        onCheckedChange={onTogglePhoneCall}
                      />
                    </div>
                    {enablePhoneCall && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Call at:</Label>
                        <input
                          type="time"
                          value={callTime}
                          onChange={(e) => onCallTimeChange(e.target.value)}
                          className="bg-black/40 border border-white/10 rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary w-24 text-center"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {variant === "deadline" && ins.status === "draft" && onSetDeadline && id && (
              <div className="flex gap-2 pt-1">
                <LoadingButton
                  size="sm"
                  variant="glow"
                  loading={applying}
                  className="w-full sm:w-auto"
                  onClick={onSetDeadline}
                >
                  <Calendar className="h-4 w-4 mr-1" /> Set deadline
                </LoadingButton>
              </div>
            )}

            {variant === "info" && ins.status === "draft" && onDismiss && id && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                disabled={applying}
                onClick={() => void onDismiss([id])}
              >
                <X className="h-4 w-4 mr-1" /> Dismiss
              </Button>
            )}

            {(ins.reminderCount ?? 0) > 0 && ins.status === "applied" && (
              <p className="text-xs text-green-400 flex items-center gap-1.5 font-medium">
                <Check className="h-3.5 w-3.5" />
                {ins.reminderCount} reminder(s) / call schedules set (view in Call Alerts or Reminders)
              </p>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
