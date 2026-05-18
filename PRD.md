# Product Requirements Document (PRD)
# QC Inspection — ระบบสุ่มตรวจคุณภาพ

**Version:** 2.3.0
**Last Updated:** 18 พฤษภาคม 2026
**Owner:** Comets Intertrade Co., Ltd.
**Status:** Active (Production)
**Live URL:** https://web-mocha-three-44.vercel.app

---

## 1. Executive Summary

**QC Inspection** เป็น Web Application สำหรับบันทึกและจัดการผลการสุ่มตรวจคุณภาพสินค้าของ Comets Intertrade รวมถึงรายงาน NCR (Non-Conformance Report) อัตโนมัติเมื่อพบของไม่ผ่านมาตรฐาน ระบบรวมศูนย์ข้อมูลใน Supabase (PostgreSQL) ควบคุมสิทธิ์ตาม Role และมี Dashboard วิเคราะห์ภาพรวมพร้อมส่งออก Excel/PDF

### Goals
- บันทึกการสุ่มตรวจคุณภาพในฐานข้อมูลเดียว (ทดแทน Excel/กระดาษ)
- Auto-fill จาก Master Data + แยกประเภทสินค้าจาก SAP Code อัตโนมัติ → ลดเวลากรอกข้อมูล
- **Sales/SCM** ดึงจากตาราง brand_responsibilities (single source of truth) ที่ Admin จัดการได้ผ่าน UI
- ควบคุมการแก้ไขข้อมูลด้วย Approval Workflow (audit trail ครบ)
- Operator เป็นผู้กดยืนยัน + เลือกชื่อผู้อนุมัติ — แยกชัดเจนจากบทบาท QC Admin
- **Review-before-save popup** — Operator ตรวจ/แก้ไขข้อมูล + เลือกผู้อนุมัติ ก่อนยืนยันบันทึกจริง
- หลักฐานภาพถ่ายของเสีย 1-3 รูป/รายการ
- รายงาน % ของเสีย + Critical/Major/Minor อัตโนมัติ
- Dashboard วิเคราะห์ตาม Supplier / Brand / ช่วงเวลา + Export Excel/PDF
- จัดการ Master Data (Suppliers / Materials / Defects / Brand Responsibilities) ในตัว
- เอกสาร PDF: ใบ QC Inspection Report (รายตัว), Summary Report (รวมหลาย order), ใบ NCR

### Success Metrics
- บันทึก QC Order ≤ 3 นาที/ใบ
- ความถูกต้อง Auto-fill (จาก SAP Code) ≥ 95%
- Admin จัดการ User / Master Data ได้เองโดยไม่ต้องติดต่อ IT — รวมถึงรีเซ็ตรหัสผ่าน
- Dashboard ตอบสนอง ≤ 2s แม้มี data > 5,000 orders
- Brand-based Sales/SCM coverage ≥ 90% ของ orders (ที่เหลือ fallback จาก materials)

---

## 2. Target Users (Roles)

| Role | ชื่อในระบบ | สิทธิ์โดยสรุป |
|---|---|---|
| **Admin System** | `admin` | ทุกอย่าง — รวมจัดการ User |
| **QC Admin** | `qc_admin` | จัดการ Master Data + Need Edit + Dashboard + Material |
| **QC Staff** | `operator` | บันทึก QC + ดูประวัติ + **ยืนยันรับ Order (เลือกผู้อนุมัติ)** + แก้ไขเฉพาะของตัวเอง (เมื่อ admin อนุมัติ) |
| **Viewer** | `viewer` | ดู History + Dashboard + Material อย่างเดียว |

> รองรับการเพิ่ม role ใหม่ได้แบบ free-text (text column) — RLS ใช้ helper `current_role_level()`
>
> **เปลี่ยนใน v2.1:** ปุ่ม "ยืนยัน / Approve" ปัจจุบัน Operator เป็นคนกด (ไม่ใช่ admin/qc_admin) — Operator เลือกชื่อผู้อนุมัติจาก dropdown ที่กรองเฉพาะ `admin`/`qc_admin` หรือพิมพ์ชื่อ custom ได้

---

## 3. Pages & Navigation Map

| Path | หน้า | Roles ที่เข้าถึง |
|---|---|---|
| `/login` | Login (มีปุ่มแสดง/ซ่อนรหัส) | ทุกคน |
| `/` | History (หน้าแรกหลัง login, รวมงาน NCR แล้ว) | ทุก role ที่ login |
| `/entry` | บันทึก QC | ทุก role (viewer ไม่ควรเข้า) |
| `/edit/:orderId` | แก้ไข QC Order (เมื่อ `edit_approved=true`) | เจ้าของ order หรือ admin/qc_admin |
| `/dashboard` | Dashboard + Charts + Export | admin, qc_admin, viewer |
| `/materials` | Material Management | ทุกคน (ดู), admin/qc_admin (อัปโหลด) |
| `/admin` | Admin Panel (Suppliers / Defects / Users) | admin, qc_admin (เฉพาะ admin จัดการ Users) |
| `/guide` | คู่มือใช้งาน | ทุกคน (เนื้อหาตาม role) |

> **ลบใน v2.1:** เมนู `/ncr` แยก — รวมเข้า History page แล้ว เข้าผ่านปุ่ม **📋 NCR** ใน expanded view ของ Reject orders

### Top Navigation
```
ประวัติ / History  →  บันทึก QC / Entry  →  Dashboard*  →  Material  →  จัดการ / Admin*  →  คู่มือ / Guide
```
\* แสดงตามสิทธิ์

---

## 4. Feature Specifications

### 4.1 Authentication
- **Login:** Email + Password (สร้างโดย Admin System เท่านั้น)
- **Show/Hide Password:** ปุ่มไอคอนตา 👁️ ที่มุมขวาของช่อง Password — คลิกเพื่อเช็ครหัสที่พิมพ์
- **Session:** ไม่เก็บ session (`persistSession: false`) — Login ใหม่ทุกครั้งที่เปิดเว็บ
- **Logout:** ปุ่ม "ออก / Logout" ที่ Header
- **Password Policy (v2.2):** Admin สามารถตั้ง/รีเซ็ตรหัสของ User ผ่านหน้า Admin → Users → Edit
  - มีปุ่ม **🎲 สุ่ม** สร้างรหัส 12 ตัว (ไม่ใช้ 0/O/l/I เพื่อลดความสับสน)
  - หลังบันทึกจะแสดงรหัสใหม่ครั้งเดียวพร้อมปุ่มคัดลอก ให้ Admin จด/เก็บไว้ที่อื่น
  - Supabase Auth เก็บ **bcrypt hash เท่านั้น** — รหัสปัจจุบันดูไม่ได้ทุกกรณี ทำได้แค่ตั้งใหม่

