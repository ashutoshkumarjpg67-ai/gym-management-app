/* Gym Management App — data.js
 * Data layer. app.js NEVER touches localStorage directly — it only calls
 * the functions on window.GymData below. That is what makes a future
 * Supabase swap a data-layer-only change.
 *
 * Step 1 storage: localStorage (key from config.js).
 * Step 2 storage: Supabase — replace the bodies of loadFromStore/saveToStore
 * with Supabase calls and set USE_SUPABASE = true in config.js.
 *
 * Seed is EMPTY on purpose: no sample members, plans, trainers or fees.
 * The gym owner adds their real data. Gym identity is pre-filled only
 * (SPARTAN FITNESS, Gopalganj); owner name stays empty until given.
 */
(function () {
  var CFG = window.GYM_CONFIG;
  var KEY = CFG.STORAGE_KEY;

  var FEE_MONTHS = [
    { value: "2026-04", label: "Apr 2026" }, { value: "2026-05", label: "May 2026" },
    { value: "2026-06", label: "Jun 2026" }, { value: "2026-07", label: "Jul 2026" },
    { value: "2026-08", label: "Aug 2026" }, { value: "2026-09", label: "Sep 2026" },
    { value: "2026-10", label: "Oct 2026" }, { value: "2026-11", label: "Nov 2026" },
    { value: "2026-12", label: "Dec 2026" }, { value: "2027-01", label: "Jan 2027" },
    { value: "2027-02", label: "Feb 2027" }, { value: "2027-03", label: "Mar 2027" }
  ];
  function monthLabel(value) {
    for (var i = 0; i < FEE_MONTHS.length; i++) if (FEE_MONTHS[i].value === value) return FEE_MONTHS[i].label;
    return value;
  }
  function monthOf(dateStr) { return (dateStr || "").slice(0, 7); }
  /* Add n months to a date, keeping the day-of-month (clamped to the
     target month's last day, e.g. 31 Jan + 1 = 28 Feb). Always computed
     from the ORIGINAL date, so 31 Jan + 2 = 31 Mar (no anchor drift). */
  function addMonthsClamped(iso, n) {
    var p = (iso || "").split("-");
    var y = parseInt(p[0], 10) || 1970, m = (parseInt(p[1], 10) || 1) - 1 + n, d = parseInt(p[2], 10) || 1;
    var ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
    var last = new Date(ty, tm + 1, 0).getDate();
    var td = Math.min(d, last);
    var mm = String(tm + 1); if (mm.length < 2) mm = "0" + mm;
    var dd = String(td); if (dd.length < 2) dd = "0" + dd;
    return ty + "-" + mm + "-" + dd;
  }
  function todayStr() {
    // IST date, always — server/client timezone mismatch caused off-by-one
    // "today" counts in an earlier build. One source of truth here.
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    var y = "", m = "", d = "";
    parts.forEach(function (p) { if (p.type === "year") y = p.value; if (p.type === "month") m = p.value; if (p.type === "day") d = p.value; });
    return y + "-" + m + "-" + d;
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return parseInt(p[2], 10) + " " + months[parseInt(p[1], 10) - 1] + " " + p[0];
  }
  function addDays(iso, days) {
    var d = new Date(iso + "T00:00:00+05:30");
    d = new Date(d.getTime() + days * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36); }

  function seed(settings) {
    var s = settings || {};
    return {
      version: 1,
      settings: {
        gymName: (s.gymName || "").trim() || "SPARTAN FITNESS",
        city: (s.city || "").trim() || "Gopalganj",
        ownerName: (s.ownerName || "").trim() || "",
        logo: s.logo || ""
      },
      members: [],
      plans: [],
      trainers: [],
      memberPlans: [],
      fees: [],
      payments: [],
      attendance: {},
      extras: {},
      notices: [],
      expenses: []
    };
  }

  /* ---------- Store (localStorage in Step 1) ---------- */
  var lastSaveError = null; // null | "quota" | "error" — app.js checks this after saves
  function loadFromStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function saveToStore(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      lastSaveError = null;
      return true;
    } catch (e) {
      // QuotaExceededError: phone storage full (big risk once member photos
      // are stored). Callers must check lastSaveError() and degrade
      // gracefully (e.g. save the member without the photo) — never crash.
      lastSaveError = (e && e.name === "QuotaExceededError") ? "quota" : "error";
      return false;
    }
  }
  // Step 2 stubs — fill these in when Supabase is connected. app.js does
  // not call them directly; it calls the public functions below.
  function supabaseFetch() { throw new Error("Supabase not configured yet. Set USE_SUPABASE and fill config.js."); }
  function supabaseSave() { throw new Error("Supabase not configured yet. Set USE_SUPABASE and fill config.js."); }

  // v1.4: NO auto-seed / auto-save at parse time. The data key is per
  // account and is only chosen once the UI knows who is logged in
  // (GymData.initForAccount). Until then state stays null and nothing is
  // written — the legacy gym_live_v1 key is never touched here.
  var state = loadFromStore() || null;

  /* ---------- Public API (only thing app.js uses) ---------- */
  window.GymData = {
    getState: function () { return state; },
    save: function () { if (CFG.USE_SUPABASE) { supabaseSave(state); return true; } return saveToStore(state); },
    /* v1.4 — per-account data. The UI calls this once, right after login /
       signup (and after an optional legacy migration), before any other
       GymData call. KEY switches to the account's own key; state is loaded
       from it, or seeded (with the account's gym identity) and saved. */
    initForAccount: function (accountId, seedSettings) {
      KEY = CFG.ACCOUNT_DATA_PREFIX + accountId;
      state = loadFromStore();
      if (!state || state.version !== 1) { state = seed(seedSettings); saveToStore(state); }
      this.migrateMonthlyFees();
      this.ensureMonthlyDues();
      return state;
    },
    /* Replace the whole in-memory state (used by the legacy migration:
       read the old state, initForAccount, then replaceState(oldState)). */
    replaceState: function (newState) {
      state = newState;
      this.migrateMonthlyFees();
      this.ensureMonthlyDues();
      return saveToStore(state);
    },
    /* Re-read the current account key from localStorage (migration
       verification — proves what is actually on disk, not in memory). */
    readRaw: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) { return null; }
    },
    currentKey: function () { return KEY; },
    lastSaveError: function () { return lastSaveError; },
    /* Storage accounting (chars of stored JSON — the localStorage budget).
       Photos are base64 data URLs, so photoChars dominates once photos exist. */
    storageInfo: function () {
      var json = "";
      try { json = JSON.stringify(state); } catch (e) {}
      var photos = 0, photoChars = 0;
      state.members.forEach(function (m) { if (m.photo) { photos++; photoChars += String(m.photo).length; } });
      return { bytes: json.length, members: state.members.length, photos: photos, photoChars: photoChars };
    },
    resetAll: function () { state = seed(); this.save(); return state; },
    todayStr: todayStr,
    fmtDate: fmtDate,
    monthLabel: monthLabel,
    feeMonths: function () { return FEE_MONTHS.slice(); },

    settings: function () { return state.settings; },
    saveSettings: function (o) {
      state.settings.gymName = (o.gymName || "").trim() || "SPARTAN FITNESS";
      state.settings.city = (o.city || "").trim();
      state.settings.ownerName = (o.ownerName || "").trim();
      if (o.logo !== undefined) state.settings.logo = o.logo; // "" = remove logo
      this.save();
      return state.settings;
    },

    /* ----- Monthly fee model (v1.6.0 — plan system retired) -----
       Simple rule, the way the gym actually works: every member has one
       monthly fee. Fees are anchored on the ADMISSION DATE — a member who
       joined on 7 Jul owes on 7 Jul, 7 Aug, 7 Sep ... (next month, same
       date, 1 month complete). A period's fee exists once its start date
       has arrived, and NEVER for a future month — so a 25 Jul join has
       Jul/Aug/Sep/Oct dues on 7 Nov, but no November fee yet (25 Nov has
       not come). Dues are stored as ordinary Membership fee records, so
       totals, defaulters, Collect, receipts and Delete all work unchanged
       — only the SOURCE of the records changed (auto from join date,
       instead of plan assign/renew). */
    migrateMonthlyFees: function () {
      // Members saved before v1.6.0 have no monthlyFee: take it from the
      // active plan's price, else from their latest Membership fee amount.
      state.members.forEach(function (m) {
        if (m.monthlyFee !== undefined && m.monthlyFee !== null) return;
        var fee = 0;
        var ap = this.activePlanFor(m.id);
        if (ap) fee = ap.price || 0;
        else {
          var recs = state.fees.filter(function (f) { return f.memberId === m.id && f.type === "Membership"; });
          if (recs.length) fee = recs[recs.length - 1].amount || 0;
        }
        m.monthlyFee = parseInt(fee, 10) || 0;
      }, this);
      // v1.6.1: fees generate only up to the current month. Drop Membership
      // records for FUTURE months that the old plan system created (a renew
      // made a next-month fee, e.g. December while it is still November).
      // A hand-added future fee (no plan name) is the owner's own entry —
      // that one stays.
      var cur = monthOf(todayStr());
      state.fees = state.fees.filter(function (f) {
        return !(f.type === "Membership" && f.month > cur && f.planName);
      });
      this.save();
    },
    ensureMonthlyDues: function () {
      // Idempotent: only creates a Membership record for a period that does
      // not have one yet. Runs on login, on member save, and on import.
      var created = 0, today = todayStr();
      state.members.forEach(function (m) {
        if (m.status !== "active") return;
        var fee = parseInt(m.monthlyFee, 10) || 0;
        if (fee <= 0) return;
        var join = m.joinDate || today;
        for (var n = 0; n <= 120; n++) {
          var start = addMonthsClamped(join, n);
          if (start > today) break;
          var mo = monthOf(start);
          if (!this.feeExists(m.id, mo, "Membership")) {
            this.addFee({ memberId: m.id, type: "Membership", month: mo, amount: fee });
            created++;
          }
        }
      }, this);
      return created;
    },

    /* ----- Members ----- */
    membersList: function (status) {
      var list = state.members.filter(function (m) { return (status || "active") === "all" ? true : m.status === (status || "active"); });
      return list.slice();
    },
    memberById: function (id) {
      for (var i = 0; i < state.members.length; i++) if (state.members[i].id === id) return state.members[i];
      return null;
    },
    addMember: function (m) {
      m.id = uid("M");
      m.status = "active";
      m.joinDate = m.joinDate || todayStr();
      m.monthlyFee = parseInt(m.monthlyFee, 10) || 0;
      state.members.push(m);
      this.save();
      this.ensureMonthlyDues();
      return m;
    },
    updateMember: function (id, fields) {
      var m = this.memberById(id);
      if (!m) return null;
      if (fields.monthlyFee !== undefined) fields.monthlyFee = parseInt(fields.monthlyFee, 10) || 0;
      Object.keys(fields).forEach(function (k) { if (fields[k] !== undefined) m[k] = fields[k]; });
      this.save();
      this.ensureMonthlyDues();
      return m;
    },
    archiveMember: function (id) {
      var m = this.memberById(id);
      if (!m) return false;
      m.status = "archived";
      this.save();
      return true;
    },
    /* Full remove — only used to roll back a member whose save failed
       (e.g. storage full even without a photo), so a half-saved member
       never appears in the list and vanishes on reload. */
    removeMember: function (id) {
      var before = state.members.length;
      state.members = state.members.filter(function (m) { return m.id !== id; });
      delete state.extras[id];
      if (state.members.length !== before) this.save();
      return state.members.length !== before;
    },

    /* ----- Plans ----- */
    /* LEGACY (v1.6.0): the plan system is retired — the UI no longer uses
       these. Kept so stored data stays valid and an older cached app
       shell calling them does not crash. New fees come from monthlyFee. */
    plansList: function () { return state.plans.slice(); },
    planById: function (id) {
      for (var i = 0; i < state.plans.length; i++) if (state.plans[i].id === id) return state.plans[i];
      return null;
    },
    savePlan: function (p) {
      if (p.id) {
        var ex = this.planById(p.id);
        if (!ex) return null;
        ex.name = p.name; ex.days = p.days; ex.price = p.price;
        this.save();
        return ex;
      }
      p.id = uid("P");
      state.plans.push({ id: p.id, name: p.name, days: p.days, price: p.price });
      this.save();
      return state.plans[state.plans.length - 1];
    },
    deletePlan: function (id) {
      state.plans = state.plans.filter(function (p) { return p.id !== id; });
      this.save();
    },

    /* ----- Trainers ----- */
    trainersList: function () { return state.trainers.slice(); },
    trainerById: function (id) {
      for (var i = 0; i < state.trainers.length; i++) if (state.trainers[i].id === id) return state.trainers[i];
      return null;
    },
    saveTrainer: function (t) {
      if (t.id) {
        var ex = this.trainerById(t.id);
        if (!ex) return null;
        ex.name = t.name; ex.specialty = t.specialty; ex.phone = t.phone;
        this.save();
        return ex;
      }
      t.id = uid("T");
      state.trainers.push({ id: t.id, name: t.name, specialty: t.specialty || "", phone: t.phone || "" });
      this.save();
      return state.trainers[state.trainers.length - 1];
    },
    deleteTrainer: function (id) {
      state.trainers = state.trainers.filter(function (t) { return t.id !== id; });
      this.save();
    },

    /* ----- Memberships (plan assign / renew) ----- */
    activePlanFor: function (memberId) {
      var today = todayStr();
      var found = null;
      state.memberPlans.forEach(function (mp) {
        if (mp.memberId === memberId && mp.endDate >= today) found = mp;
      });
      return found;
    },
    assignPlan: function (memberId, planId) {
      var m = this.memberById(memberId);
      var p = this.planById(planId);
      if (!m || !p) return { ok: false, error: "member-or-plan-missing" };
      if (this.activePlanFor(memberId)) return { ok: false, error: "active-exists" };
      var start = todayStr();
      var mp = { id: uid("MP"), memberId: memberId, planId: planId, planName: p.name, startDate: start, endDate: addDays(start, p.days), price: p.price };
      state.memberPlans.push(mp);
      // Usi mahine ka Membership fee record pehle se ho (manual Add Fee ya
      // pehle ka assign) to dobara fee record mat banao — nahi to member
      // ek hi mahine ki fee do baar dega aur defaulter dikhega.
      var fee = null, feeSkipped = false;
      if (this.feeExists(memberId, monthOf(start), "Membership")) { feeSkipped = true; }
      else { fee = this.addFee({ memberId: memberId, type: "Membership", planName: p.name, month: monthOf(start), amount: p.price }); }
      this.save();
      return { ok: true, mp: mp, fee: fee, feeSkipped: feeSkipped };
    },
    renewPlan: function (memberPlanId) {
      var mp = null;
      state.memberPlans.forEach(function (x) { if (x.id === memberPlanId) mp = x; });
      if (!mp) return { ok: false, error: "not-found" };
      var p = this.planById(mp.planId);
      if (!p) return { ok: false, error: "plan-deleted" };
      var today = todayStr();
      var base = mp.endDate >= today ? mp.endDate : today;
      mp.endDate = addDays(base, p.days);
      mp.planName = p.name;
      mp.price = p.price;
      // Renewal fee us mahine ki hai jab renewed period START hota hai
      // (base) — current month ki nahi. Agar us mahine ka Membership
      // fee record pehle se ho to dobara mat banao.
      var feeMonth = monthOf(base);
      var fee = null, feeSkipped = false;
      if (this.feeExists(mp.memberId, feeMonth, "Membership")) { feeSkipped = true; }
      else { fee = this.addFee({ memberId: mp.memberId, type: "Membership", planName: p.name, month: feeMonth, amount: p.price }); }
      this.save();
      return { ok: true, mp: mp, fee: fee, feeSkipped: feeSkipped, feeMonth: feeMonth };
    },

    /* ----- Fees & payments ----- */
    feeExists: function (memberId, month, type) {
      return state.fees.some(function (f) { return f.memberId === memberId && f.month === month && f.type === type; });
    },
    removeFee: function (feeId) {
      // Sirf bina payment wala (paid === 0) record delete ho sakta hai —
      // Paid record delete karne se payment history aur totals bigad jayenge.
      var idx = -1;
      state.fees.forEach(function (f, i) { if (f.id === feeId) idx = i; });
      if (idx < 0 || state.fees[idx].paid !== 0) return false;
      state.fees.splice(idx, 1);
      this.save();
      return true;
    },
    addFee: function (o) {
      var m = this.memberById(o.memberId);
      if (!m) return null;
      var rec = {
        id: uid("F"), memberId: m.id, member: m.name,
        type: o.type || "Membership", planName: o.planName || "",
        period: monthLabel(o.month || monthOf(todayStr())), month: o.month || monthOf(todayStr()),
        amount: o.amount, paid: 0, due: o.amount, status: "Due", date: ""
      };
      state.fees.push(rec);
      this.save();
      return rec;
    },
    feesFor: function (month, type) {
      return state.fees.filter(function (f) {
        var okM = !month || month === "All" || f.month === month;
        var okT = !type || type === "All" || f.type === type;
        return okM && okT;
      });
    },
    feeTotals: function (month) {
      var billed = 0, collected = 0, due = 0;
      var dueMembers = {};
      this.feesFor(month, "All").forEach(function (f) {
        billed += f.amount; collected += f.paid; due += f.due;
        if (f.due > 0) dueMembers[f.memberId] = true;
      });
      return { billed: billed, collected: collected, due: due, defaulters: Object.keys(dueMembers).length };
    },
    feeById: function (id) {
      for (var i = 0; i < state.fees.length; i++) if (state.fees[i].id === id) return state.fees[i];
      return null;
    },
    collectPayment: function (feeId, amount, method) {
      var f = this.feeById(feeId);
      if (!f) return null;
      var applied = Math.min(amount, f.due);
      var overpaid = amount - applied;
      if (applied <= 0) return { fee: f, applied: 0, overpaid: overpaid };
      f.paid += applied; f.due -= applied;
      f.status = f.due === 0 ? "Paid" : "Due";
      if (f.due === 0) f.date = todayStr();
      state.payments.push({ id: uid("PAY"), feeId: feeId, memberId: f.memberId, member: f.member, amount: applied, date: todayStr(), method: method || "Cash" });
      this.save();
      return { fee: f, applied: applied, overpaid: overpaid };
    },
    paymentsRecent: function (n) {
      return state.payments.slice().reverse().slice(0, n || 30);
    },
    paymentsForMember: function (memberId) {
      return state.payments.filter(function (p) { return p.memberId === memberId; }).slice().reverse();
    },
    collectedToday: function () {
      var today = todayStr(), sum = 0;
      state.payments.forEach(function (p) { if (p.date === today) sum += p.amount; });
      return sum;
    },
    defaulters: function (month) {
      var map = {};
      state.fees.forEach(function (f) {
        if (f.due <= 0) return;
        // Month diya ho (jaise "2026-08") to sirf us mahine ke unpaid
        // fees gino — nahi to August ke filter par November ke defaulter
        // dikhte hain, jabki member August mein join hi nahi hua tha.
        if (month && month !== "All" && f.month !== month) return;
        if (!map[f.memberId]) map[f.memberId] = { member: this.memberById(f.memberId), due: 0, fees: [] };
        map[f.memberId].due += f.due;
        map[f.memberId].fees.push(f);
      }, this);
      var list = Object.keys(map).map(function (k) { return map[k]; });
      list.sort(function (a, b) { return b.due - a.due; });
      return list;
    },
    expiringSoon: function (days) {
      var today = todayStr();
      var limit = addDays(today, days || 7);
      var list = [];
      state.memberPlans.forEach(function (mp) {
        if (mp.endDate >= today && mp.endDate <= limit) {
          var m = this.memberById(mp.memberId);
          if (!m || m.status !== "active") return;
          var daysLeft = Math.round((new Date(mp.endDate + "T00:00:00+05:30") - new Date(today + "T00:00:00+05:30")) / 86400000);
          list.push({ member: m, planName: mp.planName, endDate: mp.endDate, daysLeft: daysLeft, mpId: mp.id });
        }
      }, this);
      list.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
      return list;
    },

    /* ----- Attendance ----- */
    attendanceFor: function (date) { return state.attendance[date] || {}; },
    saveAttendance: function (date, map) {
      state.attendance[date] = map;
      this.save();
    },
    attendanceLatest: function () {
      var keys = Object.keys(state.attendance);
      if (!keys.length) return { key: "", map: {} };
      var latest = keys.sort().pop();
      return { key: latest, map: state.attendance[latest] };
    },
    attendancePct: function () {
      var latest = this.attendanceLatest();
      var map = latest.map;
      var total = Object.keys(map).length, present = 0;
      Object.keys(map).forEach(function (k) { if (map[k] === "Present") present++; });
      return total ? Math.round(present / total * 100) : 0;
    },
    presentToday: function () {
      var map = this.attendanceFor(todayStr());
      var total = Object.keys(map).length, present = 0;
      Object.keys(map).forEach(function (k) { if (map[k] === "Present") present++; });
      return { present: present, total: total };
    },

    /* ----- Diet / workout (per member) ----- */
    extrasFor: function (memberId) { return state.extras[memberId] || { diet: "", workout: "" }; },
    saveExtras: function (memberId, o) {
      state.extras[memberId] = { diet: o.diet || "", workout: o.workout || "" };
      this.save();
    },

    /* ----- Notices & expenses ----- */
    addNotice: function (n) { n.id = uid("N"); n.date = n.date || todayStr(); state.notices.unshift(n); this.save(); return n; },
    deleteNotice: function (id) { state.notices = state.notices.filter(function (n) { return n.id !== id; }); this.save(); },
    addExpense: function (e) { e.id = uid("EX"); state.expenses.push(e); this.save(); return e; },
    deleteExpense: function (id) { state.expenses = state.expenses.filter(function (e) { return e.id !== id; }); this.save(); },
    expenseTotal: function () {
      return state.expenses.reduce(function (a, e) { return a + e.amount; }, 0);
    },

    /* ----- Export / import ----- */
    exportJSON: function () { return JSON.stringify(state, null, 2); },
    importJSON: function (str) {
      try {
        var data = JSON.parse(str);
        if (!data || data.version !== 1 || !data.settings || !Array.isArray(data.members)) return false;
        state = data;
        this.save();
        this.migrateMonthlyFees();
        this.ensureMonthlyDues();
        // A huge backup (e.g. many photos) can exceed localStorage — then
        // the import must report failure, not pretend it worked.
        return this.lastSaveError() ? false : true;
      } catch (e) { return false; }
    }
  };
})();
