#!/usr/bin/env python3
"""
Move the legacy defect photos from Google Drive into Supabase Storage.

Run this AFTER patch-32 and patch-33, once the orders and their defect lines are
in the database.

    python scripts/migrate-defect-images.py --src "D:/path/to/Order Details_Imagess"

Why a local folder rather than talking to Drive: there are 3,806 files, about
460 MB. Pulling them one at a time through an API is thousands of round trips
that fail halfway and start over. Downloading the folder once as a ZIP from the
Drive UI is faster, needs no Google credentials, and is easy to retry.

    https://drive.google.com/drive/folders/1GnOJc75FxwGvLKCvZrIXeAXdybitqurG
    -> right-click the folder -> Download  (Drive zips it)
    -> extract, then point --src at the extracted folder

Safe to stop and re-run. Progress is written to scripts/.image-migration.json
after every file, and anything already uploaded is skipped.
"""

import argparse
import io
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "supabase", "import", "detail_images.csv")
PROGRESS = os.path.join(ROOT, "scripts", ".image-migration.json")
BUCKET = "defect-images"
# Kept apart from the app's own uploads, which live under <order_id>/, so a
# migrated photo is always recognisable and the whole batch can be removed again.
PREFIX = "legacy"


def env(path, *names):
    """Read a key from a .env file without needing python-dotenv."""
    if not os.path.exists(path):
        return None
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() in names:
                return v.strip().strip('"').strip("'")
    return None


def load_progress():
    if os.path.exists(PROGRESS):
        with io.open(PROGRESS, encoding="utf-8") as f:
            return json.load(f)
    return {"uploaded": {}, "failed": {}}


def save_progress(p):
    tmp = PROGRESS + ".tmp"
    with io.open(tmp, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False)
    os.replace(tmp, PROGRESS)