### 4.2 บันทึก QC (QC Entry — `/entry`)

**Header Fields:**
| Field | Type | Auto-fill Source | Required |
|---|---|---|---|
| Order Status (Inspection Result) | Button group | — | ✅ (Accept / Accept Lot / Reject) |
| **เลขที่ Project Brief / Project Brief No.** (v2.2) | Text | — | ✅ |
| **วันที่รับเข้า / Received Date** (v2.2.1) | Date | — | optional |
| **วันที่ตรวจ / Inspection Date** (v2.2.1) | Date | วันนี้ | ✅ |
| **เลขที่ Order / Order No (ประมาณ)** (v2.2.1) | Display | `peek_next_order_no()` RPC | display (preview) |
| SAP Code | Text | — | ✅ |
| รายละเอียดสินค้า | Text | materials.description | display |
| **ประเภท / Item Type** | Display | parseSapCode (pos 1) | display |
| **ที่มา / Item Source** | Display | parseSapCode (pos 2) | display |
| **หมวด SAP / Item Category** | Display | parseSapCode (pos 3) | display |
| **กลุ่ม SAP / Item Group** | Display | parseSapCode (pos 4) | display |
| **กลุ่มย่อย / Sub-Item Group** | Display | parseSapCode (pos 4+5) | display |
| **Running No** | Display | parseSapCode (pos 6+) | display |
| **Revision** | Display | parseSapCode (after `-`) | display |
| กลุ่มสินค้า (Master) / Product Category | Display | materials.product_category | display |
| Brand | Display | materials.brand | display |
| **Sales / ฝ่ายขาย** (v2.2) | **Display (read-only)** | brand_responsibilities (fallback materials) | display |
| **SCM** (v2.2) | **Display (read-only)** | brand_responsibilities (fallback materials) | display |
| **Vendor Code / Sup SAP** (v2.2) | Text | — | optional |
| Sup Code | Display | suppliers (lookup by Vendor Code) | display |
| Lot No. | Text | — | optional |
| จำนวนรับ / Received Qty | Number | — | optional |
| จำนวนตรวจสอบ / Sample Size | Number | — | ✅ |
| หมายเหตุ / Note | Textarea | — | optional |
| **เอกสารต้นฉบับ / Original Documents** (v2.2.2) | Select | dropdown 4 + Custom | optional |
| **ผู้บันทึก / Recorded By** (v2.2.2) | Display | logged-in user (auto) | display |

> **ใหม่ใน v2.1:** SAP Code parser แยกโครงสร้างเป็น 7 ฟิลด์ (Item Type / Source / Category / Group / Sub-Group / Running / Revision) — แสดงเป็น Display fields แยกกัน ปรับ real-time
>
> **ใหม่ใน v2.2:**
> - **Project Brief No.** — required field ใกล้ ๆ SAP Code, บันทึกใน `qc_orders.project_brief_no`
> - **Sales/SCM ปรับเป็น display-only** — Operator แก้ไม่ได้จาก QC Entry; ดึงจากตาราง `brand_responsibilities` (lookup ด้วย brand ที่ normalize แล้ว — strip `*`/`"`/`'` + lowercase), fallback ไปใช้ `materials.sales/scm` ถ้า brand ไม่อยู่ใน table
> - **Supplier name input ถูกซ่อนจาก QC Entry** (เก็บใน DB ผ่าน lookup) — เหลือเฉพาะ Vendor Code (Sup SAP) input + Sup Code display อัตโนมัติ
>
> **ใหม่ใน v2.2.1:**
> - **2 ฟิลด์วันที่** — แทนที่ "วันที่ / Date" เดิมด้วย "วันที่ตรวจ / Inspection Date" (ใช้คอลัมน์ `order_date` เดิม, required) + เพิ่ม "วันที่รับเข้า / Received Date" (`received_date` ใหม่, optional)
> - **Order No preview** — แสดง "QC2605xxx (ประมาณ)" ในส่วน header ของฟอร์ม + ในปอปอัพ review โดยเรียก RPC `peek_next_order_no(p_date)` ตามวันที่ตรวจ
>   - Preview ไม่ reserve เลข — ถ้ามีคน insert ก่อน DB trigger จะ +1 ให้อัตโนมัติเมื่อ save จริง
>   - DB trigger `gen_order_no()` ใส่ `pg_advisory_xact_lock(hashtext('qc_order_no_seq'))` เพื่อ serialize concurrent INSERT → กันเลขซ้ำในระดับ DB

**Defect List (multi-select):**
- ค้นหารหัสของเสียและอาการ → เลือกได้หลายอันพร้อมกัน → "เพิ่มในรายการ" → รวมเป็น 1 แถว
- ระดับ: Critical / Major / Minor
- จำนวน: Integer
- รูปภาพ: 1-3 รูป/แถว (เก็บใน Supabase Storage bucket `defect-images`)

**Real-time Calculations:**
- `defect_qty = Σ quantity ของ defect ทั้งหมด`
- `good_qty = sample_size − defect_qty`
- `defect_percent = defect_qty / sample_size × 100` (generated column ใน DB)
- `critical_qty / major_qty / minor_qty` แยกตาม rank

**Status Buttons (Inspection Result):**
- ✅ ผ่าน / Accept
- 🟡 รับ Lot / Accept Lot
- ❌ ไม่ผ่าน / Reject — **ทริกเกอร์สร้าง NCR อัตโนมัติ**

**Post-Submit Flow (v2.2 — Review Before Save):**

เมื่อ Operator กดปุ่ม "บันทึก / Save" ใน QC Entry → **ไม่ insert ลง DB ทันที** แต่เปิด popup ให้ตรวจ/แก้ไขข้อมูลก่อนยืนยัน

