# User Stories — QC Inspection Web App

**Version:** 2.5.1
**Last Updated:** 3 มิถุนายน 2026
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
**As a** ทุก role, **I want to** Login ด้วย Email + Password ที่ Admin สร้างให้ **so that** ฉันเข้าใช้งานระบบได้

**Acceptance Criteria:**
- หน้า login มีช่อง Email + Password + ปุ่ม Login (bilingual)
- ระบบไม่มี "Sign Up" — มีแค่ admin สร้างให้
- กรอกผิด → แสดง error message
- Login สำเร็จ → redirect ไป `/`
- Session ไม่เก็บ — ออกจาก browser แล้วต้อง login ใหม่

### US-102: แสดง/ซ่อนรหัสผ่านในหน้า Login (v2.1)
**As a** ทุก role, **I want to** กดปุ่มไอคอนตา 👁️ ที่ช่องรหัสผ่าน **so that** ฉันเช็ครหัสที่พิมพ์ถูกต้องก่อน Login

**Acceptance Criteria:**
- ปุ่มอยู่มุมขวาของช่อง Password
- คลิก → input type=password ↔ text สลับกัน
- Tab navigation ข้ามปุ่มนี้ (`tabIndex={-1}`)
- มี aria-label + title สำหรับ accessibility

### US-103: Logout
**As a** ทุก role, **I want to** กด Logout ที่มุมขวาบน **so that** ออกจากระบบทันที

### US-104: Admin สร้าง User ใหม่ 👑
**As an** admin, **I want to** สร้าง User ใหม่พร้อม Email + Role + Full Name + Password **so that** ทีมใหม่เข้าใช้งานได้

**Acceptance Criteria:**
- ปุ่ม "+ เพิ่มผู้ใช้" ใน Admin → Users (เฉพาะ admin)
- Modal มี: Email*, Full Name, **Role select dropdown** (4 default roles + Custom option), Password* (min 6)
- Role dropdown ใช้ `<select>` แสดงชื่อ + คำอธิบาย เช่น "qc_admin (QC Admin)"
- Custom option → input field โผล่ให้พิมพ์ role ใหม่
- บันทึก → สร้างใน Supabase Auth + insert ลง `profiles`

### US-105: Admin แก้ไขข้อมูล User 👑 (v2.2 — รวมรีเซ็ตรหัสผ่าน)
**As an** admin, **I want to** แก้ไข Email / Full Name / Role / Password ของ User เดิม **so that** อัปเดตข้อมูลและจัดการรหัสได้เอง

**Acceptance Criteria:**
- ปุ่ม "แก้ไข" ในแต่ละแถว
- Modal เปิดพร้อมข้อมูลเดิม (Email ปัจจุบัน + Full Name + Role)
- **ช่อง Password (v2.2):** เว้นว่างถ้าไม่เปลี่ยน, ใส่ค่าจะ reset เป็นรหัสใหม่ทันที
- ปุ่ม **🎲 สุ่ม** สร้างรหัส 12 ตัว (avoid 0/O/l/I)
- Role select ใช้ dropdown เดียวกันกับ Add
- หลังบันทึก → ถ้าตั้งรหัสใหม่ แสดง **banner one-time** ที่หน้า Users พร้อมปุ่ม **Copy** ให้ Admin จดเก็บ

### US-105b: หลักการเก็บรหัสผ่าน (v2.2) 👑
**As an** admin, **I want to** เข้าใจว่า Supabase เก็บอะไรไว้ในระบบ **so that** รู้ว่าทำไมต้องจดรหัสตอน banner ปรากฏ

**Acceptance Criteria:**
- ระบบเก็บแค่ bcrypt hash ของรหัสผ่าน — ไม่มี plaintext ใน DB
- แม้ admin/service-role ก็ดูรหัสปัจจุบันไม่ได้ ทำได้แค่ตั้งใหม่
- รหัส plaintext ที่ Admin ดูได้คือเฉพาะตอน banner one-time หลัง reset เท่านั้น
- ไฟล์ CSV ใน local สำหรับเก็บรหัสไว้อ้างอิงต้อง gitignored (`*-passwords.*` ใน `.gitignore`)

### US-106: Admin ลบ User 👑
**As an** admin, **I want to** ลบ User ที่ไม่ใช้แล้ว **so that** เลิก access ทันที

**Acceptance Criteria:**
- ปุ่ม "ลบ" ในแต่ละแถว — confirm ก่อนลบ
- ลบตัวเองไม่ได้ (ป้องกัน lockout)

### US-107: ทุก User เห็นรายชื่อเพื่อนร่วมงาน (v2.1)
**As a** ทุก role, **I want to** เห็นรายชื่อ users ทั้งหมด (สำหรับ dropdown ต่าง ๆ) **so that** เลือกผู้อนุมัติ/ผู้รับผิดชอบได้

**Acceptance Criteria:**
- RLS `profiles_read_all` — authenticated users select profiles ทั้งหมดได้
- เขียน (insert/update/delete) ยังคงเฉพาะ admin

---

## Epic 2 — บันทึก QC (QC Entry)

### US-201: Auto-fill จาก SAP Code 👷
**As an** operator, **I want to** กรอก SAP Code แล้วให้ Brand / Description / SAP breakdown ปรากฏอัตโนมัติ **so that** ลดเวลากรอก

**Acceptance Criteria:**
- พิมพ์ SAP Code → debounce 400ms → query `materials` table
- พบ → fill Brand, description, product_category, base_uom, sap breakdown 7 ฟิลด์
- Sales/SCM → ดึงจาก `brand_responsibilities` ตาม brand (v2.2 — ดู US-209)
- ไม่พบ → ช่องว่าง, ใส่เองได้ (ยกเว้น Sales/SCM ที่เป็น display-only)
- เปลี่ยน SAP Code อีกครั้ง → ข้อมูลเก่าหายไป

### US-209: Sales/SCM ดึงจาก Brand Responsibilities (v2.2) 👷
**As an** operator, **I want to** เห็น Sales/SCM ที่ดึงจาก brand ของสินค้าอัตโนมัติ (อ่านอย่างเดียว) **so that** ข้อมูลตรงกับสิ่งที่ Admin ดูแลไว้ ไม่มีโอกาสพิมพ์ผิด

**Acceptance Criteria:**
- ฟิลด์ Sales / SCM แสดงเป็น **display-only** (พื้นหลังเทา, แก้ไม่ได้)
- ระบบ normalize brand ก่อน lookup: `strip [*"']` + `toLowerCase()` → คุม "*BEET" ↔ "BEET" ↔ "beet" ให้ตรงกัน
- ถ้า brand อยู่ใน `brand_responsibilities` → ใช้ sales/scm จาก table นี้
- ถ้าไม่อยู่ → fallback ใช้ `materials.sales/scm`
- Cache โหลด `brand_responsibilities` ทั้งตารางตอน component mount (Map) → lookup O(1)

### US-212: 2 ฟิลด์วันที่ — Received Date + Inspection Date (v2.2.1) 👷
**As an** operator, **I want to** กรอกแยกระหว่าง "วันที่รับเข้าจาก supplier" และ "วันที่ตรวจสอบ" **so that** ข้อมูลตรงกับเอกสารและทำให้รายงาน trace กลับได้

**Acceptance Criteria:**
- ฟิลด์ "วันที่ตรวจ / Inspection Date" — required, default = วันนี้ (ใช้คอลัมน์ `order_date` เดิม)
- ฟิลด์ "วันที่รับเข้า / Received Date" — optional (`received_date` ใหม่)
- ทั้ง 2 ฟิลด์อยู่ในแถวเดียวกัน ใต้ Project Brief No.
- แสดงในหน้า History expanded view, OrderReport PDF, NcrReport PDF
- QCEdit รองรับการแก้ไข Received Date (Inspection Date ปกติ disabled ใน edit เพราะกำหนดเลข Order ไปแล้ว)

### US-213: แสดงเลข Order preview ขณะกรอก (v2.2.1) 👷
**As an** operator, **I want to** เห็นเลข Order ที่จะได้รับล่วงหน้าก่อน save **so that** จดบันทึก/อ้างอิงได้ทันที + รู้ว่าจะใช้เลขอะไรก่อนยืนยัน

