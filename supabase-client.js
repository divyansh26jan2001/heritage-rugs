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
    const checks = [
      ["shops", client.from("shops").select("id,storefront_id", { head: true })],
      ["products", client.from("products").select("id,storefront_id", { head: true })],
      ["cart_items", client.from("cart_items").select("user_id", { head: true })],
      ["wishlist_items", client.from("wishlist_items").select("user_id", { head: true })],
      ["store_settings", client.from("store_settings").select("id", { head: true })],
      ["newsletter_subscribers", client.from("newsletter_subscribers").select("id", { head: true })]
    ];
    const results = await Promise.all(checks.map(async ([name, query]) => {
      const { error } = await query;
      if (error) throw new Error(name + ": " + error.message);
      return name;
    }));

    const result = {
      connected: true,
      checkedTables: results,
      message: "Rugvaya Supabase connection and database schema are ready."
    };
    window.dispatchEvent(new CustomEvent("rugvaya:supabase-ready", { detail: result }));
    console.info("[Rugvaya] Supabase connection and database schema ready.");
    return result;
  } catch (error) {
    const result = {
      connected: false,
      message: "Supabase client initialized, but one or more database tables/migrations are not ready.",
      error: error?.message || String(error)
    };
    window.dispatchEvent(new CustomEvent("rugvaya:supabase-error", { detail: result }));
    console.error("[Rugvaya] Supabase schema check failed:", result.error);
    return result;
  }
})();;
