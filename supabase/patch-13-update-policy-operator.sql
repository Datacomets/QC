-- Patch 13: Operator อนุมัติ order ของใครก็ได้
-- เดิม operator แก้ได้เฉพาะ order ที่ตัวเองสร้าง (created_by = auth.uid)
-- ในระบบใหม่ operator คือคน "ยืนยันรับ" ให้กับ QC Admin → ต้องอนุมัติ order ใดก็ได้
-- viewer ยังคงเขียนไม่ได้ (ไม่อยู่ในรายการ)

drop policy if exists "qc_orders_update_own"           on public.qc_orders;
drop policy if exists "qc_orders_update_authenticated" on public.qc_orders;

create policy "qc_orders_update_authenticated" on public.qc_orders for update
  using (public.current_role_level() in ('admin','qc_admin','operator'))
  with check (public.current_role_level() in ('admin','qc_admin','operator'));
