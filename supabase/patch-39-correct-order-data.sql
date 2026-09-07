-- Patch 39: correct the brand and the supplier code on the orders themselves
--
-- patch-37 gave the mail a Brand Standard lookup, which fixes what the reader
-- sees. It does not fix what the database holds, and two things read the stored
-- value directly:
--
--   * the Dashboard groups and filters by qc_orders.brand, so GENTLE COLOR (3)
--     and GENTLE COLORS (49) count as two different brands
--   * the entry form fills SCM and Sales by matching the brand against
--     brand_responsibilities, so an order typed "2P" finds nothing where the
--     responsibilities table says "2P ORIGINAL". That is why QC26080216 was
--     saved with scm empty and the mail had to fall back to a stand-in.
--
-- Checked against the live database on 2026-09-07 before writing this:
--
--   * 418 orders across 10 brands would be renamed, and every one of the ten
--     targets ALREADY has a row in brand_responsibilities under its standard
--     name — so this patch does not touch that table at all. Which matters:
--     normalising it too would collide on 20 brands, and in three of those
--     (HELEN BEAUTY, GINO MCCRAY, JOJI SECRET YOUNG) the two rows name
--     genuinely different people. Those are a human decision, not a migration.
--
--   * The 18 ambiguous brands are left alone. ICT (130 orders) resolves six
--     ways depending on the owning company and CM (55) two, and nothing on the
--     order records which company that is.
--
--   * 876 orders can have sup_code filled by matching supplier_name against
--     suppliers. sup_code is a foreign key — patch-33 hit 23503 on it — so the
--     value comes from the suppliers row itself and cannot dangle. One supplier
--     name maps to two codes (GUANGZHOU SHIFEI → 5V and F); it is excluded
--     rather than guessed, and it turns out to cover 0 of the affected orders.
--
-- What QC typed is not thrown away. brand_as_typed keeps the original, because
-- an order is a record of an inspection on a day and that record should stay
-- readable even after the name is tidied.

-- The join key is built the way brand_key was built: strip the leading marker
-- set, then trim. btrim() alone would also take a trailing '.', which would
-- only ever miss a match rather than make a wrong one — but a lookup that
-- quietly disagrees with the app's own normalizeBrand() is not worth shipping.

begin;

-- ---------------------------------------------------------------------------
-- 0. Bring the standard-named responsibility row up to date first.
--
-- Renaming an order's brand changes which brand_responsibilities row the entry
-- form finds, and for one brand that would have been a downgrade: the row
-- called SIS2SIS still says scm = 'Non Active' from 12 May, while the row
-- called S2S names นัสรีน and was updated 31 Aug. Renaming 20 orders from S2S
-- to SIS2SIS without this step would have handed those orders a placeholder
-- instead of a person.
--
-- Checked all ten renamed brands; SIS2SIS is the only downgrade. The rule
-- applied is narrow on purpose — fill only where the standard row holds
-- nothing or the 'Non Active' placeholder, and only from a row that is newer.
-- A standard row that names a real person is never overwritten, because two
-- rows naming two different people is a question for whoever owns the brand
-- list, not something a migration should decide.
--
-- JOJI is the one such case: JOJI SECRET YOUNG says sales = ยานุมาส (12 May)
-- and JOJI says พลอยไพลิน (2 Jun). This patch keeps ยานุมาส and leaves the
-- disagreement visible. It affects exactly one order — fix it in Admin if
-- ยานุมาส is wrong.
-- ---------------------------------------------------------------------------
update public.brand_responsibilities std
   set sales = coalesce(nullif(btrim(std.sales), ''), fresh.sales),
       scm   = coalesce(nullif(btrim(std.scm),   ''), fresh.scm),
       updated_at = now()
  from public.brand_responsibilities fresh
  join public.brand_standards bs
    on bs.brand_key = upper(btrim(ltrim(fresh.brand, '*". ''')))
 where not bs.ambiguous
   and std.brand = bs.brand_standard          -- the row a renamed order will find
   and fresh.brand <> bs.brand_standard       -- the differently-spelled sibling
   and fresh.updated_at > std.updated_at
   and (
        -- only where the standard row has nothing usable to lose
        (coalesce(nullif(btrim(std.sales), ''), 'Non Active') = 'Non Active'
           and coalesce(btrim(fresh.sales), '') not in ('', 'Non Active'))
     or (coalesce(nullif(btrim(std.scm), ''), 'Non Active') = 'Non Active'
           and coalesce(btrim(fresh.scm), '') not in ('', 'Non Active'))
   );

