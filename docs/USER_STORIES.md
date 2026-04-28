# User Stories — QC Inspection Web App

**Version:** 2.0
**Last Updated:** 28 เมษายน 2026
**Companion to:** [PRD.md](PRD.md)

---

## Format

```
US-XX: As a [role], I want [action], so that [benefit]
   Acceptance Criteria:
   - [criterion 1]
   - [criterion 2]
```

**Roles:**
- 👑 `admin` (Admin System)
- 🛡️ `qc_admin` (QC Admin)
- 👷 `operator` (QC Staff)
- 👀 `viewer` (Read-only)

---

## Epic 1 — Authentication & User Management

### US-101: Login เข้าระบบ
**As an** ทุก role, **I want to** Login ด้วย Email + Password ที่ Admin สร้างให้ **so that** ฉันสามารถเข้าใช้งานระบบได้

**Acceptance Criteria:**
- หน้า login มีช่อง Email + Password + ปุ่ม Login (bilingual)
- ระบบไม่มี "Sign Up" — มีแค่ admin สร้างให้
- กรอกผิด → แสดง error message ภาษาไทย/อังกฤษ
- Login สำเร็จ → redirect ไป `/` (History)
- Session ไม่เก็บ — ออกจาก browser แล้วต้อง login ใหม่

### US-102: Logout
**As an** ทุก role, **I want to** กดปุ่ม Logout ที่มุมขวาบน **so that** ฉันออกจากระบบได้ทันที

**Acceptance Criteria:**
- ปุ่ม "ออก / Logout" อยู่บน header เห็นได้ทุกหน้า
- กดแล้ว → clear session → redirect ไป `/login`

### US-103: Admin สร้าง User ใหม่ 👑
**As an** admin, **I want to** สร้าง User ใหม่พร้อมกำหนด Email + Password + Role + Full Name **so that** ทีมใหม่เข้าใช้งานระบบได้

**Acceptance Criteria:**
- ปุ่ม "+ เพิ่มผู้ใช้ / Add User" อยู่ใน Admin → Users (แสดงเฉพาะ admin)
- Modal มีช่อง: Email*, Full Name, Role* (combo), Password* (min 6 chars)
- บันทึก → สร้างใน Supabase Auth + insert ลง `profiles`
- รีเฟรชตาราง user list หลังสร้าง

### US-104: Admin แก้ไขข้อมูล User 👑
**As an** admin, **I want to** แก้ไข Full Name + Role ของ User เดิม **so that** อัปเดตข้อมูลให้ตรงปัจจุบัน

**Acceptance Criteria:**
- ปุ่ม "แก้ไข" ในแต่ละแถวของ Users (เฉพาะ admin)
- Modal เปิดขึ้นพร้อมข้อมูลเดิม
- แก้ Full Name + Role ได้ — **ไม่มีช่อง Password** (ตามนโยบาย locked)
- บันทึก → อัปเดต profile + auth metadata

### US-105: Admin ลบ User 👑
**As an** admin, **I want to** ลบ User ที่ไม่ใช้แล้ว **so that** เลิก access ได้ทันที

**Acceptance Criteria:**
- ปุ่ม "ลบ" ในแต่ละแถว — confirm ก่อนลบ
- **ลบตัวเองไม่ได้** (ป้องกัน lockout)
- ลบสำเร็จ → ทั้ง `auth.users` และ `profiles` ถูกลบ

---

## Epic 2 — บันทึก QC (QC Entry)

### US-201: บันทึก Order ใหม่ด้วย Auto-fill จาก SAP Code 👷
**As an** operator, **I want to** กรอก SAP Code แล้วให้ Brand / Sales / SCM / Description ปรากฏอัตโนมัติ **so that** ฉันลดเวลากรอกข้อมูล

**Acceptance Criteria:**
- พิมพ์ SAP Code → debounce 400ms → query `materials` table
- พบ → fill Brand, description, product_category, base_uom, sales, scm
- ไม่พบ → ช่องเหล่านั้นว่าง, ใส่เองได้
- เปลี่ยน SAP Code อีกครั้ง → ข้อมูลเก่าหายไปทันที (`setMaterial(null)`)

