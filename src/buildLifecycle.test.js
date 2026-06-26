import { describe, expect, it } from 'vitest';
import { buildLifecycleMetrics, buildMonthlyByAccount } from './App';

// ── buildLifecycleMetrics ─────────────────────────────────────────────────────

describe('buildLifecycleMetrics', () => {
  it('returns N/A averages and zero counts for empty client list', () => {
    const m = buildLifecycleMetrics([]);
    expect(m.totalEvals).toBe(0);
    expect(m.totalFunded).toBe(0);
    expect(m.avgDaysToFail).toBe('N/A');
    expect(m.avgDaysToFunded).toBe('N/A');
    expect(m.avgDaysToPayout).toBe('N/A');
  });

  it('counts evaluations and funded accounts across registry', () => {
    const client = {
      id: 'c1', name: 'Pedro',
      accountRegistry: {
        A1: { accountType: 'Evaluation - Standard', status: 'Active' },
        A2: { accountType: 'Evaluation - Bullet Bot', status: 'Active' },
        A3: { accountType: 'Funded', status: 'Active' },
        A4: { accountType: 'Cash', status: 'Active' }, // not counted
      },
    };
    const m = buildLifecycleMetrics([client]);
    expect(m.totalEvals).toBe(2);
    expect(m.totalFunded).toBe(1);
  });

  it('computes average days from eval start to fail', () => {
    const client = {
      id: 'c1', name: 'Pedro',
      accountRegistry: {
        A1: { accountType: 'Evaluation - Standard', dateAdded: '2026-06-01', dateFailed: '2026-06-11' }, // 10 days
        A2: { accountType: 'Evaluation - Standard', dateAdded: '2026-06-01', dateFailed: '2026-06-21' }, // 20 days
      },
    };
    const m = buildLifecycleMetrics([client]);
    expect(m.avgDaysToFail).toBe('15.0');
  });

  it('computes average days from eval start to funded', () => {
    const client = {
      id: 'c1', name: 'Pedro',
      accountRegistry: {
        A1: { accountType: 'Evaluation - Standard', dateAdded: '2026-05-01', dateFunded: '2026-05-31' }, // 30 days
      },
    };
    const m = buildLifecycleMetrics([client]);
    expect(m.avgDaysToFunded).toBe('30.0');
  });

  it('computes average days from funded to first payout', () => {
    const client = {
      id: 'c1', name: 'Pedro',
      accountRegistry: {
        A1: { accountType: 'Funded', dateFunded: '2026-05-01', dateLastPayout: '2026-05-21' }, // 20 days
        A2: { accountType: 'Funded', dateFunded: '2026-05-01', dateLastPayout: '2026-05-11' }, // 10 days
      },
    };
    const m = buildLifecycleMetrics([client]);
    expect(m.avgDaysToPayout).toBe('15.0');
  });

  it('skips entries with missing or inverted dates', () => {
    const client = {
      id: 'c1', name: 'Pedro',
      accountRegistry: {
        A1: { accountType: 'Evaluation - Standard', dateAdded: '', dateFailed: '2026-06-10' }, // missing start
        A2: { accountType: 'Evaluation - Standard', dateAdded: '2026-06-10', dateFailed: '2026-06-05' }, // inverted
      },
    };
    const m = buildLifecycleMetrics([client]);
    expect(m.avgDaysToFail).toBe('N/A'); // neither entry should be counted
  });
});

// ── buildMonthlyByAccount ─────────────────────────────────────────────────────

describe('buildMonthlyByAccount', () => {
  it('returns empty for client with no imports', () => {
    expect(buildMonthlyByAccount({ dailyImports: [] })).toHaveLength(0);
  });

  it('groups imports by month and aggregates per-account P&L', () => {
    const client = {
      accountRegistry: {},
      dailyImports: [
        { date: '2026-06-10', accounts: {}, snapshots: [{ accountName: 'A1', grossRealizedPnl: 200, strategies: [] }] },
        { date: '2026-06-11', accounts: {}, snapshots: [{ accountName: 'A1', grossRealizedPnl: 300, strategies: [] }] },
        { date: '2026-07-01', accounts: {}, snapshots: [{ accountName: 'A1', grossRealizedPnl: 100, strategies: [] }] },
      ],
    };
    const months = buildMonthlyByAccount(client);
    expect(months).toHaveLength(2);
    const june = months.find(m => m.month === '2026-06');
    expect(june).toBeDefined();
    expect(june.accounts[0].pnl).toBe(500);
    expect(june.accounts[0].days).toBe(2);
  });

  it('sorts months ascending and accounts by pnl descending within each month', () => {
    const client = {
      accountRegistry: {},
      dailyImports: [
        { date: '2026-07-01', accounts: {}, snapshots: [{ accountName: 'B1', grossRealizedPnl: 100, strategies: [] }] },
        { date: '2026-06-10', accounts: {}, snapshots: [
            { accountName: 'A1', grossRealizedPnl: 200, strategies: [] },
            { accountName: 'A2', grossRealizedPnl: 400, strategies: [] },
        ]},
      ],
    };
    const months = buildMonthlyByAccount(client);
    expect(months[0].month).toBe('2026-06');
    expect(months[0].accounts[0].accountName).toBe('A2'); // higher P&L first
  });

  it('collects strategy families used per account per month', () => {
    const client = {
      accountRegistry: {},
      dailyImports: [
        { date: '2026-06-10', accounts: {}, snapshots: [{ accountName: 'A1', grossRealizedPnl: 100,
          strategies: [{ strategyFamily: 'RBO', enabled: true }, { strategyFamily: 'OGX', enabled: true }] }] },
        { date: '2026-06-11', accounts: {}, snapshots: [{ accountName: 'A1', grossRealizedPnl: 100,
          strategies: [{ strategyFamily: 'RBO', enabled: true }] }] },
      ],
    };
    const [june] = buildMonthlyByAccount(client);
    expect(june.accounts[0].strategies).toContain('RBO');
    expect(june.accounts[0].strategies).toContain('OGX');
  });
});