**Acceptance Criteria:**
- แสดง chip "📋 QC2605xxx (ประมาณ / preview)" ในส่วน header ของฟอร์ม QC Entry
- แสดงในปอปอัพ Review-before-save ด้วย
- เลขคำนวณจาก RPC `peek_next_order_no(p_date)` โดย p_date = inspection_date ปัจจุบัน
- อัพเดตอัตโนมัติเมื่อเปลี่ยน inspection_date
- **เป็น preview เท่านั้น** — เลขจริงกำหนดโดย DB trigger ตอน INSERT (อาจ +1 ถ้ามีคน save ก่อน)

### US-215: บันทึกผู้ถือเอกสารต้นฉบับ (v2.2.2) 👷
**As an** operator, **I want to** เลือกจาก dropdown ว่าเอกสารฉบับจริงอยู่ที่ใคร **so that** ทีมอื่นรู้ว่าจะตามเอกสารกระดาษได้ที่ไหน

**Acceptance Criteria:**
- Dropdown ใน Remarks section ของ QC Entry
- 4 ค่ามาตรฐาน: **คุณอู๋ / WH / PD / SCM**
- ค่า **"อื่น ๆ (พิมพ์เอง)"** → text input เพิ่มเติม
- Optional (เว้นว่างได้)
- บันทึกใน `qc_orders.original_doc_with text`
- แก้ไขได้ใน Review-before-save popup
- แสดงในหน้า History expanded view

### US-216: แสดงชื่อผู้บันทึก (v2.2.2) 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็นชื่อผู้ที่บันทึก order เข้าระบบ **so that** ทราบที่มาของข้อมูลโดยไม่ต้องไปดู approval log

**Acceptance Criteria:**
- ฟิลด์ "ผู้บันทึก / Recorded By" — read-only, ไม่ต้องกรอก
- ในฟอร์ม QC Entry: ดึงจาก logged-in user (`profile.full_name`)
- ใน Review popup: ดึงจาก draft.created_by_name (ส่งมาจาก QCEntry)
- ใน History expanded view: ดึงจาก `profilesMap[created_by]` (look up profiles)
- ไม่มีคอลัมน์ DB ใหม่ — ใช้ `created_by` UUID เดิมที่อ้างอิง profiles

### US-214: เลข Order ไม่ซ้ำกันถึงจะ insert พร้อมกัน (v2.2.1) 👷👑
**As a** system, **I want to** ป้องกัน duplicate `order_no` แม้ 2 operators กด save ในวินาทีเดียวกัน **so that** ไม่มี collision

**Acceptance Criteria:**
- DB trigger `gen_order_no()` เรียก `pg_advisory_xact_lock(hashtext('qc_order_no_seq'))` ก่อน SELECT max(seq) → serialize transaction
- Lock ปล่อยอัตโนมัติเมื่อ COMMIT/ROLLBACK (xact_lock)
- ผลลัพธ์: ทุก INSERT ได้เลข sequential แน่นอน ไม่มีทาง duplicate
- ทดสอบโดย concurrent INSERT 2 transactions ในเวลาเดียวกัน → ทั้งคู่ได้คนละเลข

### US-210: Project Brief No. (v2.2) 👷
**As an** operator, **I want to** กรอกเลขที่ Project Brief ที่อ้างอิง **so that** เชื่อมโยง QC order กับเอกสาร Project Brief ได้

**Acceptance Criteria:**
- ฟิลด์ "เลขที่ Project Brief / Project Brief No." อยู่ใกล้ช่อง SAP Code (ส่วนบนของฟอร์ม)
- **Required** — บันทึกไม่ได้ถ้าเว้นว่าง
- บันทึกใน `qc_orders.project_brief_no text`
- แสดงในหน้า History expanded view + PDF reports

### US-211: Supplier dropdown (v2.3.1) 👷
**As an** operator, **I want to** เลือก supplier จาก dropdown ที่แบ่งกลุ่ม Import / Local **so that** ค้นและเลือกได้รวดเร็วโดยไม่ต้องพิมพ์รหัสเอง

**Acceptance Criteria (v2.3.1 — แทน Vendor Code input เดิม):**
- ฟิลด์เดียว: "รหัสผู้จัดจำหน่าย / Sup Code" เป็น `<select>` ดึงจาก `suppliers` ทั้งหมด (~90 ราย)
- Label option: `<sup_sap_code>/<sup_code>` เช่น `10000138/12Y`
- **แบ่ง `<optgroup>` 2 หมวด** ตาม `suppliers.purchase`: **Import** + **Local**
- supplier ที่ purchase ไม่ใช่ Import/Local → ไปกลุ่ม "อื่น ๆ / Other"
- เลือกแล้ว → ระบบบันทึก `sup_code` + `supplier_name` ลง qc_orders
- **Supplier name input + Vendor Code input ถูกลบ** จาก QC Entry (ทดแทนด้วย dropdown นี้)
- หน้า History modal: ฟิลด์ Sup Code แสดง `<sap>/<code>` เหมือนใน dropdown

### US-202: SAP Code Breakdown แสดงเป็นช่องแยก (v2.1) 👷
**As an** operator, **I want to** เห็นการแยกประเภทของ SAP Code (Item Type / Source / Category / Group / Sub-Group / Running / Revision) เป็นช่องแยกกัน **so that** เข้าใจสินค้าทันทีโดยไม่ต้องจำ mapping

**Acceptance Criteria:**
- Display fields read-only แสดงต่อจากช่อง SAP Code (พื้นหลังเทา)
- 7 ช่อง: ประเภท / ที่มา / หมวด SAP / กลุ่ม SAP / กลุ่มย่อย / Running No / Revision
- คำนวณ real-time ขณะพิมพ์ (parseSapCode helper)
- ช่องว่างถ้าไม่ match mapping (เช่น sap_code สั้นเกินไป)

### US-203: เลือกรหัสของเสียหลายอันพร้อมกัน 👷
**As an** operator, **I want to** เลือกรหัสของเสียหลายรายการในครั้งเดียว **so that** บันทึกเป็นกลุ่มเดียวรวดเร็ว

### US-204: แนบรูปภาพของเสีย 1-3 รูป 👷
**As an** operator, **I want to** อัปโหลดรูปภาพ 1-3 รูป/รายการของเสีย **so that** มีหลักฐาน

### US-205: เห็น % ของเสีย real-time 👷
**As an** operator, **I want to** เห็น % ของเสียคำนวณอัตโนมัติ **so that** ยืนยันความถูกต้องก่อนบันทึก

### US-206: เลือก Inspection Result 👷
**As an** operator, **I want to** เลือกผลตรวจ Accept / Accept Lot / Reject **so that** สรุปผลการสุ่มตรวจ

### US-207: Review-before-save popup (v2.2) 👷
**As an** operator, **I want to** เห็น popup ตรวจ/แก้ไขข้อมูลก่อนบันทึกลง DB จริง **so that** ลดความผิดพลาดและไม่ต้องไป Need Edit ทีหลัง

**Acceptance Criteria:**
- กดปุ่ม "บันทึก / Save" ใน QC Entry → **ไม่ insert ลง DB ทันที**
- เปิด popup Review (Stage 1):
  - แสดง preview ของ Order + Defect List ที่จะบันทึก
  - **แก้ไขใน popup ได้:** Date, Lot No., Received Qty, Sample Size, Note
  - **แก้ไข Defects ได้:** Critical Rank, จำนวน, เพิ่ม/ลบรูปภาพ, ลบรายการ
  - **เลือกผู้อนุมัติ** ใน popup (dropdown qc_admin/admin + Custom name option)
  - ปุ่ม "ยกเลิก / Cancel" → กลับไปแก้ในฟอร์ม
  - ปุ่ม "✓ ยืนยันบันทึก / Confirm Save" → ทำ DB writes (insert qc_orders, insert details, upload images, set approval)
- ถ้ายกเลิก popup → ฟอร์ม QC Entry คงข้อมูลเดิม Operator แก้ต่อได้
- หลังยืนยันสำเร็จ → popup เปลี่ยนเป็น Success view (Stage 2) แสดง Order No + NCR No (ถ้ามี)
- ปิด popup → reset form ของ QC Entry

### US-208: NCR auto-create เมื่อ Reject 👷🛡️
**As a** system, **I want to** สร้าง NCR record อัตโนมัติเมื่อ Order มี status='Reject'

---

## Epic 3 — ประวัติ (History)

### US-301: ดูรายการประวัติ Group by Status 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็น QC Orders จัดกลุ่มตามสถานะ **so that** เข้าใจภาพรวมเร็ว

