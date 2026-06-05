-- Patch 23: Supplier upload log + audit columns
-- ใช้คู่กับ Admin → Suppliers → "Upload Supplier File" (ฟีเจอร์อัปโหลด Excel เพื่อ batch upsert)

-- 1) Audit columns on suppliers (parallel to materials)
alter table public.suppliers add column if not exists updated_at timestamptz;
alter table public.suppliers add column if not exists updated_by text;

-- backfill updated_at สำหรับแถวเก่า (ใช้ created_at ถ้ามี ไม่งั้น now())
update public.suppliers
  set updated_at = coalesce(updated_at, created_at, now())
  where updated_at is null;

-- 2) Trigger: auto-update updated_at เมื่อมีการแก้ไข
create or replace function public.touch_suppliers_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before insert or update on public.suppliers
  for each row execute function public.touch_suppliers_updated_at();

-- 3) ตารางบันทึก log การอัปโหลด
create table if not exists public.supplier_upload_log (
  id bigserial primary key,
  file_name text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  total_rows integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0
);

create index if not exists idx_supplier_upload_log_uploaded_at
  on public.supplier_upload_log (uploaded_at desc);

-- 4) RLS — อ่านได้ทุกคนที่ login, เขียนได้เฉพาะ admin/qc_admin
alter table public.supplier_upload_log enable row level security;

drop policy if exists "sup_upload_log_read" on public.supplier_upload_log;
create policy "sup_upload_log_read" on public.supplier_upload_log
  for select using (auth.role() = 'authenticated');

drop policy if exists "sup_upload_log_admin_write" on public.supplier_upload_log;
create policy "sup_upload_log_admin_write" on public.supplier_upload_log
  for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));
