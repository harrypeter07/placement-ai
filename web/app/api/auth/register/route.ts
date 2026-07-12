import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { name, email, password } = parsed.data;

    // Check if email already registered in Supabase
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    // Create user in Supabase users table
    const { error: insertError } = await supabase
      .from("users")
      .insert([
        {
          name,
          email: email.toLowerCase().trim(),
          password_hash: hashed,
          role: "student",
          updated_at: new Date().toISOString(),
        },
      ]);

    if (insertError) {
      console.error("[register] Supabase insert error:", insertError);
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[register] exception:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