**Review Popup (Stage 1):**
- แสดง preview ของ Order + Defect List ที่จะบันทึก
- **แก้ไขได้ในปอปอัพ:** Date, Lot No., Received Qty, Sample Size, Note
- **แก้ไข Defects ได้:** เปลี่ยน Critical Rank, เปลี่ยนจำนวน, ลบ/เพิ่ม/แก้รูปภาพ, ลบรายการ
- **เลือกผู้อนุมัติ** ที่นี่เลย — dropdown qc_admin/admin + Custom name option (ไม่ต้องไป approve ในหน้า History แยก)
- ปุ่ม **ยกเลิก / Cancel** → กลับไปแก้ในฟอร์ม / ปุ่ม **✓ ยืนยันบันทึก / Confirm Save**

**On Confirm Save:**
1. Insert `qc_orders` (+ trigger gen `order_no`, parse SAP, auto-create NCR ถ้า Reject)
2. Upload defect images ไป Storage `defect-images/<order_id>/...`
3. Insert `qc_order_details`
4. Set approval columns ตาม approver ที่เลือก (`approved=true`, `*_approved_by_name=...`, etc.)
5. แสดง Success view (Stage 2) — Order No + NCR No (ถ้ามี) + ปุ่ม ปิด/บันทึกใหม่
6. Reset form ของ QC Entry

> **Why:** ลดการบันทึกผิดพลาด — Operator มีโอกาสรีวิว/แก้ไขทุกอย่าง (รวม Defects + Approver) ก่อนข้อมูลเข้า DB; ไม่มี race window ที่ order ค้างเป็น Pending

### 4.3 SAP Code Structure (ใหม่ใน v2.1)

ระบบ parse `sap_code` ทั้งฝั่ง client (`parseSapCode()` ใน utils.ts) และฝั่ง DB (`parse_sap_code()` trigger function) ให้ผลตรงกัน

**โครงสร้าง:** `<base 5-8 digits>[-<revision>]`

| ตำแหน่ง | ความหมาย | ค่าที่เป็นไปได้ |
|---|---|---|
| **1** | Item Type | `1`=FG, `2`=SG, `3`=Bulk, `4`=PK, `5`=RM, `8`=SPARE PART, `9`=OPERATION SUPPLY, `0`=OTHER |
| **2** | Item Source | `1`=PRODUCTION, `2`=TRADING, `3`=CUSTOMER SUPPLY, `4`=CONSIGNMENT |
| **3** | Item Category | `1`=MAKEUP, `2`=FACIAL CARE, `3`=HAIR CARE, `4`=BODY CARE, `5`=FRAGRANCE, `6`=BEAUTY ACCESSORY, `7`=SOFT COMPONENTS, `0`=OTHER |
| **4** | Item Group | `1`=GIFT BOX, `2`=CARD, `3`=DOME, `4`=INNER, `5`=CARTON, `6`=STICKER, `7`=LABEL, `8`=WRAP, `9`=PACK, `0`=OTHER |
| **5** | Sub-Item Group | (mapping 30+ ค่า ขึ้นกับตำแหน่งที่ 4 — เช่น `41`=Paper Inner Box, `61`=Shade STK) |
| **6+** | Running No | เลข running (3-4 หลัก ไม่จำกัดยาว) |
| หลัง `-` | Revision | ถ้าไม่มีขีด → revision = `"0"` |

**ตัวอย่าง:** `42741000-1` → PK · TRADING · SOFT COMPONENTS · INNER › Paper Inner Box (Run 000) · Rev 1

> Mapping ทั้งหมดอยู่ใน [`web/src/lib/utils.ts`](../web/src/lib/utils.ts) และ DB function `parse_sap_code()` — แก้ครั้งเดียวมีผลทั้งสองฝั่ง

### 4.4 ประวัติ (History — `/`) — รวม NCR แล้ว

**Layout:**
- Header: ค้นหา + Filter Status + ปุ่ม **📥 PDF รวม (N)** + ปุ่ม "บันทึกใหม่"
- รายการ QC Orders **จัดกลุ่มตามสถานะ** (sticky group header):
  - ✓ อนุมัติแล้ว / Approved
  - ผ่าน / Accept
  - รับ Lot / Accept Lot
  - ❌ ไม่ผ่าน / Reject
  - ✏️ รอแก้ไข / Pending Edit
  - อื่น ๆ / Other (legacy)

**Each Card shows:**
- Order No, วันที่, Inspection Result chip, Approval chip (Pending/Approved สถานะ-specific), Edit chip
- **NCR chip** บน Reject orders ที่มี NCR (สี/label ตามสถานะ Open/In Progress/Closed)
- SAP Code + ประเภท chip + รายละเอียด, Brand, Supplier, Lot
- % ของเสีย + Critical/Major/Minor counts
  - **(v2.2)** สำหรับ status = **Accept Lot** แสดง `—` แทน `%` เพราะอัตราของเสียไม่ใช่เกณฑ์ตัดสินใจของ workflow นี้ (PDF + Dashboard ยังคำนวณ % ปกติ)

**Expanded View:**
- Header info ครบ + SAP breakdown line (ทุกตำแหน่ง)
- Edit reason (ถ้า admin อนุมัติแก้ไข)
- **กล่อง Approval Record** — แสดงผู้อนุมัติ + วันที่ตามสถานะที่ approve (Accept / Accept Lot / Reject)
- รายการของเสีย + รูปภาพ
- ปุ่ม Action

**Action Buttons (per role + per state):**
- **📄 PDF** (ทุก role) → เปิด modal preview ใบ QC Inspection Report → Download PDF
- **📋 NCR · NCR-No** (ถ้ามี NCR) → เปิด NCR modal (ดูข้อมูล Order + Defect Details + กรอก Root Cause/Corrective + Status + Save + Download NCR PDF)
- **✓ ยืนยันรับ / Confirm Accept** (operator only — label ตาม status):
  - Accept → "ยืนยันรับ / Confirm Accept"
  - Accept Lot → "ยืนยันรับ Lot / Confirm Accept Lot"
  - Reject → "ยืนยันการปฏิเสธ / Confirm Reject" *(v2.2 ปรับคำให้สุภาพ)*
  - คลิก → modal เลือกผู้อนุมัติ (dropdown qc_admin/admin หรือ Custom name) → Confirm
  - หมายเหตุ: ใน v2.2 Operator สามารถเลือกผู้อนุมัติได้ตั้งแต่ใน review popup ของ QC Entry แล้ว — ปุ่มนี้ใช้กรณี order ที่บันทึกแบบยังไม่ approve เท่านั้น
