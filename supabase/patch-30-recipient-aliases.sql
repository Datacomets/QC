-- Patch 30: alias matching for mail recipients
--
-- patch-29's nickname_of() matched 238 of the 254 brand owners. The 16 misses
-- fall into three kinds, and only one of them is a bug:
--
--   placeholders   'Non Active' (87 brands), 'Team Present' (17), 'Sales PK' (5)
--                  Not people. Nothing to match. Handled by the fallback rule
--                  in the sending API, not here.
--
--   missing        11 real people who appear in brand_responsibilities but were
--                  never in the Mail_Config sheet, so there is no address for
--                  them at all. Waiting on their emails; add them from the
--                  Admin screen.
--
--   unmatchable    2 people who ARE in the directory but whose name is written
--                  in a shape no regex can reduce to the right nickname:
--
--                    brand_responsibilities        mail_recipients
--                    ธนวัฒ พิบูลย์สวัสดิ์          ธนวัฒ_พิบูลย์สวัสดิ์_คุณเอก
--                      -> no nickname written at all
--                    อัจฉราภรณ์ ไนน์ สถาปนศิริ      อัจฉราภรณ์_สถาปนศิริ_ไนน์
--                      -> nickname sits in the middle with no parentheses
--
-- Widening the regex to catch these would start guessing which middle word is a
-- nickname, and would mis-fire on ordinary three-part names. An explicit alias
-- list is honest about it: a human states that these two spellings mean this
-- person, and the admin can add more as new spellings turn up.

begin;

-- ---------------------------------------------------------------------------
-- 1. Alias list per recipient.
-- ---------------------------------------------------------------------------
alter table public.mail_recipients
  add column if not exists aliases text[] not null default '{}';

comment on column public.mail_recipients.aliases is
  'ชื่อสะกดแบบอื่นที่ให้ถือว่าเป็นคนเดียวกัน — ใช้ตอนจับคู่ชื่อผู้รับผิดชอบจากใบ QC';

create index if not exists mail_recipients_aliases_idx
  on public.mail_recipients using gin (aliases);

-- ---------------------------------------------------------------------------
-- 2. One place that answers "who is this name?".
--
-- Order matters: an exact alias is a human's explicit statement and outranks
-- the nickname heuristic. Whitespace is collapsed because the source data is
-- inconsistent about double spaces ("ธนวัฒ  พิบูลย์สวัสดิ์").
-- ---------------------------------------------------------------------------
create or replace function public.find_recipient_id(person text)
returns bigint language sql stable as $$
  with needle as (
    select btrim(regexp_replace(coalesce(person, ''), '\s+', ' ', 'g')) as raw
  )
  select r.id
    from public.mail_recipients r, needle n
   where n.raw <> ''
     and (
       exists (
         select 1 from unnest(r.aliases) a
          where btrim(regexp_replace(a, '\s+', ' ', 'g')) = n.raw
       )
       or (r.nickname is not null and r.nickname = public.nickname_of(n.raw))
     )
   order by (
     exists (
       select 1 from unnest(r.aliases) a
        where btrim(regexp_replace(a, '\s+', ' ', 'g')) = n.raw
     )
   ) desc
   limit 1;
$$;

comment on function public.find_recipient_id(text) is
  'หา mail_recipients.id จากชื่อผู้รับผิดชอบในใบ QC — เช็ค aliases ก่อน แล้วค่อยชื่อเล่น';

-- ---------------------------------------------------------------------------
-- 3. The two known aliases.
--
-- Note a discrepancy worth knowing about rather than silently smoothing over:
-- อัจฉราภรณ์ is role `pcm` in the directory but is the *sales* owner of 3
-- brands. The routing uses whichever field the order carries, so she is mailed
-- as that brand's Sales contact. Her directory row is also active = false, so
-- she still receives nothing until an admin switches her on.
-- ---------------------------------------------------------------------------
update public.mail_recipients
   set aliases = array['ธนวัฒ พิบูลย์สวัสดิ์', 'ธนวัฒน์ พิบูลย์สวัสดิ์']
 where mail_id = 'm030';

update public.mail_recipients
   set aliases = array['อัจฉราภรณ์ ไนน์ สถาปนศิริ']
 where mail_id = 'm015';

commit;

-- ---------------------------------------------------------------------------
-- Verify — the same unmatched report as patch-29, now via find_recipient_id.
-- Expect 14 rows: the 3 placeholders and the 11 people with no address yet.
-- ธนวัฒ and อัจฉราภรณ์ should be gone.
-- ---------------------------------------------------------------------------
select b.person,
       public.nickname_of(b.person) as ชื่อเล่นที่ดึงได้,
       count(*)                     as จำนวนแบรนด์,
       case
         when b.person in ('Non Active', 'Team Present', 'Sales PK')
           then 'ค่าว่าง ไม่ใช่คน'
         else 'คนจริง — ยังไม่มีอีเมล'
       end                          as ประเภท
  from (
    select scm as person from public.brand_responsibilities where scm is not null
    union all
    select sales from public.brand_responsibilities where sales is not null
  ) b
 where public.find_recipient_id(b.person) is null
 group by b.person
 order by ประเภท, จำนวนแบรนด์ desc;
