import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import { computeCheck } from "telegram/Password";

export function getTelegramApiCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";
  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set on the web app (Vercel)");
  }
  return { apiId, apiHash };
}

export function normalizePhone(phone: string) {
  const p = phone.trim().replace(/\s/g, "");
  if (!p.startsWith("+")) throw new Error("Phone must include country code, e.g. +919876543210");
  return p;
}

function is2faError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "errorMessage" in err
      ? String((err as { errorMessage?: string }).errorMessage)
      : "";
  return (
    msg.includes("SESSION_PASSWORD_NEEDED") ||
    msg.includes("2FA") ||
    code.includes("SESSION_PASSWORD_NEEDED")
  );
}

export async function createTelegramClient(sessionString = "") {
  const { apiId, apiHash } = getTelegramApiCredentials();
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}

export async function sendTelegramCode(phoneNumber: string) {
  const { apiId, apiHash } = getTelegramApiCredentials();
  const client = await createTelegramClient("");
  try {
    const result = await client.sendCode({ apiId, apiHash }, phoneNumber);
    return {
      phoneCodeHash: result.phoneCodeHash,
      isCodeViaApp: result.isCodeViaApp ?? false,
    };
  } finally {
    await client.disconnect();
  }
}

export async function completeTelegramLogin(
  phoneNumber: string,
  phoneCodeHash: string,
  code: string,
  password?: string
) {
  const client = await createTelegramClient("");
  try {
    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: code.trim(),
        })
      );
    } catch (err: unknown) {
      if (!is2faError(err)) {
        throw err;
      }
      if (!password?.trim()) {
        throw new Error("Two-factor password required");
      }
      const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
      const passwordCheck = await computeCheck(passwordSrpResult, password.trim());
      await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
    }

    const sessionString = client.session.save() as unknown as string;
    const me = await client.getMe();
    return {
      sessionString,
      phoneNumber,
      telegramUserId: me?.id ? String(me.id) : undefined,
      telegramUsername: me?.username ?? undefined,
      displayName: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || undefined,
    };
  } finally {
    await client.disconnect();
  }
}
