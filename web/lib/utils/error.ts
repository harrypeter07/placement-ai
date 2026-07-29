/**
 * Robustly extract a human-readable error message from any thrown value.
 * Handles:
 *   - native Error instances → .message
 *   - Supabase PostgrestError objects → .message (they have .message but are not instanceof Error)
 *   - plain strings
 *   - anything else → JSON.stringify
 */
export function getErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    // Handle Error instances and Supabase PostgrestError (both have .message)
    const asObj = e as Record<string, unknown>;
    if (typeof asObj.message === "string" && asObj.message) {
      // Supabase also has .details and .hint — include them for clarity
      const detail = typeof asObj.details === "string" ? ` | details: ${asObj.details}` : "";
      const code = typeof asObj.code === "string" ? ` [code: ${asObj.code}]` : "";
      return `${asObj.message}${code}${detail}`;
    }
    // Fallback to JSON
    try {
      return JSON.stringify(e);
    } catch {
      return "Unknown error (could not serialize)";
    }
  }
  return "Unknown error";
}
