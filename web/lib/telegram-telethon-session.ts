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
  const dcId = Number(session.dcId ?? session._dcId ?? 2);
  const serverAddress = String(
    session.serverAddress ?? session._serverAddress ?? DC_IPV4[dcId] ?? DC_IPV4[2]
  );
  const port = Number(session.port ?? session._port ?? 443);
  return { dcId, serverAddress, port };
}

/**
 * Build a Telethon-compatible StringSession from a logged-in GramJS client.
 * Render worker requires this format (GramJS session.save() is not compatible).
 */
function decodeGramJsBody(body: string): Buffer | null {
  const pad = (4 - (body.length % 4)) % 4;
  const padded = body + "=".repeat(pad);
  try {
    return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    try {
      return Buffer.from(padded, "base64url");
    } catch {
      return null;
    }
  }
}

/** Re-encode GramJS session bytes as Telethon url-safe StringSession (353 chars total). */
export function convertGramJsStringToTelethonString(gramjs: string): string | null {
  const t = gramjs.trim();
  if (!t.startsWith("1") || t.length < 40) return null;
  const raw = decodeGramJsBody(t.slice(1));
  if (!raw || raw.length !== 263) return null;

  const b64 = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  const pad = (4 - (b64.length % 4)) % 4;
  const body = b64 + "=".repeat(pad);
  if (body.length !== TELETHON_IPV4_BODY_LEN) return null;

  const out = `1${body}`;
  if (isValidTelethonSessionString(out)) return out;
  return null;
}

export function exportTelethonSessionString(client: TelegramClient): string | null {
  const gramjsSave = String(client.session.save?.() || "").trim();

  const sess = client.session as unknown;
  const authKey = extractAuthKeyBuffer(sess);
  if (authKey) {
    const s = sess as Record<string, unknown>;
    const { dcId, serverAddress, port } = readDc(s);
    const ipParts = serverAddress.split(".").map((p) => Number(p));
    if (ipParts.length === 4 && !ipParts.some((n) => Number.isNaN(n))) {
      const payload = Buffer.alloc(1 + 4 + 2 + 256);
      payload.writeUInt8(dcId, 0);
      ipParts.forEach((b, i) => payload.writeUInt8(b, 1 + i));
      payload.writeUInt16BE(port, 5);
      authKey.copy(payload, 7);

      const b64 = payload
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
      const pad = (4 - (b64.length % 4)) % 4;
      const body = b64 + "=".repeat(pad);
      const fromKey = `1${body}`;
      if (
        isValidTelethonSessionString(fromKey) &&
        (!gramjsSave || fromKey !== gramjsSave)
      ) {
        return fromKey;
      }
    }
  }

  if (gramjsSave) {
    return convertGramJsStringToTelethonString(gramjsSave);
  }
  return null;
}

function decodeTelethonBody(body: string): Buffer | null {
  const pad = (4 - (body.length % 4)) % 4;
  const padded = pad ? body + "=".repeat(pad) : body;
  try {
    return Buffer.from(padded, "base64url");
  } catch {
    return null;
  }
}

/** Telethon IPv4 body length after leading `1` (includes base64 padding). */
export const TELETHON_IPV4_BODY_LEN = 352;

export function isValidTelethonSessionString(s: string | undefined | null): boolean {
  const t = (s || "").trim();
  if (!t.startsWith("1")) return false;
  const body = t.slice(1);
  if (body.length !== TELETHON_IPV4_BODY_LEN) return false;
  const raw = decodeTelethonBody(body);
  return !!raw && raw.length === 263;
}

export function sessionsLookIdentical(
  telethon: string | undefined | null,
  gramjs: string | undefined | null
): boolean {
  const a = (telethon || "").trim();
  const b = (gramjs || "").trim();
  return !!a && !!b && a === b;
}

export function telethonSessionForWorker(
  telethon: string | undefined | null,
  gramjs: string | undefined | null
): string | null {
  const th = (telethon || "").trim();
  const gj = (gramjs || "").trim();
  if (th && isValidTelethonSessionString(th)) return th;
  if (gj && isValidTelethonSessionString(gj)) return gj;
  const converted = gj ? convertGramJsStringToTelethonString(gj) : null;
  return converted;
}

/** Add missing `=` so Telethon StringSession.decode() accepts legacy exports */
export function normalizeTelethonSessionString(s: string): string {
  const t = s.trim();
  if (!t.startsWith("1")) return t;
  const body = t.slice(1);
  const pad = (4 - (body.length % 4)) % 4;
  return pad ? `1${body}${"=".repeat(pad)}` : t;
}
