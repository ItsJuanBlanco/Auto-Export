import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConsistencyWarnings, buildDisconnectAlerts, buildPayoutAlerts } from './App';

// ── buildConsistencyWarnings ──────────────────────────────────────────────────

function makeClientWithPnls(accountName, pnls, accountType = 'Funded') {
  return {
    accountRegistry: {
      [accountName]: { accountName, accountType, status: 'Active' },
    },
    dailyImports: pnls.map((pnl, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      snapshots: [{ accountName, grossRealizedPnl: pnl }],
    })),
  };
}

describe('buildConsistencyWarnings', () => {
  it('returns empty for client with fewer than 3 days of data', () => {
    const client = makeClientWithPnls('ACC1', [500, 300]);
    expect(buildConsistencyWarnings(client)).toHaveLength(0);
  });

  it('returns empty when best day is ≤30% of total positive PnL', () => {
    // Best day 300 out of 300+300+300+300 = 1200 → 25% — below threshold
    const client = makeClientWithPnls('ACC1', [300, 300, 300, 300]);
    expect(buildConsistencyWarnings(client)).toHaveLength(0);
  });

  it('flags Warning when best day is 31–50% of total positive PnL', () => {
    // Best day 400 out of 400+300+300+300 = 1300 → ~31%
    const client = makeClientWithPnls('ACC1', [400, 300, 300, 300]);
    const warnings = buildConsistencyWarnings(client);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('Warning');
  });

  it('flags Critical when best day exceeds 50% of total positive PnL', () => {
    // Best day 600 out of 600+100+100 = 800 → 75%
    const client = makeClientWithPnls('ACC1', [600, 100, 100]);
    const warnings = buildConsistencyWarnings(client);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('Critical');
    expect(warnings[0].ratio).toBe(75);
  });

  it('skips non-funded accounts', () => {
    const client = makeClientWithPnls('EVAL1', [600, 100, 100], 'Evaluation - Standard');
    expect(buildConsistencyWarnings(client)).toHaveLength(0);
  });

  it('skips Failed accounts', () => {
    const client = {
      accountRegistry: {
        ACC1: { accountName: 'ACC1', accountType: 'Funded', status: 'Failed' },
      },
      dailyImports: [600, 100, 100].map((pnl, i) => ({
        date: `2026-06-0${i + 1}`,
        snapshots: [{ accountName: 'ACC1', grossRealizedPnl: pnl }],
      })),
    };
    expect(buildConsistencyWarnings(client)).toHaveLength(0);
  });
});

// ── buildPayoutAlerts ─────────────────────────────────────────────────────────

function makeDailyImport(accounts) {
  return {
    id: 'di-1',
    date: '2026-06-25',
    accounts: {},
    snapshots: accounts.map(a => ({ accountName: a.name, accountBalance: a.balance })),
    flags: [],
  };
}