### US-302: ดูรายละเอียดแต่ละ Order 👷👀🛡️👑
**As a** ทุก role, **I want to** คลิก order → expand ดูข้อมูลครบ + รายการของเสีย + รูป **so that** ตรวจสอบประวัติได้

**Acceptance Criteria:**
- บรรทัด 🏷️ SAP breakdown ที่ด้านบน expanded view
- InfoFields รวม Type, SAP, Description, Sales, SCM, Sup Code, Supplier, Received Qty, Sample Size

### US-303: ค้นหา + Filter Status 👷👀🛡️👑
**As a** ทุก role, **I want to** ค้นหา Order No / SAP / Brand / Supplier และกรองตามสถานะ **so that** หา order ได้เร็ว

### US-304: เห็น 2 chip แยกกัน — Inspection vs Approval 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็น Inspection Result และ Approval Status เป็น chip แยกกัน **so that** ไม่สับสน

**Acceptance Criteria:**
- chip Inspection: Accept / Accept Lot / Reject — แสดงเฉพาะค่าที่ valid
- chip Approval: ⏳ Pending **OR** ✓ Approved (mutually exclusive) — label เปลี่ยนตาม status ที่ approve (เช่น "ปฏิเสธ Reject Approved")
- chip "Pending Edit" อำพันถ้า edit_approved=true

### US-305: NCR chip บน Reject orders (v2.1) 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็น chip NCR No + status บน card ของ Reject orders ที่มี NCR **so that** ระบุได้ทันทีว่ามี NCR

**Acceptance Criteria:**
- chip รูปแบบ "📋 NCR26050001 · Open" — สีตามสถานะ NCR (Open=แดง, In Progress=เหลือง, Closed=เขียว)
- เฉพาะ Reject orders ที่มี NCR record

### US-309: Activity Timeline ใน Order Detail (v2.3.2) 👑
**As an** admin, **I want to** เห็นประวัติการดำเนินการของแต่ละ Order ทั้งหมดในที่เดียว **so that** ตรวจสอบ audit trail ได้เร็วโดยไม่ต้องไปไล่ดูตารางทีละตาราง

**Acceptance Criteria:**
- Section "ประวัติการดำเนินการ (N)" ที่ด้านล่างของ Order Detail Modal
- **เห็นเฉพาะ `profile.role === 'admin'`** (qc_admin / operator / viewer ไม่เห็น)
- Event ที่รวบรวม:
  - **สร้างเอกสาร / Created** — จาก `qc_orders.created_at` + `created_by`
  - **แก้ไขข้อมูล / Edited** — จาก rows ใน `qc_order_edit_log` พร้อม `edit_reason` เป็น note
  - **ยืนยันรับ / Confirm Accept** — จาก `accept_approved_at` + `accept_approved_by_name`
  - **ยืนยันรับ Lot** — จาก `acceptlot_approved_at`
  - **ยืนยันการปฏิเสธ** — จาก `reject_approved_at`
- รูปแบบแต่ละ row: `DD/MM/YYYY HH:mm · ชื่อผู้ใช้ (role) → action  "note"`
- เรียงจากใหม่สุดบนสุด

### US-307: Order Detail แสดงเป็น Popup Modal (v2.3.1) 👷👀🛡️👑
**As a** ทุก role, **I want to** ดู order detail ใน modal popup แทน inline expand **so that** รายการอื่น ๆ ไม่ถูกดันลงเวลากดดูออเดอร์ใดออเดอร์หนึ่ง

**Acceptance Criteria:**
- คลิกการ์ด order → เปิด modal ตรงกลางหน้าจอ (max-w-4xl, scrollable)
- Header sticky: Order No + วันที่ตรวจ + chip status / approval / NCR + ปุ่ม **ปิด / Close**
- Body: SAP breakdown + info grid (Project Brief / 2 วันที่ / SAP / Type / Description / Sales / SCM / Sup Code / Supplier / Qty / Sample / Original Docs / Recorded By) + Approval Record + รายการของเสีย (conditional ดู US-308)
- Footer sticky: ปุ่ม PDF / NCR / Confirm / Edit ทุกที่ใช้ได้
- ปิดได้ 3 วิธี: ปุ่ม Close, คลิก backdrop, กด ESC

### US-308: Defect List section conditional display (v2.3.1) 👷👀🛡️👑
**As a** ทุก role, **I want to** ไม่ต้องเห็นหัวข้อ "รายการของเสีย / Defect List" สำหรับ order ที่ status = Accept **so that** หน้าจอไม่รก ตามความเป็นจริงที่ Accept ไม่มีของเสีย

**Acceptance Criteria:**
- ใน Order Detail Modal: section "รายการของเสีย / Defect List" แสดง **เฉพาะเมื่อ** `status === 'Accept Lot'` หรือ `status === 'Reject'`
- Status = `Accept` → ไม่มีหัวข้อนี้ในปอปอัพ
- ฟอร์ม QC Entry / QCEdit ยังคงให้ใส่ defect ได้ทุก status (เผื่อ user เปลี่ยน status ทีหลัง)

### US-306: ซ่อน Defect % เมื่อ Accept Lot (v2.2) 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็น `—` แทน `%` ของเสียในการ์ดหน้า History สำหรับ order ที่ status = Accept Lot **so that** ไม่เข้าใจผิดว่า Accept Lot ใช้เกณฑ์ % ตัดสินใจ

**Acceptance Criteria:**
- การ์ดหน้า History: ถ้า `status === 'Accept Lot'` แสดง "—" สีเทา (ไม่ใช่สีแดง/ฟ้า)
- บรรทัด `ตรวจ/Inspected · ดี/Good · เสีย/Defect` และ chip C/M/m ยังคงแสดงปกติ
- defect records ใน `qc_order_details` ยังถูกบันทึกเหมือนเดิม
- **PDF reports** (per-order, summary, NCR) ยังคำนวณ + แสดง % ตาม `defect_percent` ปกติ
- **Dashboard** rate aggregations ยังรวม Accept Lot เป็น sample/defect ปกติ

---

## Epic 4 — Approval & Edit Workflow

### US-401: Operator ยืนยันรับ Order + เลือกผู้อนุมัติ 👷
**As an** operator, **I want to** กดปุ่ม "ยืนยัน" แล้วเลือกชื่อผู้อนุมัติจาก dropdown หรือพิมพ์ชื่อเอง **so that** บันทึกการรับ order + ระบุผู้รับผิดชอบ

**Acceptance Criteria:**
- ปุ่ม label เปลี่ยนตามสถานะ:
  - Accept → "✓ ยืนยันรับ / Confirm Accept"
  - Accept Lot → "✓ ยืนยันรับ Lot / Confirm Accept Lot"
  - Reject → "✓ ยืนยันการปฏิเสธ / Confirm Reject" *(v2.2 — ปรับคำเดิม "ยืนยันปฏิเสธ")*
- คลิก → Modal เปิดพร้อม:
  - แสดง Order No + ผลตรวจ
  - **Dropdown** "ผู้อนุมัติ / Approver" — แสดงเฉพาะ role `admin` + `qc_admin` พร้อม label
  - Option **+ พิมพ์ชื่อเอง / Custom name…** → input field โผล่ขึ้นมา
- กด **✓ ยืนยัน** → บันทึก:
  - `approved=true`, `approved_by=<UUID หรือ NULL>`, `approved_by_name=<text>`, `approved_at=now`
  - เซ็ตคอลัมน์ status-specific (เช่น `accept_approved=true`, `accept_approved_by_name=...`)
- ผู้กดต้องเป็น role `operator` เท่านั้น — admin/qc_admin/viewer **ไม่เห็นปุ่มนี้**
- หมายเหตุ (v2.2): Operator เลือกผู้อนุมัติได้ตั้งแต่ใน Review popup ของ QC Entry ตอนบันทึกใหม่ — ปุ่มนี้ใช้กรณี order ที่ค้าง Pending เท่านั้น

### US-402: ~~Admin/QC Admin ขอให้แก้ไข Order~~ — DEPRECATED v2.3.0
**Removed in v2.3.0** — ปุ่ม "Need Edit" + workflow ปลดล็อกถูกยกเลิก เพราะเจ้าของ order, admin, qc_admin สามารถกดปุ่ม "แก้ไขข้อมูล / Edit" ได้โดยตรงตลอดเวลาแล้ว (ดู US-403)

### US-406: Audit log table กู้คืน (v2.3.1) 🛡️👑
**As a** admin/qc_admin, **I want to** มีตาราง `qc_order_edit_log` ใน Supabase บันทึก audit ทุกครั้งที่มีการแก้ Order **so that** ตรวจสอบประวัติย้อนหลังได้

