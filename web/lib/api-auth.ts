import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  // Validate UUID. If it's a legacy MongoDB ObjectId, treat the user as unauthenticated
  // to prevent DB format errors and force a clean logout/re-login.
  if (!UUID_REGEX.test(session.user.id)) {
    console.warn(`[api-auth] Rejecting legacy non-UUID session ID: ${session.user.id}`);
    return null;
  }

  return session.user;
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") throw new Error("Forbidden");
  return user;
}