- **แก้ไขข้อมูล / Edit** — สิทธิ์เข้าหน้าแก้ไข `/edit/:orderId`
  - **(v2.3.0) ลบ Need Edit workflow** — เจ้าของ order, admin, qc_admin แก้ได้โดยตรงตลอดเวลา
  - **แก้ไข order ที่อนุมัติแล้ว** → ระบบ clear ทุก approval column (กลับเป็น Pending) เพราะข้อมูลเปลี่ยน → ต้อง re-approve ใหม่
  - Audit: ทุก edit INSERT row ใหม่ลง `qc_order_edit_log` (`edit_reason='แก้ไขข้อมูล / Direct edit'`)
  - คอลัมน์ `edit_approved`, `edit_reason`, `edit_approved_by`, `edit_approved_at` ใน DB ยังเก็บไว้ (audit history) แต่ไม่ได้ set true อีกแล้ว

**Two Independent States** (สำคัญ):
- `inspection_result` (Accept / Accept Lot / Reject) — กำหนดโดย Operator ตอนบันทึก
- `approval_status` (Pending / Approved) — กำหนดโดย Operator ตอนกดยืนยัน + เลือกชื่อผู้อนุมัติ
- ทั้งสองแยกกันอย่างสิ้นเชิง — ไม่ปะปนกัน

**Status-specific Approval Columns** (ใหม่ใน v2.1):
- เมื่อ approve → set ทั้ง generic (`approved`) และ status-specific (`accept_approved` / `acceptlot_approved` / `reject_approved`)
- เก็บผู้อนุมัติแยก: `accept_approved_by_name`, `acceptlot_approved_by_name`, `reject_approved_by_name` (text)
- ใช้ดู audit trail ได้แม่นยำ

### 4.5 NCR (Non-Conformance Report) — รวมใน History

**Auto-create:** เมื่อ Operator บันทึก order ที่ `status='Reject'` → DB trigger สร้าง NCR record อัตโนมัติ (ตาราง `ncr_reports`, NCR No format `NCR<YY><MM><seq4>`)

**NCR Modal (เปิดจากปุ่ม 📋 NCR ใน expanded view):**
- Header: NCR No + status chip + Order No + ปุ่ม PDF + Close
- **Order Information section** (read-only): Order No, Date, Result, SAP, Type, Brand, Description, Supplier, Sup Code, Lot, Sales, SCM
- **Inspection Summary table:** Sample / Good / Defect / Critical / Major / Minor / Defect %
- **Note** (ถ้ามี)
- **Defect Details:** รายการของเสีย + chip Rank + chip จำนวน + รูปภาพ thumbnail
- **NCR Form fields** (admin/qc_admin แก้ได้):
  - ปัญหาที่พบ / Problem Found
  - สาเหตุของปัญหา / Root Cause
  - การแก้ไข / Corrective & Preventive Action
  - การติดตามผล / Follow-up
- **Status:** Open / In Progress / Closed (admin/qc_admin เปลี่ยนได้)
- ปุ่ม **บันทึก NCR / Save** + **ยกเลิก / Cancel** (มี draft state)
- ปุ่ม **📄 PDF** → เปิด modal ซ้อนแสดงใบ NCR เต็มรูปแบบ A4 → Download

### 4.6 PDF Reports (ใหม่ใน v2.1)

**3 ประเภทเอกสาร:**

| เอกสาร | ปุ่ม | จุดสร้าง |
|---|---|---|
| **QC Inspection Report** (ราย Order) | 📄 PDF ใน History expanded | A4 portrait — Order info, Inspection Summary, Defect Details + รูป, Signatures (QC Inspector + QC Admin) |
| **QC Summary Report** (หลาย Order) | 📥 PDF รวม (N) ในหัว History | A4 landscape — KPI cards, ตาราง orders ทั้งหมด (filter ได้), TOTAL row |
| **NCR Document** | 📄 NCR PDF ใน NCR modal | A4 portrait — Order Info, Inspection Summary, Defect Details + รูป, Analysis & Action sections, 3 ลายเซ็น (QC Inspector / QC Admin / PCM Manager) |

ทั้งหมดใช้ html2canvas + jsPDF — render template hidden, capture, multi-page auto-split

### 4.7 Dashboard (`/dashboard`)

**Filter Bar (compact):**
- Date Range (From / To)
- Supplier / Brand / Product (search) / Inspector (created_by)

**KPI Cards:**
- Total Orders / Accept (รวม Accept Lot) / Reject / Avg Defect %

**Charts:**
- 📈 Defect Rate Trend (by month) — Line chart
- 🥧 Inspection Result Distribution — Pie chart (Accept / Accept Lot / Reject — ไม่มี Pending แล้ว)
- 📊 Top Suppliers by Defect Rate — Bar chart (top 10)
- 📊 Top Defects by Quantity — Bar chart (top 10)

**Supplier Scorecard:** เลือก Supplier ใน filter → scorecard ใต้ filter (Accept rate, Defect %, top defect codes)

**Export:**
- 📊 Excel — Summary + Orders + Top Suppliers + Top Defects (4 sheets)
- 📄 PDF — Snapshot ของหน้า Dashboard

### 4.8 Material Management (`/materials`)

**Top Section:**
- Last Upload info: วันที่ + ผู้อัปโหลด + ชื่อไฟล์ + chip new/updated/error
- ⚠️ Warning ถ้าไม่อัปเดต > 7 วัน (เห็นเฉพาะ admin/qc_admin)
- ปุ่ม **📤 Upload Material File** (.xlsx) — เฉพาะ admin/qc_admin

**Preview Before Import:**
- Auto-detect header row (หา cell "Material ID")
- แสดง 50 แถวแรก พร้อม highlight: 🟢 New / 🟡 Update / 🔴 Error (missing/duplicate)
- Summary: Total / New / Update / Error
- ปุ่ม ยืนยันนำเข้า / ยกเลิก

**Import Logic:** Upsert by `sap_code` (chunks of 500) → DB trigger ตั้ง `updated_at` + parse SAP breakdown ให้อัตโนมัติ → log ลง `material_upload_log`

**Data Table:**
- Search (Material ID / Description) + Filter by Category + **Filter by Type (FG/SG/Bulk/PK/RM/Other)** + Sort columns
- คอลัมน์: Material ID, **Type (chip)**, Description, Product Category, Base UoM, Cat. ID, Updated
- แสดง 1,000 แถวแรกหลัง filter (sticky header + scroll)

