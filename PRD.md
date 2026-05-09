# Product Requirements Document (PRD)
# QC Inspection — ระบบสุ่มตรวจคุณภาพ

**Version:** 2.1
**Last Updated:** 9 พฤษภาคม 2026
**Owner:** Comets Intertrade Co., Ltd.
**Status:** Active (Production)
**Live URL:** https://web-mocha-three-44.vercel.app

---

## 1. Executive Summary

**QC Inspection** เป็น Web Application สำหรับบันทึกและจัดการผลการสุ่มตรวจคุณภาพสินค้าของ Comets Intertrade รวมถึงรายงาน NCR (Non-Conformance Report) อัตโนมัติเมื่อพบของไม่ผ่านมาตรฐาน ระบบรวมศูนย์ข้อมูลใน Supabase (PostgreSQL) ควบคุมสิทธิ์ตาม Role และมี Dashboard วิเคราะห์ภาพรวมพร้อมส่งออก Excel/PDF

### Goals
- บันทึกการสุ่มตรวจคุณภาพในฐานข้อมูลเดียว (ทดแทน Excel/กระดาษ)
- Auto-fill จาก Master Data + แยกประเภทสินค้าจาก SAP Code อัตโนมัติ → ลดเวลากรอกข้อมูล
- ควบคุมการแก้ไขข้อมูลด้วย Approval Workflow (audit trail ครบ)
- Operator เป็นผู้กดยืนยัน + เลือกชื่อผู้อนุมัติ — แยกชัดเจนจากบทบาท QC Admin
- หลักฐานภาพถ่ายของเสีย 1-3 รูป/รายการ
- รายงาน % ของเสีย + Critical/Major/Minor อัตโนมัติ
- Dashboard วิเคราะห์ตาม Supplier / Brand / ช่วงเวลา + Export Excel/PDF
- จัดการ Master Data (Suppliers / Materials / Defects) ในตัว
- เอกสาร PDF: ใบ QC Inspection Report (รายตัว), Summary Report (รวมหลาย order), ใบ NCR

### Success Metrics
- บันทึก QC Order ≤ 3 นาที/ใบ
- ความถูกต้อง Auto-fill (จาก SAP Code) ≥ 95%
- Admin จัดการ User / Master Data ได้เองโดยไม่ต้องติดต่อ IT
- Dashboard ตอบสนอง ≤ 2s แม้มี data > 5,000 orders
- ไม่ต้องเก็บรหัสผ่านนอกระบบ — Admin สร้างให้, ระบบ lock ไว้

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
- **Password Policy:** เมื่อตั้งครั้งแรกแล้ว **ไม่มี UI ให้เปลี่ยน/รีเซ็ต** — ถ้าลืมต้องลบ user แล้วสร้างใหม่

### 4.2 บันทึก QC (QC Entry — `/entry`)

**Header Fields:**
| Field | Type | Auto-fill Source | Required |
|---|---|---|---|
| วันที่ / Date | Date | วันนี้ | ✅ |
| Order Status (Inspection Result) | Button group | — | ✅ (Accept / Accept Lot / Reject) |
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
| Sales | Text (editable) | materials.sales | ✅ |
| SCM | Text (editable) | materials.scm | ✅ |
| Sup SAP / Sup Code / Supplier | Text | suppliers (lookup) | display |
| Lot No. | Text | — | optional |
| จำนวนรับ / Received Qty | Number | — | optional |
| จำนวนตรวจสอบ / Sample Size | Number | — | ✅ |
| หมายเหตุ / Note | Textarea | — | optional |

> **ใหม่ใน v2.1:** SAP Code parser แยกโครงสร้างเป็น 7 ฟิลด์ (Item Type / Source / Category / Group / Sub-Group / Running / Revision) — แสดงเป็น Display fields แยกกัน ปรับ real-time

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

**Post-Save:**
- Popup สรุปข้อมูล (read-only) — รวม SAP breakdown + NCR No (ถ้า Reject)
- Order No: `QC<YY><MM><seq4>` (เช่น `QC26050001`) — auto-generated by trigger
- Reset form

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
  - Reject → "ยืนยันปฏิเสธ / Confirm Reject"
  - คลิก → modal เลือกผู้อนุมัติ (dropdown qc_admin/admin หรือ Custom name) → Confirm
