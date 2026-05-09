-- Patch 14: เก็บการแยกประเภทจาก SAP Code ลง DB
-- เพิ่มคอลัมน์ + trigger function ที่ parse sap_code อัตโนมัติทุกครั้งที่ insert/update
-- ใช้กับทั้ง qc_orders และ materials

-- ============================================================================
-- 1) Trigger function — parse SAP code และตั้งค่าคอลัมน์ที่เกี่ยวข้อง
-- ============================================================================
create or replace function public.parse_sap_code() returns trigger as $$
declare
  base text;
  rev  text;
  p1 text; p2 text; p3 text; p4 text; p5 text;
  running text;
begin
  if new.sap_code is null or new.sap_code = '' then
    new.sap_base := null;
    new.sap_revision := null;
    new.sap_item_type := null;
    new.sap_item_source := null;
    new.sap_item_category := null;
    new.sap_item_group := null;
    new.sap_sub_item_group := null;
    new.sap_running_no := null;
    return new;
  end if;

  -- Split base from revision (ใช้ "-" เป็นตัวคั่น; ถ้าไม่มี → revision = "0")
  if position('-' in new.sap_code) > 0 then
    base := split_part(new.sap_code, '-', 1);
    rev  := substring(new.sap_code from position('-' in new.sap_code) + 1);
  else
    base := new.sap_code;
    rev  := '0';
  end if;

  new.sap_base     := trim(base);
  new.sap_revision := trim(rev);

  base := trim(base);
  p1 := substring(base from 1 for 1);
  p2 := substring(base from 2 for 1);
  p3 := substring(base from 3 for 1);
  p4 := substring(base from 4 for 1);
  p5 := substring(base from 5 for 1);
  if length(base) >= 6 then
    new.sap_running_no := substring(base from 6);
  else
    new.sap_running_no := null;
  end if;

  -- Position 1 = Item Type
  new.sap_item_type := case p1
    when '1' then 'FG'
    when '2' then 'SG'
    when '3' then 'Bulk'
    when '4' then 'PK'
    when '5' then 'RM'
    when '8' then 'SPARE PART'
    when '9' then 'OPERATION SUPPLY'
    when '0' then 'OTHER'
    else null
  end;

  -- Position 2 = Item Source
  new.sap_item_source := case p2
    when '1' then 'PRODUCTION'
    when '2' then 'TRADING'
    when '3' then 'CUSTOMER SUPPLY'
    when '4' then 'CONSIGNMENT'
    else null
  end;

  -- Position 3 = Item Category
  new.sap_item_category := case p3
    when '1' then 'MAKEUP'
    when '2' then 'FACIAL CARE'
    when '3' then 'HAIR CARE'
    when '4' then 'BODY CARE'
    when '5' then 'FRAGRANCE'
    when '6' then 'BEAUTY ACCESSORY'
    when '7' then 'SOFT COMPONENTS'
    when '0' then 'OTHER'
    else null
  end;

  -- Position 4 = Item Group
  new.sap_item_group := case p4
    when '1' then 'GIFT BOX'
    when '2' then 'CARD'
    when '3' then 'DOME'
    when '4' then 'INNER'
    when '5' then 'CARTON'
    when '6' then 'STICKER'
    when '7' then 'LABEL'
    when '8' then 'WRAP'
    when '9' then 'PACK'
    when '0' then 'OTHER'
    else null
  end;

  -- Position 5 = Sub-Item Group (ดูคู่กับตำแหน่งที่ 4)
  new.sap_sub_item_group := case p4 || p5
    when '11' then 'Paper Gift Box'
    when '12' then 'Insert Gift Box'
    when '13' then 'Tray for Gift Box'
    when '14' then 'PVC Gift Box'
    when '21' then 'Paper Slide Card'
    when '22' then 'Paper Blister Card'
    when '23' then 'Gift Card'
    when '31' then 'Slide Dome'
    when '32' then 'Blister Dome'
    when '41' then 'Paper Inner Box'
    when '42' then 'Insert Inner Box'
    when '43' then 'PVC Inner Box'
    when '51' then 'Carton'
    when '52' then 'Partition'
    when '61' then 'Shade STK'
    when '62' then 'FDA STK'
    when '63' then 'Bottom STK'
    when '64' then 'Common (Plain) STK'
    when '65' then 'Pop up STK'
    when '71' then 'Bottle Label'
    when '72' then 'Inner Label'
    when '73' then 'Leaflet'
    when '74' then 'Tag'
    when '81' then 'Shrink'
    when '82' then 'Foil'
    when '83' then 'Film Pallet'
    when '91' then 'Plastic Bag'
    when '92' then 'OPP Bag'
    when '00' then 'OTHER'
    else null
  end;

  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 2) qc_orders — เพิ่มคอลัมน์
-- ============================================================================
alter table public.qc_orders
  add column if not exists sap_base            text,
  add column if not exists sap_revision        text,
  add column if not exists sap_item_type       text,
  add column if not exists sap_item_source     text,
  add column if not exists sap_item_category   text,
  add column if not exists sap_item_group      text,
  add column if not exists sap_sub_item_group  text,
  add column if not exists sap_running_no      text;

-- Trigger
drop trigger if exists qc_orders_parse_sap on public.qc_orders;
create trigger qc_orders_parse_sap
  before insert or update of sap_code on public.qc_orders
  for each row execute function public.parse_sap_code();

-- Backfill ข้อมูลเก่า (touch sap_code → trigger จะคำนวณคอลัมน์ทั้งหมด)
update public.qc_orders set sap_code = sap_code where sap_code is not null;

-- Index สำหรับ filter ใน Dashboard
create index if not exists qc_orders_sap_base_idx           on public.qc_orders (sap_base);
create index if not exists qc_orders_sap_item_type_idx      on public.qc_orders (sap_item_type);
create index if not exists qc_orders_sap_item_group_idx     on public.qc_orders (sap_item_group);
create index if not exists qc_orders_sap_item_category_idx  on public.qc_orders (sap_item_category);

-- ============================================================================
-- 3) materials — เพิ่มคอลัมน์เดียวกัน
-- ============================================================================
alter table public.materials
  add column if not exists sap_base            text,
  add column if not exists sap_revision        text,
  add column if not exists sap_item_type       text,
  add column if not exists sap_item_source     text,
  add column if not exists sap_item_category   text,
  add column if not exists sap_item_group      text,
  add column if not exists sap_sub_item_group  text,
  add column if not exists sap_running_no      text;

-- Trigger function ใช้ตัวเดียวกัน (parse ตามฟิลด์ sap_code ของ row นั้น)
drop trigger if exists materials_parse_sap on public.materials;
create trigger materials_parse_sap
  before insert or update of sap_code on public.materials
  for each row execute function public.parse_sap_code();

-- Backfill
update public.materials set sap_code = sap_code where sap_code is not null;

-- Index
create index if not exists materials_sap_item_type_idx     on public.materials (sap_item_type);
create index if not exists materials_sap_item_group_idx    on public.materials (sap_item_group);
create index if not exists materials_sap_item_category_idx on public.materials (sap_item_category);
