# CAM CRM — Next Features Plan (CAM Overview, Trade Drill-down, XML/Param Classification)

> Date: 2026-06-08 · Owner: Pedro · Demo target: Thursday 2026-06-11
> Execute phase-by-phase. Each phase is self-contained: a fresh context can pick it up from its "What / Files / Steps / Verify" block.

**Stack:** React 19 + Vite SPA, domain layer in `src/domain/*`, UI in `src/App.jsx` + `src/components/*`, localStorage persistence, Vitest. No backend.

**Priority / sequencing:**
1. Phase 1 — CAM Overview (demo headline). Lowest risk, highest demo value.
2. Phase 2 — Per-strategy trade drill-down. Medium. Needs orders↔executions join.
3. Phase 3 — Strategy classification (params + XML). Deepest/riskiest. Likely **post-demo**; ship Phase 3A (CSV params) for the demo if time allows, defer 3B (XML matching).

---

## Phase 0: Real Data Shapes (grounding — already inspected, do NOT re-assume)

Source files live in repo root (gitignored, local only).

### Strategies CSV (`*str.csv`) → already parsed by `src/domain/csvImport.js#mapStrategy`
Columns: `Strategy, Instrument, Account display name, Data series, Parameters, Unrealized, Realized, Connection, Enabled`.

- `Strategy` example: `0 - B2X-2.5` → family `B2X`, version `2.5` (version already parsed via `parseStrategyVersion`). The leading `0 -` is a slot index, NOT the risk tier.
- **`Parameters` is self-describing**: `value/value/... (Name1/Name2/...)`. The parenthesized list are the NinjaScript property names; the leading list are their values, in the same order. Real example (B2X):
  - values: `38/5/22/5/False/30/False/2/True/1/1/2020 4:45:00 PM/V-...W/Both/3/3/2/125/150/200/127/100/1/1/2020 11:30:00 AM/1/1/2020 10:00:00 AM/True/70/15/True`
  - names: `(B2X1/B2X2/B2X3/B2X4/Backtest/BreakEvenAfterTicks/BreakEvenIsOn/BreakEvenOffset/CloseAllOpenTrades/CloseAllOpenTradeTime/LicenseKey/MyTradeDirection/PosSize1/PosSize2/PosSize3/ProfitTargetTicks1/ProfitTargetTicks2/ProfitTargetTicks3/StartTrailAfterTicks/StopLossTicks/TradeEndTime/TradeStartTime/TradeWindowIsOn/TrailByTicks/TrailFrequency/TrailIsOn)`
  - Risk-relevant fields available directly: `MyTradeDirection`, `PosSize1..3`, `ProfitTargetTicks1..3`, `StopLossTicks`, `TradeStartTime/TradeEndTime`.
- **HAZARD:** naive `split('/')` breaks because values contain dates (`1/1/2020 4:45:00 PM` = 2 extra slashes) and a license key may vary. Do NOT zip by raw index. Strategy: split the names list (clean, no slashes inside a name) to get N field names; then consume the values left-to-right, treating any `M/D/YYYY h:mm:ss AM/PM` run as a single date token (regex), so value-count realigns to N. Validate `values.length === names.length` after date coalescing; if mismatch, mark `paramsParsed: false` and skip (do not guess).

### Orders CSV (`*ord.csv`)
Columns include: `Instrument, Action, Type, Quantity, Limit, Stop, State, Filled, Avg. price, Remaining, Name, Strategy, OCO, TIF, Account display name, ID, Time`.
- Has **`Strategy`** (e.g. `0 - OGX-PF-2.4`) and order **`ID`**. This is the only file that links an order to a strategy.

### Executions/positions CSV (`*.csv`, the 4th file)
Columns: `Instrument, Action, Quantity, Price, Time, ID, E/X, Position, Order ID, Name, Commission, Rate, Account display name, Connection`.
- Has **`Order ID`** and `E/X` (Entry/Exit), `Name` (e.g. `PT2-Long`), but **NO `Strategy`**.
- **Join key for drill-down:** `execution.orderId === order.id` → gives `order.strategyName`. Confirm both map through `mapExecution`/`mapOrder` (fields `orderId`, `id`, `strategyName`).

