# App Review & Feedback — Manager Walkthrough (2026-07-02)

Structured feedback captured while reviewing the deployed app
(`https://cam-crm-vincere.vercel.app/`) and creating real clients. Grouped by
area so the company developer (Natanel) can implement and version each change
clearly.

> **Companion docs:** implementation hand-off in
> [`2026-07-02-patch-notes-for-natanel.md`](./2026-07-02-patch-notes-for-natanel.md)
> (what changed / where + the reported deployed-build bug); NinjaTrader R&D in
> [`2026-07-02-ninjatrader-data-research.md`](./2026-07-02-ninjatrader-data-research.md).

---

## 0. Blocker to resolve first — source of truth / repo divergence

The deployed Vercel app already has things this GitHub repo does **not**:
Supabase/database connection, a `/database` route, DB-backed login, DB-backed
SOP items. This GitHub repo is still the original **localStorage demo**.

That means the deployed version has **diverged** from this repo. Before we push
UI changes here and ask the dev to "pull", we need to agree on the workflow:

- **Option A:** This GitHub repo is the single source of truth. Natanel pushes
  his DB integration back here, we branch/PR on top, he pulls. (Preferred —
  everything versioned in one place.)
- **Option B:** Natanel keeps his own repo/branch and we hand him this feedback
  doc + reference changes as a spec, and he re-implements on his side.

**Decision needed.** The rest of this doc is written to work either way: it's a
precise spec, and where useful it points at the exact file/line in this repo.

---

## 1. Manager portal — lifecycle & performance focus (new concept)

Idea: a Manager-specific surface (distinct from the CAM view) focused on the
**client lifecycle** and **team performance**. Goals:

- Show what stage each client is in and how to move them forward.
- Surface insight on how to manage clients / troubleshoot issues.
- Self-measure performance metrics per CAM so the team is **evaluable**.

This is the strategic layer. Candidate metrics/views (to refine):

- Lifecycle funnel: intake → onboarding → evaluation → funded → payout → churn.
- Per-CAM scorecard: accounts managed, avg daily/weekly PnL, pass rate,
  days-to-funded, days-to-payout, flags resolved, SLA on client contact.
- "Clients needing attention" (stalled stage, overdue contact, open flags).
- Playbook hints per stage (what the CAM should do next).

Ties directly to the `start date` field (section 2) as the lifecycle anchor.

---

## 2. Client profile form ("Credentials & Notes") — field changes

Current form: `src/App.jsx` → `CredentialsTab` (~L4203–4315).

| Field | Current | Change requested |
|---|---|---|
| Phone | free text | OK, keep |
| Time zone | free text (`L4235`) | **Dropdown list** — no free typing |
| "Discord / Telegram" (`L4237`) | one combined field | **Discord only** — remove Telegram, relabel to `Discord username` |
| Prop firm (`L4236`) | free text in profile | **Remove from profile** — belongs in VPS/platform section as a per-prop-firm toggle (see §3) |
| Client stage (`L4243`) | dropdown | OK, keep (manager moves it) |
| Country (`L4269`) | free text | **Typeahead**: lets you type but suggests options/autocomplete. (Not a hard remove — keep it but make it a suggest list.) |
| Start date (`L4270`) | date | OK, keep — this is the lifecycle anchor |
| Preferred channel / Language | dropdowns | (not mentioned — leave for now) |

### New field: **Product Key** (important, missing)
Every client has a **product key** that must be entered in NinjaTrader for the
algos to work. Add a `Product Key` field to the client profile (copyable, like
the other credential rows). High priority.

### Multiple emails per client
Some clients have several email addresses. Need to store more than one **without
cluttering the UI** (not a stack of empty rows). Options to consider:

- A primary email + an "additional emails" chips/tags input (comma or enter to
  add), collapsed by default.
- Keep primary email as-is; extra emails as removable pills below it.

Today the workaround is dumping extra emails in Notes — replace that.

---

## 3. VPS / Platform access — multiple prop firms + login fixes

Current section: `src/App.jsx` (~L4274–4289).

### Login field fixes (currently mislabeled/wrong)
- `NT login` (`L4285`) → should be **NinjaTrader username**.
- `Prop firm login` (`L4286`) is wrong — the field we actually need is the
  **NinjaTrader password**. (NT password field is currently missing entirely.)
- Net result per client credentials: **NinjaTrader username + NinjaTrader
  password** (mapped from intake `NT8 username` / `NT8 password`).

### Multiple prop firms per client (missing)
A client can have **multiple prop firms**. The prop-firm data belongs here (VPS
/ platform access), not in the profile. Each prop firm entry needs:

- **Prop firm connection type toggle: Tradovate vs Rithmic** (only these two).
- The prop firm name  
- The prop-firm login/credentials for that connection.
- Ability to **add multiple** prop firm entries per client.

(Intake asks "Are you using Tradovate or Rithmic?" + "Tradovate credentials" —
maps straight into this.)

### CAM add/remove-client permissions (see §6) — also review here
Review and justify which CAM roles can add/remove clients from the DB.

---

## 4. Daily SOP — replace with the real checklist

