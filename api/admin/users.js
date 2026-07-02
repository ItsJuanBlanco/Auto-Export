import { createClient } from '@supabase/supabase-js';

/* global process */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function send(res, status, body) {
  res.status(status).json(body);
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function legacyUserKey(username) {
  return `user-${normalizeUsername(username).replace(/[^a-z0-9_-]/g, '-')}`;
}

function mapUser(row) {
  return {
    id: row.legacy_key || row.id,
    appUserId: row.id,
    authUserId: row.auth_user_id || '',
    username: row.username || '',
    role: row.role || 'CAM',
    status: row.status || 'Active',
    displayName: row.display_name || row.username || '',
    email: row.email || '',
    camProfileId: row.cam_profiles?.legacy_key || null,
  };
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

async function requireManager(req, admin, authClient) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw Object.assign(new Error('Missing bearer token.'), { status: 401 });

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    throw Object.assign(new Error('Invalid session token.'), { status: 401 });
  }

  const { data: appUser, error: appUserError } = await admin
    .from('app_users')
    .select('id, role, status')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (appUserError) throw appUserError;
  if (appUser?.role !== 'Manager' || appUser.status === 'Inactive') {
    throw Object.assign(new Error('Manager permission required.'), { status: 403 });
  }
  return appUser;
}

async function getCamProfileId(admin, camProfileId) {
  if (!camProfileId) return null;
  const { data, error } = await admin
    .from('cam_profiles')
    .select('id')
    .eq('legacy_key', camProfileId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw Object.assign(new Error(`CAM profile not found: ${camProfileId}`), { status: 400 });
  return data.id;
}

async function listUsers(admin) {
  const { data, error } = await admin
    .from('app_users')
    .select('*, cam_profiles(legacy_key, name)')
    .order('role', { ascending: false })
    .order('display_name', { ascending: true });
  if (error) throw error;
  const users = (data || []).map(mapUser);
  if (!users.length) {
    throw Object.assign(new Error('No app_users rows returned from Supabase. Verify public.app_users has rows and the API is pointed at the correct project.'), { status: 500 });
  }
  return users;
}

async function createUser(admin, payload) {
  const username = normalizeUsername(payload.username);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  const displayName = String(payload.displayName || '').trim();
  const role = payload.role === 'Manager' ? 'Manager' : 'CAM';
  if (!username || !email || !password || !displayName) {
    throw Object.assign(new Error('Display name, username, email, and password are required.'), { status: 400 });
  }

  const { data: duplicate, error: duplicateError } = await admin
    .from('app_users')
    .select('id')
    .or(`username.eq.${username},email.eq.${email}`)
    .limit(1)
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate?.id) {
    throw Object.assign(new Error('Username or email is already in use.'), { status: 409 });
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName, role },
  });
  if (authError) throw authError;

  const camUuid = await getCamProfileId(admin, payload.camProfileId);
  const { data, error } = await admin
    .from('app_users')
    .upsert({
      legacy_key: legacyUserKey(username),
      auth_user_id: authData.user.id,
      username,
      display_name: displayName,
      email,
      role,
      status: 'Active',
      cam_profile_id: camUuid,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'auth_user_id' })
    .select('*, cam_profiles(legacy_key, name)')
    .single();
  if (error) throw error;
  return mapUser(data);
}

async function updateUser(admin, payload) {
  const appUserId = payload.appUserId;
  if (!appUserId) throw Object.assign(new Error('appUserId is required.'), { status: 400 });

  const { data: existing, error: existingError } = await admin
    .from('app_users')
    .select('*')
    .eq('id', appUserId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw Object.assign(new Error('User not found.'), { status: 404 });

  const username = payload.username != null ? normalizeUsername(payload.username) : existing.username;
  const email = payload.email != null ? normalizeEmail(payload.email) : existing.email;
  const displayName = payload.displayName != null ? String(payload.displayName || '').trim() : existing.display_name;
  const role = payload.role === 'Manager' ? 'Manager' : payload.role === 'CAM' ? 'CAM' : existing.role;
  const status = payload.status === 'Inactive' ? 'Inactive' : 'Active';
  const camUuid = 'camProfileId' in payload
    ? await getCamProfileId(admin, payload.camProfileId)
    : existing.cam_profile_id;

  if (!username || !email || !displayName) {
    throw Object.assign(new Error('Display name, username, and email are required.'), { status: 400 });
  }

  if (existing.auth_user_id) {
    const authPatch = {
      email,
      user_metadata: { username, display_name: displayName, role },
      ban_duration: status === 'Inactive' ? '876000h' : 'none',
    };
    if (payload.password) authPatch.password = String(payload.password);
    const { error: authError } = await admin.auth.admin.updateUserById(existing.auth_user_id, authPatch);
    if (authError) throw authError;
  }

  const { data, error } = await admin
    .from('app_users')
    .update({
      legacy_key: legacyUserKey(username),
      username,
      display_name: displayName,
      email,
      role,
      status,
      cam_profile_id: camUuid,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appUserId)
    .select('*, cam_profiles(legacy_key, name)')
    .single();
  if (error) throw error;
  return mapUser(data);
}

async function deactivateUser(admin, payload) {
  return updateUser(admin, { appUserId: payload.appUserId, status: 'Inactive' });
}

export default async function handler(req, res) {
  try {
    const { admin, auth } = clients();
    await requireManager(req, admin, auth);

    if (req.method === 'GET') {
      return send(res, 200, { users: await listUsers(admin) });
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (req.method === 'POST') {
      const user = await createUser(admin, payload);
      return send(res, 201, { user, users: await listUsers(admin) });
    }
    if (req.method === 'PATCH') {
      const user = await updateUser(admin, payload);
      return send(res, 200, { user, users: await listUsers(admin) });
    }
    if (req.method === 'DELETE') {
      const user = await deactivateUser(admin, payload);
      return send(res, 200, { user, users: await listUsers(admin) });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const status = error.status || 500;
    return send(res, status, { error: error.message || 'Unexpected user management error.' });
  }
}
