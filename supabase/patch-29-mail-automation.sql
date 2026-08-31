-- Patch 29: QC Mail Automation — schema + recipient directory
--
-- Ports the Google Apps Script "QC MAIL AUTOMATION FLOW V8" onto appQC.
-- This patch is data and schema only; the sending API and the Admin screen
-- come after it.
--
-- Section 1 folds in patch-22, which was never applied. That is urgent on its
-- own: SuccessModal.tsx:226 sends `pcm`/`pur` in the qc_orders INSERT, the
-- columns do not exist, so PostgREST rejects the whole row and the operator
-- sees "บันทึก Order ไม่สำเร็จ". No QC order has been saved since 2026-05-26,
-- which is when the PCM/PUR fields shipped. Running this patch unblocks that.

begin;

-- ---------------------------------------------------------------------------
-- 1. patch-22, folded in. Two columns, idempotent.
-- ---------------------------------------------------------------------------
alter table public.qc_orders
  add column if not exists pcm text,
  add column if not exists pur text;

comment on column public.qc_orders.pcm is
  'ผู้รับผิดชอบ PCM (Product Category Management) — เลือกจากรายชื่อ + custom';
comment on column public.qc_orders.pur is
  'ผู้รับผิดชอบ PUR (Purchasing) — เลือกจากรายชื่อ + custom';

-- ---------------------------------------------------------------------------
-- 2. Nickname extraction.
--
-- The two systems spell people differently, so a full-name join finds nobody:
--
--   qc_orders.scm            อิทธิ อยู่วารีรักษ์ (ทอย)
--   qc_orders.sales          สิริสุดา (กระต่าย) ชัญถาวร     <- nickname in the middle
--   Mail_Config.Name         อิทธิ_อยู่วารีรักษ์_ทอย
--
-- The nickname is the one part written identically everywhere, so that is what
-- we match on. Parenthesised form wins when present; otherwise take the last
-- underscore-separated part. Trimmed, because a few source rows have a stray
-- leading space ("ภัทราภรณ์_นามะวงค์_ เอิญ").
-- ---------------------------------------------------------------------------
create or replace function public.nickname_of(full_name text)
returns text language sql immutable as $$
  select nullif(
    btrim(
      case
        when full_name ~ '\(' then regexp_replace(full_name, '^[^(]*\(([^)]*)\).*$', '\1')
        else regexp_replace(full_name, '^.*_', '')
      end
    ),
    ''
  );
$$;

comment on function public.nickname_of(text) is
  'ดึงชื่อเล่นจากชื่อเต็ม รองรับทั้ง "ชื่อ นามสกุล (เล่น)" และ "ชื่อ_นามสกุล_เล่น"';