### US-202: เลือกรหัสของเสียหลายอันพร้อมกัน 👷
**As an** operator, **I want to** เลือกรหัสของเสียหลายรายการในครั้งเดียว **so that** ฉันบันทึกเป็นกลุ่มเดียวได้รวดเร็ว

**Acceptance Criteria:**
- ค้นหารหัส/อาการ → checkbox หลายอัน → "เพิ่มในรายการ"
- รวมเป็น 1 แถว — defect_code = "11001,11002,11003" (comma-separated)
- แสดง symptom รวมในแถวเดียว

### US-203: แนบรูปภาพของเสีย 1-3 รูป 👷
**As an** operator, **I want to** อัปโหลดรูปภาพ 1-3 รูปต่อรายการของเสีย **so that** มีหลักฐานภาพถ่ายของเสีย

**Acceptance Criteria:**
- input type="file" multiple, accept="image/*"
- จำกัด 3 รูป/แถว — เกินจะถูกตัดออก
- รูป preview แสดง thumbnail
- บันทึก → upload เข้า bucket `defect-images` พร้อม path ที่ unique
- เก็บ URL ใน `qc_order_details.images[]`

### US-204: เห็น % ของเสีย real-time 👷
**As an** operator, **I want to** เห็น % ของเสียคำนวณอัตโนมัติขณะกรอก **so that** ฉันยืนยันความถูกต้องก่อนบันทึก

**Acceptance Criteria:**
- แสดงมุมขวาบนของฟอร์ม
- สูตร: `(Σ defect quantity) / sample_size × 100`
- อัปเดตทันทีเมื่อเปลี่ยน sample_size หรือเพิ่ม/ลบ defect
- แยก count: Critical / Major / Minor

### US-205: เลือก Order Status (Inspection Result) 👷
**As an** operator, **I want to** เลือกผลตรวจ Accept / Accept Lot / Reject **so that** สรุปผลการสุ่มตรวจ

**Acceptance Criteria:**
- ปุ่ม 3 ปุ่ม (ผ่าน / รับ Lot / ไม่ผ่าน) — ไม่มี Pending
- ต้องเลือก 1 ก่อนบันทึก (validation)
- ถ้าเลือก Reject → confirm popup ก่อนบันทึก (เพราะจะสร้าง NCR)

### US-206: เห็น Success Popup สรุปข้อมูลหลังบันทึก 👷
**As an** operator, **I want to** เห็น popup สรุปข้อมูลทั้งหมดหลังกดบันทึก **so that** ฉันตรวจสอบความถูกต้อง

**Acceptance Criteria:**
- Popup แสดง Order No (เช่น QC26040001), วันที่, ข้อมูลทั้งหมด, รายการของเสีย, รูปภาพ
- ถ้า status=Reject → แจ้งว่าสร้าง NCR แล้ว
- ปุ่ม "ปิด" → reset form กรอกใหม่

### US-207: NCR สร้างอัตโนมัติเมื่อ Reject 👷🛡️
**As a** system, **I want to** สร้าง NCR record อัตโนมัติเมื่อ Order มี status='Reject' **so that** มีรายงานติดตามของไม่ผ่าน

**Acceptance Criteria:**
- DB trigger `trg_create_ncr_on_reject` ทำงาน on INSERT/UPDATE
- Insert ลง `ncr_reports` ผูกกับ `order_id`
- Success popup แจ้งว่ามี NCR

---

## Epic 3 — ประวัติ (History)

### US-301: ดูรายการประวัติแบบ Group by Status 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็น QC Orders จัดกลุ่มตามสถานะ **so that** ฉันเข้าใจภาพรวมได้เร็ว

**Acceptance Criteria:**
- 6 กลุ่ม (sticky header):
  - ✓ อนุมัติแล้ว / Approved
  - ผ่าน / Accept
  - รับ Lot / Accept Lot
  - ❌ ไม่ผ่าน / Reject
  - ✏️ รอแก้ไข / Pending Edit
  - อื่น ๆ / Other
- กลุ่มไม่มี item → ซ่อน
- แต่ละกลุ่มมี chip แสดงจำนวน

### US-302: ดูรายละเอียดแต่ละ Order 👷👀🛡️👑
**As a** ทุก role, **I want to** คลิก order เพื่อดูข้อมูลครบ + รายการของเสีย + รูป **so that** ฉันตรวจสอบประวัติได้

