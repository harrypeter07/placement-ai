import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-auth";

export async function GET() {
  try {
    await requireAdmin();

    // Query students from Supabase
    const { data: students, error } = await supabase
      .from("users")
      .select("id, name, email, role, created_at, updated_at")
      .eq("role", "student")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET admin/students] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const mapped = (students || []).map((s) => ({
      _id: s.id,
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
