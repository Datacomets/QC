-- Patch 17: เพิ่ม column "เอกสารต้นฉบับอยู่ที่" ใน qc_orders
-- เก็บข้อมูลว่าเอกสารฉบับจริง (paper) อยู่กับใคร — dropdown ใน UI:
--   คุณอู๋ / WH / PD / SCM / Custom (พิมพ์เอง)

alter table public.qc_orders
  add column if not exists original_doc_with text;

comment on column public.qc_orders.original_doc_with is
  'ผู้ถือเอกสารต้นฉบับ (paper). Dropdown: คุณอู๋ / WH / PD / SCM / Custom — optional';