**Acceptance Criteria:**
- ตาราง `qc_order_edit_log` (สร้างผ่าน patch-18) มีคอลัมน์: `id`, `order_id` (FK qc_orders), `edit_reason text not null`, `edited_by` (FK profiles), `edited_at timestamptz`
- RLS: authenticated read + insert (เขียนผ่าน frontend ได้ ลบไม่ได้)
- ทุก save ใน `/edit/:orderId` → frontend INSERT row ใหม่อัตโนมัติ (edit_reason default = "แก้ไขข้อมูล / Direct edit")
- Supabase Dashboard → Table Editor → `qc_order_edit_log` ดู audit ทั้งหมดได้
- **เหตุที่ต้องกู้คืน:** patch-04 (สร้าง edit_log ครั้งแรก) ไม่เคยถูก apply กับ project นี้ → เคยทำ frontend INSERT แต่ fail เงียบ → patch-18 fix

### US-407: QCEdit ไม่เขียน edit_approved* columns (v2.3.1 — bug fix) 👷🛡️👑
**As an** operator/admin, **I want to** บันทึกการแก้ไข Order ได้โดยไม่ error **so that** ใช้ระบบได้

**Acceptance Criteria:**
- frontend ไม่ส่ง `edit_approved`, `edit_reason`, `edit_approved_by`, `edit_approved_at` ใน UPDATE payload (คอลัมน์ไม่มีจริงใน DB)
- save Order ใน `/edit/:orderId` สำเร็จทุกครั้ง — ไม่มี error "Could not find the 'edit_approved' column"

### US-403: แก้ไข Order หลังบันทึก 👷🛡️👑 (v2.3.0 — ลบ Need Edit workflow)
**As an** operator/qc_admin/admin, **I want to** แก้ไข Order ได้โดยตรงผ่านปุ่ม "Edit" **so that** แก้ข้อมูลที่ผิดได้ทันทีไม่ต้องผ่านขั้น unlock

**Acceptance Criteria (v2.3.0):**
- ปุ่ม "แก้ไขข้อมูล / Edit" แสดงในการ์ดของ Order สำหรับ:
  - **เจ้าของ order** (`created_by === auth.uid()`) — ทุก order ของตัวเอง
  - **admin / qc_admin** — ทุก order (ของใครก็ได้)
- Viewer ไม่เห็นปุ่ม (ไม่มีสิทธิ์)
- เมื่อแก้ order ที่ **เคย approve** มาแล้ว → ระบบ clear ทุก approval column (Pending) — ต้อง re-approve
- ทุก edit → INSERT row ใหม่ใน `qc_order_edit_log` (`edit_reason='แก้ไขข้อมูล / Direct edit'`)
- หน้า `/edit/:orderId` แสดง banner เตือน ถ้า approval จะถูกรีเซ็ต
- ปุ่ม "Need Edit" + modal กรอกเหตุผลถูก **ลบออกหมด** (ไม่จำเป็นแล้ว)

### US-404: บันทึกการแก้ไข 👷🛡️👑
**As a** owner หรือ admin, **I want to** บันทึกข้อมูลที่แก้ไข **so that** Order กลับสู่สถานะปกติ

### US-405: ดู Approval Record (v2.1) 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็นกล่อง "การอนุมัติ / Approval Record" ใน expanded view ของ approved orders **so that** ทราบว่าใครยืนยัน, แบบไหน, เมื่อไหร่

**Acceptance Criteria:**
- กล่องสีน้ำเงินอ่อนใต้ Edit reason
- บรรทัด: "✓ ยืนยันรับ / Confirm Accept · โดย คุณสมชาย · เมื่อ 09-05-2026"
- แสดงเฉพาะแถวที่ตรงกับ status ที่ approve
- legacy data (ก่อน v2.1) → fallback แสดง "อนุมัติแล้ว" generic

---

## Epic 5 — NCR (รวมใน History) (v2.1)

### US-501: ปุ่ม NCR ใน expanded view 👷👀🛡️👑
**As a** ทุก role, **I want to** กดปุ่ม "📋 NCR" ใน expanded view ของ Reject order ที่มี NCR **so that** เปิด modal ดู/จัดการ NCR

**Acceptance Criteria:**
- ปุ่มอยู่ในแถว action buttons ข้าง ๆ "📄 PDF"
- คลิก → modal เปิด พร้อมโหลด defect details

### US-502: NCR Modal แสดงข้อมูล Order ครบ 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็นข้อมูล Order ที่อ้างอิงในใบ NCR **so that** เข้าใจบริบทก่อนกรอก root cause

**Acceptance Criteria:**
- Section **ข้อมูล Order / Order Information**:
  - Order No, Date, Result, SAP, Type, Brand, Description (col-span 3), Supplier, Sup Code, Lot, Sales, SCM
- Section **สรุปผลการตรวจ / Inspection Summary**:
  - Sample / Good / Defect / Critical / Major / Minor / Defect % (chip table 7 ช่อง สีแดงเน้น Defect)
- หมายเหตุ Order (ถ้ามี)

### US-503: NCR Modal แสดง Defect Details 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็นรายการของเสีย + รูปภาพ ใน NCR modal **so that** เห็นปัญหาที่ต้องวิเคราะห์

**Acceptance Criteria:**
- Section **รายการของเสีย / Defect Details** (lazy-load เมื่อเปิด modal)
- แต่ละแถวมี: defect_code, symptom, chip Rank, chip จำนวน
- รูปภาพ thumbnail 64×64 (คลิกเปิดเต็มในแท็บใหม่)

### US-504: กรอก NCR analysis fields 🛡️👑
**As a** admin/qc_admin, **I want to** กรอก Problem Found / Root Cause / Corrective Action / Follow-up + เปลี่ยน Status **so that** ติดตามการแก้ไขปัญหา

**Acceptance Criteria:**
- Form 4 ช่อง grid 2 คอลัมน์
- Status dropdown: Open / In Progress / Closed
- ปุ่ม Save (admin/qc_admin) — มี draft state
- เปลี่ยนเป็น Closed → auto-set `closed_at`

### US-505: Download NCR PDF 👷👀🛡️👑
**As a** ทุก role, **I want to** กด "📄 PDF" ใน NCR modal **so that** ดาวน์โหลดใบ NCR เป็น PDF

**Acceptance Criteria:**
- ปุ่มอยู่ใน Header ของ NCR modal
- เปิด modal ซ้อน → preview NcrReport (A4 portrait)
- ปุ่ม Download → save เป็น `<NCR-No>.pdf`
- รูปแบบเอกสาร 5 sections + 3 ลายเซ็น (QC Inspector / QC Admin / PCM Manager)

---

## Epic 6 — PDF Reports (v2.1)

### US-601: Per-Order PDF 👷👀🛡️👑
**As a** ทุก role, **I want to** กด "📄 PDF" ใน expanded view → ดาวน์โหลดใบ QC Inspection Report **so that** มีเอกสารเป็นทางการของ order นั้น

**Acceptance Criteria:**
- Modal preview แสดง template A4 portrait
- 5 sections: Order Info, Inspection Summary, Defect Details + รูป, Remarks (ถ้ามี), Signatures (QC Inspector + QC Admin)
- ปุ่ม Download → save เป็น `<Order-No>.pdf`
- รอรูปโหลดเสร็จก่อน screenshot

### US-602: Summary PDF (รวมหลาย Order) 👷👀🛡️👑
**As a** ทุก role, **I want to** กด "📥 PDF รวม (N)" ในหัว History **so that** ดาวน์โหลดรายงานสรุปทุก order ที่ filter อยู่

**Acceptance Criteria:**
- ปุ่มแสดงจำนวน N (filtered count) ในชื่อ
- A4 landscape
- KPI cards: Total / Accept (incl. Lot) / Reject / Approved / Total Defects / Avg Defect %
- ตารางทุก order: # / Order No / Date / SAP / Type / Description / Brand / Supplier / Lot / Sample / Defect / C/M/m / % / Result / Approval
- TOTAL row ท้ายตาราง
- File name: `QC-Summary-<YYYY-MM-DD>.pdf`

### US-603: ฟิลเตอร์ทำงานครบใน Summary PDF 👷👀🛡️👑
**As a** ทุก role, **I want to** Summary PDF ส่งออกตาม filter ที่ active **so that** ได้รายงานเฉพาะกลุ่มที่สนใจ