**Acceptance Criteria:**
- คลิก card → expand แสดงข้อมูลครบทุก field + edit reason (ถ้ามี)
- แสดงรายการของเสีย + รูป (คลิกรูป → เปิดแท็บใหม่)
- คลิกอีกครั้ง → collapse

### US-303: ค้นหา + Filter Status 👷👀🛡️👑
**As a** ทุก role, **I want to** ค้นหา Order No / SAP / Brand / Supplier และกรองตามสถานะ **so that** ฉันหา order ที่ต้องการได้เร็ว

**Acceptance Criteria:**
- input ค้นหา (case-insensitive)
- dropdown filter: All / Inspection (Accept/Accept Lot/Reject) / Approval (Pending/Approved) / Edit Pending
- combine ทั้งสอง filter ทำงานพร้อมกันได้

### US-304: เห็น 2 chip แยกกัน — Inspection vs Approval 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็น Inspection Result และ Approval Status เป็น chip 2 อันแยกกัน **so that** ฉันไม่สับสน

**Acceptance Criteria:**
- chip Inspection: Accept (น้ำเงิน) / Accept Lot (ฟ้า) / Reject (แดง) — แสดงเฉพาะค่าที่ valid
- chip Approval: ⏳ Pending (เทา) **OR** ✓ Approved (น้ำเงิน) — แสดง 1 อันเท่านั้น
- chip "Pending Edit" (อำพัน) เพิ่มถ้า edit_approved=true

---

## Epic 4 — Approval & Edit Workflow

### US-401: Admin/QC Admin อนุมัติ Order 🛡️👑
**As a** admin/qc_admin, **I want to** กด "อนุมัติ" ที่ Order ที่ตรวจแล้ว **so that** ปิด review cycle

**Acceptance Criteria:**
- ปุ่ม "✓ อนุมัติ / Approve" แสดงใน expanded view เฉพาะ admin/qc_admin และเฉพาะเมื่อ `approved=false && edit_approved=false`
- กด → confirm → set `approved=true`, `approved_by`, `approved_at`
- รีเฟรชแล้ว Order ย้ายไปกลุ่ม "อนุมัติแล้ว"

### US-402: Admin/QC Admin ขอให้แก้ไข Order 🛡️👑
**As a** admin/qc_admin, **I want to** กด "ต้องแก้ไข" พร้อมใส่เหตุผล **so that** ปลดล็อกให้เจ้าของ Order แก้ข้อมูล

**Acceptance Criteria:**
- ปุ่ม "✏️ ต้องแก้ไข / Need Edit" แสดงเฉพาะ admin/qc_admin (เมื่อยังไม่อนุมัติ)
- กด → modal ขอเหตุผล (required, textarea)
- ยืนยัน → set `edit_approved=true`, `edit_reason`, `edit_approved_by`, `edit_approved_at` + insert log
- Order ย้ายไปกลุ่ม "✏️ รอแก้ไข"

### US-403: Operator แก้ไข Order ของตัวเอง 👷
**As an** operator, **I want to** แก้ไข Order ของตัวเองเมื่อได้รับอนุมัติแล้ว **so that** ฉันแก้ข้อมูลที่ผิดได้

**Acceptance Criteria:**
- ปุ่ม "แก้ไขข้อมูล / Edit" แสดงเมื่อ `edit_approved=true` และเป็น `created_by` ของผู้ใช้
- ถ้าไม่ใช่เจ้าของ และไม่ใช่ admin → ขึ้น "รอเจ้าของแก้ไข"
- หน้าแก้ไข validate ownership อีกครั้ง — ไม่ใช่เจ้าของ → alert + redirect

### US-404: บันทึกการแก้ไข 👷🛡️👑
**As a** owner หรือ admin, **I want to** บันทึกข้อมูลที่แก้ไข **so that** Order กลับสู่สถานะปกติ

**Acceptance Criteria:**
- form แก้ได้ทุก field ยกเว้น `order_no` และ `order_date`
- บันทึก → reset `edit_approved=false`, `edit_reason=null`, อัปเดต log
- ลบ details เก่า + insert ใหม่
- Redirect กลับ History

