# CAM CRM MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable web-first CAM CRM demo: header-based NinjaTrader CSV import, persistent account classification, daily close review, client workspace layout, and report-ready snapshots.

**Architecture:** Replace the current dashboard-first draft with a small domain layer plus React workspace UI. Keep storage local for the demo, but model data as if it can later move to a database. Parse CSVs by normalized headers only, never by column order.

**Tech Stack:** React 19, Vite, PapaParse, localStorage for MVP persistence, Vitest for domain/parser tests, CSS in `src/index.css`.

---

## File Structure

- Create `src/domain/csvImport.js`: normalize headers, detect NinjaTrader file type, parse accounts/strategies/orders/executions by header names.
- Create `src/domain/reconcile.js`: convert parsed files into daily snapshots, preserve classifications, generate operational flags.
- Create `src/domain/demoStore.js`: localStorage-backed client/import/account registry helpers.
- Create `src/domain/report.js`: build report-ready summaries from closed or reviewed snapshots.
- Create `src/domain/csvImport.test.js`: tests for header order independence and file type detection.
- Create `src/domain/reconcile.test.js`: tests for new accounts, persistent classifications, missing accounts, payout violations.
- Modify `package.json`: add Vitest and test script.
- Replace `src/App.jsx`: workspace shell with Pedro sidebar, clients, selected client/date, upload flow, tabs.
- Replace `src/components/UploadArea.jsx`: reusable daily file upload panel.
- Replace `src/components/AccountManager.jsx`: account registry table inside client tabs.
- Replace `src/components/Dashboard.jsx`: client snapshot dashboard and report preview.
- Modify `src/index.css`: workspace layout and dense operational UI.
- Update `README.md`: local run and demo workflow.

## Task 1: Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/domain/csvImport.test.js`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`

Expected: `package.json` and `package-lock.json` include `vitest`.

- [ ] **Step 2: Add test script**

In `package.json`, set:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 3: Write failing parser test**

Create `src/domain/csvImport.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { detectNinjaTraderFileType, parseNinjaTraderCsvText } from './csvImport';

describe('csvImport', () => {
  it('detects accounts files by headers regardless of column order', () => {
    const csv = [
      'Weekly PnL,Display name,Connection,Cash value,Gross realized PnL,Trailing max drawdown,Unrealized PnL,ConnectionStatus',
      '12.5,ACC123,Lucid,50100,100,-250,0,Connected'
    ].join('\n');

    const parsed = parseNinjaTraderCsvText(csv, 'random-name.csv');

    expect(detectNinjaTraderFileType(parsed.headers)).toBe('accounts');
    expect(parsed.type).toBe('accounts');
    expect(parsed.rows[0]).toMatchObject({
      accountName: 'ACC123',
      connection: 'Lucid',
      grossRealizedPnl: 100,
      trailingMaxDrawdown: -250,
      accountBalance: 50100,
      weeklyPnl: 12.5
    });
  });
});
```

- [ ] **Step 4: Run test and verify red**

Run: `npm test -- src/domain/csvImport.test.js`

Expected: FAIL because `src/domain/csvImport.js` does not exist.

- [ ] **Step 5: Commit test harness**

Run:

```bash
git add package.json package-lock.json src/domain/csvImport.test.js
git commit -m "test: add CSV import harness"
```

## Task 2: Header-Based CSV Importer

**Files:**
- Create: `src/domain/csvImport.js`
- Modify: `src/domain/csvImport.test.js`

- [ ] **Step 1: Add tests for all four CSV types**

Extend `src/domain/csvImport.test.js` with:

```js
it('detects strategies files and parses account strategy links by header', () => {
  const csv = [
    'Enabled,Parameters,Account display name,Strategy,Instrument,Realized,Unrealized,Data series,Connection',
    'True,False/10/key/Long/2,NQ JUN26 account should not matter,0 - Bullet Bot-1.1,NQ JUN26,($100.00),$0.00,20 Second,My Funded Futures'
  ].join('\n').replace('NQ JUN26 account should not matter', 'MFF123');

  const parsed = parseNinjaTraderCsvText(csv, 'strategies.csv');

  expect(parsed.type).toBe('strategies');
  expect(parsed.rows[0]).toMatchObject({
    accountName: 'MFF123',
    strategyName: '0 - Bullet Bot-1.1',
    strategyFamily: 'Bullet Bot',
    instrument: 'NQ JUN26',
    enabled: true,
    realized: -100
  });
});

it('detects orders files by headers regardless of file name', () => {
  const csv = [
    'State,Account display name,Strategy,Instrument,Action,Type,Quantity,Limit,Stop,Filled,Avg. price,Remaining,Name,ID,Time',
    'Working,ACC1,0 - RBO-1.8,M2K JUN26,Sell,Limit,2,2957.8,0,0,0,2,PT3-Long,42,6/2/2026 10:47:46 AM'
  ].join('\n');

  const parsed = parseNinjaTraderCsvText(csv, 'anything.csv');

  expect(parsed.type).toBe('orders');
  expect(parsed.rows[0]).toMatchObject({
    accountName: 'ACC1',
    strategyName: '0 - RBO-1.8',
    state: 'Working',
    action: 'Sell',
    quantity: 2
  });
});

it('detects executions or positions files by entry exit headers', () => {
  const csv = [
    'Account display name,E/X,Instrument,Action,Quantity,Price,Time,Order ID,Name,Connection',
    'ACC1,Entry,NQ JUN26,Buy,2,19000,6/2/2026 9:30:00 AM,99,Enter Long,Lucid'
  ].join('\n');

  const parsed = parseNinjaTraderCsvText(csv, 'positions.csv');

  expect(parsed.type).toBe('executions');
  expect(parsed.rows[0]).toMatchObject({
    accountName: 'ACC1',
    entryExit: 'Entry',
    price: 19000,
    quantity: 2
  });
});
```

