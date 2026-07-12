import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireAuth();

    // Fetch notifications from Supabase
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[GET notifications] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const mapped = (notifications || []).map((n) => ({
      _id: n.id,
      id: n.id,
      userId: n.user_id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: n.read,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    }));

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const { id, readAll } = await req.json();

    if (readAll) {
      // Mark all notifications as read in Supabase
      const { error } = await supabase
        .from("notifications")
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      if (error) throw error;
    } else if (id) {
      // Mark specific notification as read in Supabase
      const { error } = await supabase
        .from("notifications")
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
