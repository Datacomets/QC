-- Patch 03: เปลี่ยน user_role จาก enum เป็น text เพื่อให้เพิ่ม role ใหม่ได้
-- RLS policies ใช้การเทียบ string ดังนั้นยังใช้งานได้เหมือนเดิม

-- 1. Drop function that depends on enum type
drop function if exists public.current_role_level() cascade;

-- 2. Alter column type
alter table public.profiles
  alter column role type text using role::text;
alter table public.profiles
  alter column role set default 'operator';

-- 3. Drop enum type (no longer needed)
drop type if exists user_role;

-- 4. Recreate helper function with text return type
create or replace function public.current_role_level()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 5. Recreate all policies that referenced the enum (they were dropped by cascade)
-- Profiles
drop policy if exists "profiles_self_read" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_self_read" on public.profiles for select
  using (auth.uid() = id or public.current_role_level() in ('admin','qc_admin'));
create policy "profiles_admin_all" on public.profiles for all
  using (public.current_role_level() = 'admin')
  with check (public.current_role_level() = 'admin');

-- Suppliers
drop policy if exists "suppliers_admin_write" on public.suppliers;
create policy "suppliers_admin_write" on public.suppliers for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));

-- Materials
drop policy if exists "materials_admin_write" on public.materials;
create policy "materials_admin_write" on public.materials for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));

-- Defects
drop policy if exists "defects_admin_write" on public.defects;
create policy "defects_admin_write" on public.defects for all
  using (public.current_role_level() in ('admin','qc_admin'))
  with check (public.current_role_level() in ('admin','qc_admin'));

-- QC Orders
drop policy if exists "qc_orders_update_own" on public.qc_orders;
drop policy if exists "qc_orders_admin_delete" on public.qc_orders;
create policy "qc_orders_update_own" on public.qc_orders for update
  using (auth.uid() = created_by or public.current_role_level() in ('admin','qc_admin'))
  with check (auth.uid() = created_by or public.current_role_level() in ('admin','qc_admin'));
create policy "qc_orders_admin_delete" on public.qc_orders for delete
  using (public.current_role_level() in ('admin','qc_admin'));

-- QC Details
drop policy if exists "qc_details_write" on public.qc_order_details;
create policy "qc_details_write" on public.qc_order_details for all
  using (
    exists (select 1 from public.qc_orders o where o.id = order_id
            and (o.created_by = auth.uid() or public.current_role_level() in ('admin','qc_admin')))
  )
  with check (
    exists (select 1 from public.qc_orders o where o.id = order_id
            and (o.created_by = auth.uid() or public.current_role_level() in ('admin','qc_admin')))
  );
