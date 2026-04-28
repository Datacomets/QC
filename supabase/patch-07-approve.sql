-- Patch 07: เพิ่มฟิลด์ "อนุมัติ" แยกจากการ "ต้องแก้ไข"
alter table public.qc_orders add column if not exists approved boolean not null default false;
alter table public.qc_orders add column if not exists approved_by uuid references public.profiles(id);
alter table public.qc_orders add column if not exists approved_at timestamptz;
