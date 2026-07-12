import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";
import { completeTelegramLogin, sanitizeOtpCode } from "@/lib/telegram-gramjs";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(4).max(12),
  password: z.string().max(256).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
    }

    const otp = sanitizeOtpCode(parsed.data.code);
    if (otp.length < 4) {
      return NextResponse.json({ error: "Enter the full login code" }, { status: 400 });
    }

    // Query pending auth from Supabase
    const { data: pending } = await supabase
      .from("telegram_auth_pendings")
      .select("id, user_id, phone, phone_code_hash, auth_session_string, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pending) {
      return NextResponse.json(
        { error: "No active login — send a code first", errorCode: "NO_PENDING" },
        { status: 400 }
      );
    }

    if (new Date(pending.expires_at) < new Date()) {
      await supabase.from("telegram_auth_pendings").delete().eq("id", pending.id);
      return NextResponse.json(
        {
          error: "Login session expired — tap Resend code",
          errorCode: "PHONE_CODE_EXPIRED",
          expired: true,
        },
        { status: 400 }
      );
    }

    if (!pending.auth_session_string) {
      return NextResponse.json(
        { error: "Login session invalid — resend code", errorCode: "SESSION_MISSING", expired: true },
        { status: 400 }
      );
    }

    try {
      const login = await completeTelegramLogin(
        pending.phone,
        pending.phone_code_hash,
        pending.auth_session_string,
        otp,
        parsed.data.password
      );

      // Upsert worker session in Supabase
      const sessionPayload = {
        key: "default",
        session_string: login.sessionString,
        telethon_session_string: login.telethonSessionString || null,
        phone_number: login.phoneNumber,
        telegram_username: login.telegramUsername || null,
        display_name: login.displayName || null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Perform upsert based on key uniqueness
      await supabase
        .from("telegram_worker_sessions")
        .upsert([sessionPayload], { onConflict: "key" });

      // Delete pending auth
      await supabase.from("telegram_auth_pendings").delete().eq("user_id", pending.user_id);

      return NextResponse.json({
        ok: true,
        displayName: login.displayName,
        telegramUsername: login.telegramUsername,
      });
    } catch (loginErr: unknown) {
      const err = loginErr as Error & {
        needs2fa?: boolean;
        errorCode?: string;
        expired?: boolean;
        invalidCode?: boolean;
      };

      if (err.expired || err.errorCode === "PHONE_CODE_EXPIRED") {
        await supabase.from("telegram_auth_pendings").delete().eq("user_id", pending.user_id);
      }

      return NextResponse.json(
        {
          error: err.message || "Verification failed",
          needs2fa: !!err.needs2fa,
          errorCode: err.errorCode,
          expired: !!err.expired,
          invalidCode: !!err.invalidCode,
        },
        { status: 400 }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
