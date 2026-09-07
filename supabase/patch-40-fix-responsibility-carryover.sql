-- Patch 40: finish the carry-over that patch-39 section 0 got wrong
--
-- patch-39 was meant to lift a responsible person onto the standard-named row
-- before renaming orders onto it. It set:
--
--     scm = coalesce(nullif(btrim(std.scm), ''), fresh.scm)
--
-- The guard above it correctly treated 'Non Active' as "nobody", but this
-- expression did not: nullif() only turns the EMPTY string into null, so a
-- literal 'Non Active' survived coalesce() and fresh.scm was never reached.
-- The next statement then blanked 'Non Active' to null — so the row ended up
-- empty, which is the exact downgrade the section was written to prevent.
--
-- Checked against the live database after patch-39 ran: one field is affected.
--
--     SIS2SIS   scm   empty   should be นัสรีน_กาขาว_นัส   (from the S2S row)   20 orders
--
-- Every other pair either had a real name on the standard row already (kept, as
-- patch-39 documented) or had nothing to copy from.
--
-- The rule here is narrower than patch-39's and needs no timestamp comparison:
-- the target field is empty, so there is nothing to lose, and the donor must be
-- the ONLY distinct value among the differently-spelled siblings. Two siblings
-- naming two different people is left alone — that is a decision for whoever
-- owns the brand list. patch-39's timestamp rule cannot be reused because
-- patch-39 stamped updated_at = now() on the rows it touched, which now makes
-- every sibling look older.

begin;

with resolved as (
  -- every responsibility row, tagged with the standard name it resolves to
  select r.brand,
         r.sales,
         r.scm,
         coalesce(
           case when s.ambiguous then null else s.brand_standard end,
           r.brand
         ) as std_name
    from public.brand_responsibilities r
    left join public.brand_standards s
      on s.brand_key = upper(btrim(ltrim(r.brand, '*". ''')))
),
donor as (
  select std_name,
         -- only when the siblings agree on exactly one name
         case when count(distinct nullif(btrim(sales), '')) = 1
              then max(nullif(btrim(sales), '')) end as sales,
         case when count(distinct nullif(btrim(scm), '')) = 1
              then max(nullif(btrim(scm), '')) end as scm
    from resolved
   where brand <> std_name                -- the differently-spelled siblings
   group by std_name
)
update public.brand_responsibilities t
   set sales = coalesce(nullif(btrim(t.sales), ''), d.sales),
       scm   = coalesce(nullif(btrim(t.scm),   ''), d.scm),
       updated_at = now()
  from donor d
 where t.brand = d.std_name
   and (
        (coalesce(btrim(t.sales), '') = '' and d.sales is not null)
     or (coalesce(btrim(t.scm),   '') = '' and d.scm   is not null)
   );

commit;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

-- 1. SIS2SIS should now name a person in both columns.
select brand as "แบรนด์", sales as "Sales", scm as "SCM"
  from public.brand_responsibilities
 where brand in ('SIS2SIS', 'S2S')
 order by brand;

-- 2. No standard-named row an order can land on should still be empty while a
--    differently-spelled sibling names someone. Expect zero rows.
with resolved as (
  select r.brand, r.sales, r.scm,
         coalesce(case when s.ambiguous then null else s.brand_standard end,
                  r.brand) as std_name
    from public.brand_responsibilities r
    left join public.brand_standards s
      on s.brand_key = upper(btrim(ltrim(r.brand, '*". ''')))
)
select t.brand as "แบรนด์ที่ยังว่าง",
       max(nullif(btrim(o.sales), '')) as "Sales ที่แถวอื่นมี",
       max(nullif(btrim(o.scm),   '')) as "SCM ที่แถวอื่นมี"
  from public.brand_responsibilities t
  join resolved o on o.std_name = t.brand and o.brand <> t.brand
 where (coalesce(btrim(t.sales), '') = '' and nullif(btrim(o.sales), '') is not null)
    or (coalesce(btrim(t.scm),   '') = '' and nullif(btrim(o.scm),   '') is not null)
 group by t.brand
 order by 1;

-- 3. And the 20 SIS2SIS orders now resolve to a real SCM.
select count(*) as "ใบ SIS2SIS", max(r.scm) as "SCM ที่จะได้"
  from public.qc_orders q
  join public.brand_responsibilities r on r.brand = q.brand
 where q.brand = 'SIS2SIS';