**Acceptance Criteria:**
- export ตาม `filtered` (status + search)
- filter summary แสดงในหัว PDF (เช่น "Status: Reject", "Search: BEAUTILAB")

---

## Epic 7 — Dashboard & Reports

### US-701: ดู KPI metrics 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** เห็น Total / Accept / Reject / Avg Defect % **so that** รู้สถานการณ์โดยรวม

### US-702: ดู Charts หลายมิติ 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** เห็น chart trend, distribution, top suppliers, top defects **so that** วิเคราะห์ปัญหา

### US-703: Filter ตาม Date / Supplier / Brand / Product / Inspector 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** กรองข้อมูลด้วย filter หลายเกณฑ์ **so that** drill-down ได้

### US-704: Supplier Scorecard 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** เห็น scorecard ของ Supplier ที่เลือก **so that** ประเมินเจาะจง

### US-705: Export Excel 4 sheets 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** Export Dashboard เป็น Excel

### US-706: Export PDF Snapshot 👀🛡️👑
**As a** admin/qc_admin/viewer, **I want to** Export Dashboard เป็น PDF

---

## Epic 8 — Material Management

### US-801: ดู Master Material พร้อม Type column (v2.1) 👷👀🛡️👑
**As a** ทุก role, **I want to** ดูตาราง Material พร้อมคอลัมน์ Type ที่ derive จาก SAP code **so that** อ้างอิงได้สะดวก

**Acceptance Criteria:**
- คอลัมน์: Material ID, **Type (chip)**, Description, Product Category, Base UoM, Cat. ID, Updated
- chip Type: FG / SG / Bulk / PK / RM / Other (จาก first digit)

### US-802: Filter Materials by Type (v2.1) 👷👀🛡️👑
**As a** ทุก role, **I want to** กรอง Materials ตาม Type **so that** ดูเฉพาะกลุ่มที่ต้องการ

**Acceptance Criteria:**
- dropdown filter: All Types / FG / SG / Bulk / PK / RM / Other
- combine กับ search + Category filter ทำงานพร้อมกันได้

### US-803: เห็น Last Upload Info 👷👀🛡️👑
**As a** ทุก role, **I want to** เห็นข้อมูลการอัปโหลดล่าสุด **so that** รู้ว่าข้อมูลถูกอัปเดตเมื่อไหร่

### US-804: เห็น 7-Day Stale Warning 🛡️👑
**As an** admin/qc_admin, **I want to** เห็นคำเตือนถ้า Material ไม่อัปเดตเกิน 7 วัน

### US-805: Upload Material File 🛡️👑
**As an** admin/qc_admin, **I want to** อัปโหลด .xlsx เพิ่ม/อัปเดต Material

### US-806: Preview Before Import 🛡️👑
**As an** admin/qc_admin, **I want to** ดู preview ก่อน import **so that** ยืนยันความถูกต้อง

### US-807: Confirm Import 🛡️👑
**As an** admin/qc_admin, **I want to** กด confirm เพื่อ import จริง **so that** ข้อมูลถูกบันทึก
- DB trigger `materials_parse_sap` parse SAP breakdown ให้อัตโนมัติทันที

---

## Epic 9 — Master Data Management

### US-901: จัดการ Suppliers 🛡️👑 (v2.3.2 — required fields ปรับใหม่)
**As a** admin/qc_admin, **I want to** เพิ่ม/แก้ไข/ลบ Supplier โดยมีเงื่อนไข required ที่สมเหตุผล

**Acceptance Criteria (v2.3.2):**
- ฟิลด์ที่บังคับ: **SAP Code** + **Supplier Name**
- ฟิลด์ที่ไม่บังคับ: Sup Code, Category, Status (default ACTIVE), Purchase (default Import)
- ถ้า user เว้น Sup Code → ระบบใช้ **SAP Code** เป็นค่า sup_code อัตโนมัติ (เพื่อ satisfy DB NOT NULL UNIQUE constraint)
- Validation: ถ้าเว้น Supplier Name → "กรุณากรอกชื่อ Supplier"; ถ้าเว้น SAP Code → "กรุณากรอก SAP Code"
- ก่อน v2.3.2: Sup Code เป็น required, SAP Code เป็น optional (สลับกัน)

### US-901.1: อัปโหลด Supplier list จาก Excel 🛡️👑 (v2.5.1)
**As a** admin/qc_admin, **I want to** อัปโหลดไฟล์ Excel (`Merged_Vendor_Supplier_List`) เพื่อ batch upsert Suppliers **so that** ไม่ต้องเพิ่ม/แก้ไขทีละแถวเมื่อมีการอัปเดต Vendor List

**Acceptance Criteria:**
- ปุ่ม "📤 Upload Excel" ใน Admin → Suppliers (admin/qc_admin เท่านั้น)
- Auto-detect sheet "Merged List" → fallback first sheet
- Auto-detect header row (สแกน ≤30 แถวแรก) มองหา `Sup sap Code` + `Supplier` พร้อมกัน
- Column aliases:
  - **Supcode** — `supcode`, `sup code`, `sup_code`
  - **SAP** — `sup sap code`, `sup_sap_code`, `sap code`, `vendor code`, `vendor sap code`
  - **Supplier Name** — `supplier`, `supplier name`, `sup_name`
  - **Purchase** — `purchase`, `type`, `import/local`
- Preview สถานะ per-row:
  - 🟢 **New** — ไม่พบ match ใน DB
  - 🟡 **Update** — match by `sup_code` (preferred — DB unique key) หรือ `sup_sap_code` (fallback เฉพาะกรณี Excel Supcode ว่าง)
  - 🔴 **Error** — ขาด SAP Code / ขาด Supplier Name / Sup Code (หรือ SAP fallback) ซ้ำในไฟล์
- **Trader pattern support** — รองรับกรณี SAP เดียวกัน + Sup Code ต่างกัน (เช่น HUAYI CORPORATION ใช้ SAP `10000148` ร่วมกัน 23 sub-suppliers, sup_code = "7S / 5U", "2Y / 5U", ...) ทุกแถวจะ import เป็นคนละราย เพราะ dedup ที่ `sup_code` ไม่ใช่ `sup_sap_code`
- Summary chip + ตาราง preview 50 แถวแรก
- กด "ยืนยันนำเข้า":
  - Update — เปลี่ยนเฉพาะ `sup_code / sup_sap_code / supplier_name / purchase / updated_by` (ไม่ทับ `category` / `status`)
  - Insert — `status='ACTIVE'`, `category=null`
- บันทึกผลลง `supplier_upload_log` (file_name / total / inserted / updated / errors)
- DB columns audit ใหม่: `suppliers.updated_at` (trigger touch) / `suppliers.updated_by` (patch-23)

### US-902: จัดการ Defect Codes 🛡️👑
**As a** admin/qc_admin, **I want to** เพิ่ม/แก้ไข/ลบ รหัสของเสีย พร้อม Type / Reason

### US-903: จัดการ Brand → Sales/SCM (v2.2) 👑
**As an** admin, **I want to** จัดการตาราง `brand_responsibilities` ที่ใช้กำหนด Sales/SCM ของแต่ละ brand **so that** ค่า Sales/SCM ใน QC Entry ตรงกับความรับผิดชอบจริงปัจจุบัน

**Acceptance Criteria:**
- Tab "Brand → Sales/SCM" ใน Admin Panel — **เห็นเฉพาะ admin role** (qc_admin ไม่เห็น)
- ตารางรายการ Brand ปัจจุบัน + Sales + SCM + Updated_at
- **CRUD ทีละแถว:** Add / Inline Edit / Delete พร้อม confirm
- Brand ที่บันทึกจะ normalize ก่อนเทียบ — `strip [*"']` + lowercase

### US-904: อัปโหลด Brand list หลายรายการ (v2.2) 👑
**As an** admin, **I want to** อัปโหลด Excel หรือ paste ตาราง brand หลายรายการ **so that** อัปเดต/เพิ่มได้รวดเร็วเมื่อมีการเปลี่ยน Sales/SCM ทั้งทีม

**Acceptance Criteria:**
- ปุ่ม "📤 อัปโหลด / Paste หลายรายการ"
- รองรับ:
  - Drag-drop ไฟล์ `.xlsx`
  - คลิกเลือกไฟล์
  - Paste TSV/CSV ลงในช่อง textarea (auto-detect delimiter)
