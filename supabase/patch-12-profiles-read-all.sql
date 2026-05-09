-- Patch 12: ให้ทุก user ที่ login อ่านชื่อทุกคนใน profiles ได้
-- เหตุผล: dropdown "เลือกผู้อนุมัติ" ต้องโชว์ชื่อ QC Admin/Admin/Operator ให้ทุกคนเลือกได้
-- (เดิม operator มองเห็นแค่ profile ของตัวเอง)
-- สิทธิ์เขียน (insert/update/delete) ยังคงเฉพาะ admin เท่านั้น

drop policy if exists "profiles_self_read" on public.profiles;
drop policy if exists "profiles_read_all"  on public.profiles;

create policy "profiles_read_all" on public.profiles for select
  using (auth.role() = 'authenticated');
