-- Patch 34: attach the migrated defect photos  (generated)
--
-- Written by scripts/migrate-defect-images.py after the files were uploaded to
-- Storage. Joined on legacy_detail_id, the workbook's own row id, because
-- (order_no, symptom, quantity) is not unique within an order.
--
-- Only lines that currently have no images are touched, so re-running this
-- cannot overwrite a photo somebody has added in the app since.
--
-- photos: 20 · lines: 20

begin;

update public.qc_order_details d set images = v.imgs
  from (values
    ('06e72ff6', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010019/845aeff9.Image.183336.jpg']::text[]),
    ('0f581c35', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010019/ff0a309d.Image.183351.jpg']::text[]),
    ('163ea9cc', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010005/8c5ce54c.Image.182243.png']::text[]),
    ('1c69b6f7', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010008/42f9b762.Image.182837.jpg']::text[]),
    ('1d88f3b7', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010010/d00ab6c9.Image.182848.jpg']::text[]),
    ('1f0295a2', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010019/695729f6.Image.183357.jpg']::text[]),
    ('22d0327e', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010034/f093f383.Image.161742.jpg']::text[]),
    ('265ce3b7', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010002/4460f138.Image.175615.png']::text[]),
    ('2f7aabf7', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010002/9302dac6.Image.181246.png']::text[]),
    ('314c691b', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010010/c743d39e.Image.182854.jpg']::text[]),
    ('338fc7e5', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010020/e444e1cd.Image.183713.png']::text[]),
    ('345fd1c5', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010003/08f45b2e.Image.182231.png']::text[]),
    ('5a24fc80', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010002/7bc0b30a.Image.180336.png']::text[]),
    ('5d457df5', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010005/1f432e98.Image.182238.png']::text[]),
    ('62dd2789', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010009/75cf301d.Image.182843.jpg']::text[]),
    ('8aae69cb', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010002/02c22afa.Image.180330.png']::text[]),
    ('9bbd700a', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010019/346c6c64.Image.183342.jpg']::text[]),
    ('a754f995', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010017/db29dd41.Image.183329.jpg']::text[]),
    ('e94a5564', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010032/3af709c1.Image.161451.jpg']::text[]),
    ('ffb06ce1', array['https://ruknpxlnvxgpraxkktfi.supabase.co/storage/v1/object/public/defect-images/legacy/QC26010005/8cd17078.Image.182249.png']::text[])
  ) as v(legacy_detail_id, imgs)
 where d.legacy_detail_id = v.legacy_detail_id
   and (d.images is null or cardinality(d.images) = 0);

commit;

-- Verify — how many imported lines ended up with photos.
select count(*) filter (where cardinality(coalesce(images, '{}')) > 0) as มีรูป,
       count(*)                                                       as รายการที่ import,
       sum(cardinality(coalesce(images, '{}')))                        as รูปทั้งหมด
  from public.qc_order_details
 where legacy_detail_id is not null;
