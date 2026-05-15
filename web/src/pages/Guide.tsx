import { useAuth } from '../lib/auth';

export default function Guide() {
  const { profile } = useAuth();
  const role = profile?.role || 'operator';
  const isQcAdmin = role === 'qc_admin' || role === 'admin';
  const isAdmin = role === 'admin';

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">คู่มือการใช้งาน</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          QC Inspection v2.2 — ระบบสุ่มตรวจคุณภาพ • คุณเข้าสู่ระบบในฐานะ <span className="chip chip-active ml-1">{role}</span>
        </p>
      </div>

      {/* ภาพรวม + Roles */}
      <Section title="ภาพรวมระบบ / Roles">
        <p>Web Application สำหรับบันทึก / ติดตามการสุ่มตรวจคุณภาพสินค้า รวม NCR และ Dashboard วิเคราะห์</p>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <RoleCard title="Operator" desc="QC Staff" access="บันทึก QC + ยืนยันรับ" active={role === 'operator'} />
          <RoleCard title="QC Admin" desc="QC หัวหน้า" access="+ Master Data + Need Edit + NCR" active={role === 'qc_admin'} />
          <RoleCard title="Admin" desc="System Admin" access="+ Users + Brand Sales/SCM" active={role === 'admin'} />
          <RoleCard title="Viewer" desc="ผู้ดูข้อมูล" access="ดู Dashboard / Material" active={role === 'viewer'} />
        </div>
      </Section>

      {/* Login */}
      <Section title="การเข้าสู่ระบบ">
        <Steps steps={[
          'เปิดเว็บ → หน้า Login',
          'กรอก Email ที่ Admin สร้างให้',
          'กรอก Password (มีปุ่ม 👁️ ดูรหัสที่พิมพ์ได้)',
          'กดปุ่ม "เข้าสู่ระบบ"',
          'เข้าหน้าประวัติ / History อัตโนมัติ',
        ]} />
        <InfoBox text="ทุกครั้งที่เปิดเว็บหรือปิดแท็บ ต้อง Login ใหม่ • บัญชีสร้างได้โดย Admin System เท่านั้น" />
      </Section>

      {/* บันทึก QC */}
      <Section title="บันทึก QC / QC Entry">
        <h3 className="font-display font-semibold text-base mb-2">ขั้นที่ 1: กรอกข้อมูลหลัก</h3>
        <Table headers={['ฟิลด์', 'คำอธิบาย']} rows={[
          ['วันที่ / Date', 'วันที่ตรวจ — default = วันนี้'],
          ['Project Brief No. *', 'หมายเลขใบ Project Brief (จำเป็น)'],
          ['SAP Code *', 'รหัสสินค้า — กรอกแล้ว Description / Brand / Sales / SCM จะขึ้นอัตโนมัติ'],
          ['SAP Breakdown', '7 ฟิลด์ derived: Item Type / Source / Category / Group / Sub-Group / Running / Revision'],
          ['Sales / SCM', 'อ่านอย่างเดียว — ดึงจาก brand_responsibilities ตาม Brand'],
          ['Vendor Code (Sup SAP)', 'รหัส Supplier จาก SAP — กรอกแล้ว Sup Code ขึ้นอัตโนมัติ'],
          ['Lot No.', 'หมายเลข Lot (optional)'],
          ['จำนวนรับ / Received', 'จำนวนรับเข้าทั้งหมด (optional)'],
          ['จำนวนตรวจสอบ / Sample Size *', 'จำนวนที่สุ่มตรวจ (จำเป็น)'],
          ['สถานะ / Status *', 'Accept / Accept Lot / Reject (จำเป็น)'],
        ]} />
        <InfoBox text="Status = Reject → ระบบสร้าง NCR (Non-Conformance Report) อัตโนมัติพร้อมเลข NCR" />

        <h3 className="font-display font-semibold text-base mt-6 mb-2">ขั้นที่ 2: เพิ่มรายการของเสีย</h3>
        <Steps steps={[
          'พิมพ์ค้นหารหัสของเสียหรือชื่ออาการ',
          'คลิกเลือกได้หลายอาการพร้อมกัน (ติ๊ก ✅)',
          'กด "เพิ่มในรายการ" → รวมเป็น 1 แถว',
          'เลือกระดับ Critical / Major / Minor',
          'กรอกจำนวนที่พบ',
          'แนบรูปภาพได้สูงสุด 3 รูป/แถว',
        ]} />

        <h3 className="font-display font-semibold text-base mt-6 mb-2">ขั้นที่ 3: ตรวจสอบและบันทึก</h3>
        <div className="bg-surface-lowest rounded-md p-4 mb-3">
          <div className="text-center font-display font-bold text-primary">
            % ของเสีย = (Critical + Major + Minor) / จำนวนตรวจสอบ × 100
          </div>
        </div>
        <Steps steps={[
          'กรอกหมายเหตุ (ถ้ามี)',
          'กดปุ่ม "ตรวจสอบและบันทึก / Review & Save"',
          'Popup จะขึ้น — แต่ยังไม่บันทึก DB',
        ]} />
        <InfoBox text="ข้อมูลจะถูกบันทึกจริง เมื่อกด Save ในหน้า popup เท่านั้น — กด Cancel = ทิ้งข้อมูลโดยไม่บันทึก" />
      </Section>

      {/* Popup */}
      <Section title="หน้า Popup ตรวจสอบก่อนบันทึก">
        <p className="mb-3">Popup รวมการตรวจ + แก้ไข + เลือกผู้อนุมัติ + บันทึก ในหน้าจอเดียว</p>

        <h3 className="font-display font-semibold text-base mb-2">สิ่งที่แก้ได้ใน Popup</h3>
        <Table headers={['ฟิลด์', 'แก้ได้']} rows={[
          ['วันที่ / Date', '✅'],
          ['Sales / SCM / SAP / Sup Code / Brand', '🔒 อ่านอย่างเดียว (มาจาก master data)'],
          ['Lot No., จำนวนรับ, จำนวนตรวจสอบ', '✅'],
          ['หมายเหตุ / Note', '✅'],
          ['Defect: rank (Critical/Major/Minor)', '✅'],
          ['Defect: จำนวน', '✅'],
          ['Defect: ลบรายการ / ลบรูป / เพิ่มรูป', '✅'],
          ['SAP Code / สถานะ / เพิ่ม defect ใหม่', '✗ (กด Cancel กลับไปแก้ในฟอร์ม)'],
        ]} />

        <h3 className="font-display font-semibold text-base mt-4 mb-2">เลือกผู้อนุมัติ (Approver)</h3>
        <Steps steps={[
          'Dropdown แสดงรายชื่อ admin / qc_admin (Role ที่อนุมัติได้)',
          'หรือเลือก "+ พิมพ์ชื่อเอง" สำหรับผู้อนุมัตินอกระบบ',
          'เว้นว่างไว้ก็ได้ — ไปกดยืนยันใน History ทีหลัง',
        ]} />

        <h3 className="font-display font-semibold text-base mt-4 mb-2">ปุ่มบันทึก (ป้ายเปลี่ยนตามสถานการณ์)</h3>
        <Table headers={['สถานการณ์', 'ป้ายปุ่ม']} rows={[
          ['เลือกผู้อนุมัติแล้ว', '✓ บันทึก + ยืนยัน / Save & Confirm'],
          ['ไม่ได้เลือกผู้อนุมัติ', '✓ บันทึก / Save'],
        ]} />
        <InfoBox text="หลังบันทึกสำเร็จ Popup เปลี่ยนเป็นหน้า '✓ Saved' โชว์ Order No + NCR No (ถ้ามี) — copy / จดได้ก่อนปิด" />
      </Section>

      {/* ประวัติ */}
      <Section title="ประวัติ / History">
        <p className="mb-3">หน้าแรกหลัง Login — จัดกลุ่มตามสถานะ Order</p>
        <h3 className="font-display font-semibold text-base mb-2">การจัดกลุ่ม</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>✓ อนุมัติแล้ว / Approved</li>
          <li>ผ่าน / Accept (รออนุมัติ)</li>
          <li>รับ Lot / Accept Lot (รออนุมัติ)</li>
          <li>❌ ไม่ผ่าน / Reject (รออนุมัติ)</li>
          <li>✏️ รอแก้ไข / Pending Edit</li>
        </ul>

        <h3 className="font-display font-semibold text-base mt-4 mb-2">ปุ่มในแต่ละ Order</h3>
        <Table headers={['ปุ่ม', 'หน้าที่', 'ใครใช้']} rows={[
          ['📄 PDF', 'ดู / Download QC Inspection Report (A4)', 'ทุก role'],
          ['📋 NCR (เลข NCR)', 'เปิดฟอร์ม NCR + Download NCR PDF (ถ้า Order = Reject)', 'ทุก role'],
          ['✓ ยืนยันรับ', 'Operator เลือกผู้อนุมัติแล้วยืนยัน — เปลี่ยน Pending → Approved', 'operator'],
          ['✏️ ต้องแก้ไข / Need Edit', 'อนุมัติให้ Operator แก้ไข Order (ขอเหตุผล)', 'qc_admin / admin'],
          ['แก้ไขข้อมูล / Edit', 'แก้ Order หลัง Need Edit ถูกอนุมัติ', 'เจ้าของ order'],
        ]} />

        <h3 className="font-display font-semibold text-base mt-4 mb-2">ปุ่มด้านบน</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li><b>📥 PDF รวม (N)</b> — สรุป Order หลายใบเป็น PDF A4 landscape</li>
          <li><b>Filter Status</b> — กรองตามสถานะหรือสถานะอนุมัติ</li>
          <li><b>ค้นหา</b> — ค้นด้วย Order No / SAP / Brand / Supplier</li>
        </ul>
      </Section>

      {/* Dashboard */}
      {(isQcAdmin || role === 'viewer') && (
        <Section title="Dashboard">
          <p className="mb-3">ภาพรวมการสุ่มตรวจ — เห็นได้สำหรับ admin / qc_admin / viewer</p>
          <h3 className="font-display font-semibold text-base mb-2">Filter</h3>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>Date Range (From / To)</li>
            <li>Supplier / Brand / Product (SAP) / Inspector</li>
          </ul>

          <h3 className="font-display font-semibold text-base mt-4 mb-2">KPI Cards</h3>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>Total Orders</li>
            <li>Accept (รวม Accept Lot)</li>
            <li>Reject</li>
            <li>Avg Defect %</li>
          </ul>

          <h3 className="font-display font-semibold text-base mt-4 mb-2">Charts</h3>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>📈 Defect Rate Trend by Month (Line)</li>
            <li>🥧 Inspection Result Distribution (Pie)</li>
            <li>📊 Top Suppliers by Defect Rate (Bar, top 10)</li>
            <li>📊 Top Defects by Quantity (Bar, top 10)</li>
          </ul>

          <h3 className="font-display font-semibold text-base mt-4 mb-2">Export</h3>
          <Table headers={['ปุ่ม', 'ผลลัพธ์']} rows={[
            ['📊 Excel', '4 sheets: Summary / Orders / Top Suppliers / Top Defects'],
            ['📄 PDF', 'Snapshot ของหน้า Dashboard'],
          ]} />
        </Section>
      )}

      {/* Material */}
      <Section title="Material Management">
        <p className="mb-3">ดู / อัปโหลด Master Data ของสินค้า (~19,000 รายการ)</p>
        <h3 className="font-display font-semibold text-base mb-2">การค้นหาและกรอง</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>Search ตาม Material ID / Description</li>
          <li>Filter by Category</li>
          <li>Filter by Type (FG / SG / Bulk / PK / RM / SPARE PART / OPERATION SUPPLY / OTHER)</li>
          <li>Sort columns ได้</li>
        </ul>

        {isQcAdmin && (
          <>
            <h3 className="font-display font-semibold text-base mt-4 mb-2">อัปโหลด Material File (admin / qc_admin)</h3>
            <Steps steps={[
              'กดปุ่ม "📤 Upload Material File"',
              'เลือกไฟล์ .xlsx',
              'ระบบหา header row (มี "Material ID") อัตโนมัติ',
              'ดู Preview: 🟢 New / 🟡 Update / 🔴 Error',
              'กด "ยืนยันนำเข้า" → upsert by SAP Code',
            ]} />
            <InfoBox text="ระบบจะ parse SAP Code อัตโนมัติเป็น 7 มิติ (Item Type / Source / Category / Group / Sub-Group / Running / Revision) ผ่าน DB trigger" />
          </>
        )}
      </Section>

      {/* QC Admin section */}
      {isQcAdmin && (
        <>
          <div className="border-t-2 border-primary/20 pt-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              สำหรับ QC Admin {isAdmin && '/ Admin'}
            </h2>
          </div>

          <Section title="จัดการ Suppliers">
            <p className="mb-3">Admin → tab "ผู้จัดจำหน่าย / Suppliers"</p>
            <Steps steps={[
              'กด "+ เพิ่ม Supplier"',
              'กรอก: Sup Code* / SAP Code / Supplier Name* / Category / Status / Purchase',
              'กดบันทึก',
            ]} />
            <p className="text-sm mt-2">แก้ / ลบ → ปุ่มในแต่ละแถว</p>
          </Section>

          <Section title="จัดการรหัสของเสีย / Defect Codes">
            <p className="mb-3">Admin → tab "รหัสของเสีย"</p>
            <Steps steps={[
              'กด "+ เพิ่มรหัสของเสีย"',
              'เลือก Type (Dropdown หรือพิมพ์เพิ่ม)',
              'เลือก Reason (Dropdown หรือพิมพ์เพิ่ม)',
              'กรอก Running No. + Symptom',
              'กดบันทึก',
            ]} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-surface-lowest rounded-md p-3">
                <div className="text-xs uppercase text-on-surface-variant mb-1">Type มาตรฐาน</div>
                <ol className="text-sm space-y-0.5 list-decimal list-inside">
                  <li>Defect/ข้อเสียหาย</li>
                  <li>Repair/ซ่อม</li>
                  <li>Short Shipment/ส่งของขาด</li>
                  <li>Scrap/ใช้ไม่ได้</li>
                  <li>Supplier/ผู้ผลิต</li>
                  <li>Customer/ลูกค้า</li>
                </ol>
              </div>
              <div className="bg-surface-lowest rounded-md p-3">
                <div className="text-xs uppercase text-on-surface-variant mb-1">Reason มาตรฐาน</div>
                <ol className="text-sm space-y-0.5 list-decimal list-inside">
                  <li>Logo/สิ่งพิมพ์</li>
                  <li>Appearance/ลักษณะที่ปรากฎ</li>
                  <li>Function/การใช้งาน</li>
                  <li>Component/ส่วนประกอบ</li>
                  <li>Bulk/ตัวยา</li>
                  <li>Machine/เครื่องจักร</li>
                </ol>
              </div>
            </div>
          </Section>

          <Section title="Need Edit Workflow">
            <p className="mb-3">qc_admin/admin อนุมัติให้ Operator แก้ Order หลังบันทึกไปแล้ว</p>
            <Steps steps={[
              'ใน History → expand Order ที่ต้องแก้',
              'กดปุ่ม "✏️ ต้องแก้ไข / Need Edit"',
              'กรอกเหตุผล (เช่น "Sample size ผิด")',
              'กดยืนยัน — Order มี chip "✏️ รอแก้ไข"',
              'Operator จะเห็นปุ่ม "แก้ไขข้อมูล" — แก้แล้ว save ใหม่',
            ]} />
          </Section>

          <Section title="NCR Workflow">
            <p className="mb-3">เมื่อ Order = Reject → ระบบสร้าง NCR อัตโนมัติ (เลข NCR-YYMM-XXXX)</p>
            <Steps steps={[
              'ใน History → expand Reject order → กดปุ่ม "📋 NCR"',
              'Modal เปิด — ดู Order info + Defect Details + Inspection Summary',
              'กรอก Problem Found / Root Cause / Corrective / Follow-up',
              'เลือก Status: Open / In Progress / Closed',
              'กด "บันทึก NCR"',
              'กด "📄 PDF" เพื่อ download ใบ NCR (A4 portrait)',
            ]} />
          </Section>
        </>
      )}

      {/* Admin-only */}
      {isAdmin && (
        <>
          <div className="border-t-2 border-primary/20 pt-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">สำหรับ Admin System (เท่านั้น)</h2>
          </div>

          <Section title="จัดการ Brand → Sales/SCM">
            <p className="mb-3">Admin → tab "Brand → Sales/SCM" (admin role เห็นเท่านั้น)</p>
            <p className="text-sm mb-2">ใช้เป็น single source of truth สำหรับ Sales / SCM ที่ดึงไปเติมในหน้า QC Entry อัตโนมัติ</p>

            <h3 className="font-display font-semibold text-base mt-3 mb-2">เพิ่ม Brand ทีละตัว</h3>
            <Steps steps={[
              'กด "+ เพิ่ม / Add Brand"',
              'กรอก Brand (เช่น "2P") + Sales + SCM',
              'กดบันทึก',
            ]} />

            <h3 className="font-display font-semibold text-base mt-4 mb-2">เพิ่มหลาย Brand พร้อมกัน</h3>
            <Steps steps={[
              'กด "📤 อัปโหลด / Paste"',
              'ลาก .xlsx ลงในกล่อง หรือคลิกเลือกไฟล์ (sheet "Sales Respon" หรือ sheet แรก)',
              'หรือ Copy หลายแถวจาก Excel → Paste ในกล่องล่าง → กด "ดูตัวอย่าง"',
              'ดู preview: ✨ NEW / 📝 UPDATE / ✓ UNCHANGED / ❌ ERROR',
              'กด "ยืนยันบันทึก (N รายการ)"',
            ]} />
            <InfoBox text='Brand ใน materials ที่มีดอกจัน "*" นำหน้า เช่น "*BEET" จะถูก normalize ให้ match กับ "BEET" ใน brand_responsibilities อัตโนมัติ' />
          </Section>

          <Section title="จัดการ Users">
            <p className="mb-3">Admin → tab "ผู้ใช้ / Users" (admin role เห็นเท่านั้น)</p>

            <h3 className="font-display font-semibold text-base mb-2">เพิ่ม User</h3>
            <Steps steps={[
              'กด "+ เพิ่มผู้ใช้"',
              'กรอก Email + Full Name + เลือก Role',
              'ตั้ง Password เอง หรือกด "🎲 สุ่ม" ให้สร้างให้',
              'กดบันทึก → ขึ้น banner สีเหลืองโชว์รหัสที่ตั้ง พร้อมปุ่ม Copy',
              '⚠ จด/copy รหัสตอนนี้ — เมื่อปิด banner รหัสจะไม่แสดงอีก',
            ]} />

            <h3 className="font-display font-semibold text-base mt-4 mb-2">รีเซ็ตรหัส User</h3>
            <Steps steps={[
              'กด "แก้ไข" ที่ user ที่ต้องการ',
              'ในช่อง "รีเซ็ตรหัส / Reset Password" → พิมพ์รหัสใหม่ หรือกด 🎲 สุ่ม',
              'กดบันทึก → banner โชว์รหัสใหม่',
              'จดในที่ปลอดภัย (Bitwarden / users-passwords.csv ที่ admin เก็บส่วนตัว) → แจ้ง user',
              'รหัสเก่าใช้ไม่ได้ทันที',
            ]} />
            <InfoBox text="ถ้าแก้แค่ชื่อ/role อย่างเดียว ให้เว้นช่อง Password ว่าง — รหัสเดิมจะไม่เปลี่ยน" />

            <h3 className="font-display font-semibold text-base mt-4 mb-2">ลบ User</h3>
            <p className="text-sm">กด "ลบ" (ลบตัวเองไม่ได้ ป้องกัน lock ออกจากระบบ)</p>

            <h3 className="font-display font-semibold text-base mt-4 mb-2">ตาราง Role</h3>
            <Table headers={['Role', 'สิทธิ์']} rows={[
              ['admin', 'ทุกอย่าง (รวม Users + Brand Sales/SCM)'],
              ['qc_admin', 'Master Data + Need Edit + NCR + Dashboard'],
              ['operator', 'บันทึก QC + History + ยืนยันรับ Order'],
              ['viewer', 'Dashboard + Material อ่านอย่างเดียว'],
            ]} />
          </Section>

          <Section title="🔐 หลักการจัดการรหัสผ่าน">
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>Supabase เก็บแค่ bcrypt <b>hash</b> — ดูรหัสเก่าไม่ได้ ไม่ว่ากรณีใด</li>
              <li>ถ้า user ลืม → admin reset → ระบบโชว์รหัสใหม่ครั้งเดียวใน banner</li>
              <li>Admin มีหน้าที่จดและจัดเก็บรหัสเองนอกระบบ (Bitwarden / Excel ส่วนตัว)</li>
              <li>รหัสจะไม่เปลี่ยนเองตามเวลา — เปลี่ยนเฉพาะเมื่อ admin reset เท่านั้น</li>
            </ul>
          </Section>
        </>
      )}

      {/* FAQ */}
      <Section title="คำถามที่พบบ่อย (FAQ)">
        <div className="space-y-3">
          <Faq q="กรอก SAP Code แล้วข้อมูลไม่ขึ้น" a="SAP Code ต้องตรงแบบ exact (เช่น 1110001 ไม่ใช่ 111) — หรือ material นั้นยังไม่ได้อัปโหลดเข้า master ให้ลองหาในหน้า Material" />
          <Faq q="Sales / SCM ไม่ขึ้น" a="ระบบ match ตาม Brand → ถ้า brand ใน materials ไม่ตรงกับใน brand_responsibilities จะไม่ขึ้น ให้ admin ไปเพิ่มใน Admin → Brand → Sales/SCM" />
          <Faq q="Vendor Code (Sup SAP) แล้ว Sup Code ไม่ขึ้น" a="รหัส Supplier ไม่อยู่ในระบบ — ให้ qc_admin ไปเพิ่มใน Admin → Suppliers" />
          <Faq q="กด ตรวจสอบและบันทึก แล้วข้อมูลหายไหม ถ้ากด Cancel ใน popup" a="ไม่หาย — ฟอร์มยังมีข้อมูลเดิม กดปรับแล้ว save ใหม่ได้" />
          <Faq q="บันทึก Order แล้วอยากแก้" a="แจ้ง qc_admin → กด ✏️ ต้องแก้ไข → เจ้าของ Order จะเห็นปุ่มแก้ไข" />
          <Faq q="Login ไม่ได้ / ลืม Password" a="แจ้ง Admin System → Admin → Users → แก้ไข → ตั้งรหัสใหม่ → จด → แจ้งให้" />
          <Faq q="รูปภาพอัปโหลดได้กี่รูป" a="สูงสุด 3 รูปต่อ 1 รายการของเสีย — เพิ่ม/ลบ ใน Popup ก่อนบันทึกได้" />
          <Faq q="Reject แล้วจะเกิดอะไรขึ้น" a="ระบบสร้าง NCR อัตโนมัติ — กดปุ่ม 📋 NCR ใน History เพื่อกรอก Root Cause และ download ใบ NCR PDF" />
          <Faq q="ดูรายงานสรุปยังไง" a="History → 📥 PDF รวม (รวม Order หลายใบ) หรือ Dashboard → 📊 Excel / 📄 PDF" />
        </div>
      </Section>

      <div className="text-center text-xs text-on-surface-variant py-6">
        QC Inspection v2.2 • ปรับปรุงล่าสุด 14 พฤษภาคม 2026
      </div>
    </div>
  );
}

/* ========== Helper Components ========== */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section space-y-3">
      <h2 className="font-display font-bold text-xl">{title}</h2>
      {children}
    </section>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="h-5 w-5 rounded-full bg-primary text-white text-[11px] grid place-items-center font-bold shrink-0 mt-0.5">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-auto mt-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
            {headers.map(h => <th key={h} className="py-2 pr-3">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-outline-variant/15">
              {r.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoBox({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-primary-container/40 px-4 py-2.5 text-sm text-on-primary-container mt-3">
      ℹ️ {text}
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-surface-lowest rounded-md p-3">
      <div className="font-semibold text-sm">Q: {q}</div>
      <div className="text-sm text-on-surface-variant mt-1">A: {a}</div>
    </div>
  );
}

function RoleCard({ title, desc, access, active }: { title: string; desc: string; access: string; active: boolean }) {
  return (
    <div className={`rounded-md p-3 ${active ? 'bg-primary-container ring-2 ring-primary/30' : 'bg-surface-lowest'}`}>
      <div className="font-display font-bold text-sm">{title}</div>
      <div className="text-xs text-on-surface-variant">{desc}</div>
      <div className="text-xs mt-1">{access}</div>
    </div>
  );
}
