import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export type Role = string; // admin | qc_admin | operator | viewer | custom

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
}
