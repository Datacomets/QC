-- Patch 04: เพิ่มระบบอนุมัติแก้ไข QC Order

-- 1. เพิ่มคอลัมน์ติดตามการแก้ไข
alter table public.qc_orders add column if not exists edit_approved boolean not null default false;
alter table public.qc_orders add column if not exists edit_reason text;
alter table public.qc_orders add column if not exists edit_approved_by uuid references public.profiles(id);
alter table public.qc_orders add column if not exists edit_approved_at timestamptz;

-- 2. ตาราง log ประวัติการแก้ไข
create table if not exists public.qc_order_edit_log (
  id bigserial primary key,
  order_id bigint not null references public.qc_orders(id) on delete cascade,
  edit_reason text not null,
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  edited_by uuid references public.profiles(id),
  edited_at timestamptz
);

-- 3. RLS
alter table public.qc_order_edit_log enable row level security;
create policy "edit_log_read" on public.qc_order_edit_log for select using (auth.role() = 'authenticated');
create policy "edit_log_insert" on public.qc_order_edit_log for insert with check (auth.role() = 'authenticated');
create policy "edit_log_update" on public.qc_order_edit_log for update using (auth.role() = 'authenticated');
