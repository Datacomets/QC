-- Patch 26: make the `viewer` role genuinely read-only at the database level
--
-- Production and PCM staff get the `viewer` role: they may look at everything
-- but must not change anything. The UI enforced that only partially, and RLS
-- did not enforce it at all. Two policies let any authenticated user write:
--
--   schema.sql:245   qc_orders_insert  with check (auth.uid() = created_by)
--   patch-06:67      ncr_insert        with check (auth.role() = 'authenticated')
--
-- Neither looks at the role. A viewer holding a valid JWT could therefore POST
-- straight to /rest/v1/qc_orders with created_by set to their own uid — and once
-- such a row existed, qc_orders_update_own (auth.uid() = created_by) and
-- qc_details_write (o.created_by = auth.uid()) would grant them full edit rights
-- on it. ncr_insert was weaker still: no created_by check whatsoever.
--
-- Every other write path was already safe: suppliers/materials/defects require
-- admin|qc_admin (patch-03:34,40,46), profiles requires admin (patch-03:28),
-- and deletes require admin|qc_admin (patch-03:56, patch-06:72).
--
-- All read policies are deliberately left alone — `auth.role() =
-- 'authenticated'` on qc_orders, qc_order_details, materials, suppliers,
-- defects and ncr_reports is exactly the "ดูข้อมูลได้" half of the requirement.
--
-- Expressed as a block-list rather than an allow-list so that adding a custom
-- role later does not silently strip its ability to record QC work. This
-- mirrors the `deny` prop added to <Protected> in App.tsx.

begin;

-- current_role_level() reads public.profiles for auth.uid(); it is defined in
-- patch-03-role-to-text.sql and is security definer, so it sees the row even
-- though profiles_self_read would otherwise hide it.

-- `is distinct from` rather than `<> `: it treats a NULL role (no profile row
-- yet) as "not a viewer", and it compiles against both the text return type
-- from patch-03 and the original user_role enum in schema.sql, so the same
-- expression can live in the baseline file too.

drop policy if exists "qc_orders_insert" on public.qc_orders;
create policy "qc_orders_insert" on public.qc_orders for insert
  with check (
    auth.uid() = created_by
    and public.current_role_level() is distinct from 'viewer'
  );

drop policy if exists "ncr_insert" on public.ncr_reports;
create policy "ncr_insert" on public.ncr_reports for insert
  with check (
    auth.role() = 'authenticated'
    and public.current_role_level() is distinct from 'viewer'
  );

-- qc_order_details has no separate insert policy — qc_details_write ("for all")
-- already requires owning the parent order, and a viewer can no longer own one.

commit;

-- ---------------------------------------------------------------------------
-- Verify. Expect no row where a viewer can write:
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, coalesce(with_check, qual) as check_expr
  from pg_policies
 where schemaname = 'public'
   and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
 order by tablename, cmd, policyname;

-- Manual smoke test, as one of the pcm viewers (e.g. pcm02): log in, then
--   POST /rest/v1/qc_orders  {"created_by": "<their uid>", ...}
-- must now fail with
--   new row violates row-level security policy for table "qc_orders"
