# User Stories — QC Inspection Web App

**Version:** 2.1
**Last Updated:** 9 พฤษภาคม 2026
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

### US-105: Admin แก้ไขข้อมูล User 👑
**As an** admin, **I want to** แก้ไข Full Name + Role ของ User เดิม **so that** อัปเดตข้อมูลให้ตรงปัจจุบัน

**Acceptance Criteria:**
- ปุ่ม "แก้ไข" ในแต่ละแถว
- Modal เปิดพร้อมข้อมูลเดิม
- แก้ Full Name + Role ได้ — **ไม่มีช่อง Password** (locked)
- Role select ใช้ dropdown เดียวกันกับ Add

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
**As an** operator, **I want to** กรอก SAP Code แล้วให้ Brand / Sales / SCM / Description ปรากฏอัตโนมัติ **so that** ลดเวลากรอก

**Acceptance Criteria:**
- พิมพ์ SAP Code → debounce 400ms → query `materials` table
- พบ → fill Brand, description, product_category, base_uom, sales, scm
- ไม่พบ → ช่องว่าง, ใส่เองได้
- เปลี่ยน SAP Code อีกครั้ง → ข้อมูลเก่าหายไป

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

### US-207: Success Popup สรุปข้อมูล 👷
**As an** operator, **I want to** เห็น popup สรุปหลังบันทึก **so that** ตรวจสอบความถูกต้อง

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

---

## Epic 4 — Approval & Edit Workflow

### US-401: Operator ยืนยันรับ Order + เลือกผู้อนุมัติ (v2.1) 👷
**As an** operator, **I want to** กดปุ่ม "ยืนยัน" แล้วเลือกชื่อผู้อนุมัติจาก dropdown หรือพิมพ์ชื่อเอง **so that** บันทึกการรับ order + ระบุผู้รับผิดชอบ

**Acceptance Criteria:**
- ปุ่ม label เปลี่ยนตามสถานะ:
  - Accept → "✓ ยืนยันรับ / Confirm Accept"
  - Accept Lot → "✓ ยืนยันรับ Lot / Confirm Accept Lot"
  - Reject → "✓ ยืนยันปฏิเสธ / Confirm Reject"
- คลิก → Modal เปิดพร้อม:
  - แสดง Order No + ผลตรวจ
  - **Dropdown** "ผู้อนุมัติ / Approver" — แสดงเฉพาะ role `admin` + `qc_admin` พร้อม label
  - Option **+ พิมพ์ชื่อเอง / Custom name…** → input field โผล่ขึ้นมา
- กด **✓ ยืนยัน** → บันทึก:
  - `approved=true`, `approved_by=<UUID หรือ NULL>`, `approved_by_name=<text>`, `approved_at=now`
  - เซ็ตคอลัมน์ status-specific (เช่น `accept_approved=true`, `accept_approved_by_name=...`)
- ผู้กดต้องเป็น role `operator` เท่านั้น — admin/qc_admin/viewer **ไม่เห็นปุ่มนี้**

### US-402: Admin/QC Admin ขอให้แก้ไข Order 🛡️👑
**As a** admin/qc_admin, **I want to** กด "ต้องแก้ไข" + ใส่เหตุผล **so that** ปลดล็อกให้เจ้าของ Order แก้ข้อมูล

### US-403: Operator แก้ไข Order ของตัวเอง 👷
**As an** operator, **I want to** แก้ไข Order ของตัวเองเมื่อได้รับอนุมัติแล้ว **so that** แก้ข้อมูลที่ผิดได้

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

### US-901: จัดการ Suppliers 🛡️👑
**As a** admin/qc_admin, **I want to** เพิ่ม/แก้ไข/ลบ Supplier

### US-902: จัดการ Defect Codes 🛡️👑
**As a** admin/qc_admin, **I want to** เพิ่ม/แก้ไข/ลบ รหัสของเสีย พร้อม Type / Reason

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

### US-1303: Password Locked Once Set
**As a** system, **I want to** ไม่มี UI ให้เปลี่ยนรหัสผู้ใช้เดิม **so that** Admin ควบคุม credential

### US-1304: ลบตัวเองไม่ได้
**As an** admin, **I should not** ลบ account ตัวเองได้

---

## Acceptance Criteria Tagging Convention

| Tag | Meaning |
|---|---|
| ✅ | Implemented & deployed in v2.1 |
| 🚧 | In progress |
| 📋 | Backlog (future phases) |

> ทุก US ในเอกสารนี้คือ ✅ (deployed v2.1) ยกเว้นที่ระบุไว้

---

## Backlog (Future User Stories — Phase 3+)

### Phase 3
- 📋 US-1401: Email notification เมื่อ NCR confirm → PCM (Microsoft Graph + MSAL.js + Outlook OAuth)
  - Setup Azure AD app registration (delegated permissions: Mail.Send, User.Read)
  - Send NCR PDF as attachment
  - DB columns: `confirmed`, `confirmed_by`, `confirmed_at`, `email_sent_status`, `email_sent_at`, `email_error`
- 📋 US-1402: Bulk import QC Orders จาก Excel
- 📋 US-1403: Barcode/QR scanner กรอก SAP/Lot
- 📋 US-1404: NCR module ขยาย (root cause taxonomy, recurring issue tracking)

### Phase 4
- 📋 US-1501: Multi-approver workflow (QC → QA → Manager)
- 📋 US-1502: SAP integration ผ่าน API (real-time master data sync)
- 📋 US-1503: Mobile app (React Native หรือ PWA installable)

---

*ดู [PRD.md](PRD.md) สำหรับรายละเอียด feature spec และ data model*
