import { createClient } from '@supabase/supabase-js';

/* global process */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const GOOGLE_SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL || '';

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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, { error: 'Method not allowed.' });
    }

    const { admin, auth } = clients();
    await requireManager(req, admin, auth);

    if (!GOOGLE_SHEET_CSV_URL) {
      return send(res, 501, {
        error: 'GOOGLE_SHEET_CSV_URL is not configured.',
        nextStep: 'Set GOOGLE_SHEET_CSV_URL to a published Google Sheet CSV export URL.',
      });
    }

    const response = await fetch(GOOGLE_SHEET_CSV_URL);
    if (!response.ok) {
      throw new Error(`Google Sheet fetch failed: ${response.status}`);
    }

    return send(res, 200, {
      source: 'google_sheet_csv',
      csv: await response.text(),
    });
  } catch (error) {
    console.error('[CRM] Intake sheet API failed:', error);
    return send(res, error.status || 500, { error: error.message || 'Intake sheet fetch failed.' });
  }
}
