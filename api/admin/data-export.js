import { createClient } from '@supabase/supabase-js';

/* global process */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const EXPORT_TABLES = [
  'cam_profiles',
  'app_users',
  'clients',
  'client_assignments',
  'trading_accounts',
  'daily_imports',
  'account_snapshots',
  'strategy_snapshots',
  'orders',
  'executions',
  'operational_flags',
  'tasks',
  'activity_logs',
  'price_checks',
  'payout_events',
  'reports',
  'audit_logs',
  'sop_templates',
  'sop_sections',
  'sop_items',
  'daily_sop_checklists',
];

function send(res, status, body) {
  res.status(status).json(body);
}

function requireConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PUBLISHABLE_KEY) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_PUBLISHABLE_KEY server env.');
  }
}

function clients() {
  requireConfig();
  return {
    admin: createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    auth: createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function getAuthUserFromRequest(req, authClient) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw Object.assign(new Error('Missing bearer token.'), { status: 401 });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw Object.assign(new Error('Invalid session token.'), { status: 401 });
  }
  return data.user;
}

async function requireManager(req, admin, authClient) {
  const authUser = await getAuthUserFromRequest(req, authClient);
  const { data, error } = await admin
    .from('app_users')
    .select('id, role, status')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  if (error) throw error;
  if (data?.role !== 'Manager' || data.status === 'Inactive') {
    throw Object.assign(new Error('Manager permission required.'), { status: 403 });
  }
  return data;
}

async function fetchAll(admin, table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin
      .from(table)
      .select('*')
      .range(from, to);
    if (error) {
      if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message || '')) {
        return { rows: [], skipped: true, reason: error.message };
      }
      throw error;
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { rows, skipped: false };
}

async function createAuditLog(admin, userId, action, afterData = {}) {
  const { error } = await admin
    .from('audit_logs')
    .insert({
      user_id: userId,
      entity_type: 'data_export',
      action,
      after_data: afterData,
    });
  if (error) console.error('[CRM] Failed to write export audit log:', error);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, { error: 'Method not allowed.' });
    }

    const { admin, auth } = clients();
    const manager = await requireManager(req, admin, auth);
    const tables = {};
    const skippedTables = [];
    for (const table of EXPORT_TABLES) {
      const result = await fetchAll(admin, table);
      if (result.skipped) {
        skippedTables.push({ table, reason: result.reason });
      } else {
        tables[table] = result.rows;
      }
    }

    await createAuditLog(admin, manager.id, 'data_export.create', {
      tableCount: Object.keys(tables).length,
      tables: Object.keys(tables),
      skippedTables,
    });

    return send(res, 200, {
      exportedAt: new Date().toISOString(),
      source: 'cam-crm-supabase',
      version: 1,
      excludedTables: ['client_credentials', 'client_prop_firms'],
      skippedTables,
      tables,
    });
  } catch (error) {
    console.error('[CRM] Data export API failed:', error);
    return send(res, error.status || 500, { error: error.message || 'Data export failed.' });
  }
}
