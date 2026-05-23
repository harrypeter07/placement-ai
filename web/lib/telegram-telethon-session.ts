import type { TelegramClient } from "telegram";

/** Telegram DC IPv4 defaults (Telethon pack format) */
const DC_IPV4: Record<number, string> = {
  1: "149.154.175.50",
  2: "149.154.167.50",
  3: "149.154.175.100",
  4: "149.154.167.91",
  5: "91.108.56.100",
};

function extractAuthKeyBuffer(session: unknown): Buffer | null {
  if (!session || typeof session !== "object") return null;
  const s = session as Record<string, unknown>;

  const tryKey = (obj: unknown): Buffer | null => {
    if (!obj || typeof obj !== "object") return null;
    const k = obj as Record<string, unknown>;
    if (typeof k.getKey === "function") {
      const buf = (k.getKey as () => Buffer)();
      if (Buffer.isBuffer(buf) && buf.length === 256) return buf;
    }
    if (Buffer.isBuffer(k.key) && k.key.length === 256) return k.key;
    if (k.key instanceof Uint8Array && k.key.byteLength === 256) return Buffer.from(k.key);
    return null;
  };

  return tryKey(s.authKey) || tryKey(s._authKey) || null;
}

function readDc(session: Record<string, unknown>) {
  const dcId = Number(s.dcId ?? s._dcId ?? 2);
  const serverAddress = String(s.serverAddress ?? s._serverAddress ?? DC_IPV4[dcId] ?? DC_IPV4[2]);
  const port = Number(s.port ?? s._port ?? 443);
  return { dcId, serverAddress, port };
}

/**
 * Build a Telethon-compatible StringSession from a logged-in GramJS client.
 * Render worker requires this format (GramJS session.save() is not compatible).
 */
export function exportTelethonSessionString(client: TelegramClient): string | null {
  const sess = client.session as unknown;
  const authKey = extractAuthKeyBuffer(sess);
  if (!authKey) return null;

  const s = sess as Record<string, unknown>;
  const { dcId, serverAddress, port } = readDc(s);
  const ipParts = serverAddress.split(".").map((p) => Number(p));
  if (ipParts.length !== 4 || ipParts.some((n) => Number.isNaN(n))) return null;

  const payload = Buffer.alloc(1 + 4 + 2 + 256);
  payload.writeUInt8(dcId, 0);
  ipParts.forEach((b, i) => payload.writeUInt8(b, 1 + i));
  payload.writeUInt16BE(port, 5);
  authKey.copy(payload, 7);

  return `1${payload.toString("base64url")}`;
}

export function isValidTelethonSessionString(s: string | undefined | null): boolean {
  const t = (s || "").trim();
  if (t.length < 40 || !t.startsWith("1")) return false;
  try {
    const raw = Buffer.from(t.slice(1), "base64url");
    return raw.length >= 263;
  } catch {
    return false;
  }
}
