/* Gym Management App — auth.js (v1.4)
 * Per-gym accounts, stored locally. No backend, no external library.
 *
 * - Accounts live in localStorage under CFG.AUTH_KEY ("gym_auth_v1") as an
 *   array of records. Passwords are NEVER stored — only a per-account
 *   random salt + SHA-256(salt + ":" + password) hex hash.
 * - The logged-in account id lives in CFG.SESSION_KEY ("gym_session_v1").
 * - Each account's gym data lives under its own key
 *   (CFG.ACCOUNT_DATA_PREFIX + accountId) — see data.js initForAccount.
 * - The pre-auth single-gym key (CFG.LEGACY_STORAGE_KEY, "gym_live_v1")
 *   is NEVER written here. readLegacy()/hasLegacyData()/clearLegacy()
 *   exist only so the UI can offer a one-time migration of the old
 *   SPARTAN FITNESS data into the new account — and only clear it after
 *   the migration is verified (GymData.readRaw()).
 *
 * Load order: config.js -> auth.js -> data.js -> app.js
 */
(function () {
  var CFG = window.GYM_CONFIG;
  var AUTH_KEY = CFG.AUTH_KEY || "gym_auth_v1";
  var SESSION_KEY = CFG.SESSION_KEY || "gym_session_v1";
  var LEGACY_KEY = CFG.LEGACY_STORAGE_KEY || "gym_live_v1";

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Crypto ---------- */
  function getSubtle() {
    try {
      var c = (typeof crypto !== "undefined") ? crypto : null;
      return (c && c.subtle) ? c.subtle : null;
    } catch (e) { return null; }
  }
  function getRandomValues() {
    try {
      var c = (typeof crypto !== "undefined") ? crypto : null;
      return (c && c.getRandomValues) ? c.getRandomValues.bind(c) : null;
    } catch (e) { return null; }
  }
  function makeSalt() {
    var bytes = new Uint8Array(16);
    var rand = getRandomValues();
    if (rand) {
      rand(bytes);
    } else {
      // Fallback only for the salt (never for the password itself).
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var hex = "";
    for (var j = 0; j < bytes.length; j++) hex += ("0" + bytes[j].toString(16)).slice(-2);
    return hex;
  }
  function bufToHex(buf) {
    var bytes = new Uint8Array(buf);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += ("0" + bytes[i].toString(16)).slice(-2);
    return hex;
  }
  // SHA-256 hex of (salt + ":" + password). Rejects with "no-crypto" when
  // WebCrypto is unavailable — callers turn that into {ok:false,error:"no-crypto"}.
  function hashPassword(salt, password) {
    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error("no-crypto"));
    var data = new TextEncoder().encode(salt + ":" + password);
    return subtle.digest("SHA-256", data).then(function (buf) { return bufToHex(buf); });
  }
  // Constant-time-ish compare: no early exit on first mismatch.
  function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    var diff = a.length ^ b.length;
    var len = Math.max(a.length, b.length);
    for (var i = 0; i < len; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  /* ---------- Storage ---------- */
  function readAccounts() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeAccounts(arr) {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(arr)); return true; }
    catch (e) { return false; }
  }
  function findByEmail(email) {
    var norm = (email || "").trim().toLowerCase();
    var list = readAccounts();
    for (var i = 0; i < list.length; i++) {
      if ((list[i].email || "").toLowerCase() === norm) return list[i];
    }
    return null;
  }
  function findById(id) {
    var list = readAccounts();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // Public shape only — hash/salt NEVER leave this file.
  function publicAccount(rec) {
    if (!rec) return null;
    return {
      id: rec.id,
      email: rec.email,
      gymName: rec.gymName,
      city: rec.city,
      ownerName: rec.ownerName,
      logo: rec.logo || ""
    };
  }
  function newId() {
    return "A" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function setSession(id) { try { localStorage.setItem(SESSION_KEY, id); } catch (e) {} }
  function getSessionId() {
    try { return localStorage.getItem(SESSION_KEY) || null; }
    catch (e) { return null; }
  }

  /* ---------- Public API ---------- */
  window.GymAuth = {
    currentAccount: function () {
      var id = getSessionId();
      if (!id) return null;
      return publicAccount(findById(id));
    },

    createAccount: function (o) {
      o = o || {};
      var email = (o.email || "").trim().toLowerCase();
      var password = o.password || "";
      var gymName = (o.gymName || "").trim();
      if (!EMAIL_RE.test(email)) return Promise.resolve({ ok: false, error: "invalid-email" });
      if (typeof password !== "string" || password.length < 6) return Promise.resolve({ ok: false, error: "weak-password" });
      if (!gymName) return Promise.resolve({ ok: false, error: "no-gym-name" });
      if (findByEmail(email)) return Promise.resolve({ ok: false, error: "email-exists" });
      if (!getSubtle()) return Promise.resolve({ ok: false, error: "no-crypto" });
      var salt = makeSalt();
      return hashPassword(salt, password).then(function (hash) {
        var rec = {
          id: newId(),
          email: email,
          salt: salt,
          hash: hash,
          gymName: gymName,
          city: (o.city || "").trim(),
          ownerName: (o.ownerName || "").trim(),
          logo: o.logo || "",
          createdAt: Date.now()
        };
        var list = readAccounts();
        list.push(rec);
        writeAccounts(list);
        setSession(rec.id);
        return { ok: true, account: publicAccount(rec) };
      }).catch(function () {
        return { ok: false, error: "no-crypto" };
      });
    },

    login: function (email, password) {
      var rec = findByEmail(email);
      if (!rec) return Promise.resolve({ ok: false, error: "no-account" });
      if (!getSubtle()) return Promise.resolve({ ok: false, error: "no-crypto" });
      return hashPassword(rec.salt, password || "").then(function (hash) {
        if (!safeEqual(hash, rec.hash)) return { ok: false, error: "wrong-password" };
        setSession(rec.id);
        return { ok: true, account: publicAccount(rec) };
      }).catch(function () {
        return { ok: false, error: "no-crypto" };
      });
    },

    logout: function () {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    },

    updateProfile: function (o) {
      o = o || {};
      var id = getSessionId();
      if (!id) return null;
      var list = readAccounts();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== id) continue;
        if (o.gymName !== undefined) list[i].gymName = (o.gymName || "").trim();
        if (o.city !== undefined) list[i].city = (o.city || "").trim();
        if (o.ownerName !== undefined) list[i].ownerName = (o.ownerName || "").trim();
        if (o.logo !== undefined) list[i].logo = o.logo || ""; // "" = remove logo
        writeAccounts(list);
        return publicAccount(list[i]);
      }
      return null;
    },

    /* ----- Legacy (pre-auth) data — read-only, migration only ----- */
    readLegacy: function () {
      try {
        var raw = localStorage.getItem(LEGACY_KEY);
        if (!raw) return null;
        var st = JSON.parse(raw);
        if (!st || st.version !== 1 || !st.settings) return null;
        return st;
      } catch (e) { return null; }
    },

    hasLegacyData: function () {
      var st = this.readLegacy();
      if (!st) return false;
      // Any real content at all? (memberPlans is derived from plans, so it
      // is not counted — the lists below cover real user-entered data.)
      var lists = ["members", "plans", "trainers", "fees", "payments", "notices", "expenses"];
      for (var i = 0; i < lists.length; i++) {
        if (Array.isArray(st[lists[i]]) && st[lists[i]].length > 0) return true;
      }
      if (st.attendance && Object.keys(st.attendance).length > 0) return true;
      if (st.extras && Object.keys(st.extras).length > 0) return true;
      var s = st.settings || {};
      // NOTE: the empty seed ships with city "Gopalganj", so a bare seed
      // must NOT count as data — only a city different from the default.
      if ((s.gymName || "") !== "SPARTAN FITNESS") return true;
      if ((s.city || "") !== "" && (s.city || "") !== "Gopalganj") return true;
      if ((s.ownerName || "") !== "") return true;
      if ((s.logo || "") !== "") return true;
      return false;
    },

    clearLegacy: function () {
      try { localStorage.removeItem(LEGACY_KEY); } catch (e) {}
    }
  };

  // Test hook — lets a smoke test hash/compare without going through signup.
  window.GymAuth._internals = { hashPassword: hashPassword, makeSalt: makeSalt };
})();