### XML set files (`Vincere Trading 6.0/3 - Set Files/<FAMILY>/*.xml`)
- One folder per family: `RBO, RBO_PF, B2X, OGX, OGX_PF, ARPD, ARPD_PF, IFSP, IFSP_PF, DJDR, DJDR_PF, PLPI, PLPI_PF, SYFY, SYFY_PF, URGO, BulletBot, MotusTemplar, FossaAssassin, TendoCentinel`. ~45 files in `RBO_PF` alone.
- **Filename is a label record.** Normal algos: `3 - RBO (M2K) - 10 Min Candle - High Risk - v5 - Period 2.xml` → risk tier prefix `3`, family `RBO`, instrument `M2K`, candle `10 Min`, **risk `High`**, **version `v5`**, **period `2`**.
- BulletBot: `1-L - Bullet Bot - (1 Day Pass) LONG - 4 Mini - 50K (3k Target) - Period 0.xml` → pass `1 Day Pass`, direction `LONG`, size `4 Mini`, account `50K`, target `3k`, period `0`.
- XML body (`<StrategyTemplate>`) holds the actual settings; inner `<Name>` e.g. `2 - RBO-PF-1.8` (risk-tier prefix + family + version). Bars period under `<BarsPeriodSerializable><Value>10</Value>` (= 10 min).
- **Risk + period are NOT in the running CSV strategy name** — only in XML filenames. To attach them to a running strategy you must match the CSV param signature to an XML (Phase 3B).

---

## Phase 1: CAM Overview (rename + algorithm rollup)  ★ demo headline

**What:** Replace the `Team Overview` mock with a `CAM Overview` = the account manager's cross-account view: every algorithm running across ALL of this CAM's clients/accounts/VPS, average performance per algorithm `family + version`, and a flag when an account's instance deviates from its peers running the same algorithm. (True multi-CAM "Team Overview" stays out of scope — keep a small clearly-mocked footnote if desired.)

**Files:**
- Create `src/domain/camOverview.js` — pure aggregation from `state.clients`.
- Create `src/domain/camOverview.test.js`.
- Modify `src/App.jsx` — rename `Team Overview` nav + `TeamOverviewMock` → `CamOverview`; pass `state.clients`.
- Modify `src/index.css` — table styling (reuse `.ops-table`, `.panel`).

**Data source:** each client has `dailyImports`; use the latest import per client (`getLatestClientImport` from `demoStore.js`) → its `snapshots[]` (each snapshot has `accountName`, `grossRealizedPnl`, `weeklyPnl`, `strategies[]`). Join snapshot.account → client.accountRegistry for `accountType`/`alias`.

**Steps:**
1. `buildCamOverview(clients)` returns:
   - `algorithms[]`: grouped by key `family + ' ' + version` (fall back to `strategyName` when family unknown). Per group: `instances` (count of account+strategy pairs), `accounts` (distinct), `avgRealized`, `avgWeekly`, `totalRealized`, list of per-instance `{ clientName, accountAlias, realized, weekly, enabled }`.
   - `deviationFlags[]`: for each algorithm group with ≥3 instances, compute mean+stdev of `realized`; flag any instance where `realized < mean - 1.5*stdev` (running materially worse than peers) → `{ severity:'Warning', algorithm, clientName, accountAlias, message }`. Guard: skip groups with <3 instances or zero variance.
2. UI `CamOverview`: top metric cards (distinct algorithms, total accounts, instances, open deviation flags). A `Deviation alerts` panel (reuse flag styling). An `ops-table`: Algorithm | Version | Accounts | Instances | Avg daily | Avg weekly | Total. Expandable row → per-instance lines (client · account · realized · weekly).
3. Rename nav label and state: `showTeam`→`showOverview`, button text `CAM Overview`. Keep the empty-state when no clients.

**Verify:**
- `npm test -- camOverview` green (cases: grouping across 2 clients, avg math, deviation flag fires for an outlier, no flag with <3 instances).
- `npm run build` + `npm run lint`.
- Browser: inject ≥2 clients with overlapping algorithm families; CAM Overview lists algorithms with averages and a deviation alert for a deliberately bad instance.

**Anti-patterns:** Don't read localStorage inside the domain fn (pass `clients`). Don't divide by zero (empty groups). Don't flag groups too small to be statistical.

---

## Phase 2: Per-strategy trade drill-down

**What:** In `Dashboard.jsx`, expanding an account already shows its strategies (`AccountDetail`). Make each strategy row clickable to expand a third level: that strategy's trades for the day (time, action, qty, price, entry/exit), sourced from executions attributed via orders.

**Files:**
- Modify `src/domain/reconcile.js` — attribute executions to strategies via the orders join; expose `executionsByStrategy` (or annotate executions with `strategyName`).
- Modify `src/domain/reconcile.test.js` — test the join.
- Modify `src/components/Dashboard.jsx` — nested expandable strategy → trades table.
- Modify `src/index.css` — nested detail styling.

**Steps:**
1. In `reconcileDailyImport`, build an `orderId → strategyName` map from `parsed.orders` (`order.id → order.strategyName`). Annotate each execution: `strategyName = orderMap[execution.orderId] || ''`. Keep the annotated `executions` on the import (back-compat: existing `executions` array, now with `strategyName`). Some executions may not match (manual/flat) → leave `strategyName` empty, bucket under "Unattributed".
2. `AccountDetail`: give each `strategy-detail` row a click handler toggling an inner `expandedStrategy` state (keyed by `accountName+strategyName`). When open, render a compact trades table filtered by `execution.accountName === row.accountName && execution.strategyName === strategy.strategyName`: columns Time | Action | Qty | Price | E/X | Name. Empty → "No trades attributed to this strategy today."
3. Keep the existing `MiniTimeline` (account-level price ticks) as-is; the per-strategy table is additive.

