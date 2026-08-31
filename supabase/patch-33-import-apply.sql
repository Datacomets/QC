-- Patch 33: apply the staged legacy import  (STEP 2 of 2)
--
-- Run patch-32 first, then load the two CSVs into the staging tables, then this.
-- Check the counts with the first query below before running the transaction.

-- ---------------------------------------------------------------------------
-- CHECK FIRST — run this alone. Expect 2021 and 3762.
-- ---------------------------------------------------------------------------
select (select count(*) from public.import_orders)        as orders_ที่โหลดมา,
       (select count(*) from public.import_order_details) as details_ที่โหลดมา,
       (select count(*) from public.qc_orders)            as orders_ในระบบก่อน_import;

begin;

-- ---------------------------------------------------------------------------
-- Triggers, and which ones must be off
--
-- qc_details_sync  MUST BE OFF. It recomputes the parent order's defect_qty,
--   good_qty and critical/major/minor from the sum of its detail rows on every
--   insert. 227 of the 2,021 orders have a header ของเสีย that disagrees with
--   their lines — a real data-quality finding the QC team should see, not
--   something an import should silently overwrite. It would also fire 3,762
--   times, each with four subqueries.
--
-- qc_orders_auto_ncr  MUST BE OFF. 525 of the imported orders are Reject, so it
--   would mint 525 brand-new NCR documents numbered in the current month for
--   work closed months ago. The legacy NCR sheet is empty, so there is nothing
--   to migrate. They can be generated later if wanted — the one-liner is at the
--   bottom of this file.
--
-- qc_orders_parse_sap  STAYS ON deliberately. It derives sap_base,
--   sap_item_type/source/category/group and the running number from sap_code,
--   which is why none of those columns are in the import at all — appQC's own
--   parser is the authority, and the workbook's "Running No" means something
--   different from appQC's sap_running_no.
--
-- qc_orders_gen_no  STAYS ON but never fires, since every row supplies its own
--   order_no. Afterwards it keeps numbering correctly: it takes max() of the
--   sequence for the month prefix, and the imported numbers are in that space.
-- ---------------------------------------------------------------------------
alter table public.qc_order_details disable trigger qc_details_sync;
alter table public.qc_orders        disable trigger qc_orders_auto_ncr;

-- ---------------------------------------------------------------------------
-- Orders
--
-- nullif(btrim(x), '')::type throughout: the CSV writes an empty field for a
-- blank cell, and '' will not cast to int or date.
--
-- sample_size is NOT NULL in appQC and 16 rows have it blank, so those become
-- 0. defect_percent is a generated column and is left alone.
--
-- `approved` is derived rather than imported: the workbook has no such flag,
-- but it does name an approver per outcome, and a named approver is what
-- appQC means by approved.
-- ---------------------------------------------------------------------------
insert into public.qc_orders (
  order_no, status, order_date, received_date, project_brief_no, sap_code,
  material_description, brand, sales, scm, pcm, pur, sup_code, supplier_name,
  lot_no, received_qty, sample_size, good_qty, defect_qty, note,
  original_doc_with, created_by,
  approved, approved_by_name, approved_at,
  accept_approved, accept_approved_by_name,
  acceptlot_approved, acceptlot_approved_by_name,
  reject_approved, reject_approved_by_name,
  qc_defect_check_status, qc_defect_alert,
  mail_send_count, mail_last_action, mail_suppressed
)
select
  btrim(i.order_no),
  btrim(i.status),
  nullif(btrim(i.order_date), '')::date,
  nullif(btrim(i.received_date), '')::date,
  nullif(btrim(i.project_brief_no), ''),
  nullif(btrim(i.sap_code), ''),
  nullif(btrim(i.material_description), ''),
  nullif(btrim(i.brand), ''),
  nullif(btrim(i.sales), ''),
  nullif(btrim(i.scm), ''),
  nullif(btrim(i.pcm), ''),
  nullif(btrim(i.pur), ''),
  nullif(btrim(i.sup_code), ''),
  nullif(btrim(i.supplier_name), ''),
  nullif(btrim(i.lot_no), ''),
  coalesce(nullif(btrim(i.received_qty), '')::numeric::int, 0),
  coalesce(nullif(btrim(i.sample_size), '')::numeric::int, 0),
  coalesce(nullif(btrim(i.good_qty), '')::numeric::int, 0),
  coalesce(nullif(btrim(i.defect_qty), '')::numeric::int, 0),
  nullif(btrim(i.note), ''),
  nullif(btrim(i.original_doc_with), ''),
  p.id,
  -- approved / approved_by_name follow whichever outcome the order actually is
  coalesce(
    nullif(btrim(i.accept_approved_by_name), ''),
    nullif(btrim(i.acceptlot_approved_by_name), ''),
    nullif(btrim(i.reject_approved_by_name), '')
  ) is not null,
  coalesce(
    nullif(btrim(i.accept_approved_by_name), ''),
    nullif(btrim(i.acceptlot_approved_by_name), ''),
    nullif(btrim(i.reject_approved_by_name), '')
  ),
  case when coalesce(
         nullif(btrim(i.accept_approved_by_name), ''),
         nullif(btrim(i.acceptlot_approved_by_name), ''),
         nullif(btrim(i.reject_approved_by_name), '')
       ) is not null
       then nullif(btrim(i.order_date), '')::date::timestamptz end,
  nullif(btrim(i.accept_approved_by_name), '')    is not null,
  nullif(btrim(i.accept_approved_by_name), ''),
  nullif(btrim(i.acceptlot_approved_by_name), '') is not null,
  nullif(btrim(i.acceptlot_approved_by_name), ''),
  nullif(btrim(i.reject_approved_by_name), '')    is not null,
  nullif(btrim(i.reject_approved_by_name), ''),
  nullif(btrim(i.qc_defect_check_status), ''),
  nullif(btrim(i.qc_defect_alert), ''),
  coalesce(nullif(btrim(i.mail_send_count), '')::numeric::int, 0),
  nullif(btrim(i.mail_last_action), ''),
  true          -- ข้อมูลเก่า ห้ามส่งเมลย้อนหลัง
