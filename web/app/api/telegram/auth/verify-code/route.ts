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
    console.log(`[POST verify-code] Request received. user: ${user.id}, body:`, { ...body, password: body.password ? "***" : undefined });
    
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.warn(`[POST verify-code] Zod validation failed:`, parsed.error.format());
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
    }

    const otp = sanitizeOtpCode(parsed.data.code);
    console.log(`[POST verify-code] Sanitized OTP: "${otp}" (raw: "${parsed.data.code}")`);
    if (otp.length < 4) {
      console.warn(`[POST verify-code] Sanitized OTP too short`);
      return NextResponse.json({ error: "Enter the full login code" }, { status: 400 });
    }

    // Query pending auth from Supabase
    console.log(`[POST verify-code] Querying telegram_auth_pendings for user: ${user.id}`);
    const { data: pending, error: fetchPendingErr } = await supabase
      .from("telegram_auth_pendings")
      .select("id, user_id, phone, phone_code_hash, auth_session_string, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchPendingErr) {
      console.error(`[POST verify-code] Supabase fetch pending error:`, fetchPendingErr);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    if (!pending) {
      console.warn(`[POST verify-code] No pending auth found for user: ${user.id}`);
      return NextResponse.json(
        { error: "No active login — send a code first", errorCode: "NO_PENDING" },
        { status: 400 }
      );
    }

    console.log(`[POST verify-code] Pending auth record found. ID: ${pending.id}, phone: ${pending.phone}, expires_at: ${pending.expires_at}`);

    if (new Date(pending.expires_at) < new Date()) {
      console.warn(`[POST verify-code] Pending auth record has expired.`);
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
      console.error(`[POST verify-code] pending.auth_session_string is missing!`);
      return NextResponse.json(
        { error: "Login session invalid — resend code", errorCode: "SESSION_MISSING", expired: true },
        { status: 400 }
      );
    }

    try {
      console.log(`[POST verify-code] Calling completeTelegramLogin...`);
      const login = await completeTelegramLogin(
        pending.phone,
        pending.phone_code_hash,
        pending.auth_session_string,
        otp,
        parsed.data.password
      );
      console.log(`[POST verify-code] completeTelegramLogin completed. User found: username=${login.telegramUsername}, displayName=${login.displayName}`);

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

      console.log(`[POST verify-code] Upserting telegram_worker_sessions payload...`);
      const { error: upsertErr } = await supabase
        .from("telegram_worker_sessions")
        .upsert([sessionPayload], { onConflict: "key" });

      if (upsertErr) {
        console.error(`[POST verify-code] Upserting worker session to Supabase failed:`, upsertErr);
        throw new Error("Failed to save login session to database");
      }
      console.log(`[POST verify-code] Worker session upserted successfully.`);

      // Delete pending auth
      console.log(`[POST verify-code] Deleting pending auth record...`);
      await supabase.from("telegram_auth_pendings").delete().eq("user_id", pending.user_id);

      return NextResponse.json({
        ok: true,
        displayName: login.displayName,
        telegramUsername: login.telegramUsername,
      });
    } catch (loginErr: unknown) {
      console.error(`[POST verify-code] Verification/saving step threw exception:`, loginErr);
      const err = loginErr as Error & {
        needs2fa?: boolean;
        errorCode?: string;
        expired?: boolean;
        invalidCode?: boolean;
      };

      if (err.expired || err.errorCode === "PHONE_CODE_EXPIRED") {
        console.log(`[POST verify-code] Cleaning up expired pending record...`);
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
    console.error(`[POST verify-code] Internal crash:`, e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
