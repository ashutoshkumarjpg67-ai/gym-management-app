# Gym Management App — Live Website + App (Step 1)

**Product:** Gym Management App — gym management service for Indian gyms.
**Model:** One app, each gym a separate account (own login, name/logo, separate database).
**First gym:** SPARTAN FITNESS, Gopalganj. Owner name, plans and trainers are
NOT filled in yet — the owner adds them in the app (More → Plans / Trainers /
Gym Settings). Nothing is invented here.
**UI style:** Athletic — Barlow Condensed headings, ink-black dashboard band,
signal-orange accent. Phone-first (bottom tab bar on mobile). **No navy-gold**
(that is Target Academy's brand) and **no purple** (that was VidyaSetu).

## Files in this folder

| File | What it is |
|---|---|
| `index.html` | All sections, sidebar (PC) + bottom tab bar (mobile) |
| `styles.css` | Athletic theme, responsive PC + mobile, self-hosted fonts |
| `fonts/*.woff2` | Barlow + Barlow Condensed (Latin), self-hosted — no Google Fonts CDN |
| `config.js` | Central config — Supabase URL/key placeholders, `USE_SUPABASE: false` |
| `data.js` | Data layer + EMPTY seed. app.js only calls `GymData.*` |
| `app.js` | UI only — navigation, members, fees, receipt, attendance |
| `manifest.json` | PWA manifest (installable) |
| `sw.js` | Service worker — network-first for HTML/JS, cache is offline fallback only |
| `icon.svg` | Original gym mark (dumbbell, ink + orange) |
| `icon-192.png` / `icon-512.png` / `icon-maskable-512.png` | PWA icons (generated from icon.svg) |
| `CONTRACT.md` | Internal build contract (not part of the live site) |

## What works in Step 1 (no backend needed)

- Home: today's collection, present today, active members, total due +
  Needs Attention (memberships expiring in 7 days, defaulters) + recent payments
- Members: list, search, trainer filter, New Member form, profile with fee
  history, diet chart, workout plan, recent attendance; edit / archive
- Plans: add / edit / delete (with confirmation). Assign plan → fee record
  auto-created; Renew extends validity + new fee record
- Fees: Billed/Collected/Due summary (month filter), Fee Records,
  Defaulter List (with WhatsApp reminder button), Paid History, Collect
  Payment with overpayment warning, receipt (printable) + WhatsApp receipt
  (wa.me link), Add Fee (Membership/Admission/Other), Expenses
- Attendance: date picker, search, Mark All Present, Save, Present/Absent toggles
- More: Plans, Trainers, Notices, Gym Settings (name/owner/city),
  Data — Export (JSON download) / Import / Reset
- Data persists in the browser via `localStorage` (`gym_live_v1`).
- The app starts EMPTY — no sample members/plans/fees. Real data only.

## How the gym will use it (live version)

1. Files are pushed to GitHub repo `ashutoshkumarjpg67-ai/gym-management-app`
   (branch `main`, root). PNG icons + font files are uploaded via the GitHub
   web-upload flow (the push tool only sends UTF-8 text files).
2. GitHub Pages enabled (Deploy from branch `main`, folder `/ (root)`).
3. Live link: `https://ashutoshkumarjpg67-ai.github.io/gym-management-app/`
4. Share that link with the gym owner. Open in Chrome (PC or phone) →
   "Add to Home Screen" / "Install app" installs it like an app.
5. Owner adds plans, trainers and members. Each gym gets its own account
   (Step 2, Supabase) — data never mixes between gyms.

## Step 2 — Supabase (later, when ready)

1. Create a **separate** Supabase project for the gym app (do NOT reuse
   Target Academy's project).
2. Create tables: `gyms, members, plans, trainers, member_plans, fees,
   payments, attendance, member_extras, notices, expenses` — one row per
   gym's data, filtered by `gym_id`.
3. In `config.js`: paste `SUPABASE_URL` + anon key, set `USE_SUPABASE: true`.
4. In `data.js`: implement `supabaseFetch` / `supabaseSave`. No UI change
   needed — `app.js` only uses `GymData.*`.

## Test locally

```bash
cd ~/workspace/gym-live
python3 -m http.server 8000
# open http://127.0.0.1:8000/ in a browser
node --check app.js && node --check data.js && node --check config.js
```

## Known limits (Step 1)

- No real login/auth yet — one gym account in this build. Real auth +
  multi-gym accounts come with Supabase (Step 2).
- Data lives in each browser's localStorage — it does not sync between
  devices yet. Export/Import (More → Data) is the Step 1 backup route.
- No payment gateway — Cash/UPI/Other is recorded manually at collection.