- **✏️ ต้องแก้ไข / Need Edit** (admin/qc_admin) → modal ขอเหตุผล → set `edit_approved=true`
- **แก้ไขข้อมูล / Edit** (เจ้าของ order หรือ admin เมื่อ `edit_approved=true`) → ไป `/edit/:orderId`

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

**Tab: Users** (เฉพาะ admin)
- ดู: full_name, email, role
- เพิ่ม user ใหม่ (POST /api/admin-users) — Email + **Role select dropdown** + Full Name + Password (min 6)
- Role select ใช้ `<select>` แสดง 4 default roles + ค่าเดิมจาก DB + "Custom" option (พิมพ์ role ใหม่)
- แก้ไข Full Name + Role เท่านั้น (ไม่มีฟิลด์เปลี่ยนรหัส)
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

**`brand_responsibilities`**
- `brand text PK`, `sales`, `scm`

**`qc_orders`**
- `id` bigserial PK, `order_no unique` (auto: `QC<YY><MM><seq4>`)
- `order_date`, `sap_code`, `material_description`, `brand`, `sales`, `scm`
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
- `qc_orders_auto_ncr` — auto-insert `ncr_reports` on status='Reject'
- `qc_orders_parse_sap` — auto-populate SAP breakdown columns on insert/update of `sap_code`
- `materials_parse_sap` — same for materials
- `trg_qc_details_sync` — recalc totals on detail change
- `trg_materials_updated_at` — auto-set `updated_at`

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

### Password Policy
- ตั้งครั้งเดียวตอน Add User
- ไม่มี UI ให้เปลี่ยน/รีเซ็ต — ถ้าลืม → admin ลบ user แล้วสร้างใหม่ด้วย email เดิม
- Min 6 ตัวอักษร (Supabase Auth requirement)
- Login page มีปุ่มแสดง/ซ่อนรหัส (เช็คตอนพิมพ์ได้)

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

## 9. Done in v2.1 (เพิ่มจาก v2.0)

- ✅ **SAP Code parser** — แยก 7 มิติ (Type / Source / Item Category / Item Group / Sub-Group / Running / Revision)
  - Pure function ใน TS (`parseSapCode`) + DB trigger (`parse_sap_code`) — ผลตรงกัน 2 ฝั่ง
  - DB columns: 8 ช่อง × 2 ตาราง (qc_orders + materials) + indexes
- ✅ **Approval workflow change** — Operator เป็นคนกดยืนยัน (ไม่ใช่ admin)
  - Modal เลือกชื่อผู้อนุมัติจาก dropdown (qc_admin/admin) หรือ Custom name
  - บันทึก `*_by_name` text columns รองรับชื่อนอกระบบ
- ✅ **NCR consolidated to History** — ลบ `/ncr` route, รวมเข้า History expanded view
  - ปุ่ม 📋 NCR เปิด modal ที่มี Order info + Defect Details + Form + PDF
- ✅ **PDF Reports**
  - QC Inspection Report (ราย order, A4 portrait)
  - QC Summary Report (หลาย order, A4 landscape, มี filter)
  - NCR Document (A4 portrait, signatures 3 ตำแหน่ง)
- ✅ **Login page show/hide password** (👁️ toggle)
- ✅ **Admin Users** — Role dropdown ใช้ `<select>` ปกติ + Custom option (datalist เดิมไม่ตอบสนอง)
- ✅ **Materials page** — เพิ่มคอลัมน์ Type chip + filter by Type
- ✅ **RLS update** — profiles read-all, qc_orders update for operator
- ✅ **User profile updates** — ชื่อจริงผู้ใช้ปัจจุบัน (สายธาร, รุ่งรัตน์, ธิดารัตน์); qc02 → qc03

---

## 10. Out of Scope (V2.1)

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

## 12. Initial Data (สถานะปัจจุบัน 9 พ.ค. 2026)

**Users:** 8 active accounts
- 1 admin (Admin System)
- 1 qc_admin (QC Admin)
- 2 operator (QC Staff)
- 4 viewer

> รหัสผ่านไม่เก็บในเอกสารนี้ — admin (sls03) ถือไว้

**Master Data:**
- **Suppliers:** ~90 records
- **Materials:** ~18,723 records (managed via Material Management page)
- **Defect Codes:** ~4,536 records (ตาม SD-QC-1909-004-00 Rev02)

---

## 13. Release Notes

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
