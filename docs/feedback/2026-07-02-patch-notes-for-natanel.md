# Patch Notes → for the DB/deployment implementation (2026-07-02)

Hi — we updated the **GitHub repo** with a first batch of UI and
data-model changes. Since you run your diff against the Supabase-connected repo,
this note explains **what changed and where** so you can port it. The GitHub repo
is up to date; you can pull/diff from there. Full context lives in
[`2026-07-02-manager-review.md`](./2026-07-02-manager-review.md); NinjaTrader R&D
in [`2026-07-02-ninjatrader-data-research.md`](./2026-07-02-ninjatrader-data-research.md).

> Note: these edits were made against the current GitHub codebase (the localStorage
> demo), so treat them as a precise **spec + reference implementation** to mirror in
> the DB-backed build, not a drop-in merge.

---

## 🐞 Bug reported (deployed build) — please prioritize

**CAM edits to a client are not visible to the Manager viewing that same client.**
Steps: edit Pedro's client profile as a CAM → open the Manager view of Pedro →
changes are missing. It looks like the client record isn't a single shared source
between roles (the two views read/write different rows or caches).

Expected: one client record is the single source of truth; any role editing it
sees the same data. Please check that CAM and Manager read/write the same
`clients` / `client_credentials` rows (no per-role copy).

---

## Changes made in this batch

Files touched: `src/App.jsx` (CredentialsTab + contact card),
`src/components/DailySOP.jsx`.

### 1. Client profile form (`CredentialsTab`)
- **Time zone** → now a **dropdown** (was free text). Options list in
  `TIMEZONE_OPTIONS`. (Daily SOP requires EST for new clients.)
- **"Discord / Telegram"** → renamed to **"Discord username"** (Telegram dropped).
  Still stored in `profile.messenger`.
- **Country** → **typeahead** (`<input list>` + `<datalist id="country-options">`,
  `COUNTRY_OPTIONS`): free text but suggests known countries.
- **Prop firm** field **removed from the profile** (moved to the new Prop firms
  section — see §3).
- **New: Product key** (`profile.productKey`) — the NinjaTrader product key each
  client must enter for algos to work. Copyable field.
- **New: Additional emails** (`profile.additionalEmails: string[]`) — add multiple
  emails as removable chips (Enter or + to add), no row clutter. Replaces the
  old "put extra emails in Notes" workaround.
- Removed the unused Telegram option from the "Preferred channel" dropdown.

### 2. VPS / Platform access
- **`NT login`** → relabeled **"NinjaTrader username"** (`credentials.ntLogin`).
- **New: "NinjaTrader password"** (`credentials.ntPassword`, masked). The old
  "Prop firm login / password" fields here were wrong/misplaced and were
  **removed from this section** (prop-firm creds now live in §3).
- Field labels clarified: "VPS username" / "VPS password".

### 3. New: Prop firms section (multiple per client)
- New data shape: **`client.propFirms: Array<{ id, connection, login, password }>`**
  where `connection` is a toggle of **`Tradovate` | `Rithmic`** (`PROP_FIRM_CONNECTIONS`).
- Add / remove multiple prop firms per client.
- **DB implication:** a client → many prop firms (e.g. a `prop_firms` table with
  `client_id` FK, `connection` enum, `login`, `password_encrypted`). Same for
  `additional_emails` (either a child table or a JSON column).

### 4. Daily SOP (`DailySOP.jsx`)
- Replaced the placeholder SOP with the **real CAM daily checklist**
  (source: `CAM_checklist.docx`): Connections & Data, Algo Configuration,
  Accounts, Payout & Evaluation Levels. Includes the payout (54k) / passed-eval
  (53k) thresholds and the "reduce to single algo (OGX low-risk) within
  $300–$500 of payout" rule.

### 5. UI polish — emoji → vector icons (lucide-react)
- Password show/hide button now uses **Eye / EyeOff** (was the 🙈/👁 "monkey" emoji).
- Email/phone actions use **Mail / Phone** icons (were ✉ / 📞).
- Contact card chips and SOP section headers now use lucide icons (were emoji).
- **Scope note:** this pass covered the Credentials/profile area, the password
  toggle, the contact card, and the SOP. **Emoji intentionally kept** in the
  outbound WhatsApp/report message templates (`src/domain/report.js`, client
  message templates) — those are client-facing messages where emoji are expected.
  A handful of other in-app button emojis remain and can be swept next.

**Verification:** `npm test` → 334 passing; `vite build` clean; no new lint errors
(50 baseline = 50 after).

---

## Still pending (need design / your input) — not in this batch

From the manager review, the larger items:

- **Intake Google Sheet → auto-populate unassigned clients** (new clients only;
  existing clients are a manual migration). Column→field mapping is in the review
  doc. Please leave a route/integration point ready for the Sheet connection.
- **CAM permissions:** manager-granted, per-CAM create/delete-client access
  (Senior CAM yes; Normal/Training no), audited. During the initial migration
  backlog, enable create/delete for everyone temporarily.
- **Manager portal:** client-lifecycle + per-CAM performance metrics (the new
  data focus — using our multi-client "lab" to compare algos across clients).
  Full concept in [`2026-07-02-manager-review.md` §1](./2026-07-02-manager-review.md#1-manager-portal--lifecycle--performance-focus-new-concept):
  lifecycle funnel (intake → onboarding → evaluation → funded → payout → churn),
  per-CAM scorecard (days-to-funded, days-to-payout, pass rate, avg PnL), and
  the `start date` field as the lifecycle anchor.

## NinjaTrader

We'll always be running the **latest available NinjaTrader version** on the VPSs.
That matters because recent NT8 stores its DB as **SQLite** (readable directly
from Python) vs the older `.sdf`. See the research doc for the export plan.
