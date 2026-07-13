import { createClient } from '@supabase/supabase-js';

/* global process */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WATCHER_API_KEY = process.env.VINCERE_WATCHER_API_KEY;

function send(res, status, body) {
  res.status(status).json(body);
}

function requireConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY server env.');
  }
  if (!WATCHER_API_KEY) {
    throw new Error('Missing VINCERE_WATCHER_API_KEY server env.');
  }
}

function requireWatcherApiKey(req) {
  const provided = req.headers['x-api-key'] || '';
  if (!provided || provided !== WATCHER_API_KEY) {
    throw Object.assign(new Error('Invalid or missing API key.'), { status: 401 });
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, { error: 'Method not allowed.' });
    }

    requireConfig();
    requireWatcherApiKey(req);

    const name = String(req.query.name || '').trim();
    if (!name) {
      return send(res, 400, { error: 'name query param is required.' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin
      .from('clients')
      .select('id, name, email')
      .is('deleted_at', null)
      .ilike('name', `%${name}%`);
    if (error) throw error;

    return send(res, 200, { matches: data || [] });
  } catch (error) {
    console.error('[CRM] Lookup client API failed:', error);
    return send(res, error.status || 500, { error: error.message || 'Lookup failed.' });
  }
}
