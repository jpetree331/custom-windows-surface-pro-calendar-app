import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Cloud mirror client. Returns null when Supabase env vars are absent —
 * the app is local-first and must run fully offline without them.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && anonKey ? createClient(url, anonKey) : null;
  return client;
}
