-- Patch 35: tidy up after the legacy import, and put the missing NCR trigger back
--
-- Run this only after patch-34 has attached the photos. Verified before writing:
--   qc_order_details:  3,347 lines carry photos · 4,294 URLs in total
-- so the staging tables have nothing left to give.

begin;

-- ---------------------------------------------------------------------------
-- 1. Restore the auto-NCR trigger.
--
-- ncr_reports exists and holds 9 rows, and gen_ncr_no() clearly ran to number
-- them, but qc_orders_auto_ncr is gone from the live database — patch-33's
-- first attempt failed with 42704 (trigger does not exist) trying to disable
-- it. So since some point, saving a Reject order has created no NCR at all.
--
-- Recreated exactly as patch-06 declares it. Both statements are idempotent.
--
-- Historical Reject orders are deliberately NOT backfilled: 525 of the
-- imported orders are Reject, and opening 525 NCRs for work finished months
-- ago would bury the real ones. The trigger only fires from here on.
-- ---------------------------------------------------------------------------
create or replace function public.auto_create_ncr()
returns trigger language plpgsql as $$
begin
  if new.status = 'Reject' and (old is null or old.status is distinct from 'Reject') then
    if not exists (select 1 from public.ncr_reports where order_id = new.id) then
      insert into public.ncr_reports (order_id, order_no, created_by)
      values (new.id, new.order_no, new.created_by);
    end if;
  end if;
  return new;
end;$$;

drop trigger if exists qc_orders_auto_ncr on public.qc_orders;
create trigger qc_orders_auto_ncr
  after insert or update of status on public.qc_orders
  for each row execute function public.auto_create_ncr();

-- ---------------------------------------------------------------------------
-- 2. Drop the import staging.
--
-- These four were only ever scaffolding for patch-33 and patch-34. Dropping
-- them removes ~6,000 rows of duplicated text and two tables that would
-- otherwise sit in the schema looking like app data.
--
-- qc_order_details.legacy_detail_id is KEPT. It costs nothing, and it is the
-- only remaining record of which workbook row an imported line came from —
-- useful if a photo ever needs re-checking against the Drive folder.
-- ---------------------------------------------------------------------------
drop table if exists public.import_detail_images;
drop table if exists public.import_order_details;
drop table if exists public.import_orders;
drop table if exists public.import_user_map;

commit;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

-- 1. Trigger is back. Expect one row: qc_orders_auto_ncr / O (enabled).
select tgname as "trigger", tgenabled as "สถานะ"
  from pg_trigger
 where tgrelid = 'public.qc_orders'::regclass
   and not tgisinternal
 order by tgname;

-- 2. Staging is gone. Expect four NULLs.
select to_regclass('public.import_orders')        as "import_orders",
       to_regclass('public.import_order_details') as "import_order_details",
       to_regclass('public.import_detail_images') as "import_detail_images",
       to_regclass('public.import_user_map')      as "import_user_map";

-- 3. The imported data itself is untouched.
select (select count(*) from public.qc_orders)                                   as "ใบ QC",
       (select count(*) from public.qc_order_details)                            as "รายการ defect",
       (select count(*) from public.qc_order_details where images <> '{}')        as "รายการที่มีรูป",
       (select count(*) from public.ncr_reports)                                  as "NCR";