- ขั้นตอน: เลือกไฟล์/วาง → ระบบ parse + แสดง preview diff
- Diff classification per row:
  - 🟢 **NEW** — brand ยังไม่มีใน table
  - 🟡 **UPDATE** — มีอยู่แล้วแต่ sales/scm ต่างกัน
  - ⚪ **UNCHANGED** — เหมือนเดิมทุกฟิลด์
  - 🔴 **ERROR** — header ไม่ตรงสเปก หรือ brand ว่าง
- Summary count + ปุ่ม "ยืนยันนำเข้า" / "ยกเลิก"
- กดยืนยัน → upsert by normalized brand

---

## Epic 10 — Guide & Help

### US-1001: ดูคู่มือใช้งานตาม Role 👷👀🛡️👑
**As a** ทุก role, **I want to** อ่านคู่มือการใช้งานในระบบ

---

## Epic 11 — SAP Code Parser (v2.1)

### US-1101: Parse SAP code ทั้งฝั่ง client + DB
**As a** system, **I want to** parse SAP code อัตโนมัติให้ผลลัพธ์ตรงกัน 2 ฝั่ง **so that** ข้อมูลใน UI และ DB sync เสมอ

**Acceptance Criteria:**
- TS function `parseSapCode()` ใน utils.ts
- DB function `parse_sap_code()` (PostgreSQL)
- Trigger `qc_orders_parse_sap`, `materials_parse_sap` populate 8 คอลัมน์ when sap_code insert/update
- Mapping เดียวกัน: Position 1 / 2 / 3 / 4 / 5+4 / 6+ / after `-`
- รองรับ rev "0" default ถ้าไม่มี dash

### US-1102: เพิ่ม mapping ใหม่โดยไม่ต้อง migrate ข้อมูล
**As a** developer, **I want to** เพิ่มประเภท/แก้ mapping โดยแก้แค่ที่เดียว **so that** maintenance ง่าย

**Acceptance Criteria:**
- TS: แก้ mapping ใน [`web/src/lib/utils.ts`](../web/src/lib/utils.ts)
- DB: แก้ function `parse_sap_code()` + run dummy update เพื่อ recompute
- ไม่ต้อง alter table หรือ migrate ข้อมูล

### US-1103: Index สำหรับ filter เร็ว
**As a** system, **I want to** มี B-tree indexes บน `sap_item_type`, `sap_item_group`, `sap_item_category`, `sap_base` **so that** Dashboard filter response < 500ms

---

## Epic 12 — Non-Functional / System

### US-1201: Bilingual Labels
- ทุกปุ่ม / label / heading มี "ไทย / English"

### US-1202: DD-MM-YYYY Date Format
- ทุกที่ที่แสดงวันที่ใช้ `fmtDate()` → DD-MM-YYYY

### US-1203: Auto-generated Order No / NCR No
- DB trigger `gen_order_no` → `QC<YY><MM><seq4>`
- DB trigger `gen_ncr_no` → `NCR<YY><MM><seq4>`

### US-1204: Session ไม่ค้าง
- `persistSession: false, autoRefreshToken: false`

### US-1205: Auth Loading Timeout
- AuthProvider Promise.race + timeout 6s

---

## Epic 14 — Reject Email Notification (v2.4.0)

### US-1401: ส่งอีเมลแจ้งเตือนอัตโนมัติเมื่อ save Reject 👷
**As a** system, **I want to** ส่งอีเมลพร้อม NCR PDF ไปยัง recipient list ทุกครั้งที่บันทึก Order = Reject **so that** ทีมที่เกี่ยวข้องรับทราบทันที

**Acceptance Criteria:**
- หลังกด "ยืนยันบันทึก" ใน Review popup ของ QC Entry ที่ status = Reject:
  1. โหลด order + details + NCR + creator
  2. Render NcrReport offscreen → html2pdf.js → PDF base64
  3. POST `/api/notify-reject` { order_id, pdf_base64, pdf_filename }
  4. API ส่งอีเมล bilingual (Thai + English) ผ่าน Nodemailer + Gmail SMTP
- Subject: `🔴 [QC Reject] <Order No> — <Description>`
- Body: Order info, % ของเสีย, defect list, link กลับไปหน้าระบบ
- Attach: `<NCR_No>.pdf` (1+ pages, A4 portrait, page-break-aware)
- Status chip ใน Success view: เตรียม PDF → ส่งอีเมล → สำเร็จ/ล้มเหลว
- Fire-and-forget: ไม่ block UI; ถ้า user ปิด browser ก่อน PDF gen เสร็จ → email อาจไม่มี PDF

### US-1402: Admin จัดการ recipient list 👑
**As an** admin, **I want to** เพิ่ม/แก้ไข/ลบ/ปิด-เปิดใช้งานอีเมลใน recipient list **so that** ควบคุมว่าใครจะได้รับแจ้งเตือน

**Acceptance Criteria:**
- Tab "📧 Reject Notify" ใน Admin Panel — เห็นเฉพาะ admin + qc_admin
- ตารางคอลัมน์: Email, Name, Role/Label, Enabled (chip ON/OFF), Actions
- ปุ่ม "+ เพิ่มอีเมล" → modal กรอก email/name/role_label + checkbox Enabled
- ปุ่ม "แก้ไข" / "ลบ" บนแต่ละแถว
- กด chip ON/OFF → toggle enabled แบบ inline
- RLS: read = authenticated, write = admin only
- Seed: `sls03@cometsintertrade.com` (Admin System) [ON]

### US-1403: qc_admin มีสิทธิ์ดู + ส่งทดสอบ + Preview (v2.4.0) 🛡️
**As a** qc_admin, **I want to** เข้า tab Reject Notify เพื่อทดสอบส่ง + ดู preview email **so that** ตรวจ format ก่อน + รู้ว่าระบบทำงานอยู่ — โดยไม่ต้องเป็น admin

**Acceptance Criteria:**
- qc_admin เห็น tab "📧 Reject Notify" (เดิม admin only)
- qc_admin ใช้ได้: ดูตาราง, "✉️ ส่งทดสอบ", "👁️ Preview email"
- qc_admin ใช้ไม่ได้ (admin only): "+ เพิ่มอีเมล", "แก้ไข", "ลบ", toggle ON/OFF
- ใน UI: rows มี chip enabled แต่กดไม่ได้ (read-only); column Actions แสดง "read-only"

### US-1404: Preview Email ก่อนส่งจริง 🛡️👑
**As an** admin/qc_admin, **I want to** ดู preview ของอีเมล + PDF ที่จะถูกส่ง **so that** ตรวจ subject, recipients, body, และ NCR PDF format ก่อน

**Acceptance Criteria:**
- ปุ่ม "👁️ Preview email" บนหัว tab
- กดแล้ว: ระบบหา Reject order ล่าสุด → load related rows → render PDF offscreen → fetch `/api/notify-reject?preview=true`
- Modal popup แสดง:
  - Subject ที่จะส่ง
  - To list (ทุก recipient ที่ enabled) — แสดงจำนวน + ลิสต์
  - Body — iframe sandboxed แสดง HTML email
  - 📎 PDF Attachment — iframe แสดง PDF + ปุ่ม "⬇ ดาวน์โหลด"
- Note: "Preview นี้แสดงข้อมูลเดียวกับที่จะถูกส่งจริง — ไม่ได้ส่ง email"

### US-1405: ส่งทดสอบ — ใช้ Reject order ล่าสุด 🛡️👑
**As an** admin/qc_admin, **I want to** กดปุ่มเดียวเพื่อส่ง email จริงไปยังทุก recipient ที่ enabled **so that** ทดสอบ end-to-end ว่าระบบใช้ได้

**Acceptance Criteria:**
- ปุ่ม "✉️ Test send"
- กดแล้ว: หา Reject order ล่าสุด → render PDF offscreen → ส่งอีเมลจริง พร้อม attachment
- ข้อความ feedback: `✅ ส่งทดสอบสำเร็จ (N ผู้รับ · แนบ PDF)` หรือ `❌ <error>`
- Send History ถูก refresh อัตโนมัติหลังกด

### US-1406: ประวัติการส่ง / Send History (v2.4.0) 🛡️👑
**As an** admin/qc_admin, **I want to** เห็นประวัติว่า Order ไหนถูกส่ง email ไปแล้ว เมื่อไหร่ ส่งให้ใครบ้าง **so that** audit + ตรวจสอบว่าระบบทำงาน

