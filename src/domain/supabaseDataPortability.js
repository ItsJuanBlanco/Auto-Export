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

export async function loadSupabaseDataExport() {
  const response = await fetch('/api/admin/data-export', {
    method: 'GET',
    headers: await authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Data export API route was not found. Run with `vercel dev` locally or deploy to Vercel.');
    }
    throw new Error(body.error || `Data export request failed (${response.status}).`);
  }
  return body;
}

export async function loadSupabaseIntakeSheet() {
  const response = await fetch('/api/admin/intake-sheet', {
    method: 'GET',
    headers: await authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Intake sheet API route was not found. Run with `vercel dev` locally or deploy to Vercel.');
    }
    throw new Error(body.error || `Intake sheet request failed (${response.status}).`);
  }
  return body;
}
