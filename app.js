/* Gym Management App — app.js
 * UI only. All data comes from window.GymData (data.js).
 * No localStorage access here, no fetch, no backend calls.
 * Follows the VidyaSetu app.js pattern (IIFE, $/esc/inr helpers,
 * showSection, renderSection dispatch, modal, forms).
 */
(function () {
  var D = window.GymData;
  var CFG = window.GYM_CONFIG;
  var rs = CFG.CURRENCY;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function inr(n) { return rs + Number(n || 0).toLocaleString("en-IN"); }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(function (w) { return w; });
    if (!parts.length) return "?";
    return parts.map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase();
  }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
  function setHTML(id, html) { var el = $(id); if (el) el.innerHTML = html; }
  function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
  function scrollToEl(el) { if (el && typeof el.scrollIntoView === "function") { try { el.scrollIntoView({ behavior: "smooth" }); } catch (e) {} } }
  function fv(form, name) { var el = form.elements ? form.elements[name] : null; return el ? el.value : ""; }
  function digitsOnly(phone) { return String(phone || "").replace(/\D/g, ""); }
  function waLink(phone, text) { return "https://wa.me/" + digitsOnly(phone) + "?text=" + encodeURIComponent(text); }

  var REDUCED = false;
  try { REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  /* Number count-up: Home stats 0 se final value tak smoothly badhein.
     Sirf visual hai — data same rehta hai. Reduced-motion ya bina-rAF
     environment par seedha final value (jsdom-safe). */
  function animateNum(el, to, format) {
    if (!el) return;
    if (REDUCED || !window.requestAnimationFrame) { el.textContent = format(to); return; }
    var start = null, dur = 450;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(Math.round(to * e));
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
  /* Rich empty state: icon + title + hint + optional action button */
  function emptyHTML(icon, title, sub, btn) {
    var b = btn ? "<button class='btn small' id='" + btn.id + "'>" + esc(btn.label) + "</button>" : "";
    return "<div class='empty rich'><div class='empty-ic'>" + icon + "</div><div class='empty-t'>" + esc(title) + "</div><div class='empty-s'>" + esc(sub) + "</div>" + b + "</div>";
  }
  function wireEmptyBtn(id, fn) { var b = document.getElementById(id); if (b) b.addEventListener("click", fn); }

  /* ---------- Member photo ----------
     Admission ke time photo li jati hai aur client-side canvas par
     compress hokar member record me data URL ke roop me save hoti hai.
     localStorage ~5MB ka hota hai, isliye photo chhoti rakhna zaroori hai:
     max side 512px, JPEG q0.7 (~30-80KB). Badi nikli to retry chhota. */
  var PHOTO_MAX_CHARS = 110000; // data-URL chars ≈ 82KB binary
  // Stored-JSON ka safe budget (chars). Chrome/Android localStorage quota
  // ~5MB hai aur har character ~2 bytes gina jata hai (UTF-16), isliye
  // hard cap ~2.6M chars hota hai — guard 2.0M par rakha hai taaki quota
  // error aane se pehle hi nayi photo bina save ho (admission kabhi fail na ho).
  var STORAGE_SAFE_CHARS = 2000000;
  function photoTargetSize(w, h, maxSide) {
    if (!w || !h) return { w: 0, h: 0 };
    var s = Math.min(1, maxSide / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }
  function loadBitmap(file) {
    // Phone photo ki orientation: createImageBitmap with
    // imageOrientation:'from-image' EXIF rotation fix karta hai (Chrome/Android).
    // Na mile to plain createImageBitmap, phir Image + object URL fallback.
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () {
        return createImageBitmap(file);
      });
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("img load failed")); };
      img.src = url;
    });
  }
  function drawToJpeg(bmp, maxSide, quality) {
    try {
      var c = document.createElement("canvas");
      var t = photoTargetSize(bmp.width, bmp.height, maxSide);
      c.width = t.w; c.height = t.h;
      var ctx = c.getContext("2d");
      if (!ctx) return null; // canvas unavailable (old browser / jsdom) — no photo
      ctx.drawImage(bmp, 0, 0, t.w, t.h);
      var url = c.toDataURL("image/jpeg", quality);
      return (url && url.indexOf("data:image/jpeg") === 0) ? url : null;
    } catch (e) { return null; }
  }
  function compressPhoto(file) {
    return new Promise(function (resolve) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) { resolve(null); return; }
      var done = false;
      var finish = function (v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function () { finish(null); }, 8000); // safety: kabhi hang na ho
      loadBitmap(file).then(function (bmp) {
        if (!bmp) { finish(null); return; }
        var url = drawToJpeg(bmp, 512, 0.7);
        if (!url) { finish(null); return; }
        if (url.length > PHOTO_MAX_CHARS) url = drawToJpeg(bmp, 384, 0.6) || url;
        if (url.length > PHOTO_MAX_CHARS) { var u2 = drawToJpeg(bmp, 256, 0.55); if (u2) url = u2; }
        finish(url);
      }).catch(function () { finish(null); });
    });
  }
  // Test hook (compression logic ko jsdom se test karne ke liye).
  window.GymPhoto = { compressPhoto: compressPhoto, targetSize: photoTargetSize, MAX_CHARS: PHOTO_MAX_CHARS, SAFE_CHARS: STORAGE_SAFE_CHARS };
  /* Avatar: photo ho to gol photo, nahi to pehle jaisa initials avatar */
  function avatarHTML(m, lg) {
    var cls = "avatar" + (lg ? " lg" : "");
    if (m && m.photo) return "<span class='" + cls + "'><img src='" + esc(m.photo) + "' alt=''></span>";
    return "<span class='" + cls + "'>" + esc(initials(m ? m.name : "")) + "</span>";
  }

  var currentSection = "home";
  var feeTab = "records";
  var feeMonth = D.todayStr().slice(0, 7);
  var currentMemberId = null;
  var currentMpId = null;
  var payFeeId = null;
  var attWorking = {};

  var TITLES = {
    home: ["Home", "Today's summary — collection, attendance and due fees at a glance."],
    members: ["Members", "All members — search and filter by trainer. Add a new member here."],
    fees: ["Fees", "Fee summary — choose a month. Collect payments and get receipts here."],
    attendance: ["Attendance", "Pick a date — then mark Present / Absent and save."],
    more: ["More", "Trainers, notices, settings and data backup — all here."],
  };

  /* ---------- Navigation ---------- */
  function showSection(name) {
    currentSection = name;
    // Purane section ke confirmation messages naye section mein nahi
    // dikhne chahiye — section badalte hi clear.
    ["memberMsg", "addFeeMsg", "attMsg", "importMsg", "settingsMsg"].forEach(function (id) { setText(id, ""); });
    document.querySelectorAll(".section").forEach(function (el) { el.classList.toggle("active", el.id === "section-" + name); });
    document.querySelectorAll("[data-nav]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-nav") === name); });
    var t = TITLES[name] || [name, ""];
    setText("topTitle", t[0]);
    renderSection(name);
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  document.querySelectorAll("[data-nav]").forEach(function (b) {
    b.addEventListener("click", function () { showSection(b.getAttribute("data-nav")); });
  });

  function renderSection(name) {
    if (name === "home") renderHome();
    else if (name === "members") renderMembers();
    else if (name === "fees") renderFees();
    else if (name === "attendance") renderAttendance();
    else if (name === "more") renderMore();
  }

  /* ---------- Settings / gym name / logo ---------- */
  function applySettings() {
    var s = D.settings();
    setText("gymNameTop", s.gymName);
    setText("gymNameSide", s.gymName);
    setText("gymCitySide", s.city || "");
    var logo = s.logo || "icon.svg";
    var side = $("gymLogoSide"); if (side) side.src = logo;
    var top = $("gymLogoTop"); if (top) top.src = logo;
    document.title = "Gym Management App — " + s.gymName + (s.city ? ", " + s.city : "");
  }

  /* ---------- Auth (v1.4): login / signup / migration ----------
     Login se pehle app ka koi data dikhna nahi chahiye — boot() tab tak
     .app + bottomNav hidden rakhta hai aur sirf auth screen dikhata hai.
     Auth/data layer: window.GymAuth (auth.js) + window.GymData (data.js).
     app.js yahan bhi localStorage ko seedha nahi chhuta. */
  function showAuthErr(id, msg) {
    var el = $(id);
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; }
    else { el.textContent = ""; el.hidden = true; }
  }
  function showAuth(mode) {
    var screen = $("authScreen");
    if (screen) screen.hidden = false;
    var app = document.querySelector(".app");
    if (app) app.hidden = true;
    var bn = $("bottomNav");
    if (bn) bn.hidden = true;
    ["loginForm", "signupForm", "migrateForm"].forEach(function (id) {
      var f = $(id);
      if (f) f.hidden = (id !== mode + "Form");
    });
    if (mode === "migrate") prefillMigrate();
  }
  function enterApp(account) {
    D.initForAccount(account.id, { gymName: account.gymName, city: account.city, ownerName: account.ownerName, logo: account.logo });
    applySettings();
    fillSelects();
    if ($("attDate")) $("attDate").value = D.todayStr();
    renderSection("home");
    var screen = $("authScreen");
    if (screen) screen.hidden = true;
    var app = document.querySelector(".app");
    if (app) app.hidden = false;
    var bn = $("bottomNav");
    if (bn) bn.hidden = false;
  }
  function boot() {
    var acct = null;
    try { acct = window.GymAuth.currentAccount(); } catch (e) { acct = null; }
    if (acct) { enterApp(acct); return; }
    var hasLegacy = false;
    try { hasLegacy = window.GymAuth.hasLegacyData(); } catch (e) { hasLegacy = false; }
    if (hasLegacy) showAuth("migrate");
    else showAuth("login");
  }

  /* ----- Migration form prefill (legacy settings + counts) ----- */
  function prefillMigrate() {
    var legacy = null;
    try { legacy = window.GymAuth.readLegacy(); } catch (e) { legacy = null; }
    if (!legacy) return;
    var f = $("migrateForm");
    if (f) {
      var ls = legacy.settings || {};
      if (f.elements["gymName"]) f.elements["gymName"].value = ls.gymName || "";
      if (f.elements["city"]) f.elements["city"].value = ls.city || "";
      if (f.elements["ownerName"]) f.elements["ownerName"].value = ls.ownerName || "";
    }
    var nm = (legacy.members || []).length;
    var np = (legacy.plans || []).length;
    var gname = (legacy.settings && legacy.settings.gymName) || "Your gym";
    setText("migrateInfo", gname + " old data found — " + nm + (nm === 1 ? " member, " : " members, ") + np + (np === 1 ? " plan. " : " plans. ") + "Set your Gmail and password and your data will move to the new account.");
  }

  /* ----- Logo picker (signup / migrate / settings) -----
     Member photo picker jaisa hi pattern: camera/gallery → compressPhoto
     (canvas, max 512px JPEG q0.7) → gol preview; na ho to dumbbell. */
  function wireLogoPicker(p) {
    var value = null; // compressed JPEG data URL, ya null (koi logo nahi)
    var statusEl = p.status ? $(p.status) : null;
    var statusDefault = statusEl ? statusEl.textContent : "";
    function render() {
      var prev = p.preview ? $(p.preview) : null;
      if (prev) {
        if (value) prev.innerHTML = "<img src='" + esc(value) + "' alt='Gym logo'>";
        else prev.innerHTML = "<span>🏋️</span>";
      }
      var rm = p.removeBtn ? $(p.removeBtn) : null;
      if (rm) rm.hidden = !value;
    }
    function handleFile(file) {
      if (!file) return;
      setText(p.status, "Compressing logo…");
      compressPhoto(file).then(function (url) {
        if (url) {
          value = url;
          setText(p.status, "Logo ready ✓ ~" + Math.round(url.length / 1024) + "KB — auto-compressed on save.");
        } else {
          value = null;
          setText(p.status, "Logo could not be compressed — continue without a logo. Try again.");
        }
        render();
      });
    }
    function clickInput(id) { var i = $(id); if (i) i.click(); }
    on(p.cameraBtn, "click", function () { clickInput(p.cameraInput); });
    on(p.galleryBtn, "click", function () { clickInput(p.galleryInput); });
    on(p.cameraInput, "change", function (e) { handleFile(e.target.files && e.target.files[0]); e.target.value = ""; });
    on(p.galleryInput, "change", function (e) { handleFile(e.target.files && e.target.files[0]); e.target.value = ""; });
    on(p.removeBtn, "click", function () { value = null; setText(p.status, "Logo removed."); render(); });
    return {
      get: function () { return value; },
      set: function (v) { value = v || null; render(); },
      reset: function () { value = null; setText(p.status, statusDefault); render(); }
    };
  }
  var signupLogoPicker = wireLogoPicker({ preview: "suLogoPreview", cameraBtn: "suLogoCameraBtn", galleryBtn: "suLogoGalleryBtn", cameraInput: "suLogoCameraInput", galleryInput: "suLogoGalleryInput", removeBtn: "suLogoRemoveBtn", status: "suLogoStatus" });
  var migrateLogoPicker = wireLogoPicker({ preview: "migLogoPreview", cameraBtn: "migLogoCameraBtn", galleryBtn: "migLogoGalleryBtn", cameraInput: "migLogoCameraInput", galleryInput: "migLogoGalleryInput", removeBtn: "migLogoRemoveBtn", status: "migLogoStatus" });
  var settingsLogoPicker = wireLogoPicker({ preview: "setLogoPreview", cameraBtn: "setLogoCameraBtn", galleryBtn: "setLogoGalleryBtn", cameraInput: "setLogoCameraInput", galleryInput: "setLogoGalleryInput", removeBtn: "setLogoRemoveBtn", status: "setLogoStatus" });

  /* ----- Password eye toggle ----- */
  document.querySelectorAll(".pw-eye").forEach(function (b) {
    b.addEventListener("click", function () {
      var input = $(b.getAttribute("data-target"));
      if (!input) return;
      if (input.type === "password") { input.type = "text"; b.textContent = "🙈"; }
      else { input.type = "password"; b.textContent = "👁"; }
    });
  });

  /* ----- Auth form switch ----- */
  on("toSignup", "click", function () { showAuth("signup"); });
  on("toLogin", "click", function () { showAuth("login"); });

  /* ----- Shared validation (signup + migration) ----- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function validateAuthForm(f) {
    var email = fv(f, "email").trim().toLowerCase();
    var password = fv(f, "password");
    var confirm = fv(f, "confirm");
    var gymName = fv(f, "gymName").trim();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid Gmail address." };
    if (!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters long." };
    if (password !== confirm) return { ok: false, error: "Passwords do not match — re-enter the same password." };
    if (!gymName) return { ok: false, error: "Enter the gym name." };
    return { ok: true, email: email, password: password, gymName: gymName, city: fv(f, "city").trim(), ownerName: fv(f, "ownerName").trim() };
  }
  function authErrorText(res) {
    if (!res) return "Something went wrong — try again.";
    if (res.error === "email-exists") return "An account with this Gmail already exists — please log in.";
    if (res.error === "invalid-email") return "Enter a valid Gmail address.";
    if (res.error === "weak-password") return "Password must be at least 6 characters long.";
    if (res.error === "no-gym-name") return "Enter the gym name.";
    if (res.error === "no-crypto") return "Secure login is not available in this browser.";
    return "Something went wrong — try again.";
  }
  function setBusy(form, busy, busyText) {
    var btn = form ? form.querySelector("button[type=submit]") : null;
    if (!btn) return;
    if (busy) {
      if (!btn.getAttribute("data-label")) btn.setAttribute("data-label", btn.textContent);
      btn.disabled = true;
      btn.textContent = busyText;
    } else {
      btn.disabled = false;
      var old = btn.getAttribute("data-label");
      if (old) btn.textContent = old;
    }
  }

  /* ----- LOGIN ----- */
  on("loginForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var email = fv(f, "email").trim().toLowerCase();
    var password = fv(f, "password");
    showAuthErr("loginErr", "");
    setBusy(f, true, "Logging in…");
    window.GymAuth.login(email, password).then(function (res) {
      setBusy(f, false);
      if (res && res.ok) { enterApp(res.account); return; }
      var msg = "Login failed — try again.";
      if (res && res.error === "wrong-password") msg = "Wrong Gmail or password.";
      else if (res && res.error === "no-account") msg = "No account with this Gmail — please sign up first.";
      else if (res && res.error === "no-crypto") msg = "Secure login is not available in this browser.";
      showAuthErr("loginErr", msg);
    });
  });

  /* ----- SIGNUP ----- */
  on("signupForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var v = validateAuthForm(f);
    if (!v.ok) { showAuthErr("signupErr", v.error); return; }
    showAuthErr("signupErr", "");
    setBusy(f, true, "Creating account…");
    window.GymAuth.createAccount({ email: v.email, password: v.password, gymName: v.gymName, city: v.city, ownerName: v.ownerName, logo: signupLogoPicker.get() || "" }).then(function (res) {
      setBusy(f, false);
      if (res && res.ok) { enterApp(res.account); return; }
      showAuthErr("signupErr", authErrorText(res));
    });
  });

  /* ----- MIGRATION: purana data naye account me -----
     Order: (1) legacy padho (2) account banao — fail ho to legacy ko
     haath mat lagao (3) account ka store init karo (4) legacy state
     replace karo (5) VERIFY karke hi legacy clear karo — verify fail
     ho to purana data safe rehta hai aur user dobara try kar sakta hai. */
  on("migrateForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var v = validateAuthForm(f);
    if (!v.ok) { showAuthErr("migrateErr", v.error); return; }
    showAuthErr("migrateErr", "");
    setBusy(f, true, "Creating account…");
    var legacy = null;
    try { legacy = window.GymAuth.readLegacy(); } catch (err) { legacy = null; }
    if (!legacy) {
      setBusy(f, false);
      showAuthErr("migrateErr", "Old data not found — reload and try again.");
      return;
    }
    window.GymAuth.createAccount({ email: v.email, password: v.password, gymName: v.gymName, city: v.city, ownerName: v.ownerName, logo: migrateLogoPicker.get() || "" }).then(function (res) {
      if (!res || !res.ok) {
        setBusy(f, false);
        showAuthErr("migrateErr", authErrorText(res));
        return;
      }
      var account = res.account;
      D.initForAccount(account.id, { gymName: v.gymName, city: v.city, ownerName: v.ownerName, logo: migrateLogoPicker.get() || "" });
      var ok = false;
      try { ok = D.replaceState(legacy); } catch (err) { ok = false; }
      var verified = false;
      if (ok) {
        var back = null;
        try { back = D.readRaw(); } catch (err) { back = null; }
        if (back && Array.isArray(back.members) && Array.isArray(back.plans) && back.settings &&
            back.members.length === (legacy.members || []).length &&
            back.plans.length === (legacy.plans || []).length &&
            back.settings.gymName === (legacy.settings && legacy.settings.gymName)) verified = true;
      }
      if (!verified) {
        setBusy(f, false);
        showAuthErr("migrateErr", "Data copy could not be verified — your old data is safe, try again.");
        return;
      }
      try { window.GymAuth.clearLegacy(); } catch (err) {}
      enterApp(account);
    });
  });

  /* ----- LOGOUT: sirf session clear — data delete NAHI hota ----- */
  on("logoutBtn", "click", function () {
    try { window.GymAuth.logout(); } catch (e) {}
    currentMemberId = null;
    ["loginForm", "signupForm", "migrateForm"].forEach(function (id) {
      var form = $(id);
      if (form) form.reset();
    });
    showAuthErr("loginErr", "");
    showAuthErr("signupErr", "");
    showAuthErr("migrateErr", "");
    showAuth("login");
  });

  /* ---------- Selects ---------- */
  function fillSelects() {
    var trainers = D.trainersList();
    var tf = $("memberTrainerFilter");
    if (tf) {
      var keepT = tf.value;
      tf.innerHTML = "";
      var oAll = document.createElement("option"); oAll.value = "All"; oAll.textContent = "All Trainers"; tf.appendChild(oAll);
      trainers.forEach(function (t) { var o = document.createElement("option"); o.value = t.id; o.textContent = t.name; tf.appendChild(o); });
      if (keepT) tf.value = keepT;
    }
    var fs = $("feeStudent");
    if (fs) {
      var keepS = fs.value;
      fs.innerHTML = "";
      D.membersList("active").forEach(function (m) { var o = document.createElement("option"); o.value = m.id; o.textContent = m.name; fs.appendChild(o); });
      if (keepS) fs.value = keepS;
    }
    var fm = $("feeMonthFilter");
    if (fm && !fm.options.length) {
      var oM = document.createElement("option"); oM.value = "All"; oM.textContent = "All Months"; fm.appendChild(oM);
      D.feeMonths().forEach(function (m) { var o = document.createElement("option"); o.value = m.value; o.textContent = m.label; fm.appendChild(o); });
      fm.value = feeMonth;
    }
    var am = $("feeMonth");
    if (am && !am.options.length) {
      D.feeMonths().forEach(function (m) { var o = document.createElement("option"); o.value = m.value; o.textContent = m.label; am.appendChild(o); });
      am.value = feeMonth;
    }
  }
  function trainerName(id) {
    if (!id) return "—";
    var found = null;
    D.trainersList().forEach(function (t) { if (t.id === id) found = t; });
    return found ? found.name : "—";
  }

  /* ---------- Home ---------- */
  function renderHome() {
    var pt = D.presentToday();
    animateNum($("statCollected"), D.collectedToday(), inr);
    animateNum($("statPresent"), pt.present, function (v) { return v + " / " + pt.total; });
    animateNum($("statActive"), D.membersList("active").length, function (v) { return String(v); });
    animateNum($("statDue"), D.feeTotals("All").due, inr);

    var defs = D.defaulters();
    var att = "";
    defs.forEach(function (d) {
      var name = d.member ? d.member.name : "";
      att += "<div class='list-row'><div class='grow'><div class='t'>" + esc(name) + "</div><div class='s'>Fees due — " + inr(d.due) + "</div></div><span class='badge due'>Due</span></div>";
    });
    setHTML("attentionList", att || emptyHTML("✅", "All good", "No due fees."));

    var pays = D.paymentsRecent(10);
    setHTML("recentPayments", pays.map(function (p) {
      return "<div class='list-row'><div class='grow'><div class='t'>" + esc(p.member) + "</div><div class='s'>" + esc(p.method || "Cash") + " • " + D.fmtDate(p.date) + "</div></div><b>" + inr(p.amount) + "</b></div>";
    }).join("") || emptyHTML("🧾", "No payments yet", "Your first collected payment will show here."));
  }

  /* ---------- Members ---------- */
  function renderMembers() {
    var q = ($("memberSearch") ? $("memberSearch").value : "").toLowerCase();
    var tr = $("memberTrainerFilter") ? $("memberTrainerFilter").value : "All";
    var list = D.membersList("active").filter(function (m) {
      if (q && m.name.toLowerCase().indexOf(q) === -1 && String(m.phone || "").indexOf(q) === -1) return false;
      if (tr && tr !== "All" && m.trainerId !== tr) return false;
      return true;
    });
    setHTML("memberRows", list.map(function (m) {
      return "<tr data-member='" + m.id + "'><td>" + avatarHTML(m) + " " + esc(m.name) + "</td>" +
        "<td>" + (m.age || "—") + "</td><td>" + esc(m.phone || "—") + "</td><td>" + (m.joinDate ? D.fmtDate(m.joinDate) : "—") + "</td>" +
        "<td>" + (m.monthlyFee ? inr(m.monthlyFee) + "/mo" : "—") + "</td><td><span class='badge paid'>Active</span></td></tr>";
    }).join("") || "<tr><td colspan='6' class='empty-cell'>" + emptyHTML("👥", "No members yet", "Start by adding a member.", { id: "emptyAddMember", label: "+ Add Member" }) + "</td></tr>");
    var rowsEl = $("memberRows");
    if (rowsEl) rowsEl.querySelectorAll("[data-member]").forEach(function (r) {
      r.addEventListener("click", function () { openMember(r.getAttribute("data-member")); });
    });
    wireEmptyBtn("emptyAddMember", function () { var b = $("newMemberBtn"); if (b) b.click(); });
  }
  on("memberSearch", "input", renderMembers);
  on("memberTrainerFilter", "change", renderMembers);

  function fillMemberFormTrainers() {
    var sel = $("memberForm") ? $("memberForm").elements["trainerId"] : null;
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = "";
    var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "No Trainer"; sel.appendChild(o0);
    D.trainersList().forEach(function (t) { var o = document.createElement("option"); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
    if (keep) sel.value = keep;
  }

  function openMember(id) {
    var m = D.memberById(id);
    if (!m) return;
    currentMemberId = id;
    setHTML("memberProfile",
      "<div class='list-row'>" + avatarHTML(m, true) + "<div class='grow'><div class='t'>" + esc(m.name) + "</div><div class='s'>Joined " + D.fmtDate(m.joinDate) + (m.monthlyFee ? " • " + inr(m.monthlyFee) + "/month" : "") + " • " + esc(m.status || "active") + "</div></div></div>" +
      "<div class='kv'><dt>Age</dt><dd>" + (m.age || "—") + "</dd><dt>Phone</dt><dd>" + esc(m.phone || "—") + "</dd><dt>Gender</dt><dd>" + esc(m.gender || "—") + "</dd><dt>Weight</dt><dd>" + (m.weight ? esc(m.weight) + " kg" : "—") + "</dd><dt>Goal</dt><dd>" + esc(m.goal || "—") + "</dd><dt>Trainer</dt><dd>" + esc(trainerName(m.trainerId)) + "</dd></div>");
    var ex = D.extrasFor(id);
    if ($("dietText")) $("dietText").value = ex.diet || "";
    if ($("workoutText")) $("workoutText").value = ex.workout || "";

    var fees = D.feesFor("All", "All").filter(function (f) { return f.memberId === id; });
    setHTML("memberFeeRows", fees.map(function (f) {
      return "<tr><td>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + "</td><td>" + esc(f.period) + "</td><td>" + inr(f.amount) + "</td><td>" + inr(f.paid) + "</td><td>" + inr(f.due) + "</td><td><span class='badge " + (f.status === "Paid" ? "paid" : "due") + "'>" + f.status + "</span></td></tr>";
    }).join("") || "<tr><td colspan='6' class='empty-cell'>" + emptyHTML("🧾", "No fee records", "This member has no fee records.") + "</td></tr>");

    var attMap = D.getState().attendance || {};
    var dates = Object.keys(attMap).sort().reverse().slice(0, 7);
    setHTML("memberAttRecent", dates.map(function (d) {
      var v = attMap[d][id];
      return "<div class='list-row'><div class='grow'><div class='t'>" + D.fmtDate(d) + "</div></div><span class='badge " + (v === "Present" ? "paid" : v === "Absent" ? "due" : "info") + "'>" + esc(v || "—") + "</span></div>";
    }).join("") || emptyHTML("✓", "No attendance yet", "It will show here once attendance is marked."));

    if ($("memberCard")) { $("memberCard").hidden = false; scrollToEl($("memberCard")); }
  }

  on("saveExtrasBtn", "click", function () {
    if (!currentMemberId) return;
    D.saveExtras(currentMemberId, { diet: $("dietText") ? $("dietText").value.trim() : "", workout: $("workoutText") ? $("workoutText").value.trim() : "" });
    if ($("saveExtrasBtn")) $("saveExtrasBtn").textContent = "Saved ✓";
    setTimeout(function () { if ($("saveExtrasBtn")) $("saveExtrasBtn").textContent = "Save Diet / Workout"; }, 2000);
  });
  on("closeMemberBtn", "click", function () { if ($("memberCard")) $("memberCard").hidden = true; currentMemberId = null; });
  on("editMemberBtn", "click", function () {
    var m = D.memberById(currentMemberId);
    if (!m) return;
    fillMemberFormTrainers();
    var f = $("memberForm");
    if (!f) return;
    f.elements["name"].value = m.name || "";
    f.elements["age"].value = m.age || "";
    f.elements["phone"].value = m.phone || "";
    f.elements["gender"].value = m.gender || "";
    f.elements["weight"].value = m.weight || "";
    f.elements["goal"].value = m.goal || "";
    f.elements["trainerId"].value = m.trainerId || "";
    f.elements["monthlyFee"].value = m.monthlyFee || "";
    f.elements["joinDate"].value = m.joinDate || D.todayStr();
    setText("memberFormTitle", "Edit Member");
    if ($("memberIdField")) $("memberIdField").value = m.id;
    pendingPhoto = m.photo || null;
    setText("photoStatus", pendingPhoto ? "Photo saved — take a new photo or remove it to change." : PHOTO_STATUS_DEFAULT);
    setPhotoPreview();
    setText("memberFormTitle", "Edit Member");
    if ($("memberFormCard")) { $("memberFormCard").hidden = false; scrollToEl($("memberFormCard")); }
  });
  on("archiveMemberBtn", "click", function () {
    var m = D.memberById(currentMemberId);
    if (!m) return;
    askConfirm("Archive member?", m.name + " will be archived. This cannot be undone.", "Yes, archive").then(function (ok) {
      if (!ok) return;
      D.archiveMember(m.id);
      if ($("memberCard")) $("memberCard").hidden = true;
      currentMemberId = null;
      renderMembers(); renderHome();
      setText("memberMsg", "✓ " + m.name + " archived.");
    });
  });
  /* ---------- Member photo picker (admission / edit form) ---------- */
  var pendingPhoto = null; // compressed JPEG data URL, ya null (koi photo nahi)
  var PHOTO_STATUS_DEFAULT = "Photo is auto-compressed on save (~50KB) so phone storage doesn't fill up.";
  function setPhotoPreview() {
    var prev = $("photoPreview");
    if (!prev) return;
    if (pendingPhoto) {
      prev.innerHTML = "<img src='" + esc(pendingPhoto) + "' alt='Member photo'>";
    } else {
      var f = $("memberForm");
      var nm = f && f.elements["name"] ? f.elements["name"].value : "";
      prev.innerHTML = "<span>" + esc(initials(nm)) + "</span>";
    }
    var rm = $("photoRemoveBtn");
    if (rm) rm.hidden = !pendingPhoto;
  }
  function resetPhotoPicker() {
    pendingPhoto = null;
    setText("photoStatus", PHOTO_STATUS_DEFAULT);
    setPhotoPreview();
  }
  function handlePhotoFile(file) {
    if (!file) return;
    setText("photoStatus", "Compressing photo…");
    compressPhoto(file).then(function (url) {
      if (url) {
        pendingPhoto = url;
        setText("photoStatus", "Photo ready ✓ ~" + Math.round(url.length / 1024) + "KB — auto-compressed on save.");
      } else {
        pendingPhoto = null;
        setText("photoStatus", "Photo could not be compressed — admission will continue without a photo. Try again.");
      }
      setPhotoPreview();
    });
  }
  function pickPhoto(inputId) { var i = $(inputId); if (i) i.click(); }
  on("photoCameraBtn", "click", function () { pickPhoto("photoCameraInput"); });
  on("photoGalleryBtn", "click", function () { pickPhoto("photoGalleryInput"); });
  on("photoCameraInput", "change", function (e) { handlePhotoFile(e.target.files && e.target.files[0]); e.target.value = ""; });
  on("photoGalleryInput", "change", function (e) { handlePhotoFile(e.target.files && e.target.files[0]); e.target.value = ""; });
  on("photoRemoveBtn", "click", function () {
    pendingPhoto = null;
    setText("photoStatus", "Photo removed.");
    setPhotoPreview();
  });
  // Naam type karte hi preview me initials update hon (jab tak photo na ho)
  on("memberForm", "input", function (e) {
    if (!pendingPhoto && e.target && e.target.name === "name") setPhotoPreview();
  });

  // Join Date: kuch phones/PWA mein date field par tap karne se native
  // calendar picker nahi khulta (field dikhta hai, par date badalti nahi).
  // Isliye tap par showPicker() se picker zabardasti kholo — jahan native
  // picker khud khul jata hai wahan ye call ignore/error hoti hai (catch).
  on("joinDateField", "click", function () {
    var el = $("joinDateField");
    if (el && el.showPicker) { try { el.showPicker(); } catch (e) {} }
  });

  on("newMemberBtn", "click", function () {
    fillMemberFormTrainers();
    var f = $("memberForm");
    if (!f) return;
    f.reset();
    resetPhotoPicker();
    if ($("memberIdField")) $("memberIdField").value = "";
    f.elements["joinDate"].value = D.todayStr();
    setText("memberFormTitle", "Add Member");
    if ($("memberFormCard")) { $("memberFormCard").hidden = false; scrollToEl($("memberFormCard")); }
  });
  on("memberCancel", "click", function () { if ($("memberFormCard")) $("memberFormCard").hidden = true; resetPhotoPicker(); });
  on("memberForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var name = fv(f, "name").trim();
    if (!name) return;
    var id = $("memberIdField") ? $("memberIdField").value : "";
    var photo = pendingPhoto || "";
    var photoDropped = false;
    // Proactive guard: photo se stored JSON safe budget (~4MB) paar ho jaye
    // to photo ke bina save karo — quota error ka wait mat karo.
    if (photo) {
      var info = D.storageInfo();
      if (info.bytes + photo.length + 200 > STORAGE_SAFE_CHARS) { photo = ""; photoDropped = true; }
    }
    var fields = {
      name: name,
      age: parseInt(fv(f, "age"), 10) || "",
      phone: fv(f, "phone").trim(),
      gender: fv(f, "gender"),
      weight: fv(f, "weight").trim(),
      goal: fv(f, "goal").trim(),
      trainerId: fv(f, "trainerId"),
      monthlyFee: parseInt(fv(f, "monthlyFee"), 10) || 0,
      joinDate: fv(f, "joinDate") || D.todayStr(),
      photo: photo
    };
    var saved = null;
    if (id) {
      var m0 = D.memberById(id);
      var oldCopy = m0 ? Object.assign({}, m0) : null;
      saved = D.updateMember(id, fields);
      if (D.lastSaveError() === "quota") {
        if (photo) {
          D.updateMember(id, { photo: "" });
          if (D.lastSaveError() === "quota") {
            if (oldCopy && m0) Object.assign(m0, oldCopy);
            return failQuotaSave();
          }
          photoDropped = true;
        } else {
          if (oldCopy && m0) Object.assign(m0, oldCopy);
          return failQuotaSave();
        }
      }
    } else {
      saved = D.addMember(fields);
      if (D.lastSaveError() === "quota") {
        if (photo) {
          D.updateMember(saved.id, { photo: "" });
          if (D.lastSaveError() === "quota") { D.removeMember(saved.id); return failQuotaSave(); }
          photoDropped = true;
        } else { D.removeMember(saved.id); return failQuotaSave(); }
      }
    }
    // Monthly fee save hote hi admission date se aaj tak ke saare mahinon
    // ki Due fee records ban jati hain (data.js ensureMonthlyDues) — har
    // mahine usi date ko (7 Jul join to 7 Aug, 7 Sep...), current month
    // tak. Aane wale mahine ki fee nahi banti. Isliye member turant
    // defaulter list mein dikhta hai, bina plan ke.
    if (photoDropped) setText("memberMsg", "⚠️ Storage is almost full — member saved without photo. Take a backup from More → Data → Export, then delete old data to add the photo again.");
    else if (saved && saved.monthlyFee) {
      var duesN = D.feesFor("All", "All").filter(function (x) { return x.memberId === (id || saved.id) && x.type === "Membership"; }).length;
      setText("memberMsg", "✓ " + saved.name + " saved. Monthly fee " + inr(saved.monthlyFee) + "/month — " + duesN + " month(s) due from " + D.monthLabel((saved.joinDate || "").slice(0, 7)) + ".");
    } else if (saved) setText("memberMsg", "✓ " + saved.name + " saved.");
    else setText("memberMsg", "");
    pendingPhoto = null;
    if ($("memberFormCard")) $("memberFormCard").hidden = true;
    fillSelects();
    renderMembers(); renderHome();
    if (id) openMember(id);
  });
  function failQuotaSave() {
    setText("memberMsg", "⚠️ Storage is full — could not save. Take a backup from More → Data → Export, then delete old data and try again.");
  }

  /* ---------- Fees ---------- */
  function renderFees() {
    var ft = D.feeTotals(feeMonth);
    var monthTxt = feeMonth === "All" ? "All months" : D.monthLabel(feeMonth);
    setText("feeBilledLabel", "Billed (" + monthTxt + ")");
    setText("feeBilled", inr(ft.billed));
    setText("feeCollected", inr(ft.collected));
    setText("feeDue", inr(ft.due));
    setText("feeDefaulters", String(ft.defaulters));

    var q = ($("feeSearch") ? $("feeSearch").value : "").toLowerCase();
    var html = "";
    if (feeTab === "defaulters") {
      var defs = D.defaulters(feeMonth).filter(function (d) {
        var name = d.member ? d.member.name : "";
        return !q || name.toLowerCase().indexOf(q) !== -1;
      });
      html = defs.map(function (d) {
        var name = d.member ? d.member.name : "";
        var phone = d.member ? d.member.phone : "";
        var s = D.settings();
        var text = "Hello " + name + ", your gym fees of " + inr(d.due) + " are due — " + s.gymName + ", " + s.city;
        var waBtn = phone
          ? "<a class='btn small' href='" + esc(waLink(phone, text)) + "' target='_blank' rel='noopener'>WhatsApp</a>"
          : "<button class='btn small' disabled title='No phone number'>WhatsApp</button>";
        return "<tr><td>" + esc(name) + "</td><td>" + d.fees.length + " fee record(s)</td><td>" + inr(d.due) + "</td><td>—</td><td>" + inr(d.due) + "</td><td><span class='badge due'>Due</span></td><td>" + waBtn + "</td></tr>";
      }).join("") || "<tr><td colspan='7' class='empty-cell'>" + emptyHTML("✅", "No defaulters", "No defaulters — all fees are paid.") + "</td></tr>";
    } else {
      var list = D.feesFor(feeMonth, "All");
      if (feeTab === "paid") list = list.filter(function (f) { return f.status === "Paid"; });
      if (q) list = list.filter(function (f) { return f.member.toLowerCase().indexOf(q) !== -1; });
      html = list.map(function (f) {
        return "<tr><td>" + esc(f.member) + "</td><td>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + " • " + esc(f.period) + "</td><td>" + inr(f.amount) + "</td><td>" + inr(f.paid) + "</td><td>" + inr(f.due) + "</td><td><span class='badge " + (f.status === "Paid" ? "paid" : "due") + "'>" + f.status + "</span></td>" +
          "<td>" + (f.due > 0 ? "<button class='btn small' data-pay='" + f.id + "'>Collect</button>" : "") + (f.paid === 0 && f.due > 0 ? " <button class='btn small danger' data-del-fee='" + f.id + "'>Delete</button>" : "") + "</td></tr>";
      }).join("") || "<tr><td colspan='7' class='empty-cell'>" + emptyHTML("🧾", "No fee records", "No fee records for this filter.") + "</td></tr>";
    }
    setHTML("feeRows", html);
    var rowsEl = $("feeRows");
    if (rowsEl) rowsEl.querySelectorAll("[data-pay]").forEach(function (b) {
      b.addEventListener("click", function () { openPayModal(b.getAttribute("data-pay")); });
    });
    if (rowsEl) rowsEl.querySelectorAll("[data-del-fee]").forEach(function (b) {
      b.addEventListener("click", function () {
        var fid = b.getAttribute("data-del-fee");
        var rec = D.feesFor("All", "All").filter(function (x) { return x.id === fid; })[0];
        if (!rec) return;
        askConfirm("Delete fee record?", rec.member + " — " + rec.type + (rec.planName ? " — " + rec.planName : "") + " • " + rec.period + " • " + inr(rec.amount) + ". This cannot be undone.", "Yes, delete").then(function (ok) {
          if (!ok) return;
          D.removeFee(fid);
          renderFees(); renderHome();
        });
      });
    });
    renderExpenses();
  }
  on("feeTabs", "click", function (e) {
    var b = e.target.closest("button[data-tab]"); if (!b) return;
    feeTab = b.getAttribute("data-tab");
    document.querySelectorAll("#feeTabs button").forEach(function (x) { x.classList.toggle("active", x === b); });
    renderFees();
  });
  on("feeMonthFilter", "change", function () { feeMonth = $("feeMonthFilter").value; renderFees(); });
  on("feeSearch", "input", renderFees);
  on("addFeeBtn", "click", function () {
    fillSelects();
    if ($("feeMonth")) $("feeMonth").value = feeMonth === "All" ? D.todayStr().slice(0, 7) : feeMonth;
    if ($("addFeeCard")) { $("addFeeCard").hidden = false; scrollToEl($("addFeeCard")); }
  });
  on("addFeeForm", "submit", function (e) {
    e.preventDefault();
    var amt = parseInt($("feeAmount") ? $("feeAmount").value : "", 10);
    var memberId = $("feeStudent") ? $("feeStudent").value : "";
    if (!memberId || !amt || amt <= 0) return;
    var fmonth = $("feeMonth") ? $("feeMonth").value : D.todayStr().slice(0, 7);
    var ftype = $("feeType") ? $("feeType").value : "Membership";
    if (D.feeExists(memberId, fmonth, ftype)) { setText("addFeeMsg", "A " + ftype + " fee record already exists for this member in " + D.monthLabel(fmonth) + "."); return; }
    var rec = D.addFee({ memberId: memberId, type: ftype, month: fmonth, amount: amt });
    if (!rec) return;
    setText("addFeeMsg", "");
    if ($("addFeeCard")) $("addFeeCard").hidden = true;
    e.target.reset();
    feeMonth = rec.month;
    if ($("feeMonthFilter")) $("feeMonthFilter").value = feeMonth;
    renderFees(); renderHome();
  });
  on("addFeeCancel", "click", function () {
    if ($("addFeeCard")) $("addFeeCard").hidden = true;
    setText("addFeeMsg", "");
  });

  /* ---------- In-app confirmation (native confirm() ki jagah) ----------
     Native confirm() headless/automated browser me dikhta hi nahi aur
     false return karta hai — isliye Archive/Delete wahan silently fail
     ho jate the (4 baar click, kuch nahi). Ye modal har browser me
     kaam karta hai aur phone par bhi professional dikhta hai. */
  var confirmResolve = null;
  function askConfirm(title, message, yesLabel) {
    setText("confirmTitle", title || "Confirm");
    setText("confirmMsg", message || "");
    var yes = $("confirmYes");
    if (yes) yes.textContent = yesLabel || "Yes";
    var m = $("confirmModal");
    if (m) m.classList.add("open");
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }
  function closeConfirm(result) {
    var m = $("confirmModal");
    if (m) m.classList.remove("open");
    if (confirmResolve) { var r = confirmResolve; confirmResolve = null; r(!!result); }
  }
  on("confirmYes", "click", function () { closeConfirm(true); });
  on("confirmNo", "click", function () { closeConfirm(false); });
  on("confirmModal", "click", function (e) { if (e.target === $("confirmModal")) closeConfirm(false); });

  /* ----- Collect payment modal ----- */
  function payWarnUpdate() {
    var f = D.feeById(payFeeId);
    var amtEl = $("payAmount");
    var w = $("payWarn");
    // payWarn <p hidden> se start hota hai — sirf text badalne se wo
    // dikhta nahi (v1.5.5 tak ka bug: warning set hoti thi par chhupi
    // rehti thi). Isliye text ke saath hidden bhi toggle karo.
    if (!f || !amtEl) { setText("payWarn", ""); if (w) w.hidden = true; return; }
    var amt = parseInt(amtEl.value, 10) || 0;
    if (amt > f.due) { setText("payWarn", "Due is only " + inr(f.due) + " — " + inr(amt - f.due) + " extra. Only " + inr(f.due) + " will be collected."); if (w) w.hidden = false; }
    else { setText("payWarn", ""); if (w) w.hidden = true; }
  }
  function openPayModal(feeId) {
    var f = D.feeById(feeId);
    if (!f) return;
    payFeeId = feeId;
    setHTML("payBody", "<div class='kv'><dt>Member</dt><dd>" + esc(f.member) + "</dd><dt>Fee</dt><dd>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + " • " + esc(f.period) + "</dd><dt>Amount</dt><dd>" + inr(f.amount) + "</dd><dt>Paid</dt><dd>" + inr(f.paid) + "</dd><dt>Due</dt><dd>" + inr(f.due) + "</dd></div>");
    if ($("payAmount")) { $("payAmount").value = f.due; $("payAmount").max = f.due; }
    if ($("payMethod")) $("payMethod").value = "Cash";
    setText("payWarn", "");
    var pw0 = $("payWarn"); if (pw0) pw0.hidden = true;
    setHTML("receiptBox", "");
    if ($("payModal")) $("payModal").classList.add("open");
  }
  on("payAmount", "input", payWarnUpdate);
  on("payClose", "click", function () { if ($("payModal")) $("payModal").classList.remove("open"); });
  on("payModal", "click", function (e) { if (e.target === $("payModal")) $("payModal").classList.remove("open"); });
  on("payConfirm", "click", function () {
    var amt = parseInt($("payAmount") ? $("payAmount").value : "", 10);
    if (!payFeeId || !amt || amt <= 0) return;
    var method = $("payMethod") ? $("payMethod").value : "Cash";
    var res = D.collectPayment(payFeeId, amt, method);
    if (!res) return;
    var f = res.fee;
    var s = D.settings();
    var m = D.memberById(f.memberId);
    var phone = m ? m.phone : "";
    var today = D.fmtDate(D.todayStr());
    var receiptText = s.gymName + " — Fee Receipt\nMember: " + f.member + "\nFee: " + f.type + (f.planName ? " — " + f.planName : "") + " (" + f.period + ")\nCollected now: " + inr(res.applied) + "\nTotal Paid: " + inr(f.paid) + " / " + inr(f.amount) + "\nBalance Due: " + inr(f.due) + "\nDate: " + today;
    var waPart = phone
      ? "<a class='btn secondary' href='" + esc(waLink(phone, receiptText)) + "' target='_blank' rel='noopener'>Send on WhatsApp</a>"
      : "<p class='muted'>Member's phone number is not available</p>";
    setHTML("receiptBox",
      "<div class='receipt'><b>Receipt — " + esc(s.gymName) + "</b>" +
      "<div class='row'><span>Member</span><span>" + esc(f.member) + "</span></div>" +
      "<div class='row'><span>Fee</span><span>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + " • " + esc(f.period) + "</span></div>" +
      "<div class='row'><span>Collected now</span><span>" + inr(res.applied) + "</span></div>" +
      "<div class='row'><span>Total Paid</span><span>" + inr(f.paid) + " / " + inr(f.amount) + "</span></div>" +
      "<div class='row'><span>Balance Due</span><span>" + inr(f.due) + "</span></div>" +
      "<div class='row'><span>Method</span><span>" + esc(method) + "</span></div>" +
      "<div class='row'><span>Date</span><span>" + today + "</span></div>" +
      (res.overpaid > 0 ? "<p class='muted'>" + inr(res.overpaid) + " extra was not collected.</p>" : "") +
      "</div><button class='btn secondary' onclick='window.print()'>Print Receipt</button> " + waPart);
    setText("payWarn", "");
    var pw1 = $("payWarn"); if (pw1) pw1.hidden = true;
    renderFees(); renderHome();
  });

  /* ----- Expenses (inside Fees section) ----- */
  function renderExpenses() {
    var list = D.getState().expenses;
    setHTML("expenseRows", list.map(function (e) {
      return "<tr><td>" + esc(e.title) + "</td><td>" + D.fmtDate(e.date) + "</td><td>" + inr(e.amount) + "</td><td><span class='badge " + (e.status === "Paid" ? "paid" : "due") + "'>" + esc(e.status || "Paid") + "</span></td>" +
        "<td><button class='btn small danger' data-exp='" + e.id + "'>Delete</button></td></tr>";
    }).join("") || "<tr><td colspan='5' class='empty-cell'>" + emptyHTML("💸", "No expenses yet", "Add your first expense.") + "</td></tr>");
    setText("expenseTotal", inr(D.expenseTotal()));
    var rowsEl = $("expenseRows");
    if (rowsEl) rowsEl.querySelectorAll("[data-exp]").forEach(function (b) {
      b.addEventListener("click", function () {
        askConfirm("Delete expense?", "This expense will be deleted. This cannot be undone.", "Yes, delete").then(function (ok) {
          if (!ok) return;
          D.deleteExpense(b.getAttribute("data-exp"));
          renderFees();
        });
      });
    });
  }
  on("addExpenseBtn", "click", function () {
    var form = $("expenseForm");
    if (!form) return;
    form.hidden = !form.hidden;
    if (!form.hidden) scrollToEl(form);
  });
  on("expenseForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var title = fv(f, "title").trim();
    var amt = parseInt(fv(f, "amount"), 10);
    if (!title || !amt || amt <= 0) return;
    D.addExpense({ title: title, amount: amt, date: fv(f, "date") || D.todayStr(), status: fv(f, "status") || "Paid" });
    f.reset();
    if ($("expenseForm")) $("expenseForm").hidden = true;
    renderFees();
  });

  /* ---------- Attendance ---------- */
  function renderAttendance() {
    var date = $("attDate") ? $("attDate").value : D.todayStr();
    if (!date) date = D.todayStr();
    var q = ($("attSearch") ? $("attSearch").value : "").toLowerCase();
    var saved = D.attendanceFor(date);
    var list = D.membersList("active").filter(function (m) {
      return !q || m.name.toLowerCase().indexOf(q) !== -1;
    });
    list.forEach(function (m) { if (!attWorking[m.id]) attWorking[m.id] = saved[m.id] || "Present"; });
    setHTML("attList", list.map(function (m) {
      return "<div class='att-row'>" + avatarHTML(m) + "<div class='grow'><b>" + esc(m.name) + "</b><div class='muted'>" + esc(m.phone || "") + "</div></div>" +
        "<span class='seg'><button type='button' data-att='" + m.id + "' data-v='Present' class='" + (attWorking[m.id] === "Present" ? "on-p" : "") + "'>Present</button>" +
        "<button type='button' data-att='" + m.id + "' data-v='Absent' class='" + (attWorking[m.id] === "Absent" ? "on-a" : "") + "'>Absent</button></span></div>";
    }).join("") || emptyHTML("👥", "No members yet", "Start by adding a member.", { id: "emptyAddMemberAtt", label: "+ Add Member" }));
    var listEl = $("attList");
    if (listEl) listEl.querySelectorAll("[data-att]").forEach(function (b) {
      b.addEventListener("click", function () { attWorking[b.getAttribute("data-att")] = b.getAttribute("data-v"); renderAttendance(); });
    });
    wireEmptyBtn("emptyAddMemberAtt", function () { showSection("members"); var b = $("newMemberBtn"); if (b) b.click(); });
  }
  on("attDate", "change", function () { attWorking = {}; renderAttendance(); });
  on("attSearch", "input", renderAttendance);
  on("markAllBtn", "click", function () { Object.keys(attWorking).forEach(function (k) { attWorking[k] = "Present"; }); renderAttendance(); });
  on("saveAttBtn", "click", function () {
    var date = $("attDate") ? $("attDate").value : D.todayStr();
    D.saveAttendance(date, attWorking);
    var total = Object.keys(attWorking).length, p = 0;
    Object.keys(attWorking).forEach(function (k) { if (attWorking[k] === "Present") p++; });
    setText("attMsg", "Attendance saved ✓ — " + p + " present / " + total + " members, " + D.fmtDate(date) + ".");
    renderHome();
  });

  /* ---------- More: Trainers / Notices / Settings / Data ---------- */
  var editingTrainerId = null;
  function renderMore() {
    setHTML("trainerRows", D.trainersList().map(function (t) {
      return "<div class='list-row'><span class='avatar'>" + esc(initials(t.name)) + "</span><div class='grow'><div class='t'>" + esc(t.name) + "</div><div class='s'>" + esc(t.specialty || "") + (t.phone ? " • " + esc(t.phone) : "") + "</div></div>" +
        "<button class='btn small secondary' data-trainer-edit='" + t.id + "'>Edit</button> <button class='btn small danger' data-trainer-del='" + t.id + "'>Delete</button></div>";
    }).join("") || emptyHTML("💪", "No trainers yet", "Add your first trainer.", { id: "emptyAddTrainer", label: "+ Add Trainer" }));
    setHTML("noticeList", D.getState().notices.map(function (n) {
      return "<div class='card'><div class='list-row'><div class='grow'><div class='t'>" + esc(n.title) + "</div><div>" + esc(n.body) + "</div><div class='s'>" + D.fmtDate(n.date) + (n.tag ? " • " + esc(n.tag) : "") + "</div></div><button class='btn small danger' data-notice-del='" + n.id + "'>Delete</button></div></div>";
    }).join("") || emptyHTML("📢", "No notices yet", "Publish your first notice."));

    var tr = $("trainerRows");
    if (tr) {
      tr.querySelectorAll("[data-trainer-edit]").forEach(function (b) {
        b.addEventListener("click", function () {
          var t = null;
          D.trainersList().forEach(function (x) { if (x.id === b.getAttribute("data-trainer-edit")) t = x; });
          if (!t) return;
          editingTrainerId = t.id;
          var f = $("trainerForm");
          f.elements["name"].value = t.name; f.elements["specialty"].value = t.specialty || ""; f.elements["phone"].value = t.phone || "";
          if ($("trainerForm")) scrollToEl($("trainerForm"));
        });
      });
      tr.querySelectorAll("[data-trainer-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          askConfirm("Delete trainer?", "This trainer will be deleted. This cannot be undone.", "Yes, delete").then(function (ok) {
            if (!ok) return;
            D.deleteTrainer(b.getAttribute("data-trainer-del"));
            fillSelects(); renderMore();
          });
        });
      });
    }
    var nl = $("noticeList");
    if (nl) nl.querySelectorAll("[data-notice-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        askConfirm("Delete notice?", "This notice will be deleted. This cannot be undone.", "Yes, delete").then(function (ok) {
          if (!ok) return;
          D.deleteNotice(b.getAttribute("data-notice-del"));
          renderMore();
        });
      });
    });
    wireEmptyBtn("emptyAddTrainer", function () { var f = $("trainerForm"); if (f) { scrollToEl(f); var n = f.elements ? f.elements["name"] : null; if (n) n.focus(); } });
    var sf = $("settingsForm");
    if (sf) {
      var s = D.settings();
      sf.elements["gymName"].value = s.gymName;
      sf.elements["ownerName"].value = s.ownerName || "";
      sf.elements["city"].value = s.city || "";
      if (typeof settingsLogoPicker !== "undefined" && settingsLogoPicker) settingsLogoPicker.set(s.logo || "");
    }
    var acct = null;
    try { acct = window.GymAuth.currentAccount(); } catch (e) { acct = null; }
    setText("loginEmailLine", acct && acct.email ? "Logged in as: " + acct.email : "");
    var si = D.storageInfo();
    setText("storageInfo", "Storage use: ~" + Math.round(si.bytes / 1024) + " KB • " + si.members + " members • " + si.photos + " photos (" + Math.round(si.photoChars / 1024) + " KB). If storage is almost full, new photos will be saved without the photo — take a backup via Export.");
  }
  on("trainerForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var name = fv(f, "name").trim();
    if (!name) return;
    D.saveTrainer({ id: editingTrainerId || undefined, name: name, specialty: fv(f, "specialty").trim(), phone: fv(f, "phone").trim() });
    editingTrainerId = null;
    f.reset();
    fillSelects(); renderMore();
  });
  on("noticeForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var title = fv(f, "title").trim();
    if (!title) return;
    D.addNotice({ title: title, tag: fv(f, "tag").trim(), body: fv(f, "body").trim(), date: D.todayStr() });
    f.reset();
    renderMore();
  });
  on("settingsForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    D.saveSettings({ gymName: fv(f, "gymName").trim(), ownerName: fv(f, "ownerName").trim(), city: fv(f, "city").trim(), logo: settingsLogoPicker.get() || "" });
    // Account profile bhi sync rakho (sidebar/topbar logo + naam wahi se aate hain)
    try {
      var s = D.settings();
      if (window.GymAuth) window.GymAuth.updateProfile({ gymName: s.gymName, city: s.city, ownerName: s.ownerName, logo: s.logo || "" });
    } catch (err) {}
    applySettings();
    setText("settingsMsg", "Settings saved ✓");
  });
  on("exportBtn", "click", function () {
    var blob = new Blob([D.exportJSON()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gym-management-app-backup-" + D.todayStr() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  on("importFile", "change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var ok = D.importJSON(String(reader.result || ""));
      setText("importMsg", ok ? "Import complete ✓ — data has been loaded." : "Import failed — choose the correct backup file.");
      if (ok) { fillSelects(); applySettings(); renderSection(currentSection); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  on("resetBtn", "click", function () {
    askConfirm("Reset all data?", "All data will be deleted — this cannot be undone.", "Yes, reset").then(function (ok) {
      if (!ok) return;
      D.resetAll();
      fillSelects(); applySettings();
      if ($("attDate")) $("attDate").value = D.todayStr();
      attWorking = {};
      renderSection(currentSection);
    });
  });

  /* ---------- Init: pehle auth check, phir hi app boot ---------- */
  boot();
})();
