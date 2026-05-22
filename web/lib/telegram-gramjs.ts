import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import { utils } from "telegram";
import { computeCheck } from "telegram/Password";
import { mapTelegramAuthError } from "@/lib/telegram-auth-errors";
import { normalizePhone, sanitizeOtpCode } from "@/lib/telegram-phone";
import { exportTelethonSessionString } from "@/lib/telegram-telethon-session";

export function getTelegramApiCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";
  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set on the web app (Vercel)");
  }
  return { apiId, apiHash };
}

export { normalizePhone, sanitizeOtpCode } from "@/lib/telegram-phone";

export async function createTelegramClient(sessionString = "") {
  const { apiId, apiHash } = getTelegramApiCredentials();
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}

/** Send OTP — returns hash + temporary auth session (must reuse for SignIn). */
export async function sendTelegramCode(phoneNumber: string) {
  const normalized = normalizePhone(phoneNumber);
  const { apiId, apiHash } = getTelegramApiCredentials();
  const client = await createTelegramClient("");
  try {
    const result = await client.sendCode({ apiId, apiHash }, normalized);
    const authSessionString = String(client.session.save());
    if (!authSessionString) {
      throw new Error("Failed to start Telegram auth session");
    }
    return {
      phoneNumber: normalized,
      phoneCodeHash: result.phoneCodeHash,
      isCodeViaApp: result.isCodeViaApp ?? false,
      authSessionString,
    };
  } catch (err) {
    const mapped = mapTelegramAuthError(err);
    throw new Error(mapped.message);
  } finally {
    await client.disconnect();
  }
}

/** Complete login using the SAME auth session that requested the code. */
export async function completeTelegramLogin(
  phoneNumber: string,
  phoneCodeHash: string,
  authSessionString: string,
  code: string,
  password?: string
) {
  if (!authSessionString?.trim()) {
    throw new Error("Login session missing — resend code and try again");
  }

  const otp = sanitizeOtpCode(code);
  if (otp.length < 4) {
    throw new Error("Enter the full code from Telegram or SMS");
  }

  const client = await createTelegramClient(authSessionString);
  try {
    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: normalizePhone(phoneNumber),
          phoneCodeHash,
          phoneCode: otp,
        })
      );
    } catch (err: unknown) {
      const mapped = mapTelegramAuthError(err);
      if (mapped.needs2fa) {
        if (!password?.trim()) {
          const e = new Error(mapped.message) as Error & { needs2fa?: boolean };
          e.needs2fa = true;
          throw e;
        }
        const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
        const passwordCheck = await computeCheck(passwordSrpResult, password.trim());
        await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
      } else {
        const e = new Error(mapped.message) as Error & {
          errorCode?: string;
          expired?: boolean;
          invalidCode?: boolean;
        };
        e.errorCode = mapped.errorCode;
        e.expired = mapped.expired;
        e.invalidCode = mapped.invalidCode;
        throw e;
      }
    }

    const sessionString = String(client.session.save());
    if (!sessionString) {
      throw new Error("Login succeeded but session could not be saved");
    }
    const telethonSessionString = exportTelethonSessionString(client) || undefined;
    const me = await client.getMe();
    return {
      sessionString,
      telethonSessionString,
      phoneNumber: normalizePhone(phoneNumber),
      telegramUserId: me?.id ? String(me.id) : undefined,
      telegramUsername: me?.username ?? undefined,
      displayName: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || undefined,
    };
  } catch (err) {
    if (err instanceof Error && (err as Error & { needs2fa?: boolean }).needs2fa) throw err;
    const mapped = mapTelegramAuthError(err);
    const e = new Error(mapped.message) as Error & {
      needs2fa?: boolean;
      errorCode?: string;
      expired?: boolean;
      invalidCode?: boolean;
    };
    e.needs2fa = mapped.needs2fa;
    e.errorCode = mapped.errorCode;
    e.expired = mapped.expired;
    e.invalidCode = mapped.invalidCode;
    throw e;
  } finally {
    await client.disconnect();
  }
}

export type DiscoveredTelegramGroup = {
  groupId: string;
  title: string;
  kind: "group" | "channel" | "supergroup";
  username?: string;
};

/** List all groups/channels from the linked Telegram account (same as worker discover). */
export async function discoverTelegramGroups(sessionString: string): Promise<DiscoveredTelegramGroup[]> {
  const client = await createTelegramClient(sessionString);
  try {
    const dialogs = await client.getDialogs({ limit: 500 });
    const groups: DiscoveredTelegramGroup[] = [];
    for (const dialog of dialogs) {
      if (!dialog.isGroup && !dialog.isChannel) continue;
      const entity = dialog.entity;
      if (!entity) continue;
      let groupId: string;
      try {
        groupId = utils.getPeerId(entity).toString();
      } catch {
        groupId = dialog.id != null ? String(dialog.id) : "";
      }
      if (!groupId) continue;
      const title = dialog.title || dialog.name || groupId;
      const kind: DiscoveredTelegramGroup["kind"] = dialog.isChannel
        ? "channel"
        : dialog.isGroup
          ? "group"
          : "supergroup";
      const username =
        entity && "username" in entity && entity.username ? String(entity.username) : undefined;
      groups.push({ groupId, title, kind, username });
    }
    return groups;
  } finally {
    await client.disconnect();
  }
}
