-- Patch 05: ตาราง Brand → Sales / SCM responsibilities (จาก Sales Respon sheet)
-- ใช้ดึงข้อมูลแบบ live แทนการเก็บ snapshot บน materials

create table if not exists public.brand_responsibilities (
  brand text primary key,
  sales text,
  scm text,
  updated_at timestamptz not null default now()
);

alter table public.brand_responsibilities enable row level security;

create policy "brand_resp_read" on public.brand_responsibilities for select using (auth.role() = 'authenticated');
create policy "brand_resp_admin_write" on public.brand_responsibilities for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));
