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
    home: ["Home", "Aaj ka summary — collection, attendance, due fees, ek nazar me."],
    members: ["Members", "Saare members ki list, search aur trainer filter. Naya member yahin se add karo."],
    fees: ["Fees", "Fees ka hisaab — Month chuno. Payment yahin se lo, receipt bhi yahin milegi."],
    attendance: ["Attendance", "Date chuno — phir Present / Absent mark karo aur Save karo."],
    more: ["More", "Plans, trainers, notices, settings aur data backup — sab yahin."],
  };

  /* ---------- Navigation ---------- */
  function showSection(name) {
    currentSection = name;
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

  /* ---------- Settings / gym name ---------- */
  function applySettings() {
    var s = D.settings();
    setText("gymNameTop", s.gymName);
    setText("gymNameSide", s.gymName);
    setText("gymCitySide", s.city || "");
  }

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

    var exp = D.expiringSoon(7);
    var defs = D.defaulters();
    var att = "";
    exp.forEach(function (e) {
      att += "<div class='list-row'><div class='grow'><div class='t'>" + esc(e.member ? e.member.name : "") + " — " + esc(e.planName) + "</div><div class='s'>Plan " + D.fmtDate(e.endDate) + " ko khatam ho raha hai (" + e.daysLeft + " din bache)</div></div><span class='badge orange'>Expiring</span></div>";
    });
    defs.forEach(function (d) {
      var name = d.member ? d.member.name : "";
      att += "<div class='list-row'><div class='grow'><div class='t'>" + esc(name) + "</div><div class='s'>Fees due — " + inr(d.due) + "</div></div><span class='badge due'>Due</span></div>";
    });
    setHTML("attentionList", att || emptyHTML("✅", "Sab theek hai", "Koi expiring plan ya due fees nahi hai."));

    var pays = D.paymentsRecent(10);
    setHTML("recentPayments", pays.map(function (p) {
      return "<div class='list-row'><div class='grow'><div class='t'>" + esc(p.member) + "</div><div class='s'>" + esc(p.method || "Cash") + " • " + D.fmtDate(p.date) + "</div></div><b>" + inr(p.amount) + "</b></div>";
    }).join("") || emptyHTML("🧾", "No payments yet", "Pehli payment collect karte hi yahan dikhegi."));
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
      var ap = D.activePlanFor(m.id);
      return "<tr data-member='" + m.id + "'><td>" + avatarHTML(m) + " " + esc(m.name) + "</td>" +
        "<td>" + (m.age || "—") + "</td><td>" + esc(m.phone || "—") + "</td><td>" + esc(trainerName(m.trainerId)) + "</td>" +
        "<td>" + (ap ? D.fmtDate(ap.endDate) : "—") + "</td><td><span class='badge paid'>Active</span></td></tr>";
    }).join("") || "<tr><td colspan='6' class='empty-cell'>" + emptyHTML("👥", "No members yet", "Add Member se shuru karo.", { id: "emptyAddMember", label: "+ Add Member" }) + "</td></tr>");
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
    var ap = D.activePlanFor(id);
    currentMpId = ap ? ap.id : null;
    setHTML("memberProfile",
      "<div class='list-row'>" + avatarHTML(m, true) + "<div class='grow'><div class='t'>" + esc(m.name) + "</div><div class='s'>Joined " + D.fmtDate(m.joinDate) + " • " + esc(m.status || "active") + "</div></div></div>" +
      "<div class='kv'><dt>Age</dt><dd>" + (m.age || "—") + "</dd><dt>Phone</dt><dd>" + esc(m.phone || "—") + "</dd><dt>Gender</dt><dd>" + esc(m.gender || "—") + "</dd><dt>Weight</dt><dd>" + (m.weight ? esc(m.weight) + " kg" : "—") + "</dd><dt>Goal</dt><dd>" + esc(m.goal || "—") + "</dd><dt>Trainer</dt><dd>" + esc(trainerName(m.trainerId)) + "</dd></div>");
    var ex = D.extrasFor(id);
    if ($("dietText")) $("dietText").value = ex.diet || "";
    if ($("workoutText")) $("workoutText").value = ex.workout || "";

    var fees = D.feesFor("All", "All").filter(function (f) { return f.memberId === id; });
    setHTML("memberFeeRows", fees.map(function (f) {
      return "<tr><td>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + "</td><td>" + esc(f.period) + "</td><td>" + inr(f.amount) + "</td><td>" + inr(f.paid) + "</td><td>" + inr(f.due) + "</td><td><span class='badge " + (f.status === "Paid" ? "paid" : "due") + "'>" + f.status + "</span></td></tr>";
    }).join("") || "<tr><td colspan='6' class='empty-cell'>" + emptyHTML("🧾", "No fee records", "Is member ki koi fee record nahi hai.") + "</td></tr>");

    var attMap = D.getState().attendance || {};
    var dates = Object.keys(attMap).sort().reverse().slice(0, 7);
    setHTML("memberAttRecent", dates.map(function (d) {
      var v = attMap[d][id];
      return "<div class='list-row'><div class='grow'><div class='t'>" + D.fmtDate(d) + "</div></div><span class='badge " + (v === "Present" ? "paid" : v === "Absent" ? "due" : "info") + "'>" + esc(v || "—") + "</span></div>";
    }).join("") || emptyHTML("✓", "No attendance yet", "Attendance mark karte hi yahan dikhegi."));

    // Assign plan
    var sel = $("assignPlanSelect");
    if (sel) {
      sel.innerHTML = "";
      D.plansList().forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.name + " — " + p.days + " days • " + inr(p.price); sel.appendChild(o); });
    }
    setText("assignMsg", D.plansList().length ? "" : "Pehle ek membership plan banao");
    if (ap) {
      setHTML("activePlanBox", "<div class='kv'><dt>Plan</dt><dd>" + esc(ap.planName) + "</dd><dt>Valid till</dt><dd>" + D.fmtDate(ap.endDate) + "</dd><dt>Price</dt><dd>" + inr(ap.price) + "</dd></div>");
      if ($("activePlanBox")) $("activePlanBox").hidden = false;
      if ($("renewPlanBtn")) $("renewPlanBtn").hidden = false;
    } else {
      setHTML("activePlanBox", "<p class='muted'>Is member ka koi active plan nahi hai.</p>");
      if ($("activePlanBox")) $("activePlanBox").hidden = false;
      if ($("renewPlanBtn")) $("renewPlanBtn").hidden = true;
    }
    if ($("memberCard")) { $("memberCard").hidden = false; scrollToEl($("memberCard")); }
  }

  on("saveExtrasBtn", "click", function () {
    if (!currentMemberId) return;
    D.saveExtras(currentMemberId, { diet: $("dietText") ? $("dietText").value.trim() : "", workout: $("workoutText") ? $("workoutText").value.trim() : "" });
    setText("assignMsg", "");
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
    f.elements["joinDate"].value = m.joinDate || D.todayStr();
    setText("memberFormTitle", "Edit Member");
    if ($("memberIdField")) $("memberIdField").value = m.id;
    pendingPhoto = m.photo || null;
    setText("photoStatus", pendingPhoto ? "Photo saved hai — badalne ke liye nayi photo lo ya hatao." : PHOTO_STATUS_DEFAULT);
    setPhotoPreview();
    setText("memberFormTitle", "Edit Member");
    if ($("memberFormCard")) { $("memberFormCard").hidden = false; scrollToEl($("memberFormCard")); }
  });
  on("archiveMemberBtn", "click", function () {
    var m = D.memberById(currentMemberId);
    if (!m) return;
    if (!confirm("Archive " + m.name + "? Ye wapas nahi aayega.")) return;
    D.archiveMember(m.id);
    if ($("memberCard")) $("memberCard").hidden = true;
    currentMemberId = null;
    renderMembers(); renderHome();
  });
  on("assignPlanBtn", "click", function () {
    if (!currentMemberId) return;
    var plans = D.plansList();
    if (!plans.length) { setText("assignMsg", "Pehle ek membership plan banao"); return; }
    var planId = $("assignPlanSelect") ? $("assignPlanSelect").value : "";
    if (!planId) { setText("assignMsg", "Pehle ek plan chuno."); return; }
    var res = D.assignPlan(currentMemberId, planId);
    if (!res.ok) {
      if (res.error === "active-exists") {
        setText("assignMsg", "Already has an active plan — use Renew");
        if ($("renewPlanBtn")) $("renewPlanBtn").hidden = false;
      } else {
        setText("assignMsg", "Plan assign nahi hua — dobara try karo.");
      }
      return;
    }
    openMember(currentMemberId);
    renderMembers();
    setText("assignMsg", "Plan assigned ✓ — valid till " + D.fmtDate(res.mp.endDate) + ". Fee record ban gaya hai (Due).");
    return;
  });
  on("renewPlanBtn", "click", function () {
    if (!currentMpId) return;
    var res = D.renewPlan(currentMpId);
    if (!res.ok) { setText("assignMsg", "Renew nahi hua — plan delete ho gaya hoga. Naya plan assign karo."); return; }
    openMember(currentMemberId);
    renderMembers();
    setText("assignMsg", "Renewed ✓ — valid till " + D.fmtDate(res.mp.endDate) + ". New fee record ban gaya hai (Due).");
  });

  /* ---------- Member photo picker (admission / edit form) ---------- */
  var pendingPhoto = null; // compressed JPEG data URL, ya null (koi photo nahi)
  var PHOTO_STATUS_DEFAULT = "Photo automatic compress hokar save hogi (~50KB), taaki phone storage na bhare.";
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
    setText("photoStatus", "Photo compress ho rahi hai…");
    compressPhoto(file).then(function (url) {
      if (url) {
        pendingPhoto = url;
        setText("photoStatus", "Photo ready ✓ ~" + Math.round(url.length / 1024) + "KB — automatic compress hokar save hogi.");
      } else {
        pendingPhoto = null;
        setText("photoStatus", "Photo compress nahi ho payi — bina photo ke admission hoga. Dobara try karo.");
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
    setText("photoStatus", "Photo hata di gayi.");
    setPhotoPreview();
  });
  // Naam type karte hi preview me initials update hon (jab tak photo na ho)
  on("memberForm", "input", function (e) {
    if (!pendingPhoto && e.target && e.target.name === "name") setPhotoPreview();
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
    if (photoDropped) setText("memberMsg", "⚠️ Storage lagbhag full hai — member photo ke bina save hua. More → Data se Export karke backup lo, phir purana data delete karke dobara photo add kar sakte ho.");
    else setText("memberMsg", "");
    pendingPhoto = null;
    if ($("memberFormCard")) $("memberFormCard").hidden = true;
    fillSelects();
    renderMembers(); renderHome();
    if (id) openMember(id);
  });
  function failQuotaSave() {
    setText("memberMsg", "⚠️ Storage full ho gaya — save nahi hua. More → Data se Export karke backup lo, phir purana data delete karo aur dobara try karo.");
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
      var defs = D.defaulters().filter(function (d) {
        var name = d.member ? d.member.name : "";
        return !q || name.toLowerCase().indexOf(q) !== -1;
      });
      html = defs.map(function (d) {
        var name = d.member ? d.member.name : "";
        var phone = d.member ? d.member.phone : "";
        var s = D.settings();
        var text = "Namaste " + name + ", aapki gym fees " + inr(d.due) + " due hai — " + s.gymName + ", " + s.city;
        var waBtn = phone
          ? "<a class='btn small' href='" + esc(waLink(phone, text)) + "' target='_blank' rel='noopener'>WhatsApp</a>"
          : "<button class='btn small' disabled title='Phone nahi hai'>WhatsApp</button>";
        return "<tr><td>" + esc(name) + "</td><td>" + d.fees.length + " fee record(s)</td><td>" + inr(d.due) + "</td><td>—</td><td>" + inr(d.due) + "</td><td><span class='badge due'>Due</span></td><td>" + waBtn + "</td></tr>";
      }).join("") || "<tr><td colspan='7' class='empty-cell'>" + emptyHTML("✅", "No defaulters", "Koi defaulter nahi hai — sab fees paid hain.") + "</td></tr>";
    } else {
      var list = D.feesFor(feeMonth, "All");
      if (feeTab === "paid") list = list.filter(function (f) { return f.status === "Paid"; });
      if (q) list = list.filter(function (f) { return f.member.toLowerCase().indexOf(q) !== -1; });
      html = list.map(function (f) {
        return "<tr><td>" + esc(f.member) + "</td><td>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + " • " + esc(f.period) + "</td><td>" + inr(f.amount) + "</td><td>" + inr(f.paid) + "</td><td>" + inr(f.due) + "</td><td><span class='badge " + (f.status === "Paid" ? "paid" : "due") + "'>" + f.status + "</span></td>" +
          "<td>" + (f.due > 0 ? "<button class='btn small' data-pay='" + f.id + "'>Collect</button>" : "") + "</td></tr>";
      }).join("") || "<tr><td colspan='7' class='empty-cell'>" + emptyHTML("🧾", "No fee records", "Is filter ke liye koi fee record nahi hai.") + "</td></tr>";
    }
    setHTML("feeRows", html);
    var rowsEl = $("feeRows");
    if (rowsEl) rowsEl.querySelectorAll("[data-pay]").forEach(function (b) {
      b.addEventListener("click", function () { openPayModal(b.getAttribute("data-pay")); });
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
    var rec = D.addFee({ memberId: memberId, type: $("feeType") ? $("feeType").value : "Membership", month: $("feeMonth") ? $("feeMonth").value : D.todayStr().slice(0, 7), amount: amt });
    if (!rec) return;
    if ($("addFeeCard")) $("addFeeCard").hidden = true;
    e.target.reset();
    feeMonth = rec.month;
    if ($("feeMonthFilter")) $("feeMonthFilter").value = feeMonth;
    renderFees(); renderHome();
  });

  /* ----- Collect payment modal ----- */
  function payWarnUpdate() {
    var f = D.feeById(payFeeId);
    var amtEl = $("payAmount");
    if (!f || !amtEl) { setText("payWarn", ""); return; }
    var amt = parseInt(amtEl.value, 10) || 0;
    if (amt > f.due) setText("payWarn", "Due sirf " + inr(f.due) + " hai — " + inr(amt - f.due) + " zyada hai. Sirf " + inr(f.due) + " collect hoga.");
    else setText("payWarn", "");
  }
  function openPayModal(feeId) {
    var f = D.feeById(feeId);
    if (!f) return;
    payFeeId = feeId;
    setHTML("payBody", "<div class='kv'><dt>Member</dt><dd>" + esc(f.member) + "</dd><dt>Fee</dt><dd>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + " • " + esc(f.period) + "</dd><dt>Amount</dt><dd>" + inr(f.amount) + "</dd><dt>Paid</dt><dd>" + inr(f.paid) + "</dd><dt>Due</dt><dd>" + inr(f.due) + "</dd></div>");
    if ($("payAmount")) { $("payAmount").value = f.due; $("payAmount").max = f.due; }
    if ($("payMethod")) $("payMethod").value = "Cash";
    setText("payWarn", "");
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
      : "<p class='muted'>Member ka phone number nahi hai</p>";
    setHTML("receiptBox",
      "<div class='receipt'><b>Receipt — " + esc(s.gymName) + "</b>" +
      "<div class='row'><span>Member</span><span>" + esc(f.member) + "</span></div>" +
      "<div class='row'><span>Fee</span><span>" + esc(f.type) + (f.planName ? " — " + esc(f.planName) : "") + " • " + esc(f.period) + "</span></div>" +
      "<div class='row'><span>Collected now</span><span>" + inr(res.applied) + "</span></div>" +
      "<div class='row'><span>Total Paid</span><span>" + inr(f.paid) + " / " + inr(f.amount) + "</span></div>" +
      "<div class='row'><span>Balance Due</span><span>" + inr(f.due) + "</span></div>" +
      "<div class='row'><span>Method</span><span>" + esc(method) + "</span></div>" +
      "<div class='row'><span>Date</span><span>" + today + "</span></div>" +
      (res.overpaid > 0 ? "<p class='muted'>" + inr(res.overpaid) + " zyada tha — collect nahi hua.</p>" : "") +
      "</div><button class='btn secondary' onclick='window.print()'>Print Receipt</button> " + waPart);
    setText("payWarn", "");
    renderFees(); renderHome();
  });

  /* ----- Expenses (inside Fees section) ----- */
  function renderExpenses() {
    var list = D.getState().expenses;
    setHTML("expenseRows", list.map(function (e) {
      return "<tr><td>" + esc(e.title) + "</td><td>" + D.fmtDate(e.date) + "</td><td>" + inr(e.amount) + "</td><td><span class='badge " + (e.status === "Paid" ? "paid" : "due") + "'>" + esc(e.status || "Paid") + "</span></td>" +
        "<td><button class='btn small danger' data-exp='" + e.id + "'>Delete</button></td></tr>";
    }).join("") || "<tr><td colspan='5' class='empty-cell'>" + emptyHTML("💸", "No expenses yet", "Add Expense se pehla kharcha add karo.") + "</td></tr>");
    setText("expenseTotal", inr(D.expenseTotal()));
    var rowsEl = $("expenseRows");
    if (rowsEl) rowsEl.querySelectorAll("[data-exp]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Delete this expense? Ye wapas nahi aayega.")) return;
        D.deleteExpense(b.getAttribute("data-exp"));
        renderFees();
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
    }).join("") || emptyHTML("👥", "No members yet", "Add Member se shuru karo.", { id: "emptyAddMemberAtt", label: "+ Add Member" }));
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

  /* ---------- More: Plans / Trainers / Notices / Settings / Data ---------- */
  var editingPlanId = null;
  var editingTrainerId = null;
  function renderMore() {
    setHTML("planRows", D.plansList().map(function (p) {
      return "<div class='list-row'><div class='grow'><div class='t'>" + esc(p.name) + "</div><div class='s'>" + p.days + " days • " + inr(p.price) + "</div></div>" +
        "<button class='btn small secondary' data-plan-edit='" + p.id + "'>Edit</button> <button class='btn small danger' data-plan-del='" + p.id + "'>Delete</button></div>";
    }).join("") || emptyHTML("📋", "No plans yet", "Pehle ek membership plan banao.", { id: "emptyAddPlan", label: "+ Add Plan" }));
    setHTML("trainerRows", D.trainersList().map(function (t) {
      return "<div class='list-row'><span class='avatar'>" + esc(initials(t.name)) + "</span><div class='grow'><div class='t'>" + esc(t.name) + "</div><div class='s'>" + esc(t.specialty || "") + (t.phone ? " • " + esc(t.phone) : "") + "</div></div>" +
        "<button class='btn small secondary' data-trainer-edit='" + t.id + "'>Edit</button> <button class='btn small danger' data-trainer-del='" + t.id + "'>Delete</button></div>";
    }).join("") || emptyHTML("💪", "No trainers yet", "Pehla trainer add karo.", { id: "emptyAddTrainer", label: "+ Add Trainer" }));
    setHTML("noticeList", D.getState().notices.map(function (n) {
      return "<div class='card'><div class='list-row'><div class='grow'><div class='t'>" + esc(n.title) + "</div><div>" + esc(n.body) + "</div><div class='s'>" + D.fmtDate(n.date) + (n.tag ? " • " + esc(n.tag) : "") + "</div></div><button class='btn small danger' data-notice-del='" + n.id + "'>Delete</button></div></div>";
    }).join("") || emptyHTML("📢", "No notices yet", "Pehla notice publish karo."));

    var pr = $("planRows");
    if (pr) {
      pr.querySelectorAll("[data-plan-edit]").forEach(function (b) {
        b.addEventListener("click", function () {
          var p = null;
          D.plansList().forEach(function (x) { if (x.id === b.getAttribute("data-plan-edit")) p = x; });
          if (!p) return;
          editingPlanId = p.id;
          var f = $("planForm");
          f.elements["name"].value = p.name; f.elements["days"].value = p.days; f.elements["price"].value = p.price;
          setText("planFormTitle", "Edit Plan");
          if ($("planForm")) scrollToEl($("planForm"));
        });
      });
      pr.querySelectorAll("[data-plan-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Delete this plan? Ye wapas nahi aayega.")) return;
          D.deletePlan(b.getAttribute("data-plan-del"));
          renderMore();
        });
      });
    }
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
          if (!confirm("Delete this trainer? Ye wapas nahi aayega.")) return;
          D.deleteTrainer(b.getAttribute("data-trainer-del"));
          fillSelects(); renderMore();
        });
      });
    }
    var nl = $("noticeList");
    if (nl) nl.querySelectorAll("[data-notice-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Delete this notice? Ye wapas nahi aayega.")) return;
        D.deleteNotice(b.getAttribute("data-notice-del"));
        renderMore();
      });
    });
    wireEmptyBtn("emptyAddPlan", function () { var f = $("planForm"); if (f) { scrollToEl(f); var n = f.elements ? f.elements["name"] : null; if (n) n.focus(); } });
    wireEmptyBtn("emptyAddTrainer", function () { var f = $("trainerForm"); if (f) { scrollToEl(f); var n = f.elements ? f.elements["name"] : null; if (n) n.focus(); } });
    var sf = $("settingsForm");
    if (sf) {
      var s = D.settings();
      sf.elements["gymName"].value = s.gymName;
      sf.elements["ownerName"].value = s.ownerName || "";
      sf.elements["city"].value = s.city || "";
    }
    var si = D.storageInfo();
    setText("storageInfo", "Storage use: ~" + Math.round(si.bytes / 1024) + " KB • " + si.members + " members • " + si.photos + " photos (" + Math.round(si.photoChars / 1024) + " KB). Storage lagbhag full ho to nayi photo bina save hogi — Export se backup lo.");
  }
  on("planForm", "submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var name = fv(f, "name").trim();
    var days = parseInt(fv(f, "days"), 10);
    var price = parseInt(fv(f, "price"), 10);
    if (!name || !days || days <= 0 || !price || price < 0) return;
    D.savePlan({ id: editingPlanId || undefined, name: name, days: days, price: price });
    editingPlanId = null;
    f.reset();
    setText("planFormTitle", "Add Plan");
    renderMore();
  });
  on("planCancel", "click", function () {
    editingPlanId = null;
    var f = $("planForm"); if (f) f.reset();
    setText("planFormTitle", "Add Plan");
  });
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
    D.saveSettings({ gymName: fv(f, "gymName").trim(), ownerName: fv(f, "ownerName").trim(), city: fv(f, "city").trim() });
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
      setText("importMsg", ok ? "Import ho gaya ✓ — data load ho gaya hai." : "Import fail — sahi backup file chuno.");
      if (ok) { fillSelects(); applySettings(); renderSection(currentSection); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  on("resetBtn", "click", function () {
    if (!confirm("Reset all data? Saara data delete ho jayega — ye wapas nahi aayega.")) return;
    D.resetAll();
    fillSelects(); applySettings();
    if ($("attDate")) $("attDate").value = D.todayStr();
    attWorking = {};
    renderSection(currentSection);
  });

  /* ---------- Init ---------- */
  fillSelects();
  applySettings();
  if ($("attDate")) $("attDate").value = D.todayStr();
  renderSection("home");
})();
