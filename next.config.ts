import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// Only a site served over HTTPS asks browsers to upgrade plain-http links.
const isHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
// The app's own address: the only site allowed to read its responses.
const siteOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;
  } catch {
    return null;
  }
})();

/*
 * Content Security Policy. Pages are partly prerendered (cacheComponents), so
 * Next's inline scripts cannot carry a per-request nonce; 'unsafe-inline' is
 * needed for scripts and styles. Everything else is locked to this site: no
 * other site's scripts, images, fonts or connections, no plugins, no <base>
 * tag, forms only post here, and no other site may frame the app.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isHttps ? ["upgrade-insecure-requests"] : [])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(isHttps ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  // Only this site may read its pages from a script.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Replaces a host's default "Access-Control-Allow-Origin: *".
  ...(siteOrigin ? [{ key: "Access-Control-Allow-Origin", value: siteOrigin }, { key: "Vary", value: "Origin" }] : [])
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
