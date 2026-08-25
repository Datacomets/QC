-- Patch 25: Normalise full_name to ชื่อ_นามสกุล_ชื่อเล่น
--
-- Old format mixed two styles:
--   'ธิดารัตน์ จันทร์เดช (เบลล์)'   <- spaces + parenthesised nickname
--   'ไอยรินทร์_แก้วฝ่าย_ไอซ์'      <- underscores, no parentheses
--
-- The underscore form is now the standard everywhere. Run this AFTER
-- patch-24-merge-duplicate-accounts.sql: the retired duplicate profiles carried
-- the bare two-part name and are gone by then, so only keepers are touched.
-- (Keying on id rather than email — profiles.email for 11181 has a capital-C
-- domain until patch-24 lower-cases it.)

begin;

-- ---------------------------------------------------------------------------
-- Step 1: profiles.full_name — this is what the app reads and displays
-- (auth.tsx selects it; Dashboard.tsx:341 and Materials.tsx:241 fall back to
-- email only when it is null).
-- ---------------------------------------------------------------------------
update public.profiles set full_name = 'ธิดารัตน์_จันทร์เดช_เบลล์'  where id = '574bd92b-e2aa-4d64-a2af-365ad64f7124'; -- 10503, was 'ธิดารัตน์ จันทร์เดช (เบลล์)'
update public.profiles set full_name = 'รุ่งรัตน์_ธงวิชัย_อิ๋ว'      where id = '2e3495e0-c10e-4530-9b9d-85941cbc0f53'; -- 11045, was 'รุ่งรัตน์ ธงวิชัย (อิ๋ว)'
update public.profiles set full_name = 'วรสุนาถ_คุณพรม_แทม'      where id = 'dba664eb-c7a6-42fe-8a01-f7bd70da52f2'; -- 11181, was 'วรสุนาถ คุณพรม (แทม)'
update public.profiles set full_name = 'สายธาร_เขียวจันทร์_ปอ'    where id = 'ea192fd1-b132-4936-a17b-d4299f9a36bc'; -- 11262, was 'สายธาร เขียวจันทร์ (ปอ)'
update public.profiles set full_name = 'อาภัทธสา_แก้วสุวรรณ_บูม'  where id = '029b8e32-b279-47e5-8836-5dfdde953437'; -- 11379, was 'อาภัทธสา แก้วสุวรรณ (บูม)'

-- Already in the new format, listed for completeness — these are no-ops:
--   qc_03            132fd6fc-4a7d-4f0c-bc72-c62eaa50bbf3  ไอยรินทร์_แก้วฝ่าย_ไอซ์
--   tapakornsonpakdi 7877df7f-d76d-4c3b-996f-94149dd0128c  ฐาปกรณ์_สอนภักดี_แบงค์

-- ---------------------------------------------------------------------------
-- Step 2: keep auth.users.raw_user_meta_data in sync.
--
-- handle_new_user() copies user_metadata.full_name into profiles on INSERT
-- only, so a stale value here is invisible today — but web/api/admin-users.ts
-- writes both on every edit, and leaving them disagreeing invites a future
-- surprise if a profile row is ever recreated from metadata.
-- ---------------------------------------------------------------------------
update auth.users u
   set raw_user_meta_data =
         coalesce(u.raw_user_meta_data, '{}'::jsonb)
         || jsonb_build_object('full_name', p.full_name)
  from public.profiles p
 where p.id = u.id
   and p.full_name is not null
   and coalesce(u.raw_user_meta_data->>'full_name', '') <> p.full_name;

-- ---------------------------------------------------------------------------
-- Step 3: the denormalised name snapshots.
--
-- These columns store a *copy* of the name taken at the moment of the action,
-- not a foreign key, so nothing above touches them. They are what the printed
-- reports and Excel exports actually show, which is why they get reformatted
-- too — otherwise QC paperwork would keep showing the old style forever.
-- Matching on the exact old string keeps this idempotent and re-runnable.
-- ---------------------------------------------------------------------------

-- qc_orders approver snapshots (patch-11). The stored values are the bare
-- two-part names, taken before the nicknames were added to profiles.
update public.qc_orders set approved_by_name           = 'ธิดารัตน์_จันทร์เดช_เบลล์' where approved_by_name           in ('ธิดารัตน์ จันทร์เดช', 'ธิดารัตน์ จันทร์เดช (เบลล์)');
update public.qc_orders set accept_approved_by_name    = 'ธิดารัตน์_จันทร์เดช_เบลล์' where accept_approved_by_name    in ('ธิดารัตน์ จันทร์เดช', 'ธิดารัตน์ จันทร์เดช (เบลล์)');
update public.qc_orders set acceptlot_approved_by_name = 'ธิดารัตน์_จันทร์เดช_เบลล์' where acceptlot_approved_by_name in ('ธิดารัตน์ จันทร์เดช', 'ธิดารัตน์ จันทร์เดช (เบลล์)');
update public.qc_orders set reject_approved_by_name    = 'ธิดารัตน์_จันทร์เดช_เบลล์' where reject_approved_by_name    in ('ธิดารัตน์ จันทร์เดช', 'ธิดารัตน์ จันทร์เดช (เบลล์)');

-- materials.updated_by (patch-08) — ~19,357 rows, all the same uploader.
update public.materials set updated_by = 'วรสุนาถ_คุณพรม_แทม'
 where updated_by in ('วรสุนาถ คุณพรม', 'วรสุนาถ คุณพรม (แทม)');

-- suppliers.updated_by (patch-23) — 166 rows, plus the upload-log row.
update public.suppliers set updated_by = 'ธิดารัตน์_จันทร์เดช_เบลล์'
 where updated_by in ('ธิดารัตน์ จันทร์เดช', 'ธิดารัตน์ จันทร์เดช (เบลล์)');
update public.supplier_upload_log set uploaded_by = 'ธิดารัตน์_จันทร์เดช_เบลล์'
 where uploaded_by in ('ธิดารัตน์ จันทร์เดช', 'ธิดารัตน์ จันทร์เดช (เบลล์)');

-- material_upload_log (patch-08) is declared in the repo but PostgREST reports
-- it missing on this project, so patch-08's log table was likely never applied.
-- Guarded so a bare reference cannot roll back the whole transaction.
do $$
begin
  if to_regclass('public.material_upload_log') is not null then
    update public.material_upload_log set uploaded_by = 'วรสุนาถ_คุณพรม_แทม'
     where uploaded_by in ('วรสุนาถ คุณพรม', 'วรสุนาถ คุณพรม (แทม)');
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verify: every full_name should now be ชื่อ_นามสกุล_ชื่อเล่น. The rows that
-- legitimately do NOT match are sls03 ('Admin') and the four pcm viewers
-- ('พี่เมย์', 'พี่พลอย', 'พี่กิ๊ฟ', 'พี่แม๊ะ') — nickname-only accounts with no
-- full name on record.
-- ---------------------------------------------------------------------------
select split_part(u.email, '@', 1) as emp_code,
       p.full_name,
       p.role,
       (array_length(string_to_array(p.full_name, '_'), 1) = 3) as new_format
  from public.profiles p
  join auth.users u on u.id = p.id
 order by new_format desc, emp_code;
