import { describe, expect, it } from 'vitest';
import { buildConsistencyWarnings, buildPayoutAlerts } from './App';

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
