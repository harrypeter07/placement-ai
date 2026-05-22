/** Returns true if current time is inside user's quiet hours (local HH:mm strings). */
export function isQuietHoursNow(
  start: string,
  end: string,
  enabled: boolean,
  now = new Date()
): boolean {
  if (!enabled) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const startM = sh * 60 + (sm || 0);
  const endM = eh * 60 + (em || 0);
  if (startM <= endM) return mins >= startM && mins < endM;
  return mins >= startM || mins < endM;
}
