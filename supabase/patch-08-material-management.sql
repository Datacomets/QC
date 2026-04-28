-- Patch 08: Material Management — เพิ่มฟิลด์ updated_at/by + product_category_id + ตาราง upload log
-- หมายเหตุ: คอลัมน์ sap_code = "Material ID" (ใช้ชื่อเดิมเพื่อให้ FK qc_orders.sap_code ใช้งานได้ต่อ)

-- 1) เพิ่มคอลัมน์ที่ขาดในตาราง materials
alter table public.materials add column if not exists product_category_id text;
alter table public.materials add column if not exists updated_at timestamptz;
alter table public.materials add column if not exists updated_by text;

-- backfill updated_at สำหรับแถวเก่า (ใช้ created_at)
update public.materials set updated_at = coalesce(updated_at, created_at);

-- 2) Trigger: auto-update updated_at เมื่อมีการแก้ไข
create or replace function public.touch_materials_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_materials_updated_at on public.materials;
create trigger trg_materials_updated_at
before insert or update on public.materials
for each row execute function public.touch_materials_updated_at();

-- 3) ตารางบันทึก log การอัปโหลด
create table if not exists public.material_upload_log (
  id bigserial primary key,
  file_name text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  total_rows integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0
);

create index if not exists idx_material_upload_log_uploaded_at
  on public.material_upload_log (uploaded_at desc);

-- 4) RLS — อ่านได้ทุกคนที่ login, เขียนได้เฉพาะ admin/qc_admin
alter table public.material_upload_log enable row level security;

drop policy if exists "mat_upload_log_read" on public.material_upload_log;
create policy "mat_upload_log_read" on public.material_upload_log
  for select using (auth.role() = 'authenticated');

drop policy if exists "mat_upload_log_admin_write" on public.material_upload_log;
create policy "mat_upload_log_admin_write" on public.material_upload_log
  for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));
