# appQC — The Precision Ledger

ระบบบันทึกการสุ่มตรวจคุณภาพ (QC) ของ Comets Intertrade พร้อม Admin Panel และฐานข้อมูล Supabase

## 🏗️ Stack
- **Frontend:** React 18 + Vite + TypeScript + Tailwind (Design System: The Precision Ledger)
- **Backend / DB / Auth:** Supabase
- **Seed / Setup:** Node scripts + xlsx

## 📁 โครงสร้าง
```
appQC/
├── .env                   # Supabase URL + keys (gitignored)
├── supabase/schema.sql    # ⚠️  ต้องรันครั้งแรกใน Supabase SQL Editor
├── scripts/               # seed users + import master data
│   ├── test-connection.mjs
│   ├── seed-users.mjs
│   └── seed-master.mjs
├── web/                   # Vite + React app
└── Sup/ … *.xlsx          # ไฟล์ต้นทาง (Supplier / Defect / Material)
```

## 🚀 Setup ครั้งแรก

### 1. รัน SQL schema
เปิด [Supabase SQL Editor](https://supabase.com/dashboard/project/ruknpxlnvxgpraxkktfi/sql/new) → paste ไฟล์ `supabase/schema.sql` → **Run**

### 2. ติดตั้ง dependencies
```bash
npm install              # root (สำหรับ seed scripts)
cd web && npm install    # web app
```

### 3. Seed ข้อมูลเริ่มต้น
```bash
npm run test:conn        # ตรวจสอบการเชื่อมต่อ
npm run seed:users       # สร้าง 3 users
npm run seed:master      # import suppliers, defects, materials
```

### 4. รันเว็บ
```bash
cd web && npm run dev
# → http://localhost:5173
```

## 👤 บัญชีเริ่มต้น

| Email | Password | Role |
|---|---|---|
| sls01@cometsintertrade.com | Comets@2026 | **admin** |
| sls02@cometsintertrade.com | Comets@2026 | **operator** |
| sls03@cometsintertrade.com | Comets@2026 | **qc_admin** |

## 🧮 สูตรคำนวณ
```
% ของเสีย = (Critical + Major + Minor) / จำนวนตรวจสอบ × 100
```
คำนวณอัตโนมัติทั้งฝั่ง UI และ generated column ใน Postgres

## 🔐 Row Level Security
- **operator** — บันทึกและแก้ไข QC order ของตัวเอง
- **qc_admin** — จัดการ QC orders และ master data ได้ทั้งหมด
- **admin** — จัดการ users ได้เพิ่มเติม