- [ ] **Step 2: Run tests and verify red**

Run: `npm test -- src/domain/csvImport.test.js`

Expected: FAIL because only the first behavior may be missing implementation.

- [ ] **Step 3: Implement importer**

Create `src/domain/csvImport.js` with:

```js
import Papa from 'papaparse';

const HEADER_ALIASES = {
  connectionstatus: 'connectionStatus',
  connection: 'connection',
  displayname: 'displayName',
  grossrealizedpnl: 'grossRealizedPnl',
  trailingmaxdrawdown: 'trailingMaxDrawdown',
  cashvalue: 'cashValue',
  weeklypnl: 'weeklyPnl',
  unrealizedpnl: 'unrealizedPnl',
  strategy: 'strategy',
  instrument: 'instrument',
  accountdisplayname: 'accountDisplayName',
  dataseries: 'dataSeries',
  parameters: 'parameters',
  unrealized: 'unrealized',
  realized: 'realized',
  enabled: 'enabled',
  action: 'action',
  type: 'orderType',
  quantity: 'quantity',
  limit: 'limit',
  stop: 'stop',
  state: 'state',
  filled: 'filled',
  avgprice: 'avgPrice',
  remaining: 'remaining',
  name: 'name',
  oco: 'oco',
  tif: 'tif',
  id: 'id',
  time: 'time',
  ex: 'entryExit',
  position: 'position',
  orderid: 'orderId',
  price: 'price',
  commission: 'commission',
  rate: 'rate'
};

export function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function canonicalHeader(header) {
  return HEADER_ALIASES[normalizeHeader(header)] || normalizeHeader(header);
}

export function detectNinjaTraderFileType(headers) {
  const keys = new Set(headers.map(canonicalHeader));
  if (keys.has('displayName') && keys.has('cashValue') && keys.has('grossRealizedPnl')) return 'accounts';
  if (keys.has('strategy') && keys.has('accountDisplayName') && keys.has('parameters')) return 'strategies';
  if (keys.has('state') && keys.has('orderType') && keys.has('filled') && keys.has('remaining')) return 'orders';
  if (keys.has('entryExit') && keys.has('orderId') && keys.has('price')) return 'executions';
  return 'unknown';
}

export function parseCurrency(value) {
  if (value == null || value === '') return 0;
  let clean = String(value).trim().replace(/[$,]/g, '');
  if (clean.startsWith('(') && clean.endsWith(')')) clean = `-${clean.slice(1, -1)}`;
  const parsed = Number.parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolFromNt(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizeRow(row) {
  const next = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key || key.startsWith('Unnamed')) continue;
    next[canonicalHeader(key)] = value;
  }
  return next;
}

export function normalizeStrategyFamily(strategyName) {
  const cleaned = String(strategyName || '').replace(/^\d+\s*-\s*/, '').trim();
  if (/bullet\s*bot/i.test(cleaned)) return 'Bullet Bot';
  const token = cleaned.split('-')[0].trim().toUpperCase();
  const known = ['ARPD', 'B2X', 'DJDR', 'FSA', 'IFSP', 'MST', 'OGX', 'PLPI', 'RBO', 'SYFY', 'TDC', 'URGO'];
  if (known.includes(token)) return token;
  if (token.endsWith('PF')) return token.replace(/PF$/, '_PF');
  return token || 'Unknown';
}

function mapByType(type, row) {
  if (type === 'accounts') {
    return {
      connectionStatus: row.connectionStatus || '',
      connection: row.connection || '',
      accountName: row.displayName || '',
      grossRealizedPnl: parseCurrency(row.grossRealizedPnl),
      trailingMaxDrawdown: parseCurrency(row.trailingMaxDrawdown),
      accountBalance: parseCurrency(row.cashValue),
      weeklyPnl: parseCurrency(row.weeklyPnl),
      unrealizedPnl: parseCurrency(row.unrealizedPnl)
    };
  }
  if (type === 'strategies') {
    return {
      strategyName: row.strategy || '',
      strategyFamily: normalizeStrategyFamily(row.strategy),
      instrument: row.instrument || '',
      accountName: row.accountDisplayName || '',
      dataSeries: row.dataSeries || '',
      parametersRaw: row.parameters || '',
      unrealized: parseCurrency(row.unrealized),
      realized: parseCurrency(row.realized),
      connection: row.connection || '',
      enabled: boolFromNt(row.enabled)
    };
  }
  if (type === 'orders') {
    return {
      instrument: row.instrument || '',
      action: row.action || '',
      orderType: row.orderType || '',
      quantity: parseCurrency(row.quantity),
      limit: parseCurrency(row.limit),
      stop: parseCurrency(row.stop),
      state: row.state || '',
      filled: parseCurrency(row.filled),
      avgPrice: parseCurrency(row.avgPrice),
      remaining: parseCurrency(row.remaining),
      name: row.name || '',
      strategyName: row.strategy || '',
      accountName: row.accountDisplayName || '',
      id: row.id || '',
      time: row.time || ''
    };
  }
  if (type === 'executions') {
    return {
      instrument: row.instrument || '',
      action: row.action || '',
      quantity: parseCurrency(row.quantity),
      price: parseCurrency(row.price),
      time: row.time || '',
      id: row.id || '',
      entryExit: row.entryExit || '',
      position: row.position || '',
      orderId: row.orderId || '',
      name: row.name || '',
      commission: parseCurrency(row.commission),
      rate: parseCurrency(row.rate),
      accountName: row.accountDisplayName || '',
      connection: row.connection || ''
    };
  }
  return row;
}

export function parseNinjaTraderCsvText(csvText, fileName = '') {
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields || [];
  const type = detectNinjaTraderFileType(headers);
  const rows = result.data.map(normalizeRow).map((row) => mapByType(type, row)).filter((row) => {
    if (type === 'accounts') return Boolean(row.accountName);
    if (type === 'strategies') return Boolean(row.accountName || row.strategyName);
    if (type === 'orders' || type === 'executions') return Boolean(row.accountName);
    return true;
  });
  return { fileName, type, headers, rows, errors: result.errors };
}
```

