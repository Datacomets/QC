-- Patch 02: เพิ่มคอลัมน์เก็บรูปภาพในรายการของเสีย (1-3 รูป)
alter table public.qc_order_details
  add column if not exists images text[] default '{}';

-- สร้าง Storage bucket สำหรับรูปของเสีย
insert into storage.buckets (id, name, public)
values ('defect-images', 'defect-images', true)
on conflict (id) do nothing;

-- Policy: authenticated users สามารถ upload ได้
create policy "defect_images_upload" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'defect-images');

-- Policy: ทุกคนดูได้ (public bucket)
create policy "defect_images_read" on storage.objects for select
  to public
  using (bucket_id = 'defect-images');

-- Policy: เจ้าของหรือ admin ลบได้
create policy "defect_images_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'defect-images');
