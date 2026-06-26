import { describe, expect, it } from 'vitest';
import { buildDailyReportSummary, buildClientMessageReport, buildWeeklyMessageReport, summarizeAccountRows } from './report';

describe('buildDailyReportSummary', () => {
  it('uses current account registry metadata over stale import metadata', () => {
    const client = {
      name: 'Amanda',
      accountRegistry: {
        ACC1: {
          accountName: 'ACC1',
          alias: 'Lucid - ACC1',
          accountType: 'Funded',
          status: 'Active',
        },
      },
    };
    const dailyImport = {
      date: '2026-06-08',
      status: 'Needs review',
      accounts: {
        ACC1: {
          accountName: 'ACC1',
          alias: 'Lucid - ACC1',
          accountType: 'Unassigned',
          status: 'Active',
        },
      },
      snapshots: [{ accountName: 'ACC1', accountBalance: 50100, grossRealizedPnl: 100, weeklyPnl: 100 }],
      flags: [],
    };

    const report = buildDailyReportSummary(client, dailyImport);

    expect(report.grouped.funded).toHaveLength(1);
    expect(report.grouped.evaluations).toHaveLength(0);
  });

  it('groups snapshots into funded even when registry key casing differs from snapshot accountName', () => {
    const client = {
      name: 'Amanda',
      accountRegistry: {
        APEX1234: { accountName: 'APEX1234', alias: 'My Account', accountType: 'Funded', status: 'Active' },
      },
    };
    const dailyImport = {
      date: '2026-06-25',
      status: 'Needs review',
      accounts: {},
      snapshots: [{ accountName: 'apex1234', accountBalance: 52000, grossRealizedPnl: 200, weeklyPnl: 400 }],
      flags: [],
    };

    const report = buildDailyReportSummary(client, dailyImport);

    expect(report.grouped.funded).toHaveLength(1);
    expect(report.grouped.funded[0].meta.alias).toBe('My Account');
  });
});

describe('summarizeAccountRows', () => {
  it('summarizes only the rows provided by the active tab', () => {
    const rows = [
      { accountName: 'CASH1', grossRealizedPnl: 10, weeklyPnl: 20, accountBalance: 1000 },
    ];

    const summary = summarizeAccountRows(rows);

    expect(summary.counts.accounts).toBe(1);
    expect(summary.totals.aggregateBalance).toBe(1000);
    expect(summary.totals.grossRealizedPnl).toBe(10);
  });
});

describe('buildClientMessageReport', () => {
  const client = {
    name: 'Pedro',
    accountRegistry: {
      APEX1: { accountName: 'APEX1', alias: 'Apex Main', accountType: 'Funded', status: 'Active' },
      EVAL1: { accountName: 'EVAL1', alias: 'Eval 1', accountType: 'Evaluation - Standard', status: 'Active' },
    },
  };
  const dailyImport = {
    date: '2026-06-25',
    accounts: {},
    snapshots: [
      { accountName: 'APEX1', grossRealizedPnl: 450, weeklyPnl: 1200, trailingMaxDrawdown: 3200, strategies: [{ strategyFamily: 'RBO', enabled: true }] },
      { accountName: 'EVAL1', grossRealizedPnl: -80, weeklyPnl: 320, strategies: [] },
    ],
    flags: [],
  };

  it('includes client name and date in the header', () => {
    const text = buildClientMessageReport(client, dailyImport);
    expect(text).toContain('Pedro');
    expect(text).toContain('2026-06-25');
  });

  it('shows daily and weekly P&L totals', () => {
    const text = buildClientMessageReport(client, dailyImport);
    expect(text).toContain('Daily P&L');
    expect(text).toContain('Weekly P&L');
  });

  it('lists funded accounts in the Funded Accounts section', () => {
    const text = buildClientMessageReport(client, dailyImport);
    expect(text).toContain('Funded Accounts');
    expect(text).toContain('Apex Main');
  });

  it('lists evaluation accounts in the Evaluations section', () => {
    const text = buildClientMessageReport(client, dailyImport);
    expect(text).toContain('Evaluations');
    expect(text).toContain('Eval 1');
  });

  it('returns a string with no account sections when dailyImport is null', () => {
    const text = buildClientMessageReport(client, null);
    expect(typeof text).toBe('string');
    expect(text).not.toContain('Funded Accounts');
    expect(text).not.toContain('Evaluations');
  });
});

describe('buildWeeklyMessageReport', () => {
  const makeImport = (date, pnl) => ({
    date,
    status: 'Closed',
    snapshots: [{ accountName: 'APEX1', grossRealizedPnl: pnl, weeklyPnl: pnl }],
    flags: [],
  });

  const client = {
    name: 'Pedro',
    accountRegistry: {
      APEX1: { accountName: 'APEX1', alias: 'Apex Main', accountType: 'Funded', status: 'Active' },
    },
    dailyImports: [
      makeImport('2026-06-23', 300),
      makeImport('2026-06-24', 150),
      makeImport('2026-06-25', -50),
    ],
  };

  it('includes client name and week range', () => {
    const text = buildWeeklyMessageReport(client);
    expect(text).toContain('Pedro');
    expect(text).toContain('2026-06-23');
    expect(text).toContain('2026-06-25');
  });

  it('shows net weekly P&L', () => {
    const text = buildWeeklyMessageReport(client);
    expect(text).toContain('Net P&L');
    expect(text).toContain('+$400'); // 300+150-50
  });

  it('omits worst day line when only one trading day', () => {
    const single = { ...client, dailyImports: [makeImport('2026-06-25', 200)] };
    const text = buildWeeklyMessageReport(single);
    expect(text).not.toContain('Worst day');
  });

  it('returns empty string when client has no imports', () => {
    expect(buildWeeklyMessageReport({ name: 'X', dailyImports: [] })).toBe('');
  });
});