Current SOP (`src/components/DailySOP.jsx`, `SOP_SECTIONS` L4–67) is a generic
placeholder and is **out of date**. Replace its content with the real CAM daily
checklist (source: `CAM_checklist.docx`). Real steps:

1. Confirm charts are moving properly, no delayed-data indicators. To verify:
   disconnect all prop-firm connections and reconnect one at a time to find
   which connection has delayed data.
2. For new clients, verify the time zone is set to **EST**.
3. Ensure the correct instrument is selected for each algo.
4. Check if the contract is current or needs rollover.
5. Confirm the correct timeframe is set for each algo.
6. Make sure there are no duplicated algos running.
7. Verify all accounts are properly assigned.
8. All funded accounts should be active unless agreed as reserves with client.
9. Review account balances.
10. Identify accounts at payout level (**54k**).
11. Identify evaluations that have passed the challenge (**53k**).
12. If an account is approaching payout (within ~$300–$500), reduce the stack to
    a single algo — recommend **OGX** on a low-risk setting.

Also update the "Quick Reference" cards (L226+) to match real workflow.

---

## 5. Intake Google Sheet → auto-populate unassigned clients

We receive a **Google Sheet** with client intake info (clients fill it in
themselves). Source sample: `CAM_Service_Setup_Form_Responses.xlsx`.

Desired flow (for **new** clients only):

- Connect / ingest the Google Sheet.
- Manager sees a list of **unassigned clients** already populated from intake,
  ready to be **assigned to a CAM**.
- No manual re-typing of the info the client already provided.

For now: at minimum **leave the integration point ready in the route** so the
developer can wire the Google Sheet connection.

**Old/existing clients:** do **not** connect this way — those are a **manual
migration** (some are already inactive, etc., but still count for lifecycle
history).

### Intake sheet → form field mapping
| Intake column | Maps to |
|---|---|
| First Name / Last Name | Full name |
| Whop Registration Email | Email (primary) |
| VPS IP Address | VPS IP |
| VPS Username | VPS Username |
| VPS Password | VPS Password |
| Preferred Communication Time | Preferred comm time / notes |
| Special Instructions or Notes | Notes |
| Discord Username | Discord username |
| NT8 username | NinjaTrader username |
| NT8 password | NinjaTrader password |
| Are you using Tradovate or Rithmic? | Prop firm connection toggle |
| Tradovate credentials | Prop firm credentials |

---

## 6. CAM permissions — per-CAM create/delete access

Add a **manager-controlled permission** to let CAMs create/add and delete
clients in the DB, toggleable **per CAM** (in each CAM's options):

- **Senior CAM** → can be granted create/delete.
- **Normal CAM** → no.
- **Training CAM** → no.

Manager (supervisor) grants this. Note: current roles in code are only
`Manager` and `CAM` (`src/domain/userStore.js` `USER_ROLES`). We likely need CAM
seniority (Senior / Normal / Training) + a per-CAM `canManageClients` flag.

**Migration exception:** during the initial migration we have a large backlog,
so **enable create/delete for everyone temporarily** to clear it, then tighten.

Also: whatever we decide, the add/remove-client permission should be **justified
and measured/audited** (who created/deleted what).

---

## 7. UI polish — replace emoji with vector icons

Remove emoji used as UI graphics; use vector icons (lucide-react, already a
dependency). Known instances:

- Show/hide passwords button uses `🙈` / `👁` (`src/App.jsx` L4278) — the
  deployed version reportedly shows a "monkey covering eyes" style emoji.
  Replace with lucide `Eye` / `EyeOff`.
- Email link `✉` (`L4224`) → lucide `Mail`.
- Phone link `📞` (`L4231`) → lucide `Phone`.
- Daily SOP section emojis `🌅 📡 🔍 📊 ✅` (`DailySOP.jsx`) → lucide icons.

General rule going forward: **no emoji in the product UI.**

---

## 8. NinjaTrader historical data — research (R&D, separate track)

Question: NinjaTrader has a Historical Data / Market Replay tool that can run
historical data against our algos. Where does NT store this data, can it be
exported, and could a Python script on the machine export what we need
automatically? Value: with historical data we could compare different clients'
histories for the same algos — much richer analytics.

> Findings are compiled in the companion file:
> [`docs/feedback/2026-07-02-ninjatrader-data-research.md`](./2026-07-02-ninjatrader-data-research.md).
> Short version: account/execution data is easy to pull (NT stores it in a local
> **SQLite** DB readable from Python); historical price `.ncd` files are
> proprietary and hard; the officially-supported export path is a small
> **NinjaScript** that writes CSV.

This is a separate development track, not part of the immediate UI fixes.

---

## Priority summary

**Quick wins (safe, unambiguous):** §7 emoji→icons, §3 NT username/password
relabel, §2 Discord-only, §3 Tradovate/Rithmic toggle, §2 time zone dropdown,
§2 country typeahead, §2 product key field.

**Medium:** §4 SOP replacement, §2 multiple emails, §3 multiple prop firms.

**Larger / needs design:** §1 manager portal, §5 Google Sheet intake, §6 CAM
permissions model.

**R&D:** §8 NinjaTrader export.