-- Re-blank the placeholder so it does not masquerade as an owner.
update public.brand_responsibilities
   set sales = case when btrim(coalesce(sales, '')) = 'Non Active' then null else sales end,
       scm   = case when btrim(coalesce(scm,   '')) = 'Non Active' then null else scm   end
 where btrim(coalesce(sales, '')) = 'Non Active'
    or btrim(coalesce(scm,   '')) = 'Non Active';

-- ---------------------------------------------------------------------------
-- 1. Keep the original before touching it.
-- ---------------------------------------------------------------------------
alter table public.qc_orders add column if not exists brand_as_typed text;

comment on column public.qc_orders.brand_as_typed is
  'The brand exactly as QC entered it, kept when patch-39 rewrote brand to the Brand Standard. Null means brand was already standard.';

update public.qc_orders o
   set brand_as_typed = o.brand
  from public.brand_standards s
 where s.brand_key = upper(btrim(ltrim(o.brand, '*". ''')))
   and not s.ambiguous
   and o.brand is distinct from s.brand_standard
   and o.brand_as_typed is null;          -- never overwrite an earlier capture

-- ---------------------------------------------------------------------------
-- 2. Rename to the standard. Ambiguous brands and brands absent from the
--    workbook are deliberately skipped — they keep exactly what was typed.
-- ---------------------------------------------------------------------------
update public.qc_orders o
   set brand = s.brand_standard
  from public.brand_standards s
 where s.brand_key = upper(btrim(ltrim(o.brand, '*". ''')))
   and not s.ambiguous
   and o.brand is distinct from s.brand_standard;

-- ---------------------------------------------------------------------------
-- 3. Fill sup_code where the recorded company name identifies exactly one
--    supplier. Orders that already carry a code are left as they are.
-- ---------------------------------------------------------------------------
update public.qc_orders o
   set sup_code = m.sup_code
  from (
        select upper(btrim(supplier_name)) as name_key, min(sup_code) as sup_code
          from public.suppliers
         where supplier_name is not null and btrim(supplier_name) <> ''
         group by 1
        having count(distinct sup_code) = 1     -- skip the one name with two codes
       ) m
 where o.sup_code is null
   and upper(btrim(o.supplier_name)) = m.name_key;

commit;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

-- 1. Expect 418 renamed, and 0 still holding a non-standard name.
select count(*) filter (where brand_as_typed is not null)          as "แก้ชื่อแบรนด์แล้ว",
       count(*) filter (where sup_code is not null)                as "มีรหัสผู้ผลิต",
       count(*) filter (where sup_code is null)                    as "ยังไม่มีรหัส",
       count(*)                                                    as "ใบทั้งหมด"
  from public.qc_orders;

-- 2. Nothing non-standard should be left except the ambiguous and the unknown.
select o.brand as "แบรนด์", s.brand_standard as "ควรเป็น", s.ambiguous as "กำกวม",
       count(*) as "ใบ"
  from public.qc_orders o
  join public.brand_standards s
    on s.brand_key = upper(btrim(ltrim(o.brand, '*". ''')))
 where o.brand is distinct from s.brand_standard
 group by 1, 2, 3
 order by 4 desc;

-- 3. The renames, with what QC originally typed.
select brand_as_typed as "QC พิมพ์", brand as "เก็บเป็น", count(*) as "ใบ"
  from public.qc_orders
 where brand_as_typed is not null
 group by 1, 2
 order by 3 desc;

-- 4. The brands a renamed order will now resolve to. No 'Non Active' should
--    remain, and every one of the ten should name at least one person.
select bs.brand_standard as "แบรนด์", r.sales as "Sales", r.scm as "SCM"
  from public.brand_standards bs
  join public.brand_responsibilities r on r.brand = bs.brand_standard
 where bs.brand_standard in ('2P ORIGINAL','BEWILD','ROYAL BEAUTY','BABY GLAM',
                             'SIS2SIS','FLEEN BEAUTY','MERREZ''CA',
                             'GENTLE COLORS','IT GIRL','JOJI SECRET YOUNG')
 order by 1;
