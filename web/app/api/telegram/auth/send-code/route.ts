import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";
import { sendTelegramCode } from "@/lib/telegram-gramjs";
import { buildPhoneNumber } from "@/lib/telegram-phone";

export const runtime = "nodejs";

const TELEGRAM_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute
const TELEGRAM_MAX_SENDS_PER_HOUR = 5;

const schema = z.object({
  phone: z.string().min(6).max(20).optional(),
  countryDial: z.string().min(1).max(4).optional(),
  localNumber: z.string().min(6).max(15).optional(),
  resend: z.boolean().optional(),
});

function resolvePhone(body: z.infer<typeof schema>) {
  if (body.countryDial && body.localNumber) {
    return buildPhoneNumber(body.countryDial, body.localNumber);
  }
  if (body.phone) {
    const p = body.phone.trim();
    if (!p.startsWith("+")) throw new Error("Include country code or use country selector");
    return p.replace(/[\s-]/g, "");
  }
  throw new Error("Phone number required");
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    console.log(`[POST send-code] Request received. user: ${user.id}, body:`, body);

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.warn(`[POST send-code] Zod validation failed:`, parsed.error.format());
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const phoneNumber = resolvePhone(parsed.data);
    console.log(`[POST send-code] Resolved phone number to: ${phoneNumber}`);

    // Query pending auth from Supabase
    console.log(`[POST send-code] Querying telegram_auth_pendings for user: ${user.id}`);
    const { data: existing, error: fetchErr } = await supabase
      .from("telegram_auth_pendings")
      .select("id, last_sent_at, send_count, phone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[POST send-code] Supabase fetch pending error:`, fetchErr);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    if (existing) {
      console.log(`[POST send-code] Existing pending record found:`, existing);
      if (!parsed.data.resend) {
        const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
        if (elapsed < TELEGRAM_RESEND_COOLDOWN_MS) {
          const waitSec = Math.ceil((TELEGRAM_RESEND_COOLDOWN_MS - elapsed) / 1000);
          console.warn(`[POST send-code] Request rate limited. Wait: ${waitSec}s`);
          return NextResponse.json(
            {
              error: `Wait ${waitSec}s before requesting another code`,
              retryAfterSec: waitSec,
            },
            { status: 429 }
          );
        }
      }
    }

    if (existing?.send_count && existing.send_count >= TELEGRAM_MAX_SENDS_PER_HOUR) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (new Date(existing.last_sent_at).getTime() > hourAgo) {
        console.warn(`[POST send-code] Maximum sends per hour reached for user: ${user.id}`);
        return NextResponse.json(
          { error: "Too many codes sent. Try again in an hour." },
          { status: 429 }
        );
      }
    }

    console.log(`[POST send-code] Dispatching sendTelegramCode for phone: ${phoneNumber}...`);
    const sent = await sendTelegramCode(phoneNumber);
    console.log(`[POST send-code] sendTelegramCode successful. phoneCodeHash: ${sent.phoneCodeHash}`);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const sendCount =
      existing && new Date(existing.last_sent_at).getTime() > Date.now() - 60 * 60 * 1000
        ? (existing.send_count || 0) + 1
        : 1;

    // Upsert pending auth record in Supabase
    const payload = {
      user_id: user.id,
      phone: sent.phoneNumber,
      phone_code_hash: sent.phoneCodeHash,
      auth_session_string: sent.authSessionString,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
      send_count: sendCount,
      step: "code",
      updated_at: new Date().toISOString()
    };

    console.log(`[POST send-code] Upserting pending auth record in Supabase...`);
    const { error: upsertErr } = await supabase
      .from("telegram_auth_pendings")
      .upsert([payload], { onConflict: "user_id" });

    if (upsertErr) {
      console.error(`[POST send-code] Supabase upsert error:`, upsertErr);
      throw new Error("Failed to store pending auth session");
    }
    console.log(`[POST send-code] Pending auth record upserted successfully.`);

    return NextResponse.json({
      ok: true,
      phoneNumber: sent.phoneNumber,
      isCodeViaApp: sent.isCodeViaApp,
      retryAfterSec: Math.ceil(TELEGRAM_RESEND_COOLDOWN_MS / 1000),
      message: sent.isCodeViaApp
        ? "Code sent to your Telegram app — enter it within a few minutes"
        : "Code sent via SMS — enter it within a few minutes",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(`[POST send-code] Fatal error:`, e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
