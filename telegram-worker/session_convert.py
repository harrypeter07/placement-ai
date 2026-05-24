"""Convert GramJS StringSession to Telethon StringSession (same auth key, different base64)."""
from __future__ import annotations

import base64
import struct

TELETHON_IPV4_BODY_LEN = 352
TELETHON_PAYLOAD_LEN = 263


def _decode_session_body(body: str) -> bytes | None:
    body = (body or "").strip()
    if not body:
        return None
    pad = (-len(body)) % 4
    padded = body + ("=" * pad)
    for decoder in (
        lambda s: base64.urlsafe_b64decode(s),
        lambda s: base64.b64decode(s.replace("-", "+").replace("_", "/")),
    ):
        try:
            raw = decoder(padded)
            if raw:
                return raw
        except Exception:
            continue
    return None


def is_valid_telethon_body(raw: bytes) -> bool:
    if len(raw) != TELETHON_PAYLOAD_LEN:
        return False
    try:
        struct.unpack(">B4sH256s", raw)
        return True
    except struct.error:
        return False


def pack_telethon_string(raw: bytes) -> str | None:
    if not is_valid_telethon_body(raw):
        return None
    body = base64.urlsafe_b64encode(raw).decode("ascii")
    if len(body) != TELETHON_IPV4_BODY_LEN:
        return None
    return "1" + body


def gramjs_string_to_telethon(session: str) -> str | None:
    """
    GramJS save() and Telethon use the same 263-byte IPv4 payload;
    GramJS often uses standard base64, Telethon uses url-safe base64.
    """
    s = (session or "").strip()
    if not s.startswith("1") or len(s) < 40:
        return None
    raw = _decode_session_body(s[1:])
    if not raw:
        return None
    if len(raw) == TELETHON_PAYLOAD_LEN and is_valid_telethon_body(raw):
        return pack_telethon_string(raw)
    return None


def normalize_session_for_worker(session: str) -> str:
    """Return Telethon-valid session string, converting GramJS encoding if needed."""
    s = (session or "").strip()
    if not s or not s.startswith("1"):
        return ""
    body = s[1:]
    if len(body) == TELETHON_IPV4_BODY_LEN:
        pad = (-len(body)) % 4
        try:
            raw = base64.urlsafe_b64decode(body + ("=" * pad))
            if is_valid_telethon_body(raw):
                return "1" + body + ("=" * pad) if pad else s
        except Exception:
            pass
    converted = gramjs_string_to_telethon(s)
    return converted or ""
