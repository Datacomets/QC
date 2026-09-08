-- Patch 41: the Mail_Config edits QC marked up on 2026-09-08
--
-- Four changes, from the marked-up Mail_Config sheet plus QC's answers on the
-- two rows the screenshot could not be read from confidently.
--
--   m020  สิริสุดา_ชัญถาวร_กระต่าย   cs05@ictcos.com -> sales14@ictcos.com
--   m023  บุษบา_มาเยอะ_บุษ           cs07@ictcos.com -> sales14@ictcos.com
--   m032  วรพล_พิบูลย์สวัสดิ์_คุณอู๋   set up like คุณจุ๋ม, left switched off
--   m031  ศลิษา_พิบูลย์สวัสดิ์_คุณจุ๋ม  already correct — asserted, not changed
--
-- Both Sales rows move to the SAME address. That was queried and confirmed: it
-- is one shared team mailbox, not a typo. mail_recipients.email is declared
-- unique, so section 1 has to widen that before section 2 can run.
--
-- Widened to unique (email, name) rather than dropped outright: a shared
-- mailbox is legitimate, two rows for the same person is still a mistake worth
-- refusing. Nothing in the app keys on email — Admin updates and deletes by id
-- — so no caller changes.
--
-- One mail still arrives once at a shared address: resolveRecipients() dedupes
-- on the lower-cased email before adding anyone, so an order naming both
-- สิริสุดา and บุษบา produces a single copy.
--
-- คุณอู๋ and คุณจุ๋ม both get their status flag set while active stays false —
-- "ส่งตามที่เซ็ตแต่ปัจจุบันปิดไว้ก่อน". The switch is the thing to flip when
-- they should start receiving; the routing is already right underneath it, so
-- nobody has to remember which statuses were intended.

begin;

-- ---------------------------------------------------------------------------
-- 1. Let a shared mailbox exist.
-- ---------------------------------------------------------------------------
do $$
declare c text;
begin
  -- Whatever the unique-on-email-alone constraint is called in this database.
  select con.conname into c
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
   where rel.relname = 'mail_recipients'
     and con.contype = 'u'
     and con.conkey = array[(select attnum from pg_attribute
                              where attrelid = rel.oid and attname = 'email')];
  if c is not null then
    execute format('alter table public.mail_recipients drop constraint %I', c);
  end if;
end $$;

alter table public.mail_recipients
  drop constraint if exists mail_recipients_email_name_key;
alter table public.mail_recipients
  add constraint mail_recipients_email_name_key unique (email, name);

-- ---------------------------------------------------------------------------
-- 2. The two Sales addresses.
-- ---------------------------------------------------------------------------
update public.mail_recipients
   set email = 'sales14@ictcos.com', updated_at = now()
 where mail_id = 'm020' and email <> 'sales14@ictcos.com';

update public.mail_recipients
   set email = 'sales14@ictcos.com', updated_at = now()
 where mail_id = 'm023' and email <> 'sales14@ictcos.com';

-- ---------------------------------------------------------------------------
-- 3. คุณอู๋ — same routing as คุณจุ๋ม, switch left off.
-- ---------------------------------------------------------------------------
update public.mail_recipients tgt
   set on_every      = src.on_every,
       on_accept     = src.on_accept,
       on_accept_lot = src.on_accept_lot,
       on_reject     = src.on_reject,
       on_ict        = src.on_ict,
       by_assignment = src.by_assignment,
       active        = false,               -- ปิดไว้ก่อน
       updated_at    = now()
  from public.mail_recipients src
 where tgt.email = 'vorapol.p@cometsintertrade.com'
   and src.email = 'salisa.p@cometsintertrade.com';

commit;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

-- 1. Both Sales rows on the shared mailbox, still two distinct people.
select mail_id as "แถว", name as "ชื่อ", email as "อีเมล", active as "ใช้งาน"
  from public.mail_recipients
 where email = 'sales14@ictcos.com'
 order by mail_id;

-- 2. คุณจุ๋ม and คุณอู๋ — flags identical, both switched off.
select name as "ชื่อ", email as "อีเมล", active as "ใช้งาน",
       on_every as "ทุกฉบับ", on_accept as "Accept", on_accept_lot as "AcceptLot",
       on_reject as "Reject", on_ict as "ICT"
  from public.mail_recipients
 where email in ('salisa.p@cometsintertrade.com', 'vorapol.p@cometsintertrade.com')
 order by email;

-- 3. Nothing stale: cs05 and cs07 should be gone.
select count(*) as "cs05/cs07 ที่ยังเหลือ (ควรเป็น 0)"
  from public.mail_recipients
 where email in ('cs05@ictcos.com', 'cs07@ictcos.com');

-- 4. And the roster still holds one row per person.
select count(*) as "ผู้รับทั้งหมด", count(distinct email) as "อีเมลไม่ซ้ำ",
       count(*) filter (where active) as "เปิดใช้งาน"
  from public.mail_recipients;
