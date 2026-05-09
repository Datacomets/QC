-- Patch 10: แยกการอนุมัติตาม Inspection Result (Accept / Accept Lot / Reject)
-- เพิ่มคอลัมน์ 9 ช่อง — เก็บข้อมูลแยกช่องตามสถานะ
-- คงคอลัมน์ approved, approved_by, approved_at เดิมไว้เพื่อ backward compat
-- (ทุกครั้งที่กดอนุมัติ จะเซ็ตทั้ง generic + status-specific พร้อมกัน)

-- 1) เพิ่มคอลัมน์
alter table public.qc_orders
  add column if not exists accept_approved      boolean not null default false,
  add column if not exists accept_approved_by   uuid references public.profiles(id),
  add column if not exists accept_approved_at   timestamptz,

  add column if not exists acceptlot_approved   boolean not null default false,
  add column if not exists acceptlot_approved_by uuid references public.profiles(id),
  add column if not exists acceptlot_approved_at timestamptz,

  add column if not exists reject_approved      boolean not null default false,
  add column if not exists reject_approved_by   uuid references public.profiles(id),
  add column if not exists reject_approved_at   timestamptz;

-- 2) Backfill ข้อมูลเดิม — order ที่ approved=true อยู่แล้ว
--    ดูค่า status ปัจจุบัน แล้ว copy ไปยังคอลัมน์ที่ตรงกัน

update public.qc_orders
   set accept_approved = true,
       accept_approved_by = approved_by,
       accept_approved_at = approved_at
 where approved = true and status = 'Accept';

update public.qc_orders
   set acceptlot_approved = true,
       acceptlot_approved_by = approved_by,
       acceptlot_approved_at = approved_at
 where approved = true and status = 'Accept Lot';

update public.qc_orders
   set reject_approved = true,
       reject_approved_by = approved_by,
       reject_approved_at = approved_at
 where approved = true and status = 'Reject';
