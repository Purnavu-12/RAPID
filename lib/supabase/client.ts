/**
 * Browser-side Supabase client.
 *
 * Uses the public anon key (subject to row-level security when enabled — §33).
 * Lazily initialised and cached per page load. Not used by the dashboard
 * today (it reads via the server gateway /api/recovery), but provided so
 * future interactive writes can authenticate the end user through Supabase Auth.
 */
"use client";

import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase browser client is not configured. Set NEXT_PUBLIC_SUPABASE_URL " +
        "and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
    );
  }

  browserClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true },
  });
  return browserClient;
}
