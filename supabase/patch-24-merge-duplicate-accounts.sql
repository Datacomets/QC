-- Patch 24: Merge duplicate accounts down to one per person
--
-- Background: before the employee-code login scheme, Supabase Auth required a
-- unique *email* per user, so several people ended up with two accounts — one
-- on a personal gmail address and one on the company domain.
--
-- Reference counts measured on 2026-08-25 against live data:
--
--   person              account       domain   refs  last sign-in  decision
--   -------------------------------------------------------------------------
--   ธิดารัตน์ จันทร์เดช     qc03          comets    25   2026-06-02    RETIRE
--                       10503         comets     0   2026-06-05    KEEP
--   รุ่งรัตน์ ธงวิชัย       aewrungrut    gmail      3   2026-05-22    RETIRE
--                       11045         comets     0   2026-06-05    KEEP
--   อาภัทธสา แก้วสุวรรณ    arpattasa     gmail     10   2026-05-22    RETIRE
--                       11379         comets     0   never         KEEP
--   สายธาร เขียวจันทร์     saitan.kj27   gmail     18   2026-05-26    RETIRE
--                       11262         comets     0   never         KEEP
--
-- The keeper is always the company-domain account. That is deliberate: the
-- login screen appends "@cometsintertrade.com" when someone types a bare code
-- (Login.tsx:22), so only company-domain accounts can be reached by employee
-- code. Keeping a gmail account would leave that person unable to log in the
-- new way, which defeats the whole point of the change.
--
-- qc_03 (ไอยรินทร์ แก้วฝ่าย) is a DIFFERENT person from qc03 (ธิดารัตน์) and is
-- deliberately left untouched here. It is not a duplicate — it just still
-- carries a provisional code. It gets renamed qc_03 -> 11411 afterwards through
-- the Admin page, which is a GoTrue email change rather than a merge, so no
-- rows move and the uuid stays the same.
--
-- AFTER RUNNING THIS: 11379 and 11262 have never been signed into, so those two
-- people do not know their password. Set one in Admin -> Users -> แก้ไข ->
-- Generate and hand it over. 10503 and 11045 are already in daily use, so
-- ธิดารัตน์ and รุ่งรัตน์ need no action at all.

begin;

-- ---------------------------------------------------------------------------
-- Step 1: repoint every attribution column onto the keeper account. 56 rows.
--
-- qc_orders.created_by and ncr_reports.created_by feed the RLS policies in
-- schema.sql:248-261, patch-03:54-68 and patch-06:70-71, which gate on
-- auth.uid() = created_by. Repointing to the same human keeps RLS correct — the
-- person still sees their own orders, just under the surviving account.
--
-- qc_orders.edit_approved_by (patch-04) is absent — patch-04 was never applied
-- to this project; see the header of patch-18.
--
-- The text columns materials.updated_by, suppliers.updated_by and
-- *_upload_log.uploaded_by store display names, not uuids, and the
-- qc_orders.*_approved_by_name columns from patch-11 are point-in-time
-- snapshots. Same human either way, so none of them need rewriting.
-- ---------------------------------------------------------------------------

-- ธิดารัตน์: qc03 -> 10503   (expect 2 + 11 + 3 + 1 + 7 + 1 = 25 rows)
update public.qc_orders set created_by            = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where created_by            = '57d69042-e096-4740-8688-454f1adc9e40';
update public.qc_orders set approved_by           = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where approved_by           = '57d69042-e096-4740-8688-454f1adc9e40';
update public.qc_orders set accept_approved_by    = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where accept_approved_by    = '57d69042-e096-4740-8688-454f1adc9e40';
update public.qc_orders set acceptlot_approved_by = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where acceptlot_approved_by = '57d69042-e096-4740-8688-454f1adc9e40';
update public.qc_orders set reject_approved_by    = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where reject_approved_by    = '57d69042-e096-4740-8688-454f1adc9e40';
update public.qc_order_edit_log     set edited_by    = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where edited_by    = '57d69042-e096-4740-8688-454f1adc9e40';
update public.ncr_reports           set created_by   = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where created_by   = '57d69042-e096-4740-8688-454f1adc9e40';
update public.notification_send_log set triggered_by = '574bd92b-e2aa-4d64-a2af-365ad64f7124' where triggered_by = '57d69042-e096-4740-8688-454f1adc9e40';

-- รุ่งรัตน์: aewrungrut -> 11045   (expect 1 + 1 + 1 = 3 rows)
update public.qc_orders set created_by            = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where created_by            = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';
update public.qc_orders set approved_by           = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where approved_by           = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';
update public.qc_orders set accept_approved_by    = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where accept_approved_by    = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';
update public.qc_orders set acceptlot_approved_by = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where acceptlot_approved_by = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';
update public.qc_orders set reject_approved_by    = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where reject_approved_by    = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';
update public.qc_order_edit_log     set edited_by    = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where edited_by    = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';
update public.ncr_reports           set created_by   = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where created_by   = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';
update public.notification_send_log set triggered_by = '2e3495e0-c10e-4530-9b9d-85941cbc0f53' where triggered_by = '7ca85baf-07c2-46e0-b66f-efce3a7a00f9';

