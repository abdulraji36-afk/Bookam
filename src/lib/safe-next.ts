/**
 * Accepts only same-site paths for post-login redirects, so a crafted link
 * cannot send someone to another website after they sign in.
 */
export function safeNextPath(value: unknown, fallback = "/businesses"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
