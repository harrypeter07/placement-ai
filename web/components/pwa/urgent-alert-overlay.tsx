"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Bell, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type UrgentReminderPayload = {
  id: string;
  title: string;
  message: string;
  escalationLevel?: string;
};

export function UrgentAlertOverlay({
  reminder,
  onAck,
  onSnooze,
}: {
  reminder: UrgentReminderPayload | null;
  onAck: () => void;
  onSnooze: () => void;
}) {
  const critical = reminder?.escalationLevel === "critical";

  return (
    <AnimatePresence>
      {reminder && critical && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="max-w-md w-full glass glow-border rounded-2xl p-6 border-2 border-red-500/50 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertTriangle className="h-10 w-10 shrink-0 animate-pulse" />
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold">Critical deadline</p>
                <h2 className="text-xl font-bold text-foreground">{reminder.title}</h2>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">{reminder.message}</p>
            <div className="flex flex-col gap-2">
              <Button variant="glow" className="w-full" onClick={onAck}>
                <Bell className="h-4 w-4 mr-2" /> Mark done
              </Button>
              <Button variant="outline" className="w-full" onClick={onSnooze}>
                <Clock className="h-4 w-4 mr-2" /> Snooze 30 min
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
