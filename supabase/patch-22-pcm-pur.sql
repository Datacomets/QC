-- Patch 22: เพิ่มฟิลด์ PCM และ PUR ในตาราง qc_orders
--
-- PCM = ฝ่ายจัดซื้อ-Product Category Management (Operator เลือกตอนบันทึก QC)
-- PUR = ฝ่ายจัดซื้อ-Purchasing (Operator เลือกตอนบันทึก QC)
-- รายชื่อใช้ตามไฟล์ "รายชื่อฝ่ายจัดซื้อ01.06.26.xlsx"

alter table public.qc_orders
  add column if not exists pcm text,
  add column if not exists pur text;

comment on column public.qc_orders.pcm is
  'ผู้รับผิดชอบ PCM (Product Category Management) — เลือกจากรายชื่อ + custom';

comment on column public.qc_orders.pur is
  'ผู้รับผิดชอบ PUR (Purchasing) — เลือกจากรายชื่อ + custom';