---

## Epic 5 — Dashboard & Reports

### US-501: ดูภาพรวม KPI 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** เห็น metrics สรุป (Total / Accept / Reject / Avg Defect %) **so that** ฉันรู้สถานการณ์โดยรวม

**Acceptance Criteria:**
- KPI cards 4 อัน
- คำนวณจาก `filtered` (data หลัง filter)
- อัปเดตทันทีเมื่อเปลี่ยน filter

### US-502: ดู Charts ตามมิติต่าง ๆ 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** เห็น chart trend, distribution, top suppliers, top defects **so that** วิเคราะห์ปัญหาได้

**Acceptance Criteria:**
- Defect Rate Trend by Month — Line chart
- Inspection Result Distribution — Pie chart (3 สี: Accept/Accept Lot/Reject — ไม่มี Pending)
- Top 10 Suppliers by Defect Rate — Bar chart
- Top 10 Defect Codes by Quantity — Bar chart

### US-503: Filter ตาม Date / Supplier / Brand / Product / Inspector 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** กรองข้อมูลด้วย filter หลายเกณฑ์ **so that** ฉัน drill-down ได้

**Acceptance Criteria:**
- filter bar แบบ compact (1 แถว, wrap ถ้าจอแคบ)
- Date Range, Supplier (dropdown distinct), Brand (dropdown), Product (search), Inspector (dropdown)
- charts + scorecard อัปเดตทันที

### US-504: Supplier Scorecard 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** เห็น scorecard ของ Supplier ที่เลือก **so that** ฉันประเมิน supplier ได้เจาะจง

**Acceptance Criteria:**
- เลือก Supplier ใน filter → scorecard ปรากฏใต้ filter
- แสดง: Total orders, Accept rate, Defect %, Top defect codes ของ supplier นั้น
- ถ้าไม่เลือก → ซ่อน

### US-505: Export Excel 4 sheets 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** Export ข้อมูล Dashboard เป็น Excel **so that** ฉันใช้วิเคราะห์ต่อ offline

**Acceptance Criteria:**
- ปุ่ม "📊 Excel" — สร้างไฟล์ `QC-Dashboard-YYYY-MM-DD.xlsx`
- 4 sheets: Summary, Orders, Top Suppliers, Top Defects
- รวมข้อมูลที่ filter แล้ว

### US-506: Export PDF Snapshot 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** Export Dashboard เป็น PDF **so that** แชร์ภาพรวมในรูปแบบเอกสารได้

**Acceptance Criteria:**
- ปุ่ม "📄 PDF" — html2canvas + jsPDF
- multi-page ถ้ายาว
- shows loading state ขณะ render

---

## Epic 6 — Material Management

### US-601: ดูข้อมูล Master Material 👷👀🛡️👑
**As a** ทุก role, **I want to** ดูตาราง Material พร้อม search/sort/filter **so that** อ้างอิงข้อมูลได้

**Acceptance Criteria:**
- คอลัมน์: Material ID, Description, Product Category, Base UoM, Cat. ID, Updated
- Search box (ค้น Material ID หรือ Description)
- Filter Category
- Sort ทุกคอลัมน์ (คลิก header)
- แสดง 1,000 แถวแรกหลัง filter (sticky header + scroll)

### US-602: เห็น Last Upload Info 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็นข้อมูลการอัปโหลดล่าสุด **so that** รู้ว่าข้อมูลถูกอัปเดตเมื่อไหร่

**Acceptance Criteria:**
- แสดงด้านบน: "Last Upload: [date time] by [user]"
- แสดงชื่อไฟล์ + chip new/updated/error counts

### US-603: เห็น 7-Day Stale Warning 🛡️👑
**As an** admin/qc_admin, **I want to** เห็นคำเตือนถ้า Material ไม่อัปเดตเกิน 7 วัน **so that** ฉันทราบและอัปเดตทันเวลา

**Acceptance Criteria:**
- คำนวณจาก `max(updated_at)` ของ materials
- ถ้า > 7 วัน → แสดง chip ⚠️ "Material data has not been updated for more than 7 days"
- เห็นเฉพาะ admin/qc_admin

