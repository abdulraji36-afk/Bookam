import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeNextPath } from "@/lib/safe-next";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

const SIGNED_IN_ONLY = ["/b", "/businesses", "/onboarding"];
const SIGNED_OUT_ONLY = ["/login", "/signup"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Record pages under a business: the section, the table its id is in, and
 * the fixed pages that sit beside the ids (such as orders/new). Longest first.
 */
const RECORD_PAGES: { section: string; table: string; fixed: string[] }[] = [
  { section: "dispatch/crew", table: "dispatch_workers", fixed: [] },
  { section: "stock/receipts", table: "stock_receipts", fixed: [] },
  { section: "returns/adjustments", table: "returnable_adjustments", fixed: [] },
  { section: "returns/exchanges", table: "supplier_exchanges", fixed: [] },
  { section: "orders", table: "orders", fixed: ["new"] },
  { section: "dispatch", table: "dispatch_trips", fixed: ["new", "crew"] },
  { section: "products", table: "products", fixed: ["new", "nbc"] },
  { section: "customers", table: "customers", fixed: ["new"] },
  { section: "team", table: "memberships", fixed: [] }
];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase session cookie and does the cheap, optimistic
 * redirects. Real authorization happens again in every page and action, and
 * finally in the database.
 */
export async function updateSession(request: NextRequest) {
  // No other site may call the app from a browser: a cross-site preflight
  // gets no permission (no Access-Control-Allow-* headers).
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { Allow: "GET, HEAD, POST", "Cache-Control": "no-store" } });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });

  if (!url || !publishableKey) return response;

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      }
    }
  });

  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed session cookies on the redirect response.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!isSignedIn && matches(pathname, SIGNED_IN_ONLY)) {
    return redirectTo(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
  }

  if (isSignedIn && matches(pathname, SIGNED_OUT_ONLY)) {
    return redirectTo(safeNextPath(request.nextUrl.searchParams.get("next")));
  }

  // A business the person is not a member of (or that does not exist) is a
  // plain 404, decided here before the page starts streaming. Row level
  // security only returns a business to its members.
  const notFound = () => {
    const missing = NextResponse.rewrite(new URL("/not-found-page", request.url), { status: 404 });
    for (const cookie of response.cookies.getAll()) missing.cookies.set(cookie);
    missing.headers.set("Cache-Control", "private, no-store, max-age=0");
    return missing;
  };
  const [, business, rest = ""] = /^\/b\/([^/]+)\/?(.*)$/.exec(pathname) ?? [];
  if (isSignedIn && business) {
    const { data: org, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", decodeURIComponent(business))
      .maybeSingle();
    if (!error && !org) return notFound();

    // A record page (an order, trip, product...) for an id that is malformed,
    // missing, or belongs to another business: 404 too, before streaming.
    const page = RECORD_PAGES.find(({ section }) => rest.startsWith(`${section}/`));
    const id = page ? rest.slice(page.section.length + 1).split("/")[0] : "";
    if (org && page && id && !page.fixed.includes(id)) {
      if (!UUID.test(id)) return notFound();
      const { data: record, error: recordError } = await supabase
        .from(page.table as "orders")
        .select("id")
        .eq("id", id)
        .eq("organization_id", org.id)
        .maybeSingle();
      if (!recordError && !record) return notFound();
    }
  }

  // Signed-in pages are for one person: never kept by a browser or shared cache.
  if (isSignedIn || matches(pathname, SIGNED_IN_ONLY)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}
