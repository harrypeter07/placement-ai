import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-auth";

const schema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  company: z.string().optional(),
  deadline: z.string().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    
    // Fetch broadcasts from Supabase
    const { data: broadcasts, error } = await supabase
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[GET admin/broadcast] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const mapped = (broadcasts || []).map((b) => ({
      _id: b.id,
      id: b.id,
      adminId: b.admin_id,
      title: b.title,
      message: b.message,
      company: b.company,
      deadline: b.deadline,
      targetRole: b.target_role,
      createdAt: b.created_at,
    }));

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // Insert broadcast into Supabase
    const { data: broadcast, error: insertError } = await supabase
      .from("broadcasts")
      .insert([
        {
          admin_id: admin.id,
          title: parsed.data.title,
          message: parsed.data.message,
          company: parsed.data.company || null,
          deadline: parsed.data.deadline ? new Date(parsed.data.deadline).toISOString() : null,
          target_role: "student",
          updated_at: new Date().toISOString(),
        }
      ])
      .select("*")
      .single();

    if (insertError || !broadcast) {
      console.error("[POST admin/broadcast] Supabase insert error:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (parsed.data.company && parsed.data.deadline) {
      // Create global deadline in Supabase
      const { error: dlErr } = await supabase
        .from("deadlines")
        .insert([
          {
            company: parsed.data.company,
            role: "Placement Drive",
            deadline_date: new Date(parsed.data.deadline).toISOString(),
            eligibility: "",
            is_global: true,
            confidence: 1.0,
            status: "pending",
            updated_at: new Date().toISOString(),
          }
        ]);

      if (dlErr) {
        console.error("[POST admin/broadcast] Supabase insert deadline error:", dlErr);
      }
    }

    // Get all student IDs to dispatch notifications
    const { data: students } = await supabase
      .from("users")
      .select("id")
      .eq("role", "student");

    if (students && students.length > 0) {
      const notifications = students.map((s) => ({
        user_id: s.id,
        title: parsed.data.title,
        message: parsed.data.message,
        type: "placement",
        updated_at: new Date().toISOString(),
      }));

      const { error: notifErr } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notifErr) {
        console.error("[POST admin/broadcast] Supabase insert notifications error:", notifErr);
      }
    }

    const mappedOutput = {
      _id: broadcast.id,
      id: broadcast.id,
      adminId: broadcast.admin_id,
      title: broadcast.title,
      message: broadcast.message,
      company: broadcast.company,
      deadline: broadcast.deadline,
      targetRole: broadcast.target_role,
      createdAt: broadcast.created_at,
    };

    return NextResponse.json(mappedOutput, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
