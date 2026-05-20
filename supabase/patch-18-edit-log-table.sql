-- Patch 18: Restore qc_order_edit_log audit table
--
-- patch-04 was never applied to this project — neither the table nor the
-- 4 edit_approved columns on qc_orders exist. In v2.3.0 we removed the
-- Need Edit workflow entirely, so the 4 columns aren't needed anymore.
-- Only the audit log table remains relevant: insert one row per edit.
--
-- (The approved_by column in patch-04 was required for the unlock workflow.
-- In v2.3.0 there is no unlock — just track who edited and when.)

create table if not exists public.qc_order_edit_log (
  id bigserial primary key,
  order_id bigint not null references public.qc_orders(id) on delete cascade,
  edit_reason text not null default 'แก้ไขข้อมูล / Direct edit',
  edited_by uuid references public.profiles(id),
  edited_at timestamptz not null default now()
);

create index if not exists qc_order_edit_log_order_id_idx
  on public.qc_order_edit_log (order_id);

alter table public.qc_order_edit_log enable row level security;

drop policy if exists "edit_log_read"   on public.qc_order_edit_log;
drop policy if exists "edit_log_insert" on public.qc_order_edit_log;

create policy "edit_log_read"
  on public.qc_order_edit_log for select
  using (auth.role() = 'authenticated');

create policy "edit_log_insert"
  on public.qc_order_edit_log for insert
  with check (auth.role() = 'authenticated');

comment on table public.qc_order_edit_log is
  'Audit log: one row per edit on qc_orders (v2.3.0 — Direct edit workflow)';