- [ ] **Step 4: Run tests and verify green**

Run: `npm test -- src/domain/csvImport.test.js`

Expected: PASS.

- [ ] **Step 5: Commit importer**

Run:

```bash
git add src/domain/csvImport.js src/domain/csvImport.test.js
git commit -m "feat: parse NinjaTrader CSV exports by header"
```

## Task 3: Daily Reconciliation

**Files:**
- Create: `src/domain/reconcile.js`
- Create: `src/domain/reconcile.test.js`

- [ ] **Step 1: Write failing reconciliation tests**

Create `src/domain/reconcile.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { reconcileDailyImport } from './reconcile';

describe('reconcileDailyImport', () => {
  it('preserves existing manual classification and flags only new accounts', () => {
    const registry = {
      ACC1: { accountName: 'ACC1', accountType: 'Funded', status: 'Active', payoutState: 'Not requested' }
    };
    const parsed = {
      accounts: [
        { accountName: 'ACC1', connection: 'Lucid', grossRealizedPnl: 10, accountBalance: 50100, weeklyPnl: 20 },
        { accountName: 'ACC2', connection: 'Lucid', grossRealizedPnl: 0, accountBalance: 50000, weeklyPnl: 0 }
      ],
      strategies: [
        { accountName: 'ACC1', strategyName: '0 - RBO-1.8', strategyFamily: 'RBO', enabled: true, instrument: 'M2K JUN26' }
      ],
      orders: [],
      executions: []
    };

    const result = reconcileDailyImport({ clientId: 'client-1', date: '2026-06-08', registry, parsed });

    expect(result.accounts.ACC1.accountType).toBe('Funded');
    expect(result.accounts.ACC2.accountType).toBe('Unassigned');
    expect(result.flags.map((flag) => flag.type)).toContain('New account');
  });

  it('raises critical flag when payout hold account has an enabled strategy', () => {
    const registry = {
      ACC1: { accountName: 'ACC1', accountType: 'Funded', status: 'Payout Hold', payoutState: 'Payout requested' }
    };
    const parsed = {
      accounts: [{ accountName: 'ACC1', connection: 'Lucid', grossRealizedPnl: 10, accountBalance: 50100, weeklyPnl: 20 }],
      strategies: [{ accountName: 'ACC1', strategyName: '0 - RBO-1.8', strategyFamily: 'RBO', enabled: true, instrument: 'M2K JUN26' }],
      orders: [],
      executions: []
    };

    const result = reconcileDailyImport({ clientId: 'client-1', date: '2026-06-08', registry, parsed });

    expect(result.flags).toContainEqual(expect.objectContaining({
      type: 'Payout hold violation',
      severity: 'Critical',
      accountName: 'ACC1'
    }));
  });
});
```

