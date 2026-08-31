-- Patch 31: stand-in recipient when an order has no owner for a role
--
-- 87 of the 254 brands carry the literal string 'Non Active' where the SCM
-- should be, and another 22 carry 'Team Present' or 'Sales PK' where the Sales
-- owner should be. Those are placeholders, not people, so a Reject on any of
-- those brands resolves to no SCM at all and that half of the notification
-- simply never goes out.
--
-- Decision: send to the SCM Manager (พี่นัสรีน) instead. Recorded as a column
-- rather than a constant in the API, for the same reason the routing switches
-- are: who covers an unowned brand is a staffing question, and staffing
-- changes should not need a deploy.

begin;

alter table public.mail_recipients
  add column if not exists fallback_for text[] not null default '{}';

comment on column public.mail_recipients.fallback_for is
  'รับแทนเมื่อใบนั้นไม่มีผู้รับผิดชอบในบทบาทนี้ เช่น {scm} = รับแทนเมื่อแบรนด์ไม่มี SCM';

create index if not exists mail_recipients_fallback_idx
  on public.mail_recipients using gin (fallback_for);

-- พี่นัสรีน (SCM Manager) รับแทนเมื่อแบรนด์ไม่มี SCM
update public.mail_recipients
   set fallback_for = array['scm']
 where mail_id = 'm003';

commit;

-- ---------------------------------------------------------------------------
-- Verify 1 — who stands in for whom.
-- ---------------------------------------------------------------------------
select name, role, email, active, fallback_for
  from public.mail_recipients
 where cardinality(fallback_for) > 0
 order by name;

-- ---------------------------------------------------------------------------
-- Verify 2 — how much of the brand table this actually covers. Every brand
-- should now resolve to somebody for SCM: either a real owner or the stand-in.
-- ---------------------------------------------------------------------------
select case
         when public.find_recipient_id(scm) is not null then 'มี SCM ของตัวเอง'
         when exists (select 1 from public.mail_recipients
                       where active and 'scm' = any(fallback_for))
           then 'ไม่มี SCM — ใช้ตัวแทน'
         else 'ไม่มีใครรับเลย'
       end                as สถานะ,
       count(*)           as จำนวนแบรนด์
  from public.brand_responsibilities
 group by 1
 order by จำนวนแบรนด์ desc;
