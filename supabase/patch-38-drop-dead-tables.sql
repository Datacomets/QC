-- Patch 38: drop the seven tables nothing uses
--
-- patch-27 and patch-28 found these and sealed them — revoked anon and
-- authenticated, dropped the wide-open `using (true)` policies — but left the
-- tables in place. A sealed empty table is still a table: it shows up in the
-- dashboard next to the real ones, and the reasoning for why it is safe has to
-- be re-derived by whoever looks next. Dropping is the version that stays true.
--
--   table            rows  superseded by
--   ------------------------------------------------
--   orders              0  qc_orders
--   order_details       0  qc_order_details
--   defect_codes        0  defects
--   defect_types        0  defects
--   defect_details      0  —
--   vendors             0  suppliers
--   users               6  profiles
--
-- Verified before writing this, on 2026-09-07 against the live database:
--   * every one of the seven is absent from web/src and web/api — no
--     .from('<table>') and no /rest/v1/<table> anywhere
--   * no function or trigger in this repo writes to any of them
--   * six hold zero rows; public.users holds 6 from the pre-Supabase-Auth
--     prototype, and login has run on auth.users + public.profiles since
--
-- Deliberately NOT using CASCADE. If some foreign key still points at one of
-- these, the drop fails and the whole patch rolls back with nothing lost —
-- which is the outcome you want from a delete you cannot undo. CASCADE would
-- instead quietly take the referring object with it. If it does fail, section 0
-- names what is holding on.

-- ---------------------------------------------------------------------------
-- 0. Pre-check — run this ALONE first. Anything listed here would block the
--    drop, and needs deciding on before you go further. Empty result = clear.
-- ---------------------------------------------------------------------------
select c.conname            as "constraint",
       src.relname          as "ตารางที่อ้างถึง",
       tgt.relname          as "ตารางที่จะลบ"
  from pg_constraint c
  join pg_class src on src.oid = c.conrelid
  join pg_class tgt on tgt.oid = c.confrelid
 where c.contype = 'f'
   and tgt.relname in ('orders','order_details','defect_codes','defect_types',
                       'defect_details','vendors','users')
   and tgt.relnamespace = 'public'::regnamespace
   and src.relname <> tgt.relname;

-- ---------------------------------------------------------------------------
-- 1. The drops. Children before parents, so no CASCADE is needed.
-- ---------------------------------------------------------------------------
begin;

drop table if exists public.order_details;
drop table if exists public.orders;

drop table if exists public.defect_details;
drop table if exists public.defect_codes;
drop table if exists public.defect_types;

drop table if exists public.vendors;
drop table if exists public.users;

commit;

-- ---------------------------------------------------------------------------
-- Verify — expect seven NULLs.
-- ---------------------------------------------------------------------------
select to_regclass('public.orders')         as "orders",
       to_regclass('public.order_details')  as "order_details",
       to_regclass('public.defect_codes')   as "defect_codes",
       to_regclass('public.defect_types')   as "defect_types",
       to_regclass('public.defect_details') as "defect_details",
       to_regclass('public.vendors')        as "vendors",
       to_regclass('public.users')          as "users";

-- And that the tables the app does use are untouched.
select (select count(*) from public.qc_orders)        as "ใบ QC",
       (select count(*) from public.qc_order_details) as "รายการ defect",
       (select count(*) from public.defects)          as "รหัสของเสีย",
       (select count(*) from public.profiles)         as "ผู้ใช้",
       (select count(*) from public.suppliers)        as "ผู้ผลิต",
       (select count(*) from public.materials)        as "material";
