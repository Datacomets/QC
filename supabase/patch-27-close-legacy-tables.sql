-- Patch 27: close two wide-open legacy tables and the audit-log insert
--
-- Found by the verify query at the end of patch-26, which lists every write
-- policy in the public schema. Three rows in that output were not accounted
-- for by any patch in this repo:
--
--   users             | Allow all on users  | ALL    | true
--   vendors           | Allow all on vendors| ALL    | true
--   qc_order_edit_log | edit_log_insert     | INSERT | auth.role() = 'authenticated'
--
-- ---------------------------------------------------------------------------
-- 1. public.users / public.vendors — leftovers from the pre-Supabase-Auth
--    prototype. `Allow all ... using (true)` for ALL commands, granted to
--    PUBLIC, so the anon key reaches them. That key ships inside the frontend
--    JS bundle, meaning public.users was readable by anyone who opened the
--    site — no login required. Verified on 2026-08-25: a plain GET with only
--    the publishable key returned all 8 rows.
--
--    Contents: 8 rows of name + email + username + role for QC and PCM staff
--    (including qc02, who no longer exists in auth.users). patch-09 already
--    stripped the plaintext `password` column from this table for the same
--    reason. public.vendors is empty.
--
--    Neither table is referenced anywhere in web/src or web/api — the live app
--    reads public.profiles and auth.users. They are dead weight.
--
-- 2. qc_order_edit_log.edit_log_insert (patch-18:31) gates on nothing but
--    "is logged in", so a viewer could append forged rows to the edit audit
--    trail — claiming someone else edited an order. Same fix as patch-26.
-- ---------------------------------------------------------------------------

begin;

-- --- 1a. Revoke the grants PostgREST relies on ------------------------------
-- Dropping the policy alone is not enough to be sure: revoking the table
-- grants closes the door even if some other permissive policy is added later.
revoke all on public.users   from anon, authenticated;
revoke all on public.vendors from anon, authenticated;

-- --- 1b. Drop the permissive policies --------------------------------------
drop policy if exists "Allow all on users"   on public.users;
drop policy if exists "Allow all on vendors" on public.vendors;

-- Belt and braces: with RLS on and no policy left, even a stray future grant
-- denies by default rather than allowing everything.
alter table public.users   enable row level security;
alter table public.vendors enable row level security;

-- --- 2. Audit log: viewers must not be able to forge edit entries ----------
drop policy if exists "edit_log_insert" on public.qc_order_edit_log;
create policy "edit_log_insert"
  on public.qc_order_edit_log for insert
  with check (
    auth.role() = 'authenticated'
    and public.current_role_level() is distinct from 'viewer'
  );

-- patch-04 also declared an "edit_log_update" policy allowing any
-- authenticated user to rewrite log rows. patch-04 was never applied to this
-- project, so the policy should not exist — dropped here so that a later
-- accidental run of patch-04 cannot reintroduce it silently.
drop policy if exists "edit_log_update" on public.qc_order_edit_log;

commit;

-- ---------------------------------------------------------------------------
-- Verify 1 — these two must return zero rows:
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, coalesce(with_check, qual) as check_expr
  from pg_policies
 where schemaname = 'public'
   and tablename in ('users', 'vendors');

select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('users', 'vendors')
   and grantee in ('anon', 'authenticated');

-- ---------------------------------------------------------------------------
-- Verify 2 — every remaining write policy. Read each check_expr and confirm
-- none of them lets a viewer through. Widen the column or Export to CSV; the
-- expressions are long and the SQL Editor truncates them.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, coalesce(with_check, qual) as check_expr
  from pg_policies
 where schemaname = 'public'
   and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
 order by tablename, cmd, policyname;

-- ---------------------------------------------------------------------------
-- Verify 3 — outside the SQL Editor, confirm the public leak is closed. Run
-- this in a terminal with the PUBLISHABLE (anon) key, not the secret one.
-- Before this patch it returned 8 rows; it must now return a permission error.
--
--   curl "https://ruknpxlnvxgpraxkktfi.supabase.co/rest/v1/users?select=*" \
--        -H "apikey: <publishable key>"
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Optional cleanup, once you are satisfied nothing needs them.
--
-- The steps above already close the exposure — the tables are unreachable
-- through the API. Dropping them is hygiene, not a fix, and it is permanent,
-- so it is left commented out deliberately.
--
-- Export both tables to CSV from the Supabase table editor FIRST, then
-- uncomment and run:
--
--   drop table if exists public.vendors;
--   drop table if exists public.users;
-- ---------------------------------------------------------------------------