### 4.9 Admin Panel (`/admin`)

**Tab: Suppliers** (CRUD โดย admin/qc_admin)
- Fields: Sup Code*, SAP Code, Supplier Name*, Category, Status (ACTIVE/INACTIVE), Purchase (Import/Local)

**Tab: รหัสของเสีย / Defect Codes** (CRUD)
- Fields: Type → Reason → Running No. (Code) → Symptom (อาการ)
- Type/Reason เป็น combo field (มาตรฐาน + ค่าเดิม) — เพิ่มค่าใหม่ได้
- มาตรฐาน SD-QC-1909-004-00 Rev02

**Tab: Brand → Sales/SCM (v2.2 — admin role only)**
- จัดการตาราง `brand_responsibilities` — แหล่งข้อมูลหลักของ Sales/SCM ที่ QC Entry ดึงไปใช้
- **CRUD แบบทีละแถว:** Brand*, Sales, SCM (Inline edit + Delete)
- **อัปโหลด/Paste หลายรายการ:**
  - Drag-drop ไฟล์ `.xlsx` หรือคลิกเลือก
  - Paste TSV/CSV (auto-detect delimiter) จาก Excel/Google Sheets
  - แสดง preview diff: 🟢 NEW · 🟡 UPDATE · ⚪ UNCHANGED · 🔴 ERROR (header ไม่ถูก/brand ว่าง)
  - Summary count + ปุ่มยืนยัน/ยกเลิก → Upsert by brand
- Brand normalization บังคับ — `strip [*"']` + lowercase → ป้องกัน "BEET" กับ "*BEET" ซ้ำกัน
- **qc_admin ไม่เห็น tab นี้** (frontend gate); DB-level RLS ยังให้ qc_admin/admin เขียนได้

**Tab: Users** (เฉพาะ admin)
- ดู: full_name, email, role
- เพิ่ม user ใหม่ (POST /api/admin-users) — Email + **Role select dropdown** + Full Name + Password (min 6)
- Role select ใช้ `<select>` แสดง 4 default roles + ค่าเดิมจาก DB + "Custom" option (พิมพ์ role ใหม่)
- **(v2.2)** แก้ไข User เดิม — เปลี่ยน Email / Full Name / Role ได้ + **ตั้ง/รีเซ็ตรหัสผ่าน** (ปุ่ม 🎲 สุ่ม 12 ตัว หรือพิมพ์เอง)
  - หลังบันทึก → แสดง banner one-time แสดงรหัสใหม่ + ปุ่ม Copy ให้ Admin จดเก็บ
  - Supabase เก็บแค่ bcrypt hash — ดูรหัสปัจจุบันไม่ได้ ทำได้แค่ตั้งใหม่เท่านั้น
- ลบ user (ยกเว้นตัวเอง)

### 4.10 NCR Auto-Creation
- DB trigger `auto_create_ncr` ทำงาน on INSERT/UPDATE qc_orders เมื่อ status เปลี่ยนเป็น Reject
- Insert ลง `ncr_reports` ผูกกับ `order_id`
- Success popup ตอนบันทึก order Reject แจ้งเลข NCR

### 4.11 Guide (`/guide`)
- คู่มือ in-app, เนื้อหาตาม role
- Operator: Login → บันทึก QC → ประวัติ → ยืนยันรับ → FAQ
- QC Admin: + Master Data + Need Edit workflow + NCR review + Dashboard
- Admin: ครบ + Users management
- Viewer: + Dashboard, Material

---

## 5. Data Model

### Core Tables (PostgreSQL via Supabase)

**`profiles`** (extends `auth.users`)
- `id` UUID PK / FK `auth.users.id`
- `email`, `full_name`, `role text`
- **RLS (v2.1):** อ่านได้ทุก authenticated; เขียน admin only

**`suppliers`**
- `id` bigserial PK
- `sup_code unique`, `sup_sap_code`, `supplier_name*`, `category`, `status`, `purchase`

**`materials`** (Master Data, ~18,723 records)
- `sap_code text PK` (= Material ID)
- `description`, `product_category`, `base_uom`, `product_category_id`
- `brand`, `sales`, `scm`
- `created_at`, `updated_at`, `updated_by`
- **SAP breakdown columns (v2.1):** `sap_base`, `sap_revision`, `sap_item_type`, `sap_item_source`, `sap_item_category`, `sap_item_group`, `sap_sub_item_group`, `sap_running_no`
- Triggers: `trg_materials_updated_at`, `materials_parse_sap`

**`material_upload_log`**
- `id`, `file_name`, `uploaded_by`, `uploaded_at`, `total_rows`, `inserted_count`, `updated_count`, `error_count`

**`defects`** (~4,536 records)
- `defect_code text PK`, `symptom*`, `reason`, `type`

**`brand_responsibilities`** (v2.2 — primary source for Sales/SCM)
- `brand text PK` (normalized — strip leading `*"'` + lowercase ที่ frontend)
- `sales`, `scm`
- `updated_at`, `updated_by`
- เป็นแหล่งหลักของ Sales/SCM ที่ QC Entry ดึงไปใช้ (materials.sales/scm เป็น fallback)
- Admin จัดการผ่าน Admin Panel → Brand → Sales/SCM tab

**`qc_orders`**
- `id` bigserial PK, `order_no unique` (auto: `QC<YY><MM><seq4>`)
- `order_date` (วันที่ตรวจ / Inspection Date), `received_date` (วันที่รับเข้า, v2.2.1, nullable)
- `project_brief_no` (v2.2), `original_doc_with` (v2.2.2, nullable), `sap_code`, `material_description`, `brand`, `sales`, `scm`
- `sup_code`, `supplier_name`, `lot_no`
- `received_qty`, `sample_size*`, `good_qty`, `defect_qty`
- `critical_qty`, `major_qty`, `minor_qty`, `defect_percent` (generated column)
- `status` (Accept / Accept Lot / Reject) — inspection result
- `note`, `created_by` FK profiles, `created_at`
- **Edit tracking:** `edit_approved`, `edit_reason`, `edit_approved_by`, `edit_approved_at`
- **Approval tracking (generic):** `approved`, `approved_by`, `approved_at`, `approved_by_name`
- **Status-specific approval (v2.1):**
  - `accept_approved`, `accept_approved_by`, `accept_approved_at`, `accept_approved_by_name`
  - `acceptlot_approved`, `acceptlot_approved_by`, `acceptlot_approved_at`, `acceptlot_approved_by_name`
  - `reject_approved`, `reject_approved_by`, `reject_approved_at`, `reject_approved_by_name`
