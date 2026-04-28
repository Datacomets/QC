-- Patch 06: เพิ่ม NCR (Non-Conformance Report) สำหรับ Order Status = Reject

-- 1. NCR table
create table if not exists public.ncr_reports (
  id bigserial primary key,
  ncr_no text unique,
  order_id bigint not null references public.qc_orders(id) on delete cascade,
  order_no text,
  problem_found text,
  root_cause text,
  corrective text,
  follow_up text,
  status text default 'Open',  -- Open / In Progress / Closed
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists ncr_reports_order_id_idx on public.ncr_reports (order_id);

-- 2. Auto-generate NCR No (NCR<YY><MM><seq4>)
create or replace function public.gen_ncr_no()
returns trigger language plpgsql as $$
declare
  prefix text;
  seq int;
begin
  if new.ncr_no is null or new.ncr_no = '' then
    prefix := 'NCR' || to_char(now(), 'YYMM');
    select coalesce(max(substring(ncr_no from 8)::int), 0) + 1
      into seq
      from public.ncr_reports
      where ncr_no like prefix || '%';
    new.ncr_no := prefix || lpad(seq::text, 4, '0');
  end if;
  return new;
end;$$;

drop trigger if exists ncr_gen_no on public.ncr_reports;
create trigger ncr_gen_no
  before insert on public.ncr_reports
  for each row execute function public.gen_ncr_no();

-- 3. Auto-create NCR when qc_orders.status changes to 'Reject'
create or replace function public.auto_create_ncr()
returns trigger language plpgsql as $$
begin
  if new.status = 'Reject' and (old is null or old.status is distinct from 'Reject') then
    -- ตรวจว่ายังไม่มี NCR สำหรับ order นี้
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

-- 4. RLS
alter table public.ncr_reports enable row level security;

create policy "ncr_read" on public.ncr_reports for select using (auth.role() = 'authenticated');
create policy "ncr_insert" on public.ncr_reports for insert
  with check (auth.role() = 'authenticated');
create policy "ncr_update" on public.ncr_reports for update
  using (auth.uid() = created_by or public.current_role_level() in ('admin','qc_admin'))
  with check (auth.uid() = created_by or public.current_role_level() in ('admin','qc_admin'));
create policy "ncr_delete" on public.ncr_reports for delete
  using (public.current_role_level() in ('admin','qc_admin'));
