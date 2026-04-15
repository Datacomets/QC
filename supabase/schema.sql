-- ============================================================================
-- appQC - Quality Control Inspection System Schema
-- Run this in Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- Drop existing (safe re-run)
drop table if exists public.qc_order_details cascade;
drop table if exists public.qc_orders cascade;
drop table if exists public.defects cascade;
drop table if exists public.materials cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.profiles cascade;
drop type if exists user_role cascade;
drop type if exists critical_rank cascade;

-- ============================================================================
-- ENUMS
-- ============================================================================
create type user_role as enum ('admin', 'qc_admin', 'operator');
create type critical_rank as enum ('Critical', 'Major', 'Minor');

-- ============================================================================
-- PROFILES (extends auth.users)
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role user_role not null default 'operator',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SUPPLIERS
-- ============================================================================
create table public.suppliers (
  id bigserial primary key,
  sup_code text not null,
  sup_sap_code text,
  supplier_name text not null,
  category text,
  status text default 'ACTIVE',
  purchase text,  -- 'Import' / 'Local'
  created_at timestamptz not null default now(),
  unique (sup_code)
);

create index on public.suppliers (sup_sap_code);
create index on public.suppliers (supplier_name);

-- ============================================================================
-- MATERIALS (SAP Code = Material ID)
-- ============================================================================
create table public.materials (
  sap_code text primary key,
  description text,
  product_category text,
  base_uom text,
  brand text,
  sales text,
  scm text,
  created_at timestamptz not null default now()
);

create index on public.materials (brand);

-- ============================================================================
-- DEFECTS (รหัสของเสีย)
-- ============================================================================
create table public.defects (
  defect_code text primary key,          -- e.g. '11001'
  symptom text not null,                  -- 'ไม่พิมพ์/Printing missing'
  reason text,                            -- 'Logo/สิ่งพิมพ์'
  type text,                              -- 'Defect/ข้อเสียหาย(ซ่อมไม่ได้)'
  created_at timestamptz not null default now()
);