-- ---------------------------------------------------------------------------
-- 3. Recipient directory — a port of the Mail_Config sheet.
--
-- Two ways a person ends up on an email, and they are independent:
--
--   by_assignment  they are named on that specific order (its PCM / PUR / SCM /
--                  Sales). Matched on nickname. Most staff are this and nothing
--                  else — they hear about their own orders only.
--
--   on_every /     they receive by standing rule regardless of who is named.
--   on_accept /    Managers and executives are these.
--   on_accept_lot /
--   on_reject /
--   on_ict
--
-- Kept as plain booleans rather than a rules engine so the Admin screen is a
-- grid of checkboxes the admin can reason about, which is what was asked for:
-- nothing about who gets mail is hardcoded in the API.
-- ---------------------------------------------------------------------------
create table if not exists public.mail_recipients (
  id             bigserial primary key,
  mail_id        text unique,                       -- m001.. from the sheet; null for new rows
  name           text not null,
  nickname       text generated always as (public.nickname_of(name)) stored,
  role           text not null,                     -- scm | scm_manager | pur | pcm | pcm_manager | sales | executive | system
  email          text not null unique,
  active         boolean not null default true,     -- master switch; false = never mailed

  by_assignment  boolean not null default false,    -- ได้รับเมื่อถูกระบุเป็นผู้รับผิดชอบในใบนั้น
  on_every       boolean not null default false,    -- ได้รับทุกฉบับ ไม่ว่าสถานะใด
  on_accept      boolean not null default false,
  on_accept_lot  boolean not null default false,
  on_reject      boolean not null default false,
  on_ict         boolean not null default false,

  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists mail_recipients_active_idx
  on public.mail_recipients (active) where active;
create index if not exists mail_recipients_nickname_idx
  on public.mail_recipients (nickname);

alter table public.mail_recipients enable row level security;

drop policy if exists "mail_recipients_read"  on public.mail_recipients;
drop policy if exists "mail_recipients_write" on public.mail_recipients;

create policy "mail_recipients_read" on public.mail_recipients for select
  using (auth.role() = 'authenticated');
create policy "mail_recipients_write" on public.mail_recipients for all
  using (public.current_role_level() = 'admin')
  with check (public.current_role_level() = 'admin');

create or replace function public.touch_mail_recipients()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_mail_recipients_updated_at on public.mail_recipients;
create trigger trg_mail_recipients_updated_at
before update on public.mail_recipients
for each row execute function public.touch_mail_recipients();

-- ---------------------------------------------------------------------------
-- 4. Seed from Mail_Config (32 rows) plus the two addresses named in the
--    routing rules but absent from the sheet.
--
-- The sheet arrived TIS-620 encoded; decoded to UTF-8 in mail_config_decoded.csv.
--
-- One deliberate departure from the sheet: คุณเอก (m030) and คุณจุ๋ม (m031) are
-- seeded active, though the sheet has them FALSE. The stated routing rules say
-- คุณเอก receives every mail and คุณจุ๋ม receives every Reject, so a FALSE flag
-- there contradicts the rule and would silently drop them. คุณอู๋ (m032) appears
-- in no rule and stays inactive. Change any of it from the Admin screen.
-- ---------------------------------------------------------------------------
insert into public.mail_recipients
  (mail_id, name, role, email, active,
   by_assignment, on_every, on_accept, on_accept_lot, on_reject, on_ict, note)
values
  -- SCM — assigned per brand via brand_responsibilities
  ('m001','อิทธิ_อยู่วารีรักษ์_ทอย',            'scm',        'scm02@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  ('m002','นลินธารา_นีรนัน_ต้นน้ำ',             'scm',        'scm03@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  ('m004','พัฒนพล_สุขแถม_เอ็กซ์',               'scm',        'scm05@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  -- SCM Manager — พี่นัสรีน: ทุกสถานะ ยกเว้นฉบับ "บันทึกเฉย ๆ"
  ('m003','นัสรีน_กาขาว_นัส',                   'scm_manager','scm04@cometsintertrade.com', true,  true,false,true, true, true, true,  'พี่นัสรีน'),
  -- PUR
  ('m005','น้ำเพชร_รอบคอบ_โปเต้',               'pur',        'pur01@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  ('m006','กาญจนา_ถาวงษ์กลาง_นก',               'pur',        'pur03@cometsintertrade.com', false, true,false,false,false,false,false, null),
  ('m007','วัชราภรณ์_รักษ์วงษ์_มด',             'pur',        'pur04@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  ('m008','สุพัตรา_มีสุข_โบว์',                 'pur',        'pur06@cometsintertrade.com', false, true,false,false,false,false,false, null),
  -- PCM Manager — เฉพาะ Reject
  ('m009','เดือนเพ็ญ_ขวัญมงคลทอง_พลอย',         'pcm_manager','pcm04@cometsintertrade.com', true,  true,false,false,false,true, false, null),
  -- PCM
  ('m010','พัณณ์ภัสร์_บัตรพันธนะ_เมย์',         'pcm',        'pcm02@cometsintertrade.com', false, true,false,false,false,false,false, null),
  ('m011','ปาลิตา_รุ่งเรืองจาตุรันต์_กลาส',     'pcm',        'pcm08@cometsintertrade.com', false, true,false,false,false,false,false, null),
  ('m012','ธัญชนก_รักษาศิริ_น้ำผึ้ง',           'pcm',        'pcm09@cometsintertrade.com', false, true,false,false,false,false,false, null),
  ('m013','ธนภรณ์_ถิ่นสะถ้อน_ปุยฝ้าย',          'pcm',        'pcm16@cometsintertrade.com', false, true,false,false,false,false,false, null),
  ('m014','วัชราภรณ์_สุดใจ_นุ่น',               'pcm',        'pcm03@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  ('m015','อัจฉราภรณ์_สถาปนศิริ_ไนน์',          'pcm',        'pcm07@cometsintertrade.com', false, true,false,false,false,false,false, null),
  ('m016','ยศวดี_รัตนกุล_ตีตี้',                'pcm',        'pcm05@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  ('m017','สุปราณี_อินทร์ชัย_มิ้นท์',           'pcm',        'pcm11@cometsintertrade.com', true,  true,false,false,false,false,false, null),
  ('m018','เพียงรวี_ทองสุก_เพียง',              'pcm',        'pcm14@cometsintertrade.com', false, true,false,false,false,false,false, null),
  ('m019','จิตตราภรณ์_ถาวรยิ่ง_ส้มจีน',         'pcm',        'pcm13@cometsintertrade.com', false, true,false,false,false,false,false, null),
  -- Sales — assigned per brand via brand_responsibilities
  ('m020','สิริสุดา_ชัญถาวร_กระต่าย',           'sales',      'cs05@ictcos.com',            true,  true,false,false,false,false,false, null),
  ('m021','รุ่งนภา_หม่องคำ_ออย',                'sales',      'sales08@ictcos.com',         true,  true,false,false,false,false,false, null),
  ('m022','ขวัญข้าว_สุริยะลังกา_สตางค์',        'sales',      'sales07@ictcos.com',         true,  true,false,false,false,false,false, null),
  ('m023','บุษบา_มาาเยอะ_บุษ',                  'sales',      'cs07@ictcos.com',            true,  true,false,false,false,false,false, null),
  ('m024','พลอยไพลิน_หอมเนียม_พลอย',            'sales',      'sales02@ictcos.com',         true,  true,false,false,false,false,false, null),
  ('m025','ภัทราภรณ์_นามะวงค์_เอิญ',            'sales',      'cs12@ictcos.com',            false, true,false,false,false,false,false, null),
  ('m026','เบญจมาภรณ์_รัตนพันธุ์ศรี_หมิว',      'sales',      'sales10@ictcos.com',         false, true,false,false,false,false,false, null),
  ('m027','ทิชา_ตุ่นภักดี_เฟรช',                'sales',      'cs08@ictcos.com',            false, true,false,false,false,false,false, null),
  ('m028','ปรียานุช_สง่าพล_ซี',                 'sales',      'sales03@ictcos.com',         false, true,false,false,false,false,false, null),
  ('m029','ชญนินทร์_สารถ้อย_เอื้อ',             'sales',      'sales05@ictcos.com',         false, true,false,false,false,false,false, null),
  -- Executive
  ('m030','ธนวัฒ_พิบูลย์สวัสดิ์_คุณเอก',        'executive',  'tanawat.secretary99@gmail.com', true, false,true, false,false,false,false, 'คุณเอก — รับทุกฉบับ (ชีทเดิมตั้ง FALSE ไว้ ขัดกับกติกา จึงเปิดให้)'),
  ('m031','ศลิษา_พิบูลย์สวัสดิ์_คุณจุ๋ม',       'executive',  'salisa.p@cometsintertrade.com', true, false,false,false,false,true, false, 'คุณจุ๋ม — เฉพาะ Reject (ชีทเดิมตั้ง FALSE ไว้ ขัดกับกติกา จึงเปิดให้)'),
  ('m032','วรพล_พิบูลย์สวัสดิ์_คุณอู๋',         'executive',  'vorapol.p@cometsintertrade.com', false,false,false,false,false,false,false, 'ไม่อยู่ในกติกาที่ระบุมา — ปิดไว้'),
  -- ไม่มีในชีท แต่กติกาบอกว่ารับทุกครั้งที่บันทึก
  (null,  'Sales Admin 01',                     'system',     'sls01@cometsintertrade.com', true,  false,true, false,false,false,false, 'เพิ่มตามกติกา — ไม่มีในชีท Mail_Config'),
  (null,  'Sales Admin 03',                     'system',     'sls03@cometsintertrade.com', true,  false,true, false,false,false,false, 'เพิ่มตามกติกา — ไม่มีในชีท Mail_Config')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Per-order mail state.
--
-- mail_last_snapshot is the SHA-256 of the fields that matter, exactly the idea
-- in buildImportantSnapshot_: unchanged hash means nothing worth mailing about
-- changed, so the sweep stays quiet instead of re-sending on every tick.
--
-- The GAS version stored a Gmail Thread Id and called thread.replyAll(). appQC
-- sends over plain SMTP, which has no thread object — so we keep the first
-- message's Message-ID and thread later mails with In-Reply-To / References.
-- Same result in the recipient's inbox, different mechanism, hence the
-- different column name.
-- ---------------------------------------------------------------------------
alter table public.qc_orders
  add column if not exists mail_message_id      text,
  add column if not exists mail_last_sent_at    timestamptz,
  add column if not exists mail_send_count      integer not null default 0,
  add column if not exists mail_last_action     text,      -- NEW | REPLY | SKIPPED
  add column if not exists mail_last_snapshot   text,
  add column if not exists mail_change_summary  text;

-- ---------------------------------------------------------------------------
-- 6. Defect cross-check, written back so QC sees it in the app.
--
-- validateDefectLines_ compares qc_orders.defect_qty against the sum of the
-- child rows and reports ครบ / ไม่ครบ / เกิน / ขาดอาการ / ขาดจำนวน. The GAS
-- version writes that verdict onto the order; same here.
-- ---------------------------------------------------------------------------
alter table public.qc_orders
  add column if not exists qc_defect_check_status text,
  add column if not exists qc_defect_alert        text,
  add column if not exists qc_defect_alert_at     timestamptz;

commit;

-- ---------------------------------------------------------------------------
-- Verify 1 — 34 recipients, and nickname extraction worked on every row.
-- ---------------------------------------------------------------------------
select role,
       count(*)                                        as ทั้งหมด,
       count(*) filter (where active)                  as เปิดใช้,
       count(*) filter (where nickname is null)        as ไม่มีชื่อเล่น
  from public.mail_recipients
 group by role
 order by role;

-- ---------------------------------------------------------------------------
-- Verify 2 — the real test: do the names already on orders find a recipient?
-- Any row with matched = 0 is a person who will silently miss their mail.
-- ---------------------------------------------------------------------------
select o.field, o.person, public.nickname_of(o.person) as ชื่อเล่น,
       (select count(*) from public.mail_recipients r
         where r.nickname = public.nickname_of(o.person)) as matched
  from (
    select 'scm'   as field, scm   as person from public.qc_orders where scm   is not null
    union select 'sales', sales from public.qc_orders where sales is not null
    union select 'pcm',   pcm   from public.qc_orders where pcm   is not null
    union select 'pur',   pur   from public.qc_orders where pur   is not null
  ) o
 order by matched, o.field;

-- ---------------------------------------------------------------------------
-- Verify 3 — same check across the whole brand table, not just orders placed
-- so far. This is the list to fix before switching the mail on.
-- ---------------------------------------------------------------------------
select b.person, public.nickname_of(b.person) as ชื่อเล่น, count(*) as จำนวนแบรนด์
  from (
    select scm as person from public.brand_responsibilities where scm is not null
    union all
    select sales from public.brand_responsibilities where sales is not null
  ) b
 where not exists (
   select 1 from public.mail_recipients r
    where r.nickname = public.nickname_of(b.person)
 )
 group by b.person
 order by จำนวนแบรนด์ desc;