- **SAP breakdown (v2.1):** `sap_base`, `sap_revision`, `sap_item_type`, `sap_item_source`, `sap_item_category`, `sap_item_group`, `sap_sub_item_group`, `sap_running_no`
- Triggers: `qc_orders_gen_no`, `qc_orders_auto_ncr`, `qc_orders_parse_sap`

**`qc_order_details`**
- `id` PK, `order_id` FK ON DELETE CASCADE
- `defect_code`, `symptom`
- `critical_rank`, `quantity`
- `images text[]`

**`qc_order_edit_log`**
- `id`, `order_id`, `edit_reason*`, `approved_by`, `approved_at`, `edited_by`, `edited_at`

**`ncr_reports`**
- `id`, `ncr_no unique` (auto: `NCR<YY><MM><seq4>`)
- `order_id` FK qc_orders, `order_no`
- `problem_found`, `root_cause`, `corrective`, `follow_up`
- `status` (Open / In Progress / Closed)
- `created_by`, `created_at`, `closed_at`

### Storage
- Bucket: `defect-images` (public read)
- Path: `<order_id>/<detail_idx>-<timestamp>-<random>.<ext>`

### Key Database Triggers
- `qc_orders_gen_no` — auto-generate `order_no` on insert
  - **(v2.2.1)** ใส่ `pg_advisory_xact_lock(hashtext('qc_order_no_seq'))` เพื่อ serialize concurrent INSERTs → ป้องกัน race condition (เลขซ้ำ)
- `qc_orders_auto_ncr` — auto-insert `ncr_reports` on status='Reject'
- `qc_orders_parse_sap` — auto-populate SAP breakdown columns on insert/update of `sap_code`
- `materials_parse_sap` — same for materials
- `trg_qc_details_sync` — recalc totals on detail change
- `trg_materials_updated_at` — auto-set `updated_at`

### RPC Functions
- **`peek_next_order_no(p_date date)` → text** (v2.2.1) — preview เลข Order ถัดไปสำหรับวันที่ที่กำหนด, **ไม่ reserve เลข**; ใช้แสดงในฟอร์ม QC Entry ก่อน save จริง

---

## 6. Security & Access Control

### Row Level Security (RLS) — Updated in v2.1
ทุกตารางเปิด RLS — ใช้ helper function `current_role_level()`

| Table | Read | Insert | Update | Delete |
|---|---|---|---|---|
| profiles | **all authenticated** (v2.1) | admin | admin | admin |
| suppliers | authenticated | admin/qc_admin | admin/qc_admin | admin/qc_admin |
| materials | authenticated | admin/qc_admin | admin/qc_admin | admin/qc_admin |
| material_upload_log | authenticated | admin/qc_admin | admin/qc_admin | admin/qc_admin |
| defects | authenticated | admin/qc_admin | admin/qc_admin | admin/qc_admin |
| qc_orders | authenticated | auth.uid = created_by | **admin/qc_admin/operator (v2.1)** | admin/qc_admin |
| qc_order_details | authenticated | owner of order | owner or admin | cascade |
| ncr_reports | authenticated | trigger only | admin/qc_admin | admin |

> **Why v2.1 changes:**
> - **profiles read-all** — เพื่อ Operator เห็นรายชื่อในการเลือกผู้อนุมัติ (privacy ok เพราะ profiles ไม่มี sensitive data)
> - **qc_orders update for operator** — เพื่อให้ Operator ยืนยันรับ order ของใครก็ได้ (workflow ใหม่)

### API Security
- **Publishable Key (anon):** ใช้ใน client — บังคับด้วย RLS
- **Secret Key:** เก็บฝั่ง server (Vercel env) — ใช้ใน Vercel Function `/api/admin-users` เท่านั้น
- API endpoint ตรวจ token + role ก่อนทุก request (admin only)

### Password Policy (Updated v2.2)
- Admin สร้าง user ใหม่ → ตั้งรหัสตอนนั้น
- **Admin รีเซ็ตรหัสผู้ใช้เดิมได้ผ่าน Admin → Users → Edit** (เลิกใช้ "passwords locked" policy เดิม)
  - มีปุ่ม **🎲 สุ่ม** generate 12 ตัวอักษร (ไม่ใช้ตัว 0/O/l/I)
  - หลังบันทึกแสดง banner one-time ให้คัดลอกรหัสใหม่
- Min 6 ตัวอักษร (Supabase Auth requirement)
- Login page มีปุ่มแสดง/ซ่อนรหัส
- **Supabase Auth เก็บเฉพาะ bcrypt hash** — แม้ admin/service-role ก็ดูรหัสปัจจุบันไม่ได้ ทำได้แค่ตั้งใหม่
- หากต้องการเก็บรหัสนอกระบบ (เพื่อบันทึก) Admin ต้องจดเองตอน banner ปรากฏ — ระบบไม่เก็บที่อื่น

---

## 7. Technical Stack

### Frontend
- React 18 + TypeScript + Vite 5
- TailwindCSS (custom design system "The Precision Ledger")
- React Router v6
- React hooks + Context (AuthProvider)
- Recharts (Dashboard)
- SheetJS (xlsx)
- jsPDF + html2canvas (PDF reports)

### Backend
- PostgreSQL (Supabase)
- Supabase Auth (Email/Password)
- Supabase Storage (`defect-images`)
- Vercel Serverless Functions (`/api/admin-users`)

### Deployment
- Hosting: Vercel
- Stable URL: https://web-mocha-three-44.vercel.app
- Source: https://github.com/Datacomets/QC
- CI/CD: Auto-deploy on push to main

---

## 8. Non-Functional Requirements

### Performance
- Initial page load < 3s
- Search/autocomplete < 500ms
- Image upload < 10s/image
- Auth timeout 6s safety net
- Dashboard render < 2s with up to 5,000 orders
- PDF generation < 5s (per order) / < 15s (summary 100+ orders)

### Compatibility
- Modern browsers (Chrome 90+, Edge 90+, Safari 14+)
- Mobile responsive (Tailwind sm/md/lg)

