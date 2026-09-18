// netlify/functions/_shared/supabase.js
//
// Server-side-only Supabase client. This file is never bundled into any
// page shipped to the browser — it only runs inside Netlify Functions.
// Uses the SERVICE ROLE key deliberately: functions do their own auth
// (session cookie -> wallet address) and enforce access scoping in the
// queries themselves, so Row Level Security policies are a second layer,
// not the only layer.
//
// NEVER import this file from anything under /js/ — that would ship the
// service role key to every visitor's browser.

const { createClient } = require("@supabase/supabase-js");

let client = null;

function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing. Set both in " +
        "Netlify env vars (see db/SETUP.md)."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

module.exports = { getSupabase };
