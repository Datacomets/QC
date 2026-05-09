-- Patch 11: เก็บชื่อผู้อนุมัติเป็น text (รองรับชื่อนอกระบบ)
-- Operator/Admin กดอนุมัติ → เลือกชื่อจาก dropdown หรือพิมพ์เอง

alter table public.qc_orders
  add column if not exists approved_by_name           text,
  add column if not exists accept_approved_by_name    text,
  add column if not exists acceptlot_approved_by_name text,
  add column if not exists reject_approved_by_name    text;

-- Backfill จากตาราง profiles สำหรับ order ที่ approve อยู่แล้ว
update public.qc_orders o
   set approved_by_name = p.full_name
  from public.profiles p
 where o.approved = true and o.approved_by = p.id and o.approved_by_name is null;

update public.qc_orders o
   set accept_approved_by_name = p.full_name
  from public.profiles p
 where o.accept_approved = true and o.accept_approved_by = p.id and o.accept_approved_by_name is null;

update public.qc_orders o
   set acceptlot_approved_by_name = p.full_name
  from public.profiles p
 where o.acceptlot_approved = true and o.acceptlot_approved_by = p.id and o.acceptlot_approved_by_name is null;

update public.qc_orders o
   set reject_approved_by_name = p.full_name
  from public.profiles p
 where o.reject_approved = true and o.reject_approved_by = p.id and o.reject_approved_by_name is null;
