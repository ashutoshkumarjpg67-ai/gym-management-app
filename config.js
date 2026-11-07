/* Gym Management App — config.js
 * Central configuration. Step 1 runs on localStorage only (USE_SUPABASE = false),
 * so the site works on GitHub Pages with no backend at all.
 *
 * STEP 2 (later, when the user is ready):
 *   1. Create a SEPARATE Supabase project (do NOT reuse Target Academy's,
 *      and do NOT reuse VidyaSetu's — this is a different product).
 *   2. Paste its URL + anon key below and set USE_SUPABASE = true.
 *   3. Implement the stub functions in data.js (supabaseFetch / supabaseSave)
 *      against the tables listed in README.md. No UI code needs to change —
 *      app.js only ever calls GymData.* functions.
 */
window.GYM_CONFIG = {
  APP_NAME: "Gym Management App",
  VERSION: "1.5.3",
  // One app, each gym a separate account. The active gym is stored
  // in the data layer (see data.js). Never hard-code another gym's data.
  USE_SUPABASE: false,
  SUPABASE_URL: "",      // e.g. "https://xyzcompany.supabase.co" — fill in Step 2
  SUPABASE_ANON_KEY: "", // anon/public key only. NEVER put the service_role key here.
  STORAGE_KEY: "gym_live_v1", // legacy alias — the pre-auth single-gym key.
  // v1.4 auth + per-account data. Each gym account gets its own data key:
  // ACCOUNT_DATA_PREFIX + accountId (e.g. "gym_live_Ak..."). The old
  // gym_live_v1 key is NEVER written again — it is only read once, during
  // first-time migration into the new account (see auth.js readLegacy).
  LEGACY_STORAGE_KEY: "gym_live_v1",
  AUTH_KEY: "gym_auth_v1",
  SESSION_KEY: "gym_session_v1",
  ACCOUNT_DATA_PREFIX: "gym_live_",
  CURRENCY: "₹"
};