-- ============================================================================
-- QC ORDERS (ใบบันทึกการสุ่มตรวจ)
-- ============================================================================
create table public.qc_orders (
  id bigserial primary key,
  order_no text unique not null,                    -- 'QC26040001'
  order_date date not null default current_date,
  sap_code text references public.materials(sap_code),
  material_description text,
  brand text,
  sales text,
  scm text,
  sup_code text references public.suppliers(sup_code),
  supplier_name text,
  lot_no text,
  received_qty integer,                             -- จำนวนรับ
  sample_size integer not null,                     -- จำนวนตรวจสอบ
  good_qty integer default 0,
  defect_qty integer default 0,                     -- รวม Critical+Major+Minor
  critical_qty integer default 0,
  major_qty integer default 0,
  minor_qty integer default 0,
  defect_percent numeric(6,3) generated always as (
    case when sample_size > 0
      then round((coalesce(defect_qty,0)::numeric / sample_size::numeric) * 100, 3)
      else 0 end
  ) stored,
  status text default 'Pending',                    -- Pending/Accept/Reject
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index on public.qc_orders (order_date);
create index on public.qc_orders (created_by);

-- ============================================================================
-- QC ORDER DETAILS (รายการของเสียในแต่ละ order)
-- ============================================================================
create table public.qc_order_details (
  id bigserial primary key,
  order_id bigint not null references public.qc_orders(id) on delete cascade,
  defect_code text references public.defects(defect_code),
  symptom text,
  critical_rank critical_rank not null,
  quantity integer not null default 0,
  created_at timestamptz not null default now()
);

create index on public.qc_order_details (order_id);

-- ============================================================================
-- AUTO-SYNC order totals from details
-- ============================================================================
create or replace function public.recalc_order_totals(p_order_id bigint)
returns void language plpgsql as $$
begin
  update public.qc_orders o set
    critical_qty = coalesce((select sum(quantity) from public.qc_order_details where order_id = p_order_id and critical_rank = 'Critical'), 0),
    major_qty    = coalesce((select sum(quantity) from public.qc_order_details where order_id = p_order_id and critical_rank = 'Major'), 0),
    minor_qty    = coalesce((select sum(quantity) from public.qc_order_details where order_id = p_order_id and critical_rank = 'Minor'), 0),
    defect_qty   = coalesce((select sum(quantity) from public.qc_order_details where order_id = p_order_id), 0)
  where o.id = p_order_id;
  update public.qc_orders set good_qty = greatest(sample_size - defect_qty, 0) where id = p_order_id;
end;$$;

create or replace function public.trg_qc_details_sync()
returns trigger language plpgsql as $$
begin
  perform public.recalc_order_totals(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;$$;

create trigger qc_details_sync
  after insert or update or delete on public.qc_order_details
  for each row execute function public.trg_qc_details_sync();

-- ============================================================================
-- AUTO-GENERATE order_no  (QC<YY><MM><seq4>)
-- ============================================================================
create or replace function public.gen_order_no()
returns trigger language plpgsql as $$
declare
  prefix text;
  seq int;
begin
  if new.order_no is null or new.order_no = '' then
    prefix := 'QC' || to_char(coalesce(new.order_date, current_date), 'YYMM');
    select coalesce(max(substring(order_no from 7)::int), 0) + 1
      into seq
      from public.qc_orders
      where order_no like prefix || '%';
    new.order_no := prefix || lpad(seq::text, 4, '0');
  end if;
  return new;
end;$$;

create trigger qc_orders_gen_no
  before insert on public.qc_orders
  for each row execute function public.gen_order_no();

-- ============================================================================
-- AUTO-CREATE profile on new auth user
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operator')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = excluded.role;
  return new;
end;$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.suppliers          enable row level security;
alter table public.materials          enable row level security;
alter table public.defects            enable row level security;
alter table public.qc_orders          enable row level security;
alter table public.qc_order_details   enable row level security;

-- Helper: current user role
create or replace function public.current_role_level()
returns user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Profiles: read own + all-admin, update own
create policy "profiles_self_read" on public.profiles for select
  using (auth.uid() = id or public.current_role_level() in ('admin','qc_admin'));
create policy "profiles_admin_all" on public.profiles for all
  using (public.current_role_level() = 'admin')
  with check (public.current_role_level() = 'admin');

-- Master data: everyone authenticated can read
create policy "suppliers_read" on public.suppliers for select using (auth.role() = 'authenticated');
create policy "suppliers_admin_write" on public.suppliers for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));

create policy "materials_read" on public.materials for select using (auth.role() = 'authenticated');
create policy "materials_admin_write" on public.materials for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));

create policy "defects_read" on public.defects for select using (auth.role() = 'authenticated');
create policy "defects_admin_write" on public.defects for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));

-- QC orders: operators can read all, insert/update their own; admin/qc_admin full access
create policy "qc_orders_read" on public.qc_orders for select using (auth.role() = 'authenticated');
create policy "qc_orders_insert" on public.qc_orders for insert
  with check (auth.uid() = created_by);
create policy "qc_orders_update_own" on public.qc_orders for update
  using (auth.uid() = created_by or public.current_role_level() in ('admin','qc_admin'))
  with check (auth.uid() = created_by or public.current_role_level() in ('admin','qc_admin'));
create policy "qc_orders_admin_delete" on public.qc_orders for delete
  using (public.current_role_level() in ('admin','qc_admin'));

create policy "qc_details_read" on public.qc_order_details for select using (auth.role() = 'authenticated');
create policy "qc_details_write" on public.qc_order_details for all
  using (
    exists (select 1 from public.qc_orders o where o.id = order_id
            and (o.created_by = auth.uid() or public.current_role_level() in ('admin','qc_admin')))
  )
  with check (
    exists (select 1 from public.qc_orders o where o.id = order_id
            and (o.created_by = auth.uid() or public.current_role_level() in ('admin','qc_admin')))
  );

-- ============================================================================
-- DONE. Next: run seed scripts from /scripts
-- ============================================================================
