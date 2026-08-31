-- Patch 32: staging tables for the legacy Orders import  (STEP 1 of 2)
--
-- Brings 2,021 QC orders and 3,762 defect lines from the AppSheet workbook
-- (Ordersss (8).xlsx) into appQC, which currently holds 16 test orders.
--
-- Run this, then import the two CSVs through the Table Editor, then run
-- patch-33. Splitting it that way lets Supabase's own CSV importer do the
-- bulk load — pasting ~1.4 MB of INSERT statements into the SQL editor is slow
-- and hard to restart if it times out half way.
--
-- Checked before writing this:
--   * order_no collisions between file and live data: NONE. The 16 existing
--     orders (QC26050001-15, QC25030001) share no number with the file.
--   * order_no already has a unique constraint, so a repeat run cannot
--     duplicate anything — it errors instead.
--   * 227 of 2,021 orders have a header ของเสีย that disagrees with the sum of
--     their defect lines. Imported as-is; see the note on triggers below.

begin;

-- ---------------------------------------------------------------------------
-- 1. Do not mail 2,021 historical orders.
--
-- Every imported order carries a final status, so the moment mail is switched
-- on the sweep would consider all of them notifiable and send thousands of
-- emails about work finished months ago.
--
-- The legacy script guarded this with a date floor (SEND_MAIL_START_DATE_TEXT).
-- A per-row flag is used here instead because it cannot be defeated by a
-- mistake in date logic, it is visible in the table, and one order can be
-- released on its own if someone does want to re-notify it.
-- ---------------------------------------------------------------------------
alter table public.qc_orders
  add column if not exists mail_suppressed boolean not null default false;

comment on column public.qc_orders.mail_suppressed is
  'true = ไม่ส่งอีเมลใบนี้ ใช้กับข้อมูลเก่าที่ import เข้ามา กันส่งย้อนหลัง';

create index if not exists qc_orders_mail_suppressed_idx
  on public.qc_orders (mail_suppressed) where not mail_suppressed;

-- ---------------------------------------------------------------------------
-- 2. Staging — every column text, so a stray value cannot abort the CSV load.
--    Casting and validation happen in patch-33 where they can be reported on.
-- ---------------------------------------------------------------------------
drop table if exists public.import_orders;
create table public.import_orders (
  order_no                   text,
  status                     text,
  order_date                 text,
  received_date              text,
  project_brief_no           text,
  sap_code                   text,
  material_description       text,
  brand                      text,
  sales                      text,
  scm                        text,
  pcm                        text,
  pur                        text,
  sup_code                   text,
  supplier_name              text,
  lot_no                     text,
  received_qty               text,
  sample_size                text,
  good_qty                   text,
  defect_qty                 text,
  note                       text,
  original_doc_with          text,
  accept_approved_by_name    text,
  acceptlot_approved_by_name text,
  reject_approved_by_name    text,
  created_by_name            text,
  qc_defect_check_status     text,
  qc_defect_alert            text,
  mail_send_count            text,
  mail_last_action           text
);

drop table if exists public.import_order_details;
create table public.import_order_details (
  legacy_detail_id text,
  order_no         text,
  defect_code      text,
  symptom          text,
  critical_rank    text,
  quantity         text
);

-- ---------------------------------------------------------------------------
-- 2b. Keep the workbook's own row id on the imported line.
--
-- The defect photos live in a Google Drive folder and are migrated separately,
-- after this import. Matching a photo back to its line needs a stable key, and
-- (order_no, symptom, quantity) is not one — the same defect at the same count
-- legitimately repeats within an order. The workbook's OrderDetail Id is unique
-- across all 3,762 rows, so it is carried across and used as the join key.
--
-- Safe to drop once the images are attached.
-- ---------------------------------------------------------------------------
alter table public.qc_order_details
  add column if not exists legacy_detail_id text;

create index if not exists qc_order_details_legacy_id_idx
  on public.qc_order_details (legacy_detail_id) where legacy_detail_id is not null;

comment on column public.qc_order_details.legacy_detail_id is
  'OrderDetail Id จากชีท AppSheet เดิม — ใช้จับคู่รูป defect ตอนย้ายจาก Google Drive';

-- Photo manifest: which Drive filenames belong to which line, in order.
drop table if exists public.import_detail_images;
create table public.import_detail_images (
  legacy_detail_id text,
  order_no         text,
  seq              text,
  filename         text
);
alter table public.import_detail_images enable row level security;
revoke all on public.import_detail_images from anon, authenticated;

-- Staging holds no secrets, but it is not app data either — keep it away from
-- the API entirely rather than leaving two unprotected tables lying around.
alter table public.import_orders        enable row level security;
alter table public.import_order_details enable row level security;
revoke all on public.import_orders        from anon, authenticated;
revoke all on public.import_order_details from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who recorded each order.
--
-- The workbook stores the QC staff member as free text, in four different
-- shapes — full 'ชื่อ_นามสกุล_เล่น', a bare nickname ('เบล', 'อิ๋ว'), or a bare
-- first name ('วรสุนาถ'). nickname_of() cannot resolve the last two, and
-- 'เบล' is not even spelled the same as the directory's 'เบลล์', so the mapping
-- is stated explicitly here instead of guessed.
-- ---------------------------------------------------------------------------
drop table if exists public.import_user_map;
create table public.import_user_map (
  source_name text primary key,
  emp_code    text not null
);

insert into public.import_user_map (source_name, emp_code) values
  ('อาภัทธสา_แก้วสุวรรณ_บูม', '11379'),   -- 716 ใบ
  ('สายธาร_เขียวจันทร์_ปอ',   '11262'),   -- 660 ใบ
  ('เบล',                     '10503'),   -- 309 ใบ · ธิดารัตน์ (ไดเรกทอรีสะกด 'เบลล์')
  ('ฐาปกรณ์_สอนภักดี_แบงค์',  '11385'),   -- 287 ใบ
  ('อิ๋ว',                    '11045'),   --  47 ใบ · รุ่งรัตน์
  ('รุ่งรัตน์_ธงวิชัย_อิ๋ว',  '11045'),   --   1 ใบ
  ('วรสุนาถ',                 '11181');   --   1 ใบ

alter table public.import_user_map enable row level security;
revoke all on public.import_user_map from anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verify — three empty staging tables and a 7-row map.
-- ---------------------------------------------------------------------------
select 'import_orders'        as ตาราง, count(*) as แถว from public.import_orders
union all select 'import_order_details',  count(*) from public.import_order_details
union all select 'import_detail_images',  count(*) from public.import_detail_images
union all select 'import_user_map',       count(*) from public.import_user_map;

-- Every source name must resolve to a real account, or those orders lose their
-- author. Expect zero rows.
select m.source_name, m.emp_code
  from public.import_user_map m
 where not exists (
   select 1 from public.profiles p
    where split_part(p.email, '@', 1) = m.emp_code
 );

-- ---------------------------------------------------------------------------
-- NEXT — load the CSVs, then run patch-33
--
-- Supabase Dashboard -> Table Editor, for each table: the "Insert" menu ->
-- "Import data from CSV".
--
--   public.import_orders         <-  supabase/import/orders.csv         (2,021)
--   public.import_order_details  <-  supabase/import/order_details.csv  (3,762)
--   public.import_detail_images  <-  supabase/import/detail_images.csv  (4,294)
--
-- All three are UTF-8 with a header row whose names match the columns above.
-- Confirm the counts with the first query in patch-33 before applying it.
--
-- import_detail_images is only needed for the photo migration afterwards; the
-- import itself works without it.
-- ---------------------------------------------------------------------------
