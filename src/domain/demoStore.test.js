import { describe, expect, it } from 'vitest';
import {
  addClient,
  appendDailyImport,
  getLatestClientImport,
  parseImportedState,
  upsertAccountMeta,
} from './demoStore';

function emptyState() {
  return {
    accountManager: { id: 'am-test', name: 'Test AM' },
    clients: [],
    selectedClientId: null,
  };
}

describe('demoStore', () => {
  it('creates clients and persists account metadata updates in state', () => {
    const withClient = addClient(emptyState(), 'Amanda Example');
    const client = withClient.clients[0];

    const updated = upsertAccountMeta(withClient, client.id, 'ACC1', {
      accountType: 'Funded',
      status: 'Active',
    });

    expect(updated.clients[0].accountRegistry.ACC1).toMatchObject({
      accountName: 'ACC1',
      accountType: 'Funded',
      status: 'Active',
    });
  });

  it('appends daily imports and returns the latest import by timestamp', () => {
    const state = addClient(emptyState(), 'Amanda Example');
    const clientId = state.clients[0].id;
    const firstImport = { id: 'one', date: '2026-06-08', importedAt: '2026-06-08T10:00:00.000Z', accounts: {} };
    const secondImport = { id: 'two', date: '2026-06-09', importedAt: '2026-06-09T10:00:00.000Z', accounts: {} };

    const withFirst = appendDailyImport(state, clientId, firstImport);
    const withSecond = appendDailyImport(withFirst, clientId, secondImport);

    expect(getLatestClientImport(withSecond.clients[0])).toMatchObject({ id: 'two' });
  });

  it('round-trips an exported backup through parseImportedState', () => {
    const state = addClient(emptyState(), 'Amanda Example');
    const restored = parseImportedState(JSON.stringify(state));

    expect(restored.clients[0].name).toBe('Amanda Example');
    expect(restored.selectedClientId).toBe(state.clients[0].id);
  });

  it('rejects files that are not valid CAM backups', () => {
    expect(() => parseImportedState('{"foo":1}')).toThrow();
    expect(() => parseImportedState('not json')).toThrow();
  });

  it('appendDailyImport does not create duplicate registry keys when NT CSV casing differs from stored casing', () => {
    // Reproduce the root-cause bug: registry has 'APEX1234' but CSV exports 'apex1234'
    let state = addClient(emptyState(), 'Test Trader');
    const clientId = state.clients[0].id;
    state = { ...state, clients: state.clients.map(c => c.id === clientId
      ? { ...c, accountRegistry: { APEX1234: { accountName: 'APEX1234', accountType: 'Funded', alias: 'My Account' } } }
      : c) };

    const importResult = {
      id: 'imp-1', date: '2026-06-25', importedAt: '2026-06-25T22:00:00Z',
      accounts: { apex1234: { accountName: 'apex1234', accountType: 'Funded' } },
      snapshots: [], strategies: [], orders: [], executions: [], flags: [],
    };

    const next = appendDailyImport(state, clientId, importResult);
    const reg = next.clients[0].accountRegistry;
    const keys = Object.keys(reg);

    // Must not have both 'APEX1234' and 'apex1234' — only one entry
    expect(keys.length).toBe(1);
    // User-configured alias must be preserved (registry takes precedence over import)
    expect(Object.values(reg)[0].alias).toBe('My Account');
  });

  it('upsertAccountMeta merges with existing entry case-insensitively without duplicating keys', () => {
    let state = addClient(emptyState(), 'Test Trader');
    const clientId = state.clients[0].id;
    // Pre-seed with uppercase key
    state = upsertAccountMeta(state, clientId, 'APEX1234', { accountType: 'Funded', alias: 'Original' });
    // Update using lowercase — should update, not create a second key
    const next = upsertAccountMeta(state, clientId, 'apex1234', { alias: 'Updated' });
    const reg = next.clients[0].accountRegistry;
    expect(Object.keys(reg).length).toBe(1);
    expect(Object.values(reg)[0].alias).toBe('Updated');
  });

  it('upsertAccountMeta coerces string numeric fields to numbers on save', () => {
    let state = addClient(emptyState(), 'Test Trader');
    const clientId = state.clients[0].id;
    // Simulate HTML input saving strings (event.target.value always returns string)
    const next = upsertAccountMeta(state, clientId, 'ACC1', {
      accountType: 'Funded',
      targetProfit: '52000',
      maxDrawdownLimit: '2500',
      startBalance: '50000',
    });
    const reg = next.clients[0].accountRegistry.ACC1;
    expect(typeof reg.targetProfit).toBe('number');
    expect(typeof reg.maxDrawdownLimit).toBe('number');
    expect(typeof reg.startBalance).toBe('number');
    expect(reg.targetProfit).toBe(52000);
    expect(reg.maxDrawdownLimit).toBe(2500);
    expect(reg.startBalance).toBe(50000);
  });
});
