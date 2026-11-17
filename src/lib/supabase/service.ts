import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * A database client with the secret key, for scheduled jobs that run without
 * anyone signed in. It skips row security, so use it only on the server and
 * only for the job it was made for. Null when the key is not set.
 */
export function createServiceClient(): ServerClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  }) as unknown as ServerClient;
}
