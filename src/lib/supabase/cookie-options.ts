/**
 * The session cookie is for the server only: the app never reads it in the
 * browser (there is no browser database client), so page scripts cannot see
 * it, and it only travels over HTTPS in production.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
};