**Acceptance Criteria:**
- Section "📜 ประวัติการส่ง / Send History" ใต้ตารางผู้รับ — 50 รายการล่าสุด
- คอลัมน์: เวลา (DD/MM/YYYY HH:mm), Order No, NCR No, ผู้รับ (จำนวน), PDF (📎/—), สถานะ (chip ✓ Sent / ✗ Failed / ○ Skipped)
- Hover ช่อง "ผู้รับ" → tooltip แสดง emails ทั้งหมด
- Hover chip Failed → tooltip แสดง error detail
- ปุ่ม "🔄 รีเฟรช" สำหรับ manual reload
- Auto-refresh หลังกด Test send
- Source: ตาราง `notification_send_log` (RLS read = admin + qc_admin)

---

## Epic 13 — Security

### US-1301: RLS บังคับทุก Mutation
**As a** system, **I want to** บังคับ Row Level Security ทุก table

**Acceptance Criteria:**
- ทุก table เปิด RLS
- viewer mutate อะไรไม่ได้
- patch-12: profiles read-all (operator เห็นชื่อ qc_admin/admin ได้)
- patch-13: qc_orders update ขยายให้ operator (ยืนยัน order ของใครก็ได้)

### US-1302: Server-side Admin Operations
**As a** system, **I want to** เก็บ Secret Key ฝั่ง server เท่านั้น

### US-1303: Admin สามารถรีเซ็ตรหัสผ่านได้ (v2.2 — แทน US-1303 เดิม)
**As an** admin, **I want to** ตั้ง/รีเซ็ตรหัสของ User เดิมผ่าน Admin UI **so that** จัดการ credential ได้โดยไม่ต้องลบ+สร้าง user ใหม่

**Acceptance Criteria:**
- Edit User modal มีช่อง Password (เว้นว่างถ้าไม่เปลี่ยน) + ปุ่ม 🎲 Generate
- หลังบันทึก แสดง banner one-time พร้อมปุ่ม Copy
- Endpoint `/api/admin-users` PATCH รับ `password` field (ผ่าน service-role)
- ระบบเก็บแค่ bcrypt hash — ดูรหัสปัจจุบันไม่ได้ทุกกรณี (เป็น by-design ของ Supabase/OWASP)
- หมายเหตุ: นโยบาย "passwords locked" เดิม (v2.0) ถูกยกเลิกใน v2.2 เพราะ Admin ต้องการ recover รหัสที่ user ลืมโดยไม่ทำลายข้อมูล

### US-1304: ลบตัวเองไม่ได้
**As an** admin, **I should not** ลบ account ตัวเองได้

---

## Epic 15 — Login by Employee ID (v2.5.0)

### US-1501: Login ด้วยรหัสพนักงาน
**As a** ผู้ใช้, **I want to** กรอกแค่รหัสพนักงาน (เช่น `10503`) ใน Login **so that** ไม่ต้องจำ email ยาว ๆ

**Acceptance Criteria:**
- หน้า Login เปลี่ยน label "อีเมล / Email" → "User"
- Input type = `text` (ไม่ใช่ `email`) — บังคับ `@` ไม่ได้แล้ว
- Placeholder: "รหัสพนักงาน" (ไม่มีตัวอย่างเลข)
- เมื่อ submit: ถ้าค่าไม่มี `@` → auto-append `@cometsintertrade.com` ก่อนส่ง supabase.auth.signInWithPassword
- ถ้ากรอกเต็ม email เช่น `sls01@cometsintertrade.com` → ใช้ได้เหมือนเดิม (backward compat)

### US-1502: บัญชี Employee-ID มี 5 ราย
**As an** admin, **I want to** มีบัญชี 5 รายที่ login ด้วยรหัสพนักงาน

**Accounts (initial seed via scripts/seed-users-batch.mjs):**
- `10503@cometsintertrade.com` — ธิดารัตน์ จันทร์เดช (เบลล์) — qc_admin
- `11045@cometsintertrade.com` — รุ่งรัตน์ ธงวิชัย (อิ๋ว) — operator
- `11181@cometsintertrade.com` — วรสุนาถ คุณพรม (แทม) — admin
- `11262@cometsintertrade.com` — สายธาร เขียวจันทร์ (ปอ) — operator
- `11379@cometsintertrade.com` — อาภัทธสา แก้วสุวรรณ (บูม) — operator

รหัสผ่านสืบทอดจากบัญชี email เดิม (qc03 / saitan.kj27 / arpattasa / aewrungrut)

---

## Epic 16 — UI Polish (v2.5.0)

### US-1601: Defect รายแถวมีหน่วย (Unit)
**As an** operator, **I want to** ระบุหน่วยนับของของเสีย (ชิ้น / อัน / แท่ง / ตลับ หรือพิมพ์เอง)

**Acceptance Criteria:**
- ทุกแถว defect ใน QC Entry / SuccessModal / QCEdit มี dropdown หน่วย
- ตัวเลือก preset: ชิ้น, อัน, แท่ง, ตลับ
- ตัวเลือก "อื่นๆ" → text input โผล่ขึ้นใต้ dropdown ให้พิมพ์เอง
- DB column `qc_order_details.unit` (patch-21, free-text)
- หน่วยถูกแสดงต่อท้ายจำนวน: History list, NCR PDF, Order PDF, Reject email

### US-1602: Sup Code ค้นหาได้
**As an** operator, **I want to** ค้น Supplier ด้วยรหัส/SAP code/ชื่อ — ไม่ต้อง scroll ทั้ง list

**Acceptance Criteria:**
- Combobox แบบ search-as-you-type
- ค้นได้จาก: sup_code / sup_sap_code / supplier_name (3 field พร้อมกัน)
- ผลลัพธ์แบ่งกลุ่ม Import / Local / Other (sticky header)
- ปุ่ม × ล้างการเลือก
- Esc ปิด dropdown
- คลิกนอกช่อง → ปิดอัตโนมัติ

### US-1603: History ใช้สีตามสถานะ
**As a** user, **I want to** เห็นสถานะ Order ด้วยสีที่ต่างกัน

**Acceptance Criteria:**
- Accept = เขียว (emerald)
- Accept Lot = เหลือง (amber) — และแสดง % จริง (ไม่ใช่ "—")
- Reject = แดง (error)
- ใช้สีเดียวกันทั้ง % chip, status chip, group header

### US-1604: Thousand Separators
**As a** user, **I want to** เห็นตัวเลขจำนวนมีคอมมาคั่นทุก 3 หลัก

**Acceptance Criteria:**
- 1,000+ ขึ้นไปมี comma เช่น `20,000`
- Helper `fmtNum()` ใน utils.ts
- ใช้กับ: Received Qty, Sample Size, Defect Qty, Critical/Major/Minor totals, ทุก PDF + email

### US-1605: Rank Chip ชื่อเต็ม
**As a** user, **I want to** เห็น chip Severity เป็นชื่อเต็มใน History card

**Acceptance Criteria:**
- เปลี่ยน "C:0 M:0 m:1" → "Critical:0 Major:0 Minor:1"

### US-1606: InfoField แสดงข้อความยาวได้
**As a** user, **I want to** ไม่ให้ข้อความรายละเอียดสินค้า (เช่น `CHARMISS,BM,CUSHION,...`) ทับคอลัมน์ถัดไป

**Acceptance Criteria:**
- InfoField มี `min-w-0` + `break-words` + `[overflow-wrap:anywhere]`
- ข้อความยาว ๆ ที่ไม่มีช่องว่าง (มีแค่คอมมา) แบ่งบรรทัดได้

### US-1607: ลบ Supplier name ออกจาก History
**As a** user, **I want to** ไม่ให้แสดงชื่อ Supplier ในหน้า History

**Acceptance Criteria:**
- ลบ "Supplier: ..." จากการ์ดในรายการ
- ลบ InfoField "ผู้จัดจำหน่าย / Supplier" จาก Popup รายละเอียด
- ลบ InfoField เดียวกันจาก Popup NCR review
- การค้นหายังใช้ supplier_name ในการ filter ได้ (แค่ไม่แสดง)

### US-1608: SAP Breakdown Label Refresh
**As a** user, **I want to** label SAP breakdown ใหม่ที่กระชับ

**Acceptance Criteria:**
- "ประเภท / Item Type" → "ประเภทของ Item"
- "ที่มา / Item Source" → "ที่มาของ Item"
- "หมวด SAP / Item Category" → "Item-Category"
- "กลุ่ม SAP / Item Group" → "Item Group"
- "กลุ่มย่อย / Sub-Item Group" → "Sub-Item Group"
- ลบ Running No, Revision, "กลุ่มสินค้า (Master) / Product Category" ออกจาก QC Entry

