import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isPlaceholder = (value) => {
  const v = String(value || '').toLowerCase();
  return !v || v.includes('seu-projeto') || v.includes('sua-anon-key') || v.includes('sua_anon_key') || v.includes('xxxx');
};

export const supabaseConfigured = !isPlaceholder(rawUrl) && !isPlaceholder(rawAnonKey);
export const supabase = supabaseConfigured ? createClient(rawUrl, rawAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;
