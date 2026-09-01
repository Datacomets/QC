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

/**
 * Fetch every row of a table, in pages.
 *
 * PostgREST caps a single response at 1,000 rows (`max-rows`), and it does so
 * silently: `.limit(5000)` on a 4,536-row table returns 1,000 rows and no error,
 * so the caller believes it has the lot. That is how the QC entry form ended up
 * offering only a fifth of the defect codes, and which fifth changed whenever a
 * row was edited — an updated row moves in the heap, and without ORDER BY the
 * first 1,000 are whatever the scan reaches first.
 *
 * So: always order by a stable column, and keep asking until a short page
 * arrives. Use this for any list the UI treats as complete.
 *
 *   const defects = await fetchAll<Defect>('defects', 'defect_code,symptom', 'defect_code');
 */
export async function fetchAll<T>(
  table: string,
  columns = '*',
  orderBy?: string,
  chunk = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += chunk) {
    let q = supabase.from(table).select(columns).range(from, from + chunk - 1);
    if (orderBy) q = q.order(orderBy);
    const { data, error } = await q;
    if (error) {
      // Return what arrived rather than nothing: a partial list still lets the
      // page work, and the caller's own error path stays in charge.
      console.warn(`fetchAll(${table}) stopped at ${all.length} rows:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < chunk) break;
  }
  return all;
}
