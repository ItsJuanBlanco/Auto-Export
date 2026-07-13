import { createClient } from '@supabase/supabase-js';
import { resolveClientForIngest } from '../../src/domain/ingestAuth.js';

/* global process */

// Mismas variables de entorno que ya usan el resto de los endpoints admin/*.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, body) {
  res.status(status).json(body);
}

function requireConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY server env.');
  }
}

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toFloat(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isStrategyRunning(stateValue) {
  if (!stateValue) return false;
  const v = String(stateValue).trim().toLowerCase();
  return v !== 'terminated' && v !== 'stopped' && v !== 'disabled';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: 'Method not allowed.' });
    }

    requireConfig();
    const admin = adminClient();

    const { clientId } = await resolveClientForIngest(admin, {
      productKey: req.headers['x-product-key'],
      machineId: req.headers['x-machine-id'],
    });

    const { accounts = [], strategies = [], orders = [], executions = [] } = req.body || {};

    const tradingDate = new Date().toISOString().slice(0, 10);

    // 1. Upsert trading_accounts.
    const accountRows = accounts
      .filter((a) => a.AccountName)
      .map((a) => ({
        client_id: clientId,
        account_name: a.AccountName,
        connection: a.ConnectionStatus || null,
      }));

    let accountIdByName = {};
    if (accountRows.length) {
      const { data, error } = await admin
        .from('trading_accounts')
        .upsert(accountRows, { onConflict: 'client_id,account_name' })
        .select('id, account_name');
      if (error) throw error;
      accountIdByName = Object.fromEntries(data.map((r) => [r.account_name, r.id]));
    }

    // 2. Upsert daily_imports (una fila por cliente/día).
    const { data: importRows, error: importError } = await admin
      .from('daily_imports')
      .upsert(
        [{ client_id: clientId, trading_date: tradingDate, source_summary: { source: 'ninjatrader_addon_auto' } }],
        { onConflict: 'client_id,trading_date' },
      )
      .select('id');
    if (importError) throw importError;
    const dailyImportId = importRows[0].id;

    // 3. Limpiar lo anterior de este mismo día (evita duplicados si sube varias veces).
    for (const table of ['account_snapshots', 'strategy_snapshots', 'orders', 'executions']) {
      const { error } = await admin.from(table).delete().eq('daily_import_id', dailyImportId);
      if (error) throw error;
    }

    // 4a. account_snapshots.
    let snapshotIdByName = {};
    if (accounts.length) {
      const snapshotRows = accounts
        .filter((a) => a.AccountName)
        .map((a) => ({
          daily_import_id: dailyImportId,
          trading_account_id: accountIdByName[a.AccountName] || null,
          account_name: a.AccountName,
          connection: a.ConnectionStatus || null,
          gross_realized_pnl: toFloat(a.RealizedPnL),
          unrealized_pnl: toFloat(a.UnrealizedPnL),
          account_balance: toFloat(a.NetLiquidation),
        }));
      const { data, error } = await admin.from('account_snapshots').insert(snapshotRows).select('id, account_name');
      if (error) throw error;
      snapshotIdByName = Object.fromEntries(data.map((r) => [r.account_name, r.id]));
    }

    // 4b. strategy_snapshots.
    if (strategies.length) {
      const strategyRows = strategies.map((s) => ({
        daily_import_id: dailyImportId,
        trading_account_id: accountIdByName[s.AccountName] || null,
        account_snapshot_id: snapshotIdByName[s.AccountName] || null,
        strategy_name: s.StrategyName || '',
        instrument: s.Instrument || '',
        enabled: isStrategyRunning(s.State),
      }));
      const { error } = await admin.from('strategy_snapshots').insert(strategyRows);
      if (error) throw error;
    }

    // 4c. orders.
    if (orders.length) {
      const orderRows = orders.map((o) => ({
        daily_import_id: dailyImportId,
        trading_account_id: accountIdByName[o.AccountName] || null,
        external_order_id: o.OrderId || '',
        strategy_name: o.Name || '',
        instrument: o.Instrument || '',
        action: o.OrderAction || '',
        order_type: o.OrderType || '',
        quantity: toFloat(o.Quantity),
        limit_price: toFloat(o.LimitPrice),
        stop_price: toFloat(o.StopPrice),
        state: o.OrderState || '',
        filled: toFloat(o.Filled),
        avg_price: toFloat(o.AvgFillPrice),
        name: o.Name || '',
        time_text: o.Time || '',
      }));
      const { error } = await admin.from('orders').insert(orderRows);
      if (error) throw error;
    }

    // 4d. executions.
    if (executions.length) {
      const executionRows = executions.map((e) => ({
        daily_import_id: dailyImportId,
        trading_account_id: accountIdByName[e.AccountName] || null,
        external_execution_id: e.ExecutionId || '',
        external_order_id: e.OrderId || '',
        instrument: e.Instrument || '',
        action: e.MarketPosition || '',
        quantity: toFloat(e.Quantity),
        price: toFloat(e.Price),
        time_text: e.Time || '',
        commission: toFloat(e.Commission),
      }));
      const { error } = await admin.from('executions').insert(executionRows);
      if (error) throw error;
    }

    return send(res, 200, {
      ok: true,
      dailyImportId,
      counts: {
        accounts: accountRows.length,
        strategies: strategies.length,
        orders: orders.length,
        executions: executions.length,
      },
    });
  } catch (error) {
    console.error('[CRM] Daily import API failed:', error);
    return send(res, error.status || 500, { error: error.message || 'Daily import failed.' });
  }
}