### US-604: Upload Material File 🛡️👑
**As an** admin/qc_admin, **I want to** อัปโหลดไฟล์ .xlsx **so that** เพิ่ม/อัปเดต Material ได้

**Acceptance Criteria:**
- ปุ่ม "📤 Upload Material File" (เฉพาะ admin/qc_admin)
- accept ".xlsx" only
- Auto-detect header row (หา cell "Material ID")
- ถ้าไม่พบ header → error "Cannot find Material ID header"

### US-605: Preview Before Import 🛡️👑
**As an** admin/qc_admin, **I want to** ดู preview ก่อน import **so that** ฉันยืนยันความถูกต้องก่อน

**Acceptance Criteria:**
- แสดง 50 แถวแรก
- แต่ละแถวมี chip: 🟢 New / 🟡 Update / 🔴 Error (missing/duplicate)
- Summary: Total, New, Update, Error counts
- ปุ่ม "ยืนยัน" + "ยกเลิก"

### US-606: Confirm Import 🛡️👑
**As an** admin/qc_admin, **I want to** กด confirm เพื่อ import จริง **so that** ข้อมูลถูกบันทึกลง DB

**Acceptance Criteria:**
- Upsert ทั้งหมด (skip error rows) — chunks of 500
- บันทึก `updated_by` = ชื่อผู้ upload
- DB trigger ตั้ง `updated_at` ให้
- Insert 1 record ลง `material_upload_log` พร้อมสถิติ
- แสดง success message + รีเฟรชตาราง

---

## Epic 7 — Master Data Management

### US-701: จัดการ Suppliers 🛡️👑
**As a** admin/qc_admin, **I want to** เพิ่ม/แก้ไข/ลบ Supplier **so that** ฐานข้อมูล supplier เป็นปัจจุบัน

**Acceptance Criteria:**
- Tab "Suppliers" ใน Admin
- Modal Add/Edit: Sup Code*, SAP Code, Supplier Name*, Category, Status, Purchase
- ค้นหา + ลิสต์
- Validation: Sup Code + Supplier Name required

### US-702: จัดการ Defect Codes 🛡️👑
**As a** admin/qc_admin, **I want to** เพิ่ม/แก้ไข/ลบ รหัสของเสีย พร้อม Type / Reason **so that** มาตรฐานการบันทึกของเสียครบถ้วน

**Acceptance Criteria:**
- Tab "รหัสของเสีย" ใน Admin
- Modal: Type → Reason → Running No.* → Symptom*
- Type/Reason เป็น combo (มาตรฐาน + ค่าเดิม) — เพิ่มค่าใหม่ได้
- ลิสต์ + ค้นหา

---

## Epic 8 — Guide & Help

### US-801: ดูคู่มือใช้งานตาม Role 👷👀🛡️👑
**As a** ทุก role, **I want to** อ่านคู่มือการใช้งานในระบบ **so that** ฉันใช้งานได้ถูกวิธี

**Acceptance Criteria:**
- เมนู "คู่มือ / Guide" บน header
- เนื้อหาแสดงตาม role:
  - operator: Login, บันทึก QC, ประวัติ, FAQ
  - qc_admin: + Master Data, Approval workflow, Dashboard
  - admin: ครบ + Users management
  - viewer: + Dashboard, Material

---

## Epic 9 — Non-Functional / System

### US-901: Bilingual Labels
**As a** ทุก role, **I want to** เห็น label ทั้งภาษาไทยและอังกฤษ **so that** ใครก็ใช้งานได้ไม่ติดภาษา

**Acceptance Criteria:**
- ทุกปุ่ม / label / heading มี "ไทย / English"
- รูปแบบ "ไทย / English" สลับได้ (ไทยขึ้นก่อน)

### US-902: DD-MM-YYYY Date Format
**As a** ทุก role, **I want to** เห็นวันที่ในรูปแบบ DD-MM-YYYY **so that** ตรงกับมาตรฐานไทย

**Acceptance Criteria:**
- ทุกที่ที่แสดงวันที่ใช้ helper `fmtDate()` → DD-MM-YYYY
- input type="date" ใช้รูปแบบ ISO ภายใน แต่แสดงตามเบราว์เซอร์ (acceptable)

