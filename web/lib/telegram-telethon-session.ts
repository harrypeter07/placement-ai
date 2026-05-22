import type { TelegramClient } from "telegram";

/** Telegram DC IPv4 defaults (Telethon pack format) */
const DC_IPV4: Record<number, string> = {
  1: "149.154.175.50",
  2: "149.154.167.50",
  3: "149.154.175.100",
  4: "149.154.167.91",
  5: "91.108.56.100",
};

type GramJsSession = {
  dcId?: number;
  serverAddress?: string;
  port?: number;
  authKey?: { getKey?: () => Buffer };
};

/**
 * Build a Telethon-compatible StringSession from a logged-in GramJS client.
 * Render worker requires this format (GramJS session.save() is not compatible).
 */
export function exportTelethonSessionString(client: TelegramClient): string | null {
  const sess = client.session as unknown as GramJsSession;
  const authKey = sess.authKey?.getKey?.();
  if (!authKey || authKey.length !== 256) return null;

  const dcId = sess.dcId ?? 2;
  const ip = sess.serverAddress || DC_IPV4[dcId] || DC_IPV4[2];
  const port = sess.port ?? 443;
  const ipParts = ip.split(".").map((p) => Number(p));
  if (ipParts.length !== 4 || ipParts.some((n) => Number.isNaN(n))) return null;

  const payload = Buffer.alloc(1 + 4 + 2 + 256);
  payload.writeUInt8(dcId, 0);
  ipParts.forEach((b, i) => payload.writeUInt8(b, 1 + i));
  payload.writeUInt16BE(port, 5);
  authKey.copy(payload, 7);

  return `1${payload.toString("base64url")}`;
}
