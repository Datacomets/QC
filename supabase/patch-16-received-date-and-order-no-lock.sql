-- Patch 16:
-- 1) เพิ่ม column received_date ใน qc_orders (วันที่รับเข้าจาก supplier)
-- 2) ใส่ advisory lock ใน gen_order_no() เพื่อกัน race condition
--    (ป้องกัน 2 transactions แย่ง seq เดียวกันตอน save พร้อมกัน)
-- 3) สร้าง RPC peek_next_order_no(p_date) สำหรับ client preview เลข Order ก่อน save

-- ----------------------------------------------------------------------------
-- 1) received_date
-- ----------------------------------------------------------------------------
alter table public.qc_orders
  add column if not exists received_date date;

comment on column public.qc_orders.received_date is
  'วันที่รับเข้าจาก supplier (optional). order_date ใช้แทน "วันที่ตรวจ / Inspection Date"';

-- ----------------------------------------------------------------------------
-- 2) gen_order_no() with advisory lock — prevents duplicate seq under concurrent inserts
-- ----------------------------------------------------------------------------
create or replace function public.gen_order_no()
returns trigger language plpgsql as $$
declare
  prefix text;
  seq int;
begin
  if new.order_no is null or new.order_no = '' then
    prefix := 'QC' || to_char(coalesce(new.order_date, current_date), 'YYMM');

    -- Serialize concurrent INSERTs on qc_orders for order_no generation.
    -- Lock released at end of transaction (commit/rollback).
    perform pg_advisory_xact_lock(hashtext('qc_order_no_seq'));

    select coalesce(max(substring(order_no from 7)::int), 0) + 1
      into seq
      from public.qc_orders
      where order_no like prefix || '%';
    new.order_no := prefix || lpad(seq::text, 4, '0');
  end if;
  return new;
end;$$;

-- Trigger already exists; CREATE OR REPLACE FUNCTION above is enough.

-- ----------------------------------------------------------------------------
-- 3) peek_next_order_no(p_date) — preview only, does NOT reserve
-- ----------------------------------------------------------------------------
create or replace function public.peek_next_order_no(p_date date default current_date)
returns text language sql stable as $$
  select 'QC' || to_char(p_date, 'YYMM') ||
         lpad(
           (coalesce(max(substring(order_no from 7)::int), 0) + 1)::text,
           4, '0'
         )
  from public.qc_orders
  where order_no like 'QC' || to_char(p_date, 'YYMM') || '%';
$$;

comment on function public.peek_next_order_no is
  'Preview เลข Order ถัดไปสำหรับวันที่ที่กำหนด — ไม่ reserve เลข (เลขจริงอาจต่างถ้ามีคน insert ก่อน). UI ใช้แสดง preview เท่านั้น';

-- Allow authenticated users to call the peek function (read-only operation)
grant execute on function public.peek_next_order_no(date) to authenticated;
