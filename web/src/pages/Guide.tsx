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
          QC Inspection — ระบบสุ่มตรวจคุณภาพ • คุณเข้าสู่ระบบในฐานะ <span className="chip chip-active ml-1">{role}</span>
        </p>
      </div>

      {/* ภาพรวมระบบ */}
      <Section title="ภาพรวมระบบ">
        <p>ระบบบันทึกผลการสุ่มตรวจคุณภาพสินค้า (QC Inspection) แบบ Web Application</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <RoleCard title="Operator" desc="พนักงานหน้างาน" access="บันทึก QC + ดูประวัติ" active={role === 'operator'} />
          <RoleCard title="QC Admin" desc="Admin ตรวจงาน" access="+ จัดการ Supplier / รหัสของเสีย" active={role === 'qc_admin'} />
          <RoleCard title="Admin" desc="System Admin" access="+ จัดการ Users ทั้งหมด" active={role === 'admin'} />
        </div>
      </Section>

      {/* Login */}
      <Section title="การเข้าสู่ระบบ">
        <Steps steps={[
          'เปิดเว็บ appQC — จะเห็นหน้า Login',
          'กรอก Email ที่ Admin สร้างให้',
          'กรอก Password',
          'กดปุ่ม "เข้าสู่ระบบ"',
          'หากข้อมูลถูกต้อง → เข้าหน้าบันทึก QC อัตโนมัติ',
        ]} />
        <InfoBox text="ทุกครั้งที่เปิดเว็บหรือปิดแท็บ ต้อง Login ใหม่เสมอ • บัญชีผู้ใช้สร้างได้โดย Admin เท่านั้น" />
      </Section>

      {/* บันทึก QC */}
      <Section title="บันทึก QC">
        <h3 className="font-display font-semibold text-base mb-2">ขั้นตอนที่ 1: กรอกข้อมูลสินค้า</h3>
        <Table headers={['ฟิลด์', 'คำอธิบาย', 'ตัวอย่าง']} rows={[
          ['SAP Code', 'รหัสสินค้าจาก SAP — กรอกแล้วข้อมูลจะขึ้นอัตโนมัติ', '1110001'],
          ['รายละเอียด / กลุ่มสินค้า / Brand / Sales / SCM', 'แสดงอัตโนมัติจาก SAP Code', 'beW, Foundation'],
          ['รหัส Sup SAP', 'รหัส Supplier จาก SAP', '10000138'],
          ['Sup Code / Supplier', 'แสดงอัตโนมัติจากรหัส Sup SAP', 'A'],
          ['Lot No.', 'หมายเลข Lot', 'INV23-CWZ106'],
          ['จำนวนรับ', 'จำนวนที่รับทั้งหมด', '75600'],
          ['จำนวนตรวจสอบ *', 'จำนวนที่สุ่มตรวจ (จำเป็น)', '500'],
        ]} />
        <InfoBox text="เมื่อเปลี่ยน SAP Code หรือ Sup SAP → ข้อมูลจะ reset และดึงใหม่อัตโนมัติ" />

        <h3 className="font-display font-semibold text-base mt-6 mb-2">ขั้นตอนที่ 2: เพิ่มรายการของเสีย</h3>
        <Steps steps={[
          'พิมพ์ค้นหาในช่อง "ค้นหารหัสของเสีย" — ค้นได้ด้วยรหัส (เช่น 11001) หรือชื่ออาการ (เช่น จุดสี)',
          'คลิกเลือกหลายอาการที่ต้องการ — แต่ละอันจะติ๊ก ✅ (เลือกได้หลายอัน)',
          'กดปุ่ม "เพิ่มในรายการ" → อาการที่เลือกจะรวมเป็น 1 แถว เช่น 11001, 11002',
          'เลือกระดับความรุนแรง (Critical / Major / Minor)',
          'กรอกจำนวนที่พบ',
          'แนบรูปภาพของเสีย ได้สูงสุด 3 รูป (กดไอคอนกล้อง)',
        ]} />
        <InfoBox text="ต้องการเพิ่มกลุ่มอื่นที่ระดับความรุนแรงต่างกัน → ค้นหาอาการอื่น → เลือก → กด 'เพิ่มในรายการ' อีกครั้ง" />

        <h3 className="font-display font-semibold text-base mt-6 mb-2">ขั้นตอนที่ 3: ตรวจสอบ % ของเสีย</h3>
        <div className="bg-surface-lowest rounded-md p-4">
          <div className="text-center mb-2">
            <span className="text-xs uppercase tracking-wider text-on-surface-variant">สูตรคำนวณ</span>
          </div>
          <div className="text-center font-display font-bold text-lg text-primary">
            % ของเสีย = (Critical + Major + Minor) / จำนวนตรวจสอบ × 100
          </div>
          <p className="text-center text-xs text-on-surface-variant mt-2">คำนวณอัตโนมัติ แสดงมุมขวาบนของฟอร์ม</p>
        </div>

        <h3 className="font-display font-semibold text-base mt-6 mb-2">ขั้นตอนที่ 4: บันทึก</h3>
        <Steps steps={[
          'กรอกหมายเหตุ (ถ้ามี)',
          'กดปุ่ม "บันทึก"',
          'Popup สรุปผลจะขึ้นมา แสดงข้อมูลทั้งหมดที่กรอก (อ่านอย่างเดียว แก้ไขไม่ได้)',
          'กดปุ่ม "ปิด" → ฟอร์มจะ reset พร้อมกรอกรายการใหม่',
        ]} />
      </Section>

      {/* ประวัติ */}
      <Section title="ประวัติ (History)">
        <p className="mb-3">หน้าดูข้อมูลที่เคยบันทึกไปแล้ว (อ่านอย่างเดียว แก้ไขไม่ได้)</p>
        <Steps steps={[
          'กดเมนู "ประวัติ" ที่แถบด้านบน',
          'เห็นรายการ QC orders ทั้งหมด เรียงจากล่าสุด',
          'ค้นหาได้ตาม Order No, SAP Code, Brand, Supplier',
          'กดที่รายการ → expand ดูรายละเอียด + รายการของเสีย + รูปภาพ',
        ]} />
      </Section>

      {/* QC Admin section */}
      {isQcAdmin && (
        <>
          <div className="border-t-2 border-primary/20 pt-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">สำหรับ QC Admin / Admin</h2>
          </div>

          <Section title="จัดการ Suppliers">
            <p className="mb-3">หน้า Admin → แท็บ Suppliers</p>
            <h3 className="font-display font-semibold text-base mb-2">เพิ่ม Supplier</h3>
            <Steps steps={[
              'กดปุ่ม "+ เพิ่ม Supplier"',
              'กรอก: Sup Code* (ห้ามซ้ำ), SAP Code, Supplier Name*, Category, Status, Purchase',
              'กดปุ่ม "บันทึก"',
            ]} />
            <h3 className="font-display font-semibold text-base mt-4 mb-2">แก้ไข / ลบ</h3>
            <p className="text-sm">กดปุ่ม "แก้ไข" หรือ "ลบ" ที่แถวของ Supplier นั้น ๆ (การลบมี confirm ก่อน)</p>
          </Section>

          <Section title="จัดการรหัสของเสีย">
            <p className="mb-3">หน้า Admin → แท็บ รหัสของเสีย</p>
            <h3 className="font-display font-semibold text-base mb-2">เพิ่มรหัสของเสีย</h3>
            <Steps steps={[
              'กดปุ่ม "+ เพิ่มรหัสของเสีย"',
              'เลือก Type (แหล่งที่มา) จาก Dropdown หรือพิมพ์เพิ่ม',
              'เลือก Reason (จุดที่พบ) จาก Dropdown หรือพิมพ์เพิ่ม',
              'กรอก Running No.* (เช่น 11001)',
              'กรอกอาการ (Symptom)* (เช่น ไม่พิมพ์/Printing missing)',
              'กดปุ่ม "บันทึก"',
            ]} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-surface-lowest rounded-md p-3">
                <div className="text-xs uppercase tracking-wide text-on-surface-variant mb-1">Type มาตรฐาน</div>
                <ol className="text-sm space-y-0.5 list-decimal list-inside">
                  <li>Defect/ข้อเสียหาย(ซ่อมไม่ได้)</li>
                  <li>Repair/ซ่อม</li>
                  <li>Short Shipment/ส่งของขาด</li>
                  <li>Scrap/ใช้ไม่ได้ (ทิ้ง)</li>
                  <li>Supplier/ผู้ผลิต</li>
                  <li>Customer/ลูกค้า</li>
                </ol>
              </div>
              <div className="bg-surface-lowest rounded-md p-3">
                <div className="text-xs uppercase tracking-wide text-on-surface-variant mb-1">Reason มาตรฐาน</div>
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
        </>
      )}

      {/* Admin section */}
      {isAdmin && (
        <>
          <div className="border-t-2 border-primary/20 pt-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">สำหรับ Admin System</h2>
          </div>

          <Section title="จัดการ Users">
            <p className="mb-3">หน้า Admin → แท็บ Users (เฉพาะ admin เท่านั้น)</p>
            <h3 className="font-display font-semibold text-base mb-2">เพิ่ม User</h3>
            <Steps steps={[
              'กดปุ่ม "+ เพิ่ม User"',
              'กรอก Email* (เช่น qc05@cometsintertrade.com)',
              'กรอก Full Name',
              'เลือก Role* จาก Dropdown หรือพิมพ์ Role ใหม่',
              'กรอก Password* (อย่างน้อย 6 ตัวอักษร)',
              'กดปุ่ม "บันทึก"',
            ]} />
            <Table headers={['Role', 'สิทธิ์การใช้งาน']} rows={[
              ['operator', 'บันทึก QC + ดูประวัติ'],
              ['qc_admin', '+ จัดการ Supplier / รหัสของเสีย'],
              ['admin', '+ จัดการ Users ทั้งหมด'],
            ]} />
            <h3 className="font-display font-semibold text-base mt-4 mb-2">แก้ไข User</h3>
            <p className="text-sm">กดปุ่ม "แก้ไข" → เปลี่ยน Name / Role / Password (เว้น Password ว่างเพื่อไม่เปลี่ยน)</p>
            <h3 className="font-display font-semibold text-base mt-4 mb-2">ลบ User</h3>
            <p className="text-sm">กดปุ่ม "ลบ" (ลบตัวเองไม่ได้ ป้องกัน lock ออกจากระบบ)</p>
            <InfoBox text="Role ที่พิมพ์เพิ่มเอง (ไม่ใช่ admin / qc_admin / operator) จะยังไม่มีสิทธิ์เข้าหน้า Admin — ต้องแจ้งผู้พัฒนาเพิ่ม policy" />
          </Section>
        </>
      )}

      {/* FAQ */}
      <Section title="คำถามที่พบบ่อย (FAQ)">
        <div className="space-y-3">
          <Faq q="กรอก SAP Code แล้วไม่ขึ้นข้อมูล?" a="SAP Code ต้องตรงแบบ exact (เช่น 1110001 ไม่ใช่ 111) — ตรวจสอบรหัสให้ถูกต้อง" />
          <Faq q="กรอก Sup SAP Code แล้ว Sup Code ไม่ขึ้น?" a="ตรวจว่ารหัสถูกต้อง หากยังไม่มีในระบบ ให้แจ้ง QC Admin เพิ่มใน Admin → Suppliers" />
          <Faq q="Login ไม่ได้ / ลืม Password?" a="แจ้ง Admin System เพื่อ reset password ในหน้า Admin → Users → แก้ไข" />
          <Faq q="อยากดูข้อมูลที่เคยบันทึกไป?" a='กดเมนู "ประวัติ" → ค้นหาด้วย Order No, SAP Code, Brand หรือ Supplier' />
          <Faq q="บันทึกแล้วแก้ไขข้อมูลได้ไหม?" a="ไม่ได้ — ข้อมูลที่บันทึกแล้วเป็น read-only เพื่อความถูกต้อง หากต้องการแก้ไข แจ้ง Admin" />
          <Faq q="รูปภาพของเสียอัพโหลดได้กี่รูป?" a="สูงสุด 3 รูปต่อ 1 รายการของเสีย" />
          <Faq q="เลือกรหัสของเสียหลายอันพร้อมกันได้ไหม?" a='ได้ — ค้นหา → คลิกเลือกหลายอัน → กด "เพิ่มในรายการ" จะรวมเป็น 1 แถว' />
        </div>
      </Section>

      <div className="text-center text-xs text-on-surface-variant py-6">
        QC Inspection v0.1.0 • ปรับปรุงล่าสุด 17 เมษายน 2026
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
              {r.map((c, j) => <td key={j} className="py-1.5 pr-3">{c}</td>)}
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
      {text}
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-surface-lowest rounded-md p-3">
      <div className="font-semibold text-sm">{q}</div>
      <div className="text-sm text-on-surface-variant mt-1">{a}</div>
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
