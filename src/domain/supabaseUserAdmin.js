import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

async function authHeaders() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error('Manager session is not active.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function requestUsers(method = 'GET', payload = null) {
  const headers = await authHeaders();
  const response = await fetch('/api/admin/users', {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('User admin API route was not found. Run with `vercel dev` locally or deploy to Vercel; Vite dev server does not serve /api/admin/users.');
    }
    throw new Error(body.error || `User admin request failed (${response.status}).`);
  }
  return body;
}

export async function loadSupabaseManagedUsers() {
  const { users } = await requestUsers('GET');
  return users || [];
}

export async function createSupabaseManagedUser(user) {
  const { users } = await requestUsers('POST', user);
  return users || [];
}

export async function updateSupabaseManagedUser(user) {
  const { users } = await requestUsers('PATCH', user);
  return users || [];
}

export async function deactivateSupabaseManagedUser(appUserId) {
  const { users } = await requestUsers('DELETE', { appUserId });
  return users || [];
}