### US-1609: เปลี่ยนชื่อ "เอกสารต้นฉบับ"
**As a** user, **I want to** เปลี่ยน label "เอกสารต้นฉบับ / Original Documents" → "สถานะเอกสาร"

**Acceptance Criteria:**
- เปลี่ยน 3 จุด: QC Entry form, SuccessModal popup, History detail popup
- DB column ยังคงชื่อเดิม (`original_doc_with`) — เปลี่ยนแค่ label ในหน้าจอ

### US-1610: Material Management โหลดข้อมูลครบ
**As an** admin, **I want to** เห็น Material ครบทุกรายการในหน้า Material Management

**Acceptance Criteria:**
- หน้า Material แสดงครบ ~19,070 รายการ (ไม่ใช่ 1,000 แรก)
- กรอง type filter (PK / FG / SG / Bulk / RM / etc.) ทำงานถูกต้องทุกค่า
- ตอน load ดึงเป็น chunk ละ 1,000 จนหมด (Supabase / PostgREST default max-rows = 1000)
- โหลดใช้เวลา ~3-5 วินาทีสำหรับ 19k records

---

## Epic 17 — DevOps (v2.5.0)

### US-1701: Vercel GitHub Auto-Deploy
**As a** developer, **I want to** ให้ Vercel deploy อัตโนมัติเมื่อ push ไป `main`

**Acceptance Criteria:**
- Vercel project `web` เชื่อมกับ `Datacomets/QC` ผ่าน GitHub App
- Production branch = `main`
- Root directory = `web`
- Frontend env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) ตั้งใน Vercel Environment Variables
- ทุก push ไป `main` → Vercel build + deploy ใน 1-2 นาที โดยไม่ต้องรัน CLI

---

## Epic 18 — PCM/PUR Buyer Tagging (v2.5.1)

### US-1801: บันทึก PCM และ PUR กับ Order
**As an** operator, **I want to** เลือกชื่อ PCM (สำหรับ Import) หรือ PUR (สำหรับ Local) ติดกับ Order **so that** ทราบว่าฝ่ายจัดซื้อคนไหนเป็นผู้รับผิดชอบสินค้านี้

**Acceptance Criteria:**
- DB columns ใหม่: `qc_orders.pcm`, `qc_orders.pur` (patch-22, both nullable text)
- UI dropdown — รายชื่อจาก `รายชื่อฝ่ายจัดซื้อ01.06.26.xlsx`
  - PCM: 9 ชื่อ (เดือนเพ็ญ, พัณณ์ภัสร์, ปาลิตา, ธัญชนก, นิชนันท์, วัชราภรณ์ สุดใจ, อัจฉราภรณ์, ยศวดี, สุปราณี)
  - PUR: 5 ชื่อ (วัชราภรณ์ รักษ์วงษ์, สุพัตรา, ณัฐฐาพร, น้ำเพชร, กาญจนา)
- ตัวเลือก "อื่นๆ (พิมพ์เอง)" → text input โผล่ขึ้นใต้ dropdown
- ค่าถูกเก็บใน DB และแสดงใน History detail popup + ใช้ในหน้า QCEdit

### US-1802: PCM/PUR แสดงตามประเภท Supplier
**As an** operator, **I want to** เห็นเฉพาะช่อง PCM หรือ PUR ที่ตรงกับประเภทของ Supplier เท่านั้น **so that** กรอกไม่ผิดฝั่ง

**Acceptance Criteria:**
- Supplier = **Import** → แสดงเฉพาะช่อง PCM (ซ่อน PUR)
- Supplier = **Local** → แสดงเฉพาะช่อง PUR (ซ่อน PCM)
- ยังไม่เลือก Supplier หรือ supplier kind อื่น → ซ่อนทั้งสองช่อง
- เปลี่ยน Supplier — ฝั่งที่ไม่ใช้ถูก clear อัตโนมัติ (ไม่ติดค่าค้าง)
- ตอนบันทึก — ฝั่งที่ไม่ใช้ถูก force เป็น `null` ใน DB
- ใช้ logic เดียวกันใน QCEntry + SuccessModal + QCEdit
- QCEdit ดึง `purchase` จาก `suppliers` table ตาม `sup_code` ตอน load order

### US-1803: Sup Code อยู่ก่อน PCM/PUR
**As an** operator, **I want to** เลือก Supplier ก่อน แล้วค่อยเห็นช่อง PCM/PUR ขึ้นมา **so that** flow การกรอกข้อมูลเป็นธรรมชาติ

**Acceptance Criteria:**
- ลำดับใน QC Entry master-info: Brand → Sales → SCM → **Sup Code** → **PCM / PUR** → Lot No. → ...
- ช่อง PCM/PUR ไม่แสดงจนกว่าจะเลือก Supplier ที่มีค่า purchase = Import หรือ Local

---

## Epic 19 — Data Quality & Migration (v2.5.1)

### US-1901: ชื่อ Brand ตรงตาม Company Brand Standard
**As an** admin, **I want to** ชื่อ Brand ใน DB ตรงกับ `Company Brand Standard.xlsx` **so that** การ join material → brand_responsibilities ไม่หลุดเพราะตัวสะกดต่างกัน

**Acceptance Criteria:**
- One-time migration: `scripts/normalize-brand-standard.mjs`
- `materials.brand`: ~4,580 rows updated (ตัวอย่าง: beW → BEWILD, 2P → 2P ORIGINAL, MERREZCA → MERREZ'CA, S2S → SIS2SIS, MT → MISTINE, BABYGLAM → BABY GLAM)
- `brand_responsibilities.brand`: 12 updated + 8 duplicate ลบทิ้ง
- หลัง migrate — ทุก material row link ไปยัง brand_responsibilities ที่ถูกต้องผ่าน brand exact match

### US-1902: ชื่อ Sales ตรงตาม Sales Customer Mapping
**As an** admin, **I want to** ชื่อ Sales ใน DB ตรงกับ `Sales_Customer x Sales.xlsx` **so that** Order ที่บันทึกใหม่เห็นชื่อ Sales ที่ถูกต้อง

**Acceptance Criteria:**
- One-time migration: `scripts/normalize-sales-by-customer.mjs`
- `materials.sales`: 5,534 rows updated
- `brand_responsibilities.sales`: 60 rows updated

### US-1903: เพิ่ม Brand ใหม่ + อัปเดต Sales ของ Order ใหม่
**As an** admin, **I want to** เพิ่ม Brand ที่อยู่ใน Sales Excel แต่ยังไม่มีใน `brand_responsibilities` และอัปเดตชื่อ Sales ของ Order เฉพาะวันที่ ≥ 26 มี.ค. 2026 **so that** ข้อมูลย้อนหลังไม่ถูกเปลี่ยนผิดบริบท

**Acceptance Criteria:**
- One-time migration: `scripts/sales-followup.mjs`
- INSERT 88 brand ใหม่เข้า `brand_responsibilities`
- UPDATE `qc_orders.sales` เฉพาะ `order_date >= 2026-03-26` (6 historical orders updated)
- Order ที่เก่ากว่านั้นไม่ถูกแตะ (เก็บ history ตามที่บันทึกตอนนั้น)

---

## Acceptance Criteria Tagging Convention

| Tag | Meaning |
|---|---|
| ✅ | Implemented & deployed in v2.5.1 |
| 🚧 | In progress |
| 📋 | Backlog (future phases) |

> ทุก US ในเอกสารนี้คือ ✅ (deployed v2.5.1) ยกเว้นที่ระบุไว้

---

## Backlog (Future User Stories — Phase 3+)

### Phase 3
- ~~📋 US-1401: Email notification เมื่อ NCR confirm → PCM~~ **DONE in v2.4.0** (ใช้ Gmail SMTP แทน Microsoft Graph — ดู Epic 14)
- 📋 US-1502: Bulk import QC Orders จาก Excel
- 📋 US-1503: Barcode/QR scanner กรอก SAP/Lot
- 📋 US-1504: NCR module ขยาย (root cause taxonomy, recurring issue tracking)

### Phase 4
- 📋 US-1501: Multi-approver workflow (QC → QA → Manager)
- 📋 US-1502: SAP integration ผ่าน API (real-time master data sync)
- 📋 US-1503: Mobile app (React Native หรือ PWA installable)

---

*ดู [PRD.md](PRD.md) สำหรับรายละเอียด feature spec และ data model*
