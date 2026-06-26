import { describe, expect, it } from 'vitest';
import { ciMeta, filteredAccountsForTab, mergeRegistryCi, searchClients } from './App';

// ── mergeRegistryCi ───────────────────────────────────────────────────────────

describe('mergeRegistryCi', () => {
  it('returns empty object for no inputs', () => {
    expect(mergeRegistryCi(null, null)).toEqual({});
  });

  it('lowercases all keys', () => {
    const merged = mergeRegistryCi({ 'APEX-1': { alias: 'A' } }, { 'Funded-2': { alias: 'B' } });
    expect(merged['apex-1']).toBeDefined();
    expect(merged['funded-2']).toBeDefined();
  });

  it('client registry overrides import accounts on same key (case-insensitive)', () => {
    const importAccounts = { ACC1: { accountType: 'Unassigned' } };
    const registry = { acc1: { accountType: 'Funded' } };
    const merged = mergeRegistryCi(importAccounts, registry);
    expect(merged['acc1'].accountType).toBe('Funded');
  });

  it('preserves entries from both import and registry when keys differ', () => {
    const merged = mergeRegistryCi({ A1: { alias: 'Alpha' } }, { B1: { alias: 'Beta' } });
    expect(Object.keys(merged)).toHaveLength(2);
  });
});

// ── ciMeta ────────────────────────────────────────────────────────���───────────

describe('ciMeta', () => {
  it('returns empty object for null or missing key', () => {
    expect(ciMeta({}, null)).toEqual({});
    expect(ciMeta({}, '')).toEqual({});
    expect(ciMeta(null, 'ACC1')).toEqual({});
  });

  it('looks up by lowercased accountName', () => {
    const reg = { 'acc1': { alias: 'Alpha', accountType: 'Funded' } };
    expect(ciMeta(reg, 'ACC1').alias).toBe('Alpha');
    expect(ciMeta(reg, 'acc1').accountType).toBe('Funded');
  });

  it('returns empty object when accountName not in registry', () => {
    expect(ciMeta({ a1: {} }, 'B2')).toEqual({});
  });
});

// ── filteredAccountsForTab ───────────────��──────────────────���─────────────────

function makeTabClient(registry) {
  return { id: 'c1', name: 'Pedro', accountRegistry: registry, dailyImports: [] };
}

function makeTabImport(accounts, snapshots = []) {
  return { date: '2026-06-25', accounts, snapshots, flags: [] };
}

describe('filteredAccountsForTab', () => {
  const registry = {
    FUND1: { accountName: 'FUND1', accountType: 'Funded' },
    EVAL1: { accountName: 'EVAL1', accountType: 'Evaluation - Standard' },
    CASH1: { accountName: 'CASH1', accountType: 'Cash' },
    UNA1:  { accountName: 'UNA1',  accountType: 'Unassigned' },
    IGN1:  { accountName: 'IGN1',  accountType: 'Inactive / Ignore' },
  };

  it('returns only Funded accounts for Funded tab', () => {
    const { accounts } = filteredAccountsForTab(makeTabClient(registry), makeTabImport({}), 'Funded');
    expect(Object.keys(accounts)).toEqual(['FUND1']);
  });

  it('returns only Evaluation accounts for Evaluations tab', () => {
    const { accounts } = filteredAccountsForTab(makeTabClient(registry), makeTabImport({}), 'Evaluations');
    expect(Object.keys(accounts)).toEqual(['EVAL1']);
  });

  it('returns only Cash accounts for Cash tab', () => {
    const { accounts } = filteredAccountsForTab(makeTabClient(registry), makeTabImport({}), 'Cash');
    expect(Object.keys(accounts)).toEqual(['CASH1']);
  });

  it('returns Unassigned and Inactive/Ignore for Review tab', () => {
    const { accounts } = filteredAccountsForTab(makeTabClient(registry), makeTabImport({}), 'Review');
    const keys = Object.keys(accounts).sort();
    expect(keys).toContain('IGN1');
    expect(keys).toContain('UNA1');
    expect(keys).not.toContain('FUND1');
  });

  it('filters snapshots to only those matching the active tab', () => {
    const snapshots = [
      { accountName: 'FUND1', grossRealizedPnl: 200, weeklyPnl: 0 },
      { accountName: 'EVAL1', grossRealizedPnl: 100, weeklyPnl: 0 },
    ];
    const { snapshots: filtered } = filteredAccountsForTab(makeTabClient(registry), makeTabImport({}, snapshots), 'Funded');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].accountName).toBe('FUND1');
  });

  it('attaches meta to each snapshot', () => {
    const snapshots = [{ accountName: 'FUND1', grossRealizedPnl: 300, weeklyPnl: 0 }];
    const { snapshots: filtered } = filteredAccountsForTab(makeTabClient(registry), makeTabImport({}, snapshots), 'Funded');
    expect(filtered[0].meta.accountType).toBe('Funded');
  });
});

// ── searchClients ────────────────────────────────────────────────��────────────

describe('searchClients', () => {
  it('returns empty for queries shorter than 2 chars', () => {
    expect(searchClients([{ id: 'c1', name: 'Pedro', accountRegistry: {} }], 'P')).toHaveLength(0);
    expect(searchClients([], '')).toHaveLength(0);
  });

  it('matches by client name (case-insensitive)', () => {
    const clients = [{ id: 'c1', name: 'Amanda', accountRegistry: {}, dailyImports: [] }];
    const results = searchClients(clients, 'aman');
    expect(results).toHaveLength(1);
    expect(results[0].client.id).toBe('c1');
    expect(results[0].matches[0].type).toBe('client');
  });

  it('matches by account alias', () => {
    const clients = [{
      id: 'c1', name: 'Pedro',
      accountRegistry: { ACC1: { accountName: 'ACC1', alias: 'Apex Main' } },
      dailyImports: [],
    }];
    const results = searchClients(clients, 'apex');
    expect(results[0].matches.some(m => m.type === 'account')).toBe(true);
  });

  it('matches by open task text', () => {
    const clients = [{
      id: 'c1', name: 'Pedro', accountRegistry: {},
      tasks: [{ id: 't1', text: 'Request payout for account', done: false }],
      dailyImports: [],
    }];
    const results = searchClients(clients, 'payout');
    expect(results[0].matches.some(m => m.type === 'task')).toBe(true);
  });

  it('does not match completed tasks', () => {
    const clients = [{
      id: 'c1', name: 'Pedro', accountRegistry: {},
      tasks: [{ id: 't1', text: 'Request payout for account', done: true }],
      dailyImports: [],
    }];
    expect(searchClients(clients, 'payout')).toHaveLength(0);
  });

  it('caps matches at 3 per client', () => {
    const clients = [{
      id: 'c1', name: 'search-target',
      notes: 'search-target note',
      accountRegistry: { A: { alias: 'search-target alias' } },
      tasks: [
        { id: 't1', text: 'search-target task 1', done: false },
        { id: 't2', text: 'search-target task 2', done: false },
      ],
      dailyImports: [],
    }];
    const [result] = searchClients(clients, 'search-target');
    expect(result.matches.length).toBeLessThanOrEqual(3);
  });
});