**Verify:**
- `npm test -- reconcile` green (execution gets strategyName from matching order; unmatched stays empty).
- Browser: upload real 4 CSVs (root samples), expand account → strategy → see its trades. Cross-check a couple of `Order ID`s against the orders file.

**Anti-patterns:** Executions have no `Strategy` column — do NOT invent one; always go through the orders join. Don't assume every execution matches an order.

---

## Phase 3: Strategy classification (params now, XML matching later)

Split so the safe part can ship for the demo and the risky part can defer.

### Phase 3A — Parse CSV `Parameters` (no XML, lower risk)
**What:** Decode the self-describing `Parameters` column into structured settings and surface risk-relevant fields per strategy.

**Files:** `src/domain/csvImport.js` (+ `csvImport.test.js`), `src/components/Dashboard.jsx`, `src/components/AccountManager.jsx`.

**Steps:**
1. Add `parseStrategyParameters(parametersRaw)`:
   - Split on the parens: `valuesPart` and `namesPart`. `names = namesPart.split('/')`.
   - Tokenize `valuesPart`: walk left-to-right; coalesce any date run matching `/^\d{1,2}\/\d{1,2}\/\d{4}.*(AM|PM)$/` (built by re-joining slash fragments that form a date+time) into one token. Produce `values` of length `names.length`; if it can't realign, return `{ parsed:false }`.
   - Zip `names↔values` → object. Derive `{ direction: MyTradeDirection, posSizes:[PosSize1..3], profitTargets:[ProfitTargetTicks1..3], stopLossTicks: StopLossTicks, tradeWindow:[TradeStartTime,TradeEndTime], parsed:true }`.
2. In `mapStrategy`, add `params = parseStrategyParameters(parametersRaw)`; expose `direction` from params when present (replaces the current `inferDirection`, keep fallback), plus `posSizes`, `stopLossTicks`, `profitTargets`.
3. UI: in `AccountDetail` strategy row, show `Contracts {posSizes} · Stop {stopLossTicks}t · Target {profitTargets}t` when `params.parsed`. AccountManager can show a read-only "Settings" hint for evals.

**Verify:** `npm test -- csvImport` with a real B2X Parameters string (date-in-values case) → correct `stopLossTicks`/`posSizes`/`direction`, and a malformed string → `parsed:false`. Build + lint.

**Anti-patterns:** Do NOT index params by fixed position. Do NOT split dates. If counts mismatch, fail closed (`parsed:false`) — never guess a stop/size.

### Phase 3B — XML signature matching (deepest; post-demo)
**What:** Attach **risk level + period + canonical version** to a running strategy by matching its param signature to the XML set files, then reading the label from the matched filename.

**Files:** new `src/domain/xmlMatch.js` (+ test); a build-time/import-time index of XML metadata (filenames are gitignored & local — load via a manual folder upload or a pre-generated JSON index committed as fixture-free tooling).

**Steps (outline — refine before building):**
1. Parse XML filenames into records: `{ family, instrument, candle, risk, version, period, passType?, direction?, size?, target? }` via a filename regex per convention (normal vs BulletBot).
2. Parse each XML body for the comparable risk params (PosSize/ProfitTargetTicks/StopLossTicks/TradeDirection) to form a `signature`.
3. For a running strategy, build the same signature from Phase 3A params; match within the family folder; on unique match attach `{risk, period, version}`; on ambiguous/none → `Unknown / custom config` + a `Strategy config unknown` flag (type already in spec).
4. Surface risk/period in Dashboard pill + AccountManager classification; raise `Strategy config mismatch` when a funded/eval account runs a version/risk that disagrees with its manual classification.

**Decisions to lock before 3B:** how XML metadata reaches the browser (manual upload of the Set Files folder vs a committed JSON index generated by a small script). Browser SPA cannot read the local XML folder directly.

**Anti-patterns:** Don't match every strategy against every XML globally — scope to the family folder (per existing spec). Don't block the demo on 3B.

---

## Final Verification (every phase)
```
npm test
npm run build
npm run lint
git diff --check
```
Then a browser smoke test with the root sample CSVs (upload → classify → report). Commit per phase with a `feat:`/`fix:` message; keep `main` green.

## Coverage map
- CAM Overview: Phase 1.
- Trade drill-down (executions↔orders join): Phase 2.
- Version (done) + direction/stops/size/targets: Phase 3A.
- Risk + period + config mismatch: Phase 3B (post-demo).