-- อาภัทธสา: arpattasa -> 11379   (expect 7 + 3 = 10 rows)
update public.qc_orders set created_by            = '029b8e32-b279-47e5-8836-5dfdde953437' where created_by            = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';
update public.qc_orders set approved_by           = '029b8e32-b279-47e5-8836-5dfdde953437' where approved_by           = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';
update public.qc_orders set accept_approved_by    = '029b8e32-b279-47e5-8836-5dfdde953437' where accept_approved_by    = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';
update public.qc_orders set acceptlot_approved_by = '029b8e32-b279-47e5-8836-5dfdde953437' where acceptlot_approved_by = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';
update public.qc_orders set reject_approved_by    = '029b8e32-b279-47e5-8836-5dfdde953437' where reject_approved_by    = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';
update public.qc_order_edit_log     set edited_by    = '029b8e32-b279-47e5-8836-5dfdde953437' where edited_by    = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';
update public.ncr_reports           set created_by   = '029b8e32-b279-47e5-8836-5dfdde953437' where created_by   = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';
update public.notification_send_log set triggered_by = '029b8e32-b279-47e5-8836-5dfdde953437' where triggered_by = 'ff9d88c6-074b-41bd-8425-67f750bc1a54';

-- สายธาร: saitan.kj27 -> 11262   (expect 6 + 5 + 5 + 2 = 18 rows)
update public.qc_orders set created_by            = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where created_by            = 'af354b0c-47ef-4865-8a49-8146356f4500';
update public.qc_orders set approved_by           = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where approved_by           = 'af354b0c-47ef-4865-8a49-8146356f4500';
update public.qc_orders set accept_approved_by    = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where accept_approved_by    = 'af354b0c-47ef-4865-8a49-8146356f4500';
update public.qc_orders set acceptlot_approved_by = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where acceptlot_approved_by = 'af354b0c-47ef-4865-8a49-8146356f4500';
update public.qc_orders set reject_approved_by    = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where reject_approved_by    = 'af354b0c-47ef-4865-8a49-8146356f4500';
update public.qc_order_edit_log     set edited_by    = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where edited_by    = 'af354b0c-47ef-4865-8a49-8146356f4500';
update public.ncr_reports           set created_by   = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where created_by   = 'af354b0c-47ef-4865-8a49-8146356f4500';
update public.notification_send_log set triggered_by = 'ea192fd1-b132-4936-a17b-d4299f9a36bc' where triggered_by = 'af354b0c-47ef-4865-8a49-8146356f4500';

-- ---------------------------------------------------------------------------
-- Step 2: delete the four retired accounts.
--
-- No name fix-up is needed: the retired profiles hold the bare name
-- ("ธิดารัตน์ จันทร์เดช") while all four keepers already hold the nicknamed form
-- ("ธิดารัตน์ จันทร์เดช (เบลล์)"), which is what Dashboard.tsx:341 and
-- Materials.tsx:241 display. Deleting the retired row loses nothing.
--
-- profiles.id references auth.users(id) ON DELETE CASCADE (schema.sql:26), so
-- the profile row goes with the auth user. The attribution columns above have
-- NO cascade, so if step 1 missed even one row this delete raises a foreign-key
-- violation and the whole transaction rolls back. That is the safety net — QC
-- history can never be silently orphaned by this patch.
-- ---------------------------------------------------------------------------
delete from auth.users where id in (
  '57d69042-e096-4740-8688-454f1adc9e40',  -- qc03         ธิดารัตน์  -> 10503
  '7ca85baf-07c2-46e0-b66f-efce3a7a00f9',  -- aewrungrut   รุ่งรัตน์   -> 11045
  'ff9d88c6-074b-41bd-8425-67f750bc1a54',  -- arpattasa    อาภัทธสา -> 11379
  'af354b0c-47ef-4865-8a49-8146356f4500'   -- saitan.kj27  สายธาร   -> 11262
);

-- Cosmetic: profiles.email for 11181 stores a capital-C domain while
-- auth.users holds the correct lowercase one. Login already works (GoTrue
-- lower-cases on lookup), but keep the mirror table honest.
update public.profiles set email = lower(email) where email <> lower(email);

commit;

-- ---------------------------------------------------------------------------
-- Verify: expect 12 accounts, one per person, every employee code unique, and
-- exactly one gmail address left (tapakornsonpakdi — no duplicate, never signed
-- in, so it is out of scope here. Note that account can only log in by typing
-- the full gmail address, not by employee code.)
-- ---------------------------------------------------------------------------
select split_part(u.email, '@', 1) as emp_code,
       u.email,
       p.full_name,
       p.role,
       (select count(*) from public.qc_orders o where o.created_by  = p.id) as orders_created,
       (select count(*) from public.ncr_reports n where n.created_by = p.id) as ncrs_created
  from public.profiles p
  join auth.users u on u.id = p.id
 order by emp_code;
