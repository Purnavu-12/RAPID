/**
 * Server-side Supabase client (admin / service role).
 *
 * The dashboard data gateway uses the service_role key so it can read the
 * analytical projections (§62) regardless of future row-level-security
 * policy (§33 Authorization). Env is read *per request* (inside each handler),
 * so importing this module during `next build` never throws when the vars are
 * absent — they are only required at runtime.
 */
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (admin / service role).
 *
 * The dashboard data gateway uses the service_role key so it can read the
 * analytical projections (§62) regardless of future row-level-security
 * policy (§33 Authorization). Env is read *per request* (inside each handler),
 * so importing this module during `next build` never throws when the vars are
 * absent — they are only required at runtime.
 *
 * Return type is intentionally inferred (not aliased from the overloaded
 * `createClient`) so supabase-js' generated row types resolve correctly.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "(see .env.example)."
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    db: { schema: "public" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