describe('buildPayoutAlerts', () => {
  it('returns empty when client or dailyImport is null', () => {
    expect(buildPayoutAlerts(null, null)).toHaveLength(0);
    expect(buildPayoutAlerts({ accountRegistry: {} }, null)).toHaveLength(0);
  });

  it('alerts when funded balance reaches 90% of target', () => {
    const client = {
      accountRegistry: {
        MFF1: { accountName: 'MFF1', accountType: 'Funded', status: 'Active', targetProfit: 53000, payoutState: 'Not requested' },
      },
    };
    const di = makeDailyImport([{ name: 'MFF1', balance: 47800 }]); // 90.2% of 53000
    const alerts = buildPayoutAlerts(client, di);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ready).toBe(false); // not fully at target yet
  });

  it('marks ready=true when balance meets or exceeds target', () => {
    const client = {
      accountRegistry: {
        MFF1: { accountName: 'MFF1', accountType: 'Funded', status: 'Active', targetProfit: 53000, payoutState: 'Not requested' },
      },
    };
    const di = makeDailyImport([{ name: 'MFF1', balance: 53500 }]);
    const alerts = buildPayoutAlerts(client, di);
    expect(alerts[0].ready).toBe(true);
  });

  it('suppresses alert when payout already requested', () => {
    const client = {
      accountRegistry: {
        MFF1: { accountName: 'MFF1', accountType: 'Funded', status: 'Active', targetProfit: 53000, payoutState: 'Payout requested' },
      },
    };
    const di = makeDailyImport([{ name: 'MFF1', balance: 54000 }]);
    expect(buildPayoutAlerts(client, di)).toHaveLength(0);
  });

  it('suppresses alert for Failed accounts', () => {
    const client = {
      accountRegistry: {
        MFF1: { accountName: 'MFF1', accountType: 'Funded', status: 'Failed', targetProfit: 53000, payoutState: 'Not requested' },
      },
    };
    const di = makeDailyImport([{ name: 'MFF1', balance: 54000 }]);
    expect(buildPayoutAlerts(client, di)).toHaveLength(0);
  });

  it('sorts results by pct descending', () => {
    const client = {
      accountRegistry: {
        ACC1: { accountName: 'ACC1', accountType: 'Funded', status: 'Active', targetProfit: 50000, payoutState: 'Not requested' },
        ACC2: { accountName: 'ACC2', accountType: 'Funded', status: 'Active', targetProfit: 50000, payoutState: 'Not requested' },
      },
    };
    const di = makeDailyImport([
      { name: 'ACC1', balance: 45000 }, // 90%
      { name: 'ACC2', balance: 49000 }, // 98%
    ]);
    const alerts = buildPayoutAlerts(client, di);
    expect(alerts[0].accountName).toBe('ACC2');
    expect(alerts[1].accountName).toBe('ACC1');
  });
});

// ── buildDisconnectAlerts ─────────────────────────────────────────────────────

// Pin clock to a known Thursday so "today" and "prevTrading" are deterministic
const FAKE_TODAY = '2026-06-25'; // Thursday
const FAKE_PREV  = '2026-06-24'; // Wednesday (prev trading day)

function makePriorImports(accountName, pnls) {
  return pnls.map((pnl, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    snapshots: [{ accountName, grossRealizedPnl: pnl }],
  }));
}

function makeDisconnectClient({ importDate = FAKE_TODAY, pnlToday = 0, priorPnls = [200, 300, 250, 180, 220], accountType = 'Funded', status = 'Active' } = {}) {
  const accountName = 'APEX1';
  return {
    accountRegistry: {
      [accountName]: { accountName, alias: 'Apex Main', accountType, status },
    },
    dailyImports: [
      ...makePriorImports(accountName, priorPnls),
      {
        date: importDate,
        accounts: {},
        snapshots: [{
          accountName,
          grossRealizedPnl: pnlToday,
          strategies: [{ strategyFamily: 'RBO', enabled: true }],
        }],
      },
    ],
  };
}

describe('buildDisconnectAlerts', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${FAKE_TODAY}T12:00:00`)); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires alert when active strategies + $0 P&L + strong prior avg', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient());
    expect(alerts).toHaveLength(1);
    expect(alerts[0].accountName).toBe('APEX1');
    expect(alerts[0].message).toContain('Verify VPS');
  });

  it('fires alert when import is from prev trading day', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient({ importDate: FAKE_PREV }));
    expect(alerts).toHaveLength(1);
  });

  it('no alert when import is older than prev trading day', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient({ importDate: '2026-06-20' }));
    expect(alerts).toHaveLength(0);
  });

  it('no alert when today P&L is non-zero', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient({ pnlToday: 150 }));
    expect(alerts).toHaveLength(0);
  });

  it('no alert when prior avg is ≤ $50 (not historically active)', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient({ priorPnls: [30, 20, 40, 10, 50] }));
    expect(alerts).toHaveLength(0);
  });

  it('no alert when fewer than 3 prior data points', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient({ priorPnls: [300, 400] }));
    expect(alerts).toHaveLength(0);
  });

  it('no alert for Inactive / Ignore account type', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient({ accountType: 'Inactive / Ignore' }));
    expect(alerts).toHaveLength(0);
  });

  it('no alert for Failed account status', () => {
    const alerts = buildDisconnectAlerts(makeDisconnectClient({ status: 'Failed' }));
    expect(alerts).toHaveLength(0);
  });

  it('returns empty for client with no imports', () => {
    expect(buildDisconnectAlerts({ dailyImports: [] })).toHaveLength(0);
  });
});