### US-903: Auto-generated Order No
**As a** system, **I want to** สร้าง Order No อัตโนมัติเป็น `QC<YY><MM><seq4>` **so that** ไม่ชนกัน

**Acceptance Criteria:**
- DB trigger `gen_order_no` รันบน INSERT
- Format: เช่น `QC26040001` (ปี 2026 เดือน 04 เลขลำดับ 0001)
- Reset sequence ทุกเดือน

### US-904: Session ไม่ค้าง
**As a** ทุก role, **I want to** เปิดเว็บใหม่แล้วต้อง login ใหม่ **so that** ป้องกันคนอื่นใช้เครื่องเดียวกันเข้าถึง

**Acceptance Criteria:**
- Supabase config: `persistSession: false, autoRefreshToken: false`
- ปิดแท็บแล้วเปิดใหม่ → ไปหน้า login

### US-905: Auth Loading Timeout
**As a** ทุก role, **I want to** ไม่ค้างที่ "กำลังโหลด" เกิน 6 วินาที **so that** ระบบไม่หน่วง

**Acceptance Criteria:**
- AuthProvider มี Promise.race + timeout 6s
- ถ้า timeout → set loading=false + ให้เข้าหน้า login

---

## Epic 10 — Security

### US-1001: RLS บังคับทุก Mutation
**As a** system, **I want to** บังคับ Row Level Security ทุก table **so that** ข้อมูลไม่รั่วข้าม role

**Acceptance Criteria:**
- ทุก table เปิด RLS
- Operator แก้ไข order ของคนอื่นไม่ได้ (Postgres ปฏิเสธ)
- Viewer mutate อะไรไม่ได้

### US-1002: Server-side Admin Operations
**As a** system, **I want to** เก็บ Secret Key ฝั่ง server เท่านั้น **so that** secret ไม่รั่วไป browser

**Acceptance Criteria:**
- Secret key อยู่ใน Vercel env var (ไม่อยู่ใน VITE_ prefix)
- การสร้าง/ลบ/แก้ user ผ่าน Vercel Function `/api/admin-users`
- Endpoint ตรวจ token + role ก่อนทำงาน

### US-1003: Password Locked Once Set
**As a** system, **I want to** ไม่มี UI ให้เปลี่ยนรหัสผู้ใช้เดิม **so that** Admin ควบคุม credential ทั้งหมด

**Acceptance Criteria:**
- ไม่มีปุ่ม "Reset Password"
- Edit Modal สำหรับ user เดิมไม่มีช่อง Password
- ถ้าลืมรหัส → admin ต้องลบ user แล้วสร้างใหม่

### US-1004: ลบตัวเองไม่ได้
**As an** admin, **I should not** ลบ account ตัวเองได้ **so that** ป้องกัน lockout ระบบ

**Acceptance Criteria:**
- ปุ่ม "ลบ" ไม่แสดงในแถวของ admin คนปัจจุบัน
- API endpoint ตรวจซ้ำฝั่ง server — ปฏิเสธถ้า id ตรงกับ caller

---

## Acceptance Criteria Tagging Convention

| Tag | Meaning |
|---|---|
| ✅ | Implemented & deployed in v2.0 |
| 🚧 | In progress |
| 📋 | Backlog (future phases) |

> ทุก US ในเอกสารนี้คือ ✅ (deployed v2.0) ยกเว้นที่ระบุไว้

---

## Backlog (Future User Stories — Phase 3+)

### Phase 3
- 📋 US-1101: Email notification เมื่อ admin อนุมัติแก้ไข
- 📋 US-1102: Email notification เมื่อ status=Reject (แจ้ง supplier/QA)
- 📋 US-1103: Bulk import QC Orders จาก Excel
- 📋 US-1104: Barcode/QR scanner กรอก SAP/Lot
- 📋 US-1105: NCR module ขยาย (root cause, corrective action, follow-up)

### Phase 4
- 📋 US-1201: Multi-approver workflow (QC → QA → Manager)
- 📋 US-1202: SAP integration ผ่าน API (real-time master data sync)
- 📋 US-1203: Mobile app (React Native หรือ PWA installable)

---

*ดู [PRD.md](PRD.md) สำหรับรายละเอียด feature spec และ data model*
