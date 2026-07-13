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
  console.log(`[GramJS sendTelegramCode] Starting for phone: ${normalized}. ApiID: ${apiId}, ApiHash length: ${apiHash?.length || 0}`);
  
  const client = await createTelegramClient("");
  try {
    console.log(`[GramJS sendTelegramCode] Connecting client to Telegram...`);
    await client.connect();
    console.log(`[GramJS sendTelegramCode] Client connected. Invoking sendCode...`);
    const result = await client.sendCode({ apiId, apiHash }, normalized);
    console.log(`[GramJS sendTelegramCode] Code sent. phoneCodeHash: ${result.phoneCodeHash}, isCodeViaApp: ${result.isCodeViaApp}`);
    
    const authSessionString = String(client.session.save());
    console.log(`[GramJS sendTelegramCode] Generated temporary session string. Length: ${authSessionString?.length || 0}`);
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
    console.error(`[GramJS sendTelegramCode] Error during sendCode:`, err);
    const mapped = mapTelegramAuthError(err);
    console.error(`[GramJS sendTelegramCode] Mapped sendCode error:`, mapped);
    throw new Error(mapped.message);
  } finally {
    console.log(`[GramJS sendTelegramCode] Disconnecting client...`);
    await client.disconnect();
    console.log(`[GramJS sendTelegramCode] Client disconnected.`);
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
  console.log(`[GramJS completeTelegramLogin] Starting login for: ${phoneNumber}`);
  console.log(`[GramJS completeTelegramLogin] hash: ${phoneCodeHash}, sessionLength: ${authSessionString?.length || 0}, hasPassword: ${!!password}`);
  
  if (!authSessionString?.trim()) {
    console.error(`[GramJS completeTelegramLogin] Error: authSessionString is missing`);
    throw new Error("Login session missing — resend code and try again");
  }

  const otp = sanitizeOtpCode(code);
  if (otp.length < 4) {
    console.error(`[GramJS completeTelegramLogin] Error: OTP length is too short: "${otp}" (raw: "${code}")`);
    throw new Error("Enter the full code from Telegram or SMS");
  }

  console.log(`[GramJS completeTelegramLogin] Creating client with temporary auth session...`);
  const client = await createTelegramClient(authSessionString);
  try {
    try {
      console.log(`[GramJS completeTelegramLogin] Invoking SignIn... (otp: ${otp})`);
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: normalizePhone(phoneNumber),
          phoneCodeHash,
          phoneCode: otp,
        })
      );
      console.log(`[GramJS completeTelegramLogin] SignIn invoked successfully (no password needed).`);
    } catch (err: unknown) {
      console.warn(`[GramJS completeTelegramLogin] SignIn attempt failed. Checking if 2FA password is required...`, err);
      const mapped = mapTelegramAuthError(err);
      console.log(`[GramJS completeTelegramLogin] Mapped SignIn error:`, mapped);
      
      if (mapped.needs2fa) {
        if (!password?.trim()) {
          console.warn(`[GramJS completeTelegramLogin] 2FA needed but no password was provided.`);
          const e = new Error(mapped.message) as Error & { needs2fa?: boolean };
          e.needs2fa = true;
          throw e;
        }
        console.log(`[GramJS completeTelegramLogin] 2FA password provided. Fetching password parameters...`);
        const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
        console.log(`[GramJS completeTelegramLogin] Computing SRP password check...`);
        const passwordCheck = await computeCheck(passwordSrpResult, password.trim());
        console.log(`[GramJS completeTelegramLogin] Invoking CheckPassword...`);
        await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
        console.log(`[GramJS completeTelegramLogin] 2FA verification succeeded.`);
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

    console.log(`[GramJS completeTelegramLogin] Generating authenticated session string...`);
    const sessionString = String(client.session.save());
    console.log(`[GramJS completeTelegramLogin] Generated sessionString. Length: ${sessionString?.length || 0}`);
    if (!sessionString) {
      throw new Error("Login succeeded but session could not be saved");
    }
    
    console.log(`[GramJS completeTelegramLogin] Exporting telethon session string...`);
    const telethonSessionString = exportTelethonSessionString(client) || undefined;
    console.log(`[GramJS completeTelegramLogin] Exported telethonSessionString length: ${telethonSessionString?.length || 0}`);
    
    console.log(`[GramJS completeTelegramLogin] Fetching me details...`);
    const me = await client.getMe();
    console.log(`[GramJS completeTelegramLogin] Logged in user: id=${me?.id}, username=${me?.username}`);
    
    return {
      sessionString,
      telethonSessionString,
      phoneNumber: normalizePhone(phoneNumber),
      telegramUserId: me?.id ? String(me.id) : undefined,
      telegramUsername: me?.username ?? undefined,
      displayName: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || undefined,
    };
  } catch (err) {
    console.error(`[GramJS completeTelegramLogin] Error completeTelegramLogin:`, err);
    if (err instanceof Error && (err as Error & { needs2fa?: boolean }).needs2fa) throw err;
    const mapped = mapTelegramAuthError(err);
    console.error(`[GramJS completeTelegramLogin] Final mapped error:`, mapped);
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
    console.log(`[GramJS completeTelegramLogin] Disconnecting client...`);
    await client.disconnect();
    console.log(`[GramJS completeTelegramLogin] Client disconnected.`);
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