from public.import_orders i
left join public.import_user_map m on m.source_name = btrim(i.created_by_name)
left join public.profiles p       on split_part(p.email, '@', 1) = m.emp_code
where btrim(coalesce(i.order_no, '')) <> ''
on conflict (order_no) do nothing;

-- ---------------------------------------------------------------------------
-- Defect lines — joined to the parent by order_no.
--
-- Images are not migrated. 3,350 of the 3,762 lines had photos, but they are
-- AppSheet paths into Google Drive, not URLs; putting those strings into
-- qc_order_details.images would render as broken images in the app. Left null,
-- and the count is reported below so the gap is on the record.
-- ---------------------------------------------------------------------------
insert into public.qc_order_details
  (order_id, legacy_detail_id, defect_code, symptom, critical_rank, quantity)
select o.id,
       nullif(btrim(d.legacy_detail_id), ''),
       nullif(btrim(d.defect_code), ''),
       nullif(btrim(d.symptom), ''),
       coalesce(nullif(btrim(d.critical_rank), ''), 'Minor'),
       coalesce(nullif(btrim(d.quantity), '')::numeric::int, 0)
  from public.import_order_details d
  join public.qc_orders o on o.order_no = btrim(d.order_no)
 where btrim(coalesce(d.order_no, '')) <> '';

alter table public.qc_orders        enable trigger qc_orders_auto_ncr;
alter table public.qc_order_details enable trigger qc_details_sync;

commit;

-- ---------------------------------------------------------------------------
-- Verify 1 — totals. Expect 2,037 orders (2,021 + the 16 that were here) and
-- 3,778 detail rows.
-- ---------------------------------------------------------------------------
select (select count(*) from public.qc_orders)         as orders_ทั้งหมด,
       (select count(*) from public.qc_order_details)  as details_ทั้งหมด,
       (select count(*) from public.qc_orders where mail_suppressed) as ปิดเมลไว้,
       (select count(*) from public.qc_orders where created_by is null) as ไม่มีผู้บันทึก;

-- ---------------------------------------------------------------------------
-- Verify 2 — anything that failed to come across. Expect zero rows.
-- ---------------------------------------------------------------------------
select i.order_no, 'ไม่ได้ถูก insert' as ปัญหา
  from public.import_orders i
 where not exists (select 1 from public.qc_orders o where o.order_no = btrim(i.order_no))
union all
select btrim(i.order_no), 'map ผู้บันทึกไม่ได้: ' || coalesce(i.created_by_name, '(ว่าง)')
  from public.import_orders i
 where btrim(coalesce(i.created_by_name, '')) <> ''
   and not exists (select 1 from public.import_user_map m
                    where m.source_name = btrim(i.created_by_name))
 limit 50;

-- ---------------------------------------------------------------------------
-- Verify 3 — status spread, and the SAP parser's work on the new rows.
-- ---------------------------------------------------------------------------
select status, count(*) as จำนวน,
       count(*) filter (where sap_item_type is not null) as parse_sap_ได้
  from public.qc_orders
 group by status
 order by จำนวน desc;

-- ---------------------------------------------------------------------------
-- Verify 4 — the 227 orders whose header ของเสีย disagrees with their lines.
-- Imported faithfully, NOT corrected. This is the list for QC to review.
-- ---------------------------------------------------------------------------
select o.order_no, o.status, o.defect_qty as ตามหัวใบ,
       coalesce(sum(d.quantity), 0) as รวมรายการ,
       o.defect_qty - coalesce(sum(d.quantity), 0) as ต่างกัน
  from public.qc_orders o
  left join public.qc_order_details d on d.order_id = o.id
 where o.mail_suppressed
 group by o.id, o.order_no, o.status, o.defect_qty
having o.defect_qty <> coalesce(sum(d.quantity), 0)
 order by abs(o.defect_qty - coalesce(sum(d.quantity), 0)) desc
 limit 50;

-- ---------------------------------------------------------------------------
-- Cleanup, once the verifies look right
--
--   drop table if exists public.import_orders;
--   drop table if exists public.import_order_details;
--   drop table if exists public.import_user_map;
--
-- Optional, only if NCR documents are wanted for the historical rejects. This
-- mints new NCR numbers in the CURRENT month, which is why it is not automatic:
--
--   insert into public.ncr_reports (order_id, order_no, created_by)
--   select o.id, o.order_no, o.created_by
--     from public.qc_orders o
--    where o.status = 'Reject'
--      and not exists (select 1 from public.ncr_reports n where n.order_id = o.id);
-- ---------------------------------------------------------------------------
