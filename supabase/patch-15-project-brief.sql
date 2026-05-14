-- Patch 15: เพิ่ม column Project Brief No. ใน qc_orders
-- ใช้บันทึกหมายเลขใบ Project Brief (ถ้ามี) ที่อ้างถึงใน QC Order

alter table public.qc_orders
  add column if not exists project_brief_no text;

comment on column public.qc_orders.project_brief_no is
  'หมายเลขใบ Project Brief ที่อ้างถึง (optional, free-text)';
