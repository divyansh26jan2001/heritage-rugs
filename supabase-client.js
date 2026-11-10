// Rugvaya Supabase browser client.
// The publishable key is intended for public browser use; access is controlled by RLS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://jpvwjoiazmualecjjcyn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kYbZ2H0C4J28oZCQQtA6Ug_WuFGNWQa";

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.rugvayaSupabase = client;
window.rugvayaSupabaseConfig = {
  url: SUPABASE_URL,
  configured: true
};

// This checks that the public Data API can read the shops table under RLS.
// An empty shop table is a successful connection, not an error.
window.rugvayaSupabaseReady = (async () => {
  try {
    const { error } = await client
      .from("shops")
      .select("id", { head: true, count: "exact" });

    if (error) throw error;

    const result = { connected: true, message: "Rugvaya database connection successful." };
    window.dispatchEvent(new CustomEvent("rugvaya:supabase-ready", { detail: result }));
    console.info("[Rugvaya] Supabase connection ready.");
    return result;
  } catch (error) {
    const result = {
      connected: false,
      message: "Supabase client initialized, but the database check failed.",
      error: error?.message || String(error)
    };
    window.dispatchEvent(new CustomEvent("rugvaya:supabase-error", { detail: result }));
    console.error("[Rugvaya] Supabase connection check failed:", result.error);
    return result;
  }
})();