### Localization
- ทุก label เป็น **bilingual** (ไทย / English)
- รูปแบบวันที่: **DD-MM-YYYY**
- Order No: `QC<YY><MM><seq4>` · NCR No: `NCR<YY><MM><seq4>`

### Data Retention
- QC Orders / Details / Images / NCR / Edit log / Material upload log: **indefinite** (audit trail)

---

## 9. Done in v2.3.0 (เพิ่มจาก v2.2.3)

- ✅ **ลบ Need Edit workflow** — เจ้าของ order, admin, qc_admin แก้ Order ได้โดยตรงตลอดเวลา ไม่ต้องผ่านขั้น "Need Edit" ของ admin อีกแล้ว
- ✅ History: ลบปุ่ม "✏️ ต้องแก้ไข / Need Edit" + modal กรอกเหตุผล + handler `requestEdit()` ออกหมด
- ✅ QCEdit: guard เปลี่ยนเป็น (owner OR admin/qc_admin) อย่างเดียว
- ✅ Edit ทุกครั้งบน approved order → clear approval state (กลับเป็น Pending)
- ✅ Edit ทุกครั้ง → INSERT log row ใหม่ (`edit_reason='แก้ไขข้อมูล / Direct edit'`)
- ✅ Guide ปรับ section "Need Edit Workflow" → "แก้ไข Order หลังบันทึก"

## Done in v2.2.3 (เพิ่มจาก v2.2.2)

- ✅ **Operator self-edit** — เจ้าของ order แก้ไขข้อมูลของตัวเองได้ตลอดเวลาโดยไม่ต้องให้ admin กด Need Edit ปลดล็อก
- ✅ **Approval state cleared on self-edit** — ถ้า order ถูก approve ไปแล้วและเจ้าของแก้ไข ระบบ clear approval columns ทุก field (กลับเป็น Pending) → ต้อง re-approve ใหม่เพื่อความถูกต้องของ audit
- ✅ **Self-edit audit log** — INSERT row ใหม่ลง `qc_order_edit_log` พร้อม `edit_reason='แก้ไขโดยเจ้าของ / Self-edit by owner'` ทุกครั้งที่เจ้าของแก้ไขแบบไม่ผ่าน admin
- ✅ **UX:** Self-Edit Mode banner ในหน้า `/edit/:orderId` อธิบาย flow + แจ้งว่า approval จะถูกรีเซ็ต (ถ้าเคย approve)

## Done in v2.2.2 (เพิ่มจาก v2.2.1)

- ✅ **เอกสารต้นฉบับ / Original Documents** — dropdown ใหม่ในส่วน Remarks (คุณอู๋ / WH / PD / SCM / Custom) บันทึกในคอลัมน์ `qc_orders.original_doc_with`
- ✅ **Recorded By (display)** — แสดงชื่อ logged-in user อัตโนมัติในฟอร์ม QC Entry, Review popup, History expanded view (read-only; ใช้ `created_by → profiles.full_name`)
- ✅ DB patches: 17

## Done in v2.2.1 (เพิ่มจาก v2.2)

- ✅ **Received Date** — เพิ่มฟิลด์ "วันที่รับเข้า / Received Date" (optional) ใน QC Entry, Review popup, QCEdit, History expanded view, OrderReport PDF, NcrReport PDF
- ✅ **Inspection Date label** — relabel "วันที่ / Date" → "วันที่ตรวจ / Inspection Date" ทุกที่ (form, popup, edit, history, PDFs)
- ✅ **Order No preview** — แสดงเลขถัดไป `QC<YYMM><seq4>` ในฟอร์ม + popup ผ่าน RPC `peek_next_order_no(p_date)` (อัพเดต real-time เมื่อเปลี่ยน inspection date)
- ✅ **Race-safe order_no** — DB trigger `gen_order_no()` ใส่ `pg_advisory_xact_lock` กันเลขซ้ำเมื่อ INSERT พร้อมกัน
- ✅ DB patches: 16

## Done in v2.2 (เพิ่มจาก v2.1)

- ✅ **Review-before-save popup** — บันทึก QC ผ่าน 2 ขั้น (ตรวจ/แก้ → ยืนยัน)
  - แก้ Header fields, Defects (rank/qty/images), เลือกผู้อนุมัติได้ใน popup
  - Insert qc_orders + qc_order_details + upload images + set approval ทำตอนกด "ยืนยัน" เท่านั้น
- ✅ **Brand → Sales/SCM lookup** ผ่าน `brand_responsibilities` table
  - QC Entry: Sales/SCM กลายเป็น **display-only** — single source of truth
  - Brand normalization (strip `*`, `"`, `'` + lowercase) ครอบคลุม "*BEET" ↔ "BEET"
  - Map-based cache โหลดครั้งเดียวตอน component mount
- ✅ **Admin → Brand → Sales/SCM tab (admin only)**
  - CRUD ทีละแถว + Excel upload + drag-drop + TSV/CSV paste
  - Diff preview NEW/UPDATE/UNCHANGED/ERROR ก่อน upsert
- ✅ **Project Brief No.** — required field ใน QC Entry; เก็บใน `qc_orders.project_brief_no`
- ✅ **Supplier UI refactor ใน QC Entry**
  - ลบ input "ชื่อผู้จัดจำหน่าย" (เก็บไว้ใน DB ผ่าน lookup)
  - เหลือ Vendor Code (Sup SAP) input + Sup Code display
- ✅ **Admin password reset** — reverse "passwords locked" policy เดิม
  - Edit User modal มี Password field + ปุ่ม 🎲 สุ่ม 12 chars
  - One-time banner หลังบันทึกแสดงรหัสใหม่ + ปุ่ม Copy
  - `/api/admin-users` PATCH รองรับ email + password
- ✅ **Accept Lot defect % แสดง "—"** ในการ์ดหน้า History (PDF + Dashboard ยังคำนวณปกติ)
- ✅ **Label rename** — "ยืนยันปฏิเสธ" → "ยืนยันการปฏิเสธ" ทั้ง History card, ปุ่มอนุมัติ, Confirm modal
- ✅ **Guide rewrite** — คู่มือ in-app ปรับให้ตรงกับ feature ทั้งหมดของ v2.2
- ✅ **DB patches:** 15 (project_brief_no)

---

## 10. Out of Scope (V2.2)

