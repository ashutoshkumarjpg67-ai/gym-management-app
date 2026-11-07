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

  function seed() {
    return {
      version: 1,
      settings: { gymName: "SPARTAN FITNESS", city: "Gopalganj", ownerName: "" },
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
  function loadFromStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function saveToStore(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }
  // Step 2 stubs — fill these in when Supabase is connected. app.js does
  // not call them directly; it calls the public functions below.
  function supabaseFetch() { throw new Error("Supabase not configured yet. Set USE_SUPABASE and fill config.js."); }
  function supabaseSave() { throw new Error("Supabase not configured yet. Set USE_SUPABASE and fill config.js."); }

  var state = loadFromStore();
  if (!state || state.version !== 1) { state = seed(); saveToStore(state); }

  /* ---------- Public API (only thing app.js uses) ---------- */
  window.GymData = {
    getState: function () { return state; },
    save: function () { if (CFG.USE_SUPABASE) { supabaseSave(state); } else { saveToStore(state); } },
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
      this.save();
      return state.settings;
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
      state.members.push(m);
      this.save();
      return m;
    },
    updateMember: function (id, fields) {
      var m = this.memberById(id);
      if (!m) return null;
      Object.keys(fields).forEach(function (k) { if (fields[k] !== undefined) m[k] = fields[k]; });
      this.save();
      return m;
    },
    archiveMember: function (id) {
      var m = this.memberById(id);
      if (!m) return false;
      m.status = "archived";
      this.save();
      return true;
    },

    /* ----- Plans ----- */
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
      var fee = this.addFee({ memberId: memberId, type: "Membership", planName: p.name, month: monthOf(start), amount: p.price });
      this.save();
      return { ok: true, mp: mp, fee: fee };
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
      var fee = this.addFee({ memberId: mp.memberId, type: "Membership", planName: p.name, month: monthOf(today), amount: p.price });
      this.save();
      return { ok: true, mp: mp, fee: fee };
    },

    /* ----- Fees & payments ----- */
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
    defaulters: function () {
      var map = {};
      state.fees.forEach(function (f) {
        if (f.due <= 0) return;
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
        return true;
      } catch (e) { return false; }
    }
  };
})();
