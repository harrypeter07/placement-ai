/** In-process fallback when MongoDB is temporarily unreachable (dev / flaky Atlas). */

export interface WorkerHeartbeatSnapshot {
  status: "online" | "offline" | "waiting";
  groupsMonitored: number;
  lastMessageAt?: Date;
  lastError?: string;
  updatedAt: Date;
}

declare global {
  // eslint-disable-next-line no-var
  var workerHeartbeatMemory: WorkerHeartbeatSnapshot | undefined;
}

export function setMemoryHeartbeat(
  data: Omit<WorkerHeartbeatSnapshot, "updatedAt">
): WorkerHeartbeatSnapshot {
  const snapshot: WorkerHeartbeatSnapshot = { ...data, updatedAt: new Date() };
  global.workerHeartbeatMemory = snapshot;
  return snapshot;
}

export function getMemoryHeartbeat(): WorkerHeartbeatSnapshot | null {
  return global.workerHeartbeatMemory ?? null;
}
