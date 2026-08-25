-- Patch 28: close the remaining prototype tables, and create the one table
--           the app expects but that was never applied
--
-- Follow-up to patch-27. A full sweep of every table PostgREST exposes (19 of
-- them) was run on 2026-08-25 with the publishable key and no login, which
-- settled two things:
--
--   * patch-27 worked. public.users and public.vendors now answer
--     `42501 permission denied` to anonymous callers instead of returning rows.
--
--   * Every table the app actually uses answers `200 []` to anonymous callers.
--     That is RLS doing its job, not a leak: the anon role holds a SELECT
--     grant, but each policy requires auth.role() = 'authenticated', so no row
--     is ever returned. These are fine and are left alone.
--
-- What is left is five more tables from the pre-Supabase-Auth prototype. They
-- are empty today, so nothing is leaking yet, and they carry the same
-- `Allow all ... using (true)` policy that public.users had. An empty table
-- with a wide-open policy is a delayed leak, not a safe one — the day anything
-- writes to it, it is public. Cross-checked against the app: none of the five
-- is referenced anywhere in web/src or web/api.
--
--   table          rows  referenced in app code
--   ---------------------------------------------
--   orders            0  no   (superseded by qc_orders)
--   order_details     0  no   (superseded by qc_order_details)
--   defect_codes      0  no   (superseded by defects)
--   defect_details    0  no
--   defect_types      0  no
--
-- Section 3 is unrelated to security: public.material_upload_log is missing.

begin;

-- ---------------------------------------------------------------------------
-- 1. Close the five prototype tables, same treatment as patch-27.
-- ---------------------------------------------------------------------------
revoke all on public.orders         from anon, authenticated;
revoke all on public.order_details  from anon, authenticated;
revoke all on public.defect_codes   from anon, authenticated;
revoke all on public.defect_details from anon, authenticated;
revoke all on public.defect_types   from anon, authenticated;

alter table public.orders         enable row level security;
alter table public.order_details  enable row level security;
alter table public.defect_codes   enable row level security;
alter table public.defect_details enable row level security;
alter table public.defect_types   enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Safety net: drop EVERY policy in the public schema whose expression is
--    the literal `true`.
--
-- The list above came from reading a 19-row report by eye, and `orders` was
-- missed on the first pass simply because it had scrolled off the top of the
-- results pane. This block removes the guesswork: it finds them regardless of
-- what they are called or which table they sit on, and RAISE NOTICE prints
-- each one it drops so the change is auditable rather than silent.
--
-- Safe for the live app: every table it actually uses is governed by a
-- role-based policy from schema.sql or an earlier patch, never by a bare
-- `true`. Only the prototype leftovers match.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and coalesce(qual, 'true')       = 'true'
       and coalesce(with_check, 'true') = 'true'
  loop
    raise notice 'dropping wide-open policy: %.% -> %', r.schemaname, r.tablename, r.policyname;
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Create public.material_upload_log — the app has always expected it.
--
-- Materials.tsx:80 reads the newest row to show "last uploaded", and :264
-- inserts one row after each Excel upload. patch-08 declared the table but was
-- never applied to this project, so PostgREST answers 404 for it. Neither call
-- site checks its result, so both fail silently: the upload history on the
-- Materials page has always been empty, and no upload has ever been recorded.
--
-- Worth fixing before the pending ~19,357-row Materials import, so that import
-- actually leaves a trace. Definition copied verbatim from
-- patch-08-material-management.sql:26-51 — `if not exists` throughout, so
-- running patch-08 later is still harmless.
-- ---------------------------------------------------------------------------
create table if not exists public.material_upload_log (
  id             bigserial primary key,
  file_name      text not null,
  uploaded_by    text not null,
  uploaded_at    timestamptz not null default now(),
  total_rows     integer not null default 0,
  inserted_count integer not null default 0,
  updated_count  integer not null default 0,
  error_count    integer not null default 0
);

create index if not exists idx_material_upload_log_uploaded_at
  on public.material_upload_log (uploaded_at desc);

alter table public.material_upload_log enable row level security;

drop policy if exists "mat_upload_log_read" on public.material_upload_log;
create policy "mat_upload_log_read" on public.material_upload_log
  for select using (auth.role() = 'authenticated');

drop policy if exists "mat_upload_log_admin_write" on public.material_upload_log;
create policy "mat_upload_log_admin_write" on public.material_upload_log
  for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));

commit;

-- ---------------------------------------------------------------------------
-- Verify 1 — must return ZERO rows. Any row here is a wide-open policy.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and coalesce(qual, 'true')       = 'true'
   and coalesce(with_check, 'true') = 'true'
 order by tablename;

-- ---------------------------------------------------------------------------
-- Verify 2 — must return ZERO rows: no anon/authenticated grants left on any
-- of the seven dead tables.
-- ---------------------------------------------------------------------------
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('users', 'vendors', 'orders', 'order_details',
                      'defect_codes', 'defect_details', 'defect_types')
   and grantee in ('anon', 'authenticated')
 order by table_name, grantee;

-- ---------------------------------------------------------------------------
-- Verify 3 — must return exactly one row: material_upload_log now exists.
-- ---------------------------------------------------------------------------
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name = 'material_upload_log';

-- ---------------------------------------------------------------------------
-- Optional cleanup, once you are satisfied nothing needs them. All seven are
-- empty except public.users (8 rows) — export that one first if you want to
-- keep the record. Permanent, so left commented out deliberately.
--
--   drop table if exists public.order_details;
--   drop table if exists public.orders;
--   drop table if exists public.defect_details;
--   drop table if exists public.defect_codes;
--   drop table if exists public.defect_types;
--   drop table if exists public.vendors;
--   drop table if exists public.users;
-- ---------------------------------------------------------------------------