- Email notifications (NCR confirm → PCM team) — แผนไว้สำหรับ v3.0 (ต้องตั้งค่า Microsoft Graph / Outlook OAuth)
- Bulk import QC orders จาก Excel
- Multi-language beyond Thai/English
- Mobile native app
- SSO (Microsoft/Google)
- Multi-approver workflow (QC → QA → Manager)
- Real-time SAP integration

---

## 11. Future Roadmap

### Phase 3 (Q3-Q4 2026)
- **Email notification** สำหรับ NCR confirm → PCM (ผ่าน Microsoft Graph API + MSAL.js)
  - Setup: Azure AD app registration + delegated permissions (Mail.Send, User.Read)
  - Send NCR PDF as attachment to PCM emails
- Bulk import QC orders จาก Excel
- Barcode/QR scanner กรอก SAP/Lot
- NCR module ขยาย (root cause taxonomy, recurring issue tracking)

### Phase 4 (2027)
- Mobile app (React Native หรือ PWA installable)
- Multi-approver workflow (QC → QA → Manager)
- SAP integration ผ่าน API (real-time master data sync)

---

## 12. Initial Data (สถานะปัจจุบัน 15 พ.ค. 2026)

**Users:** 10 active accounts
- 1 admin (sls03 — Admin System)
- 1 qc_admin (qc03 — ธิดารัตน์ จันทร์เดช)
- 4 operator (สายธาร, อาภัทธสา, รุ่งรัตน์ จาก QC; sls02 จาก Sales)
- 4 viewer (พี่แม๊ะ, พี่พลอย, พี่เมย์, พี่กิ๊ฟ — PCM team)

> รหัสผ่านไม่เก็บในเอกสารนี้ — admin (sls03) ถือไว้ใน `users-passwords.csv` (gitignored) และตั้ง/รีเซ็ตได้ผ่าน Admin UI

**Master Data:**
- **Suppliers:** ~90 records
- **Materials:** ~18,723 records (managed via Material Management page)
- **Defect Codes:** ~4,536 records (ตาม SD-QC-1909-004-00 Rev02)
- **Brand Responsibilities (v2.2):** ~136 records — seeded จาก Sales/SCM Responsibility Excel

---

## 13. Release Notes

### v2.3.0 — 18 พฤษภาคม 2026
- **ลบ Need Edit workflow ออกหมด** — ปุ่ม "✏️ ต้องแก้ไข" + modal กรอกเหตุผลในหน้า History
- Edit Order ตรงๆ ทันที — เจ้าของ order และ admin/qc_admin มีปุ่ม "แก้ไขข้อมูล / Edit" ตลอดเวลา
- ทุก edit บน approved order → reset approval เป็น Pending
- ทุก edit → INSERT row ใหม่ใน `qc_order_edit_log`
- Guide ปรับให้ตรง

### v2.2.3 — 18 พฤษภาคม 2026
- **Operator self-edit own orders** — เจ้าของ order แก้ไขได้ตลอด ไม่ต้องให้ admin ปลดล็อก
- Approved order ที่เจ้าของแก้ → approval state รีเซ็ตเป็น Pending → ต้อง re-approve
- Self-edit log: INSERT row ใหม่ลง `qc_order_edit_log` (audit trail ครบ)
- ไม่ต้อง DB migration — RLS ปัจจุบันรองรับอยู่แล้ว (operator มี UPDATE policy)

### v2.2.2 — 18 พฤษภาคม 2026
- Add **Original Documents** dropdown (คุณอู๋ / WH / PD / SCM / Custom) in Remarks section
- Display **Recorded By** auto-filled from logged-in user (QC Entry / popup / History)
- DB patches: 17

### v2.2.1 — 18 พฤษภาคม 2026
- **Received Date** field (optional) + relabel "Date" → "Inspection Date" ทุกที่
- **Order No preview** ในฟอร์ม + popup ผ่าน RPC `peek_next_order_no`
- **Race-safe `gen_order_no()`** ด้วย `pg_advisory_xact_lock` กันเลขซ้ำใต้ concurrent insert
- DB patches: 16

### v2.2 — 15 พฤษภาคม 2026
- **Review-before-save popup** — แก้ข้อมูล + Defects + เลือกผู้อนุมัติใน popup ก่อน insert จริง
- **Brand → Sales/SCM lookup** — ดึงจาก `brand_responsibilities` (single source of truth)
- **Admin → Brand → Sales/SCM tab** (admin only) — CRUD + Excel/TSV upload + diff preview
- **Project Brief No.** required field ใน QC Entry
- **Supplier UI refactor** — เหลือ Vendor Code + Sup Code (auto), ซ่อน Supplier name input
- **Admin password reset** — Edit User modal + ปุ่ม Generate + one-time banner; reverse "passwords locked" policy
- **Accept Lot defect %** แสดง "—" ในการ์ด History
- **Label rename** — ยืนยันปฏิเสธ → ยืนยันการปฏิเสธ
- **Guide** rewrite ให้ตรงกับ feature v2.2
- DB patches: 15

### v2.1 — 9 พฤษภาคม 2026
- **SAP Code parser** (7-dimensional breakdown) — TS + DB trigger
- **Approval workflow** — Operator confirm + chooses approver name
- **NCR** moved into History (no separate page)
- **PDF Reports** (3 types: per-order, summary, NCR)
- **Login** show/hide password
- **Admin Users** — proper Role select dropdown
- **Materials** — Type column + Type filter
- **RLS** — profiles read-all + qc_orders update for operator
- **DB patches:** 10, 11, 12, 13, 14
- User profile renames + qc02 → qc03

### v2.0 — 28 เมษายน 2026
- Major: Dashboard / Material Management / NCR auto / Status separation
- Minor: History grouping, Approval split, Owner-check edit, Password lock

### v1.0 — 17 เมษายน 2026
- Initial release: Login, QC Entry (auto-fill, multi-defect, images), History, Edit approval, Admin panel, Bilingual UI, Guide

---

## 14. Contact & Support

- **Developer:** Datacomets (data.comets@gmail.com)
- **Source Code:** https://github.com/Datacomets/QC
- **Live URL:** https://web-mocha-three-44.vercel.app
- **Supabase Project:** https://supabase.com/dashboard/project/ruknpxlnvxgpraxkktfi
- **User Stories:** ดู [USER_STORIES.md](USER_STORIES.md)

---

*This PRD is a living document. Update version + date when features change.*