- [ ] **Step 2: Run tests and verify red**

Run: `npm test -- src/domain/reconcile.test.js`

Expected: FAIL because `src/domain/reconcile.js` does not exist.

- [ ] **Step 3: Implement reconciliation**

Create `src/domain/reconcile.js` with functions for safe aliases, default account metadata, snapshot construction, and flag generation.

- [ ] **Step 4: Run tests and verify green**

Run: `npm test -- src/domain/reconcile.test.js`

Expected: PASS.

- [ ] **Step 5: Commit reconciliation**

Run:

```bash
git add src/domain/reconcile.js src/domain/reconcile.test.js
git commit -m "feat: reconcile daily client imports"
```

## Task 4: Local Demo Store

**Files:**
- Create: `src/domain/demoStore.js`
- Create: `src/domain/demoStore.test.js`

- [ ] **Step 1: Write tests for store migration-free behavior**

Test that a new client can be created, account metadata updates persist in the returned state, and imports are appended by date.

- [ ] **Step 2: Implement pure store helpers**

Implement pure helpers that do not directly touch React:

- `createInitialState()`
- `addClient(state, name)`
- `upsertAccountMeta(state, clientId, accountName, patch)`
- `appendDailyImport(state, clientId, importResult)`
- `getLatestClientImport(client)`

- [ ] **Step 3: Run tests**

Run: `npm test -- src/domain/demoStore.test.js`

Expected: PASS.

- [ ] **Step 4: Commit store**

Run:

```bash
git add src/domain/demoStore.js src/domain/demoStore.test.js
git commit -m "feat: add local CRM demo store"
```

## Task 5: Workspace UI

**Files:**
- Replace: `src/App.jsx`
- Modify: `src/components/UploadArea.jsx`
- Modify: `src/components/AccountManager.jsx`
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: Replace dashboard-first app shell**

Create a sidebar workspace with Pedro, clients, and Team Overview mock entry.

- [ ] **Step 2: Add client header and date selector**

Default to today's date. Show `Upload Daily Files` and `Build Daily Report`.

- [ ] **Step 3: Add client tabs**

Render `Evaluations`, `Funded`, conditional `Cash`, `Credentials & Notes`, and `Price Checks`.

- [ ] **Step 4: Wire upload to parser and reconciliation**

Upload reads files as text, parses by headers, groups by detected type, reconciles with registry, then stores daily import.

- [ ] **Step 5: Commit workspace UI**

Run:

```bash
git add src/App.jsx src/components src/index.css
git commit -m "feat: build client workspace UI"
```

## Task 6: Report Preview and Demo Polish

**Files:**
- Create: `src/domain/report.js`
- Modify: `src/components/Dashboard.jsx`
- Modify: `README.md`

- [ ] **Step 1: Add report summary helper**

Build client-safe daily summary from one import, using aggregate balance language and separating Cash.

- [ ] **Step 2: Add report preview modal or panel**

For MVP, `Build Daily Report` may render a printable report panel using `window.print()` before adding full PDF export.

- [ ] **Step 3: Add Team Overview mock**

Show team-level cards based on current local demo clients plus clearly marked mock account managers.

- [ ] **Step 4: Update README**

Document demo workflow: create client, upload files, classify accounts, close/review, build report.

- [ ] **Step 5: Commit polish**

Run:

```bash
git add src/domain/report.js src/components/Dashboard.jsx src/App.jsx README.md
git commit -m "feat: add report preview and demo overview"
```

## Verification

Run after implementation:

```bash
npm test
npm run build
git diff --check
```

Expected:

- All tests pass.
- Vite build succeeds.
- No whitespace errors.

## Self-Review

Spec coverage:

- Header-based CSV parsing: Task 2.
- Manual daily close: Tasks 3 and 5.
- Persistent classification: Tasks 3 and 4.
- Evaluation/Funded/Cash/Bullet Bot shape: Tasks 3 and 5.
- Flags: Task 3 and UI in Task 5.
- PDF/report path: Task 6.
- Team Overview mock: Task 6.

Known deferral:

- Full XML signature matching is not in the first implementation batch. The data model keeps `strategyFamily`, `parametersRaw`, and config status so refined XML matching can be added immediately after the daily workflow is reliable.
