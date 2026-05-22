/** Map GramJS / Telegram RPC errors to safe user-facing messages. */

export type TelegramAuthErrorCode =
  | "PHONE_CODE_EXPIRED"
  | "PHONE_CODE_INVALID"
  | "PHONE_CODE_EMPTY"
  | "PHONE_NUMBER_INVALID"
  | "PHONE_NUMBER_FLOOD"
  | "SESSION_PASSWORD_NEEDED"
  | "FLOOD_WAIT"
  | "UNKNOWN";

export function extractTelegramError(err: unknown): { code: string; raw: string } {
  const raw = err instanceof Error ? err.message : String(err);
  let code = "UNKNOWN";
  if (err && typeof err === "object") {
    if ("errorMessage" in err && typeof (err as { errorMessage?: string }).errorMessage === "string") {
      code = (err as { errorMessage: string }).errorMessage;
    } else if ("message" in err && typeof (err as { message?: string }).message === "string") {
      const m = (err as { message: string }).message;
      const match = m.match(/(\w+):/);
      if (match) code = match[1];
    }
  }
  if (raw.includes("PHONE_CODE_EXPIRED")) code = "PHONE_CODE_EXPIRED";
  if (raw.includes("PHONE_CODE_INVALID")) code = "PHONE_CODE_INVALID";
  if (raw.includes("PHONE_NUMBER_INVALID")) code = "PHONE_NUMBER_INVALID";
  if (raw.includes("SESSION_PASSWORD_NEEDED")) code = "SESSION_PASSWORD_NEEDED";
  if (raw.includes("FLOOD")) code = "FLOOD_WAIT";
  return { code, raw };
}

export function mapTelegramAuthError(err: unknown): {
  message: string;
  errorCode: TelegramAuthErrorCode;
  needs2fa: boolean;
  expired: boolean;
  invalidCode: boolean;
} {
  const { code, raw } = extractTelegramError(err);
  const needs2fa = code === "SESSION_PASSWORD_NEEDED" || raw.includes("SESSION_PASSWORD_NEEDED");
  const expired = code === "PHONE_CODE_EXPIRED" || raw.includes("PHONE_CODE_EXPIRED");
  const invalidCode =
    code === "PHONE_CODE_INVALID" ||
    code === "PHONE_CODE_EMPTY" ||
    raw.includes("PHONE_CODE_INVALID");

  let message = "Telegram login failed. Please try again.";
  switch (code) {
    case "PHONE_CODE_EXPIRED":
      message =
        "This code expired (login session was reset). Tap Resend code and enter the new code immediately.";
      break;
    case "PHONE_CODE_INVALID":
    case "PHONE_CODE_EMPTY":
      message = "Invalid code. Check the latest code from Telegram or SMS, then try again.";
      break;
    case "PHONE_NUMBER_INVALID":
      message = "Invalid phone number. Check country code and number.";
      break;
    case "PHONE_NUMBER_FLOOD":
    case "FLOOD_WAIT":
      message = "Too many attempts. Wait a few minutes before requesting another code.";
      break;
    case "SESSION_PASSWORD_NEEDED":
      message = "Two-factor password required for this account.";
      break;
    default:
      if (raw.includes("Two-factor")) message = raw;
      else if (process.env.NODE_ENV === "development") message = raw.slice(0, 200);
  }

  return {
    message,
    errorCode: (code as TelegramAuthErrorCode) || "UNKNOWN",
    needs2fa,
    expired,
    invalidCode,
  };
}