def request(method, url, key, data=None, ctype=None, retries=3):
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("apikey", key)
        req.add_header("Authorization", "Bearer " + key)
        if ctype:
            req.add_header("Content-Type", ctype)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            # 409 = the object is already there, which a re-run should treat as done
            if e.code == 409:
                return 409, body.encode()
            if attempt == retries - 1 or e.code < 500:
                return e.code, body.encode()
        except Exception as e:                                   # noqa: BLE001
            if attempt == retries - 1:
                return 0, str(e).encode()
        time.sleep(1.5 * (attempt + 1))
    return 0, b"unreachable"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="โฟลเดอร์ที่แตก ZIP จาก Google Drive")
    ap.add_argument("--limit", type=int, default=0, help="ทดสอบเฉพาะ N ไฟล์แรก")
    ap.add_argument("--dry-run", action="store_true", help="ตรวจไฟล์ครบไหม ไม่อัปโหลด")
    args = ap.parse_args()

    url = env(os.path.join(ROOT, ".env"), "SUPABASE_URL", "VITE_SUPABASE_URL")
    key = env(os.path.join(ROOT, ".env"), "SUPABASE_SECRET_KEY")
    if not url or not key:
        sys.exit("อ่าน SUPABASE_URL / SUPABASE_SECRET_KEY จาก .env ไม่ได้")
    url = url.rstrip("/")

    if not os.path.isdir(args.src):
        sys.exit("ไม่พบโฟลเดอร์: " + args.src)

    # Drive sometimes nests the extracted folder one level down, and filenames
    # can differ in case, so index everything on disk once by lowercase name.
    on_disk = {}
    for base, _dirs, files in os.walk(args.src):
        for fn in files:
            on_disk.setdefault(fn.lower(), os.path.join(base, fn))
    print("ไฟล์ในโฟลเดอร์ต้นทาง: {}".format(len(on_disk)))

    rows = []
    with io.open(MANIFEST, encoding="utf-8") as f:
        import csv
        for r in csv.DictReader(f):
            rows.append(r)
    print("รูปที่ต้องย้ายตาม manifest: {}".format(len(rows)))

    missing = [r for r in rows if r["filename"].lower() not in on_disk]
    if missing:
        print("\n!! หาไฟล์ไม่เจอ {} รูป — ตัวอย่าง 10 อันแรก:".format(len(missing)))
        for r in missing[:10]:
            print("   {}  ({})".format(r["filename"], r["order_no"]))
        print("   ถ้าเยอะแปลว่าโฟลเดอร์ที่ชี้มาไม่ใช่ตัวเต็ม หรือ ZIP แตกไม่ครบ")
    if args.dry_run:
        print("\n--dry-run: จบแล้ว ไม่ได้อัปโหลดอะไร")
        return

    prog = load_progress()
    todo = [r for r in rows
            if r["filename"].lower() in on_disk
            and r["filename"] not in prog["uploaded"]]
    if args.limit:
        todo = todo[:args.limit]
    print("จะอัปโหลด {} รูป (ข้ามที่ทำแล้ว {})\n".format(len(todo), len(prog["uploaded"])))

    ok = fail = 0
    for i, r in enumerate(todo, 1):
        src = on_disk[r["filename"].lower()]
        # Group by order so Storage stays browsable, and keep the original name
        # so a photo can be traced back to the Drive folder.
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", r["filename"])
        obj = "{}/{}/{}".format(PREFIX, r["order_no"], safe)
        ctype = mimetypes.guess_type(safe)[0] or "application/octet-stream"

        with io.open(src, "rb") as f:
            body = f.read()

        status, resp = request(
            "POST",
            "{}/storage/v1/object/{}/{}".format(url, BUCKET, urllib.parse.quote(obj)),
            key, data=body, ctype=ctype,
        )
        if status in (200, 409):
            prog["uploaded"][r["filename"]] = obj
            prog["failed"].pop(r["filename"], None)
            ok += 1
        else:
            prog["failed"][r["filename"]] = "{} {}".format(status, resp.decode("utf-8", "replace")[:120])
            fail += 1

        if i % 25 == 0 or i == len(todo):
            save_progress(prog)
            print("   {}/{}  สำเร็จ {}  ล้มเหลว {}".format(i, len(todo), ok, fail))

    save_progress(prog)
    print("\nอัปโหลดเสร็จ: สำเร็จ {} · ล้มเหลว {}".format(ok, fail))
    if prog["failed"]:
        print("ที่ล้มเหลวยังอยู่ใน .image-migration.json — รันสคริปต์ซ้ำได้ มันจะลองใหม่เฉพาะที่ค้าง")

    # ---- SQL to attach them, rather than writing to the tables directly ----
    # Emitted as a file so the DB change is reviewable and runs in one
    # transaction, the same as every other change in supabase/.
    base_url = "{}/storage/v1/object/public/{}/".format(url, BUCKET)
    out = os.path.join(ROOT, "supabase", "patch-34-attach-defect-images.sql")
    done = [r for r in rows if r["filename"] in prog["uploaded"]]
    by_detail = {}
    for r in sorted(done, key=lambda x: (x["legacy_detail_id"], int(x["seq"]))):
        by_detail.setdefault(r["legacy_detail_id"], []).append(prog["uploaded"][r["filename"]])

    with io.open(out, "w", encoding="utf-8") as f:
        f.write("""-- Patch 34: attach the migrated defect photos  (generated)
--
-- Written by scripts/migrate-defect-images.py after the files were uploaded to
-- Storage. Joined on legacy_detail_id, the workbook's own row id, because
-- (order_no, symptom, quantity) is not unique within an order.
--
-- Only lines that currently have no images are touched, so re-running this
-- cannot overwrite a photo somebody has added in the app since.
--
-- photos: {n} · lines: {d}

begin;

update public.qc_order_details d set images = v.imgs
  from (values
""".format(n=len(done), d=len(by_detail)))
        rows_sql = []
        for lid, objs in by_detail.items():
            arr = ", ".join("'" + base_url + o.replace("'", "''") + "'" for o in objs)
            rows_sql.append("    ('{}', array[{}]::text[])".format(lid.replace("'", "''"), arr))
        f.write(",\n".join(rows_sql))
        f.write("""
  ) as v(legacy_detail_id, imgs)
 where d.legacy_detail_id = v.legacy_detail_id
   and (d.images is null or cardinality(d.images) = 0);

commit;

-- Verify — how many imported lines ended up with photos.
select count(*) filter (where cardinality(coalesce(images, '{}')) > 0) as "มีรูป",
       count(*)                                                       as "รายการที่ import",
       sum(cardinality(coalesce(images, '{}')))                        as "รูปทั้งหมด"
  from public.qc_order_details
 where legacy_detail_id is not null;
""")
    print("\nสร้าง SQL ให้แล้ว: supabase/patch-34-attach-defect-images.sql")
    print("เอาไปรันใน Supabase SQL Editor เพื่อผูกรูปเข้ากับรายการ defect")


if __name__ == "__main__":
    main()
