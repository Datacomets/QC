-- Patch 21: เพิ่มหน่วยนับ (unit) ในแต่ละรายการของเสีย
--
-- ช่อง "หน่วย" ต่อแถว defect — เช่น ชิ้น / อัน / แท่ง / ตลับ หรือพิมพ์เอง
-- เก็บเป็น free-text เพื่อให้ผู้ใช้เพิ่มหน่วยใหม่ได้เอง

alter table public.qc_order_details
  add column if not exists unit text;

comment on column public.qc_order_details.unit is
  'หน่วยนับของเสีย (ชิ้น/อัน/แท่ง/ตลับ หรือกำหนดเอง) — free-text';
