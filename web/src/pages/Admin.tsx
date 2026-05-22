import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { generatePdfDataUri } from '../lib/pdf';
import NcrReport from '../components/NcrReport';

type Tab = 'suppliers' | 'defects' | 'brand_resp' | 'notify' | 'users';

// Official standard list from SD-QC-1909-004-00 Rev02 (18-4-25)
const OFFICIAL_TYPES = [
  '1 Defect/ข้อเสียหาย(ซ่อมไม่ได้)',
  '2 Repair/ซ่อม',
  '3 Short Shipment/ส่งของขาด',
  '4 Scrap/ใช้ไม่ได้ (ทิ้ง)',
  '5 Supplier/ผู้ผลิต',
  '6 Customer/ลูกค้า'
];
const OFFICIAL_REASONS = [
  '1 Logo/สิ่งพิมพ์',
  '2 Appearance/ลักษณะที่ปรากฎ',
  '3 Function/การใช้งาน',
  '4 Component/ส่วนประกอบ',
  '5 Bulk/ตัวยา',
  '6 Machine/เครื่องจักร'
];

export default function Admin() {
  const { profile } = useAuth();
  const isAdminSystem = profile?.role === 'admin';
  const isQcAdmin = profile?.role === 'qc_admin';
  const canSeeNotify = isAdminSystem || isQcAdmin;
  const [tab, setTab] = useState<Tab>('suppliers');

  // Guard: if qc_admin lands on brand_resp (admin-only), redirect to suppliers
  useEffect(() => {
    if (tab === 'brand_resp' && !isAdminSystem) setTab('suppliers');
    if (tab === 'notify' && !canSeeNotify) setTab('suppliers');
  }, [tab, isAdminSystem, canSeeNotify]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">จัดการระบบ / Admin</h1>
        <p className="text-sm text-on-surface-variant mt-1">จัดการ Master Data และผู้ใช้ / Manage Master Data & Users</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <TabBtn id="suppliers" tab={tab} setTab={setTab}>ผู้จัดจำหน่าย / Suppliers</TabBtn>
        <TabBtn id="defects" tab={tab} setTab={setTab}>รหัสของเสีย / Defect Codes</TabBtn>
        {isAdminSystem && <TabBtn id="brand_resp" tab={tab} setTab={setTab}>Brand → Sales/SCM</TabBtn>}
        {canSeeNotify && <TabBtn id="notify" tab={tab} setTab={setTab}>📧 Reject Notify</TabBtn>}
        <TabBtn id="users" tab={tab} setTab={setTab}>ผู้ใช้ / Users</TabBtn>
      </div>
      {tab === 'suppliers' && <SuppliersPane />}
      {tab === 'defects' && <DefectsPane />}
      {tab === 'brand_resp' && isAdminSystem && <BrandResponsibilitiesPane />}
      {tab === 'notify' && canSeeNotify && <NotifyRecipientsPane canEdit={isAdminSystem} />}
      {tab === 'users' && <UsersPane />}
    </div>
  );
}

function TabBtn({ id, tab, setTab, children }: any) {
  return (
    <button onClick={() => setTab(id)} className={`chip ${tab === id ? 'chip-active' : ''}`}>{children}</button>
  );
}

/* =========================================================================
 * SUPPLIERS
 * ======================================================================= */
interface SupplierRow {
  id: number;
  sup_code: string;
  sup_sap_code: string | null;
  supplier_name: string;
  category: string | null;
  status: string;
  purchase: string | null;
}

function SuppliersPane() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<SupplierRow> | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('sup_code').limit(2000);
    setRows((data as SupplierRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r =>
    !q || r.sup_code?.toLowerCase().includes(q.toLowerCase()) ||
    (r.sup_sap_code || '').toLowerCase().includes(q.toLowerCase()) ||
    r.supplier_name?.toLowerCase().includes(q.toLowerCase()));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    const supCode = (editing.sup_code || '').trim();
    const supSapCode = (editing.sup_sap_code || '')?.toString().trim();
    const payload = {
      // sup_code is NOT NULL UNIQUE in DB; if user leaves it blank, fall back to sap code
      sup_code: supCode || supSapCode,
      sup_sap_code: supSapCode || null,
      supplier_name: (editing.supplier_name || '').trim(),
      category: editing.category || null,
      status: editing.status || 'ACTIVE',
      purchase: editing.purchase || null
    };
    if (!payload.supplier_name) { setMsg('กรุณากรอกชื่อ Supplier'); return; }
    if (!payload.sup_sap_code) { setMsg('กรุณากรอก SAP Code'); return; }

    const { error } = editing.id
      ? await supabase.from('suppliers').update(payload).eq('id', editing.id)
      : await supabase.from('suppliers').insert(payload);

    if (error) { setMsg('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setEditing(null);
    await load();
  };

  const remove = async (r: SupplierRow) => {
    if (!confirm(`ลบ ${r.sup_code} - ${r.supplier_name}?`)) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', r.id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await load();
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display font-bold text-lg">Suppliers ({rows.length})</h2>
        <div className="flex gap-2 items-center">
          <input className="field-input max-w-sm" placeholder="ค้นหา Sup Code, SAP, ชื่อ…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-primary text-sm" onClick={() => setEditing({ status: 'ACTIVE', purchase: 'Import' })}>+ เพิ่ม / Add Supplier</button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">กำลังโหลด…</p> : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-lowest">
              <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="py-2">Sup Code</th><th>SAP</th><th>Supplier</th><th>Category</th><th>Purchase</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(r => (
                <tr key={r.id} className="border-t border-outline-variant/15 hover:bg-surface-low/30">
                  <td className="py-2 font-mono">{r.sup_code}</td>
                  <td className="font-mono text-xs">{r.sup_sap_code || '—'}</td>
                  <td>{r.supplier_name}</td>
                  <td className="text-xs">{r.category || '—'}</td>
                  <td><span className="chip">{r.purchase}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-tertiary text-xs py-1 px-2" onClick={() => setEditing(r)}>แก้ไข</button>
                    <button className="text-xs text-error hover:underline ml-2" onClick={() => remove(r)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditModal title={editing.id ? 'แก้ไข Supplier' : 'เพิ่ม Supplier'} onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sup Code" value={editing.sup_code} onChange={v => setEditing({ ...editing, sup_code: v })} />
              <Field label="SAP Code *" value={editing.sup_sap_code} onChange={v => setEditing({ ...editing, sup_sap_code: v })} />
            </div>
            <Field label="Supplier Name *" value={editing.supplier_name} onChange={v => setEditing({ ...editing, supplier_name: v })} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Category" value={editing.category} onChange={v => setEditing({ ...editing, category: v })} />
              <SelectField label="Status" value={editing.status || 'ACTIVE'} options={['ACTIVE', 'INACTIVE']}
                onChange={v => setEditing({ ...editing, status: v })} />
              <SelectField label="Purchase" value={editing.purchase || 'Import'} options={['Import', 'Local']}
                onChange={v => setEditing({ ...editing, purchase: v })} />
            </div>
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}
    </section>
  );
}

/* =========================================================================
 * DEFECTS
 * ======================================================================= */
interface DefectRow {
  defect_code: string;
  symptom: string;
  reason: string | null;
  type: string | null;
}

function DefectsPane() {
  const [rows, setRows] = useState<DefectRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<DefectRow> & { _originalCode?: string }) | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('defects').select('*').order('defect_code').limit(10000);
    setRows((data as DefectRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Merge official standard + any distinct values from DB (in case DB has legacy values)
  const typeOptions = Array.from(new Set([
    ...OFFICIAL_TYPES,
    ...(rows.map(r => r.type).filter(Boolean) as string[])
  ]));
  const reasonOptions = Array.from(new Set([
    ...OFFICIAL_REASONS,
    ...(rows.map(r => r.reason).filter(Boolean) as string[])
  ]));

  const filtered = rows.filter(r =>
    !q || r.defect_code?.includes(q) ||
    (r.symptom || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.reason || '').toLowerCase().includes(q.toLowerCase()));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    const payload = {
      defect_code: (editing.defect_code || '').trim(),
      symptom: (editing.symptom || '').trim(),
      reason: editing.reason || null,
      type: editing.type || null
    };
    if (!payload.defect_code || !payload.symptom) { setMsg('กรุณากรอกรหัสและอาการ'); return; }

    if (editing._originalCode && editing._originalCode !== payload.defect_code) {
      // Changed PK: delete old, insert new
      await supabase.from('defects').delete().eq('defect_code', editing._originalCode);
    }
    const { error } = await supabase.from('defects').upsert(payload, { onConflict: 'defect_code' });
    if (error) { setMsg('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setEditing(null);
    await load();
  };

  const remove = async (r: DefectRow) => {
    if (!confirm(`ลบ ${r.defect_code} - ${r.symptom}?`)) return;
    const { error } = await supabase.from('defects').delete().eq('defect_code', r.defect_code);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await load();
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display font-bold text-lg">รหัสของเสีย ({rows.length})</h2>
        <div className="flex gap-2 items-center">
          <input className="field-input max-w-sm" placeholder="ค้นหา…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-primary text-sm" onClick={() => setEditing({})}>+ เพิ่ม / Add Defect Code</button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">กำลังโหลด…</p> : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-lowest">
              <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="py-2">Code</th><th>อาการ</th><th>Reason</th><th>Type</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(r => (
                <tr key={r.defect_code} className="border-t border-outline-variant/15 hover:bg-surface-low/30">
                  <td className="py-2 font-mono text-xs">{r.defect_code}</td>
                  <td>{r.symptom}</td>
                  <td className="text-xs text-on-surface-variant">{r.reason || '—'}</td>
                  <td className="text-xs text-on-surface-variant">{r.type || '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-tertiary text-xs py-1 px-2" onClick={() => setEditing({ ...r, _originalCode: r.defect_code })}>แก้ไข</button>
                    <button className="text-xs text-error hover:underline ml-2" onClick={() => remove(r)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <p className="text-xs text-on-surface-variant mt-2">แสดง 500 รายการแรก ใช้ค้นหาเพื่อกรอง</p>}
        </div>
      )}

      {editing && (
        <EditModal title={editing._originalCode ? 'แก้ไขรหัสของเสีย' : 'เพิ่มรหัสของเสีย'} onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            <ComboField label="Type (แหล่งที่มา)" value={editing.type} options={typeOptions}
              onChange={v => setEditing({ ...editing, type: v })} placeholder="เลือกหรือพิมพ์" />
            <ComboField label="Reason (จุดที่พบ)" value={editing.reason} options={reasonOptions}
              onChange={v => setEditing({ ...editing, reason: v })} placeholder="เลือกหรือพิมพ์" />
            <Field label="Running No. *" value={editing.defect_code} onChange={v => setEditing({ ...editing, defect_code: v })} placeholder="เช่น 11001" />
            <Field label="อาการ (Symptom) *" value={editing.symptom} onChange={v => setEditing({ ...editing, symptom: v })} placeholder="เช่น ไม่พิมพ์/Printing missing" />
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}
    </section>
  );
}

/* =========================================================================
 * BRAND RESPONSIBILITIES (Brand → Sales / SCM)
 * ======================================================================= */
interface BrandRespRow {
  brand: string;
  sales: string | null;
  scm: string | null;
  updated_at?: string;
}

type PasteStatus = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
interface PasteRow {
  brand: string;
  sales: string | null;
  scm: string | null;
  status: PasteStatus;
  before?: { sales: string | null; scm: string | null };
  error?: string;
}

function BrandResponsibilitiesPane() {
  const [rows, setRows] = useState<BrandRespRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<BrandRespRow> & { _originalBrand?: string; _isNew?: boolean }) | null>(null);
  const [msg, setMsg] = useState('');
  // Bulk paste/upload state
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState<PasteRow[] | null>(null);
  const [pasteSaving, setPasteSaving] = useState(false);
  const [pasteMsg, setPasteMsg] = useState('');
  const [fileInfo, setFileInfo] = useState<{ name: string; sheet: string; rowCount: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('brand_responsibilities').select('*').order('brand').limit(2000);
    setRows((data as BrandRespRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r =>
    !q || r.brand.toLowerCase().includes(q.toLowerCase()) ||
    (r.sales || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.scm || '').toLowerCase().includes(q.toLowerCase()));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    const payload = {
      brand: (editing.brand || '').trim(),
      sales: (editing.sales || '').trim() || null,
      scm: (editing.scm || '').trim() || null,
    };
    if (!payload.brand) { setMsg('กรุณากรอกชื่อ Brand'); return; }
    if (!payload.sales && !payload.scm) { setMsg('กรุณากรอก Sales หรือ SCM อย่างน้อย 1 ฟิลด์'); return; }

    if (editing._originalBrand && editing._originalBrand !== payload.brand) {
      // Brand renamed (PK changed): delete old, insert new
      await supabase.from('brand_responsibilities').delete().eq('brand', editing._originalBrand);
    }
    const { error } = await supabase.from('brand_responsibilities').upsert(payload, { onConflict: 'brand' });
    if (error) { setMsg('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setEditing(null);
    await load();
  };

  const remove = async (r: BrandRespRow) => {
    if (!confirm(`ลบ Brand "${r.brand}"?`)) return;
    const { error } = await supabase.from('brand_responsibilities').delete().eq('brand', r.brand);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await load();
  };

  const withScm = rows.filter(r => r.scm && r.scm.trim()).length;
  const withSales = rows.filter(r => r.sales && r.sales.trim()).length;

  // ----- Bulk Paste / Upload -----
  // Classify rows against existing DB state — shared by paste and file upload
  const classifyRows = (input: { brand: string; sales: string | null; scm: string | null }[]): PasteRow[] => {
    const existing = new Map(rows.map(r => [r.brand, r]));
    const seen = new Set<string>();
    const result: PasteRow[] = [];
    for (const r of input) {
      const brand = r.brand.trim();
      const sales = r.sales?.trim() || null;
      const scm = r.scm?.trim() || null;

      if (!brand) {
        result.push({ brand, sales, scm, status: 'ERROR', error: 'ไม่มี Brand' });
        continue;
      }
      if (seen.has(brand)) {
        result.push({ brand, sales, scm, status: 'ERROR', error: 'ซ้ำในชุด' });
        continue;
      }
      seen.add(brand);

      const cur = existing.get(brand);
      if (!cur) {
        result.push({ brand, sales, scm, status: 'NEW' });
      } else if ((cur.sales || null) !== sales || (cur.scm || null) !== scm) {
        result.push({ brand, sales, scm, status: 'UPDATE', before: { sales: cur.sales, scm: cur.scm } });
      } else {
        result.push({ brand, sales, scm, status: 'UNCHANGED' });
      }
    }
    return result;
  };

  const parsePaste = () => {
    setPasteMsg('');
    setFileInfo(null);
    const text = pasteText.trim();
    if (!text) { setPasteMsg('กรุณาวาง (paste) ข้อมูล'); setPastePreview(null); return; }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { setPasteMsg('ไม่พบข้อมูล'); setPastePreview(null); return; }

    const firstLine = lines[0];
    const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(',') ? ',' : firstLine.includes('|') ? '|' : '\t';
    const splitLine = (l: string) => l.split(delim).map(c => c.trim());
    const first = splitLine(firstLine).map(c => c.toLowerCase());
    const hasHeader = first.some(c => c === 'brand') && first.some(c => c.includes('sales') || c.includes('scm'));
    const dataLines = hasHeader ? lines.slice(1) : lines;

    setPastePreview(classifyRows(dataLines.map(line => {
      const c = splitLine(line);
      return { brand: c[0] || '', sales: c[1] || null, scm: c[2] || null };
    })));
  };

  const handleFile = async (file: File) => {
    setPasteMsg('');
    setPasteText('');
    setPastePreview(null);
    setFileInfo(null);

    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setPasteMsg('รองรับเฉพาะ .xlsx / .xls / .csv'); return;
    }

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      // Prefer "Sales Respon" sheet, else first sheet
      const sheetName = wb.SheetNames.find(n => /sales\s*respon/i.test(n)) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      if (rawRows.length === 0) { setPasteMsg('ไฟล์ว่างเปล่า'); return; }

      // Find columns by case-insensitive header
      const keys = Object.keys(rawRows[0]);
      const brandKey = keys.find(k => /^brand$/i.test(k.trim()));
      const salesKey = keys.find(k => /^sales$/i.test(k.trim()));
      const scmKey = keys.find(k => /^scm$/i.test(k.trim()));

      if (!brandKey) {
        setPasteMsg(`ไม่พบคอลัมน์ "Brand" ในไฟล์ (sheet: ${sheetName})`); return;
      }

      const mapped = rawRows.map(r => ({
        brand: String(r[brandKey] ?? '').trim(),
        sales: salesKey ? (String(r[salesKey] ?? '').trim() || null) : null,
        scm: scmKey ? (String(r[scmKey] ?? '').trim() || null) : null
      }));

      setFileInfo({ name: file.name, sheet: sheetName, rowCount: rawRows.length });
      setPastePreview(classifyRows(mapped));
    } catch (err) {
      setPasteMsg('อ่านไฟล์ไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ''; // reset so same file can be re-uploaded
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const applyPaste = async () => {
    if (!pastePreview) return;
    const toApply = pastePreview
      .filter(r => r.status === 'NEW' || r.status === 'UPDATE')
      .map(r => ({ brand: r.brand, sales: r.sales, scm: r.scm }));
    if (toApply.length === 0) { setPasteMsg('ไม่มีอะไรต้องบันทึก'); return; }

    setPasteSaving(true);
    setPasteMsg('');
    const { error } = await supabase.from('brand_responsibilities').upsert(toApply, { onConflict: 'brand' });
    setPasteSaving(false);
    if (error) { setPasteMsg('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setPasteOpen(false);
    setPasteText('');
    setPastePreview(null);
    await load();
  };

  const closePaste = () => {
    setPasteOpen(false);
    setPasteText('');
    setPastePreview(null);
    setPasteMsg('');
    setFileInfo(null);
  };

  const pasteSummary = pastePreview ? {
    new: pastePreview.filter(r => r.status === 'NEW').length,
    update: pastePreview.filter(r => r.status === 'UPDATE').length,
    unchanged: pastePreview.filter(r => r.status === 'UNCHANGED').length,
    error: pastePreview.filter(r => r.status === 'ERROR').length,
  } : null;

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-lg">Brand → Sales / SCM ({rows.length})</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            ใช้ auto-fill ในหน้าบันทึก QC โดย match จาก <span className="font-mono">materials.brand</span> (รองรับ prefix * โดย normalize อัตโนมัติ)
          </p>
          <div className="flex gap-2 text-xs mt-2">
            <span className="chip">มี Sales: <b className="ml-1">{withSales}</b></span>
            <span className="chip">มี SCM: <b className="ml-1">{withScm}</b></span>
            <span className="chip">SCM ว่าง: <b className="ml-1 text-error">{rows.length - withScm}</b></span>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input className="field-input max-w-sm" placeholder="ค้นหา Brand / Sales / SCM…"
            value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-secondary text-sm whitespace-nowrap" onClick={() => setPasteOpen(true)}>
            📤 อัปโหลด / Paste
          </button>
          <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setEditing({ _isNew: true })}>
            + เพิ่ม / Add Brand
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">กำลังโหลด…</p> : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-lowest">
              <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="py-2">Brand</th>
                <th>Sales</th>
                <th>SCM</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(r => (
                <tr key={r.brand} className="border-t border-outline-variant/15 hover:bg-surface-low/30">
                  <td className="py-2 font-mono font-semibold">{r.brand}</td>
                  <td>{r.sales || <span className="text-on-surface-variant italic">— ว่าง</span>}</td>
                  <td>{r.scm || <span className="text-on-surface-variant italic">— ว่าง</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-tertiary text-xs py-1 px-2"
                      onClick={() => setEditing({ ...r, _originalBrand: r.brand })}>แก้ไข</button>
                    <button className="text-xs text-error hover:underline ml-2"
                      onClick={() => remove(r)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <p className="text-xs text-on-surface-variant mt-2">แสดง 500 จาก {filtered.length} — กรองให้แคบลง</p>
          )}
        </div>
      )}

      {editing && (
        <EditModal title={editing._isNew ? 'เพิ่ม Brand' : `แก้ไข Brand: ${editing._originalBrand}`}
                   onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Brand *" value={editing.brand}
              onChange={v => setEditing({ ...editing, brand: v })}
              placeholder="เช่น 2P, ALESE — ระบบจะ normalize ตอน match (ตัด * นำหน้า)" />
            <Field label="Sales" value={editing.sales}
              onChange={v => setEditing({ ...editing, sales: v })}
              placeholder="ชื่อผู้รับผิดชอบฝ่ายขาย" />
            <Field label="SCM" value={editing.scm}
              onChange={v => setEditing({ ...editing, scm: v })}
              placeholder="ชื่อผู้รับผิดชอบ SCM" />
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}

      {pasteOpen && (
        <EditModal title="📋 เพิ่มหลายรายการ / Bulk Import" onClose={closePaste}>
          <div className="space-y-4">
            {/* File drop zone */}
            <div>
              <label className="field-label">📤 อัปโหลดไฟล์ / Upload File</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-md border-2 border-dashed transition cursor-pointer text-center py-6 px-4 ${
                  dragOver ? 'border-primary bg-primary-container/40' : 'border-outline-variant/40 bg-surface-low hover:bg-surface-mid'
                }`}>
                <div className="text-2xl mb-1">{dragOver ? '⬇️' : '📁'}</div>
                <div className="text-sm font-medium">
                  {dragOver ? 'วางไฟล์ได้เลย / Drop here' : 'ลากไฟล์ลงที่นี่ หรือ คลิกเพื่อเลือก'}
                </div>
                <div className="text-[11px] text-on-surface-variant mt-1">
                  รองรับ .xlsx, .xls, .csv — ระบบจะหา sheet "Sales Respon" ก่อน (ถ้าไม่เจอใช้ sheet แรก)
                </div>
                <div className="text-[11px] text-on-surface-variant">
                  คอลัมน์ต้องมี: <b>Brand</b> | <b>Sales</b> | <b>SCM</b>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileInput} />
              </div>
              {fileInfo && (
                <div className="mt-2 rounded-md bg-primary-container/30 px-3 py-2 text-xs">
                  📄 <b>{fileInfo.name}</b> · sheet: <span className="font-mono">{fileInfo.sheet}</span> · {fileInfo.rowCount} แถว
                </div>
              )}
            </div>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-outline-variant/30"></div>
              <span className="px-3 text-xs text-on-surface-variant">หรือ / OR</span>
              <div className="flex-1 border-t border-outline-variant/30"></div>
            </div>

            {/* Paste textarea */}
            <div>
              <label className="field-label">📋 Paste ข้อมูล (Copy จาก Excel/Sheet)</label>
              <textarea className="field-input font-mono text-xs" rows={6}
                value={pasteText}
                onChange={e => { setPasteText(e.target.value); setPastePreview(null); setFileInfo(null); }}
                placeholder={'Brand\tSales\tSCM\n2P\tภคพรรณ (น้ำเพ็ชร) ชะอุ่ม\tอัมพร (เตย)\nALESE\tขวัญข้าว...\tอัมพร (เตย)'} />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={parsePaste} className="btn-secondary text-sm"
                  disabled={!pasteText.trim()}>
                  🔍 ดูตัวอย่างจาก Paste / Parse
                </button>
                <button type="button" onClick={() => { setPasteText(''); setPastePreview(null); setFileInfo(null); }}
                  className="text-xs text-on-surface-variant hover:underline self-center">
                  ล้าง / Clear
                </button>
              </div>
            </div>

            {pasteSummary && (
              <div className="flex gap-2 text-xs flex-wrap">
                <span className="chip bg-primary/10 text-primary">✨ NEW: <b className="ml-1">{pasteSummary.new}</b></span>
                <span className="chip bg-amber-100 text-amber-800">📝 UPDATE: <b className="ml-1">{pasteSummary.update}</b></span>
                <span className="chip">✓ UNCHANGED: <b className="ml-1">{pasteSummary.unchanged}</b></span>
                {pasteSummary.error > 0 && (
                  <span className="chip bg-error/10 text-error">❌ ERROR: <b className="ml-1">{pasteSummary.error}</b></span>
                )}
              </div>
            )}

            {pastePreview && pastePreview.length > 0 && (
              <div className="max-h-[40vh] overflow-auto border border-outline-variant/20 rounded">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-low">
                    <tr className="text-left">
                      <th className="py-1.5 px-2">Status</th>
                      <th className="px-2">Brand</th>
                      <th className="px-2">Sales</th>
                      <th className="px-2">SCM</th>
                      <th className="px-2">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastePreview.slice(0, 200).map((r, i) => (
                      <tr key={i} className="border-t border-outline-variant/15">
                        <td className="py-1.5 px-2">
                          <span className={`chip text-[10px] ${
                            r.status === 'NEW'       ? 'bg-primary/10 text-primary' :
                            r.status === 'UPDATE'    ? 'bg-amber-100 text-amber-800' :
                            r.status === 'ERROR'     ? 'bg-error/10 text-error' :
                            'bg-surface-mid text-on-surface-variant'
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-2 font-mono">{r.brand || '—'}</td>
                        <td className="px-2">
                          {r.status === 'UPDATE' && (r.before?.sales || null) !== r.sales ? (
                            <span><s className="text-on-surface-variant/60">{r.before?.sales || '—'}</s> → <b>{r.sales || '—'}</b></span>
                          ) : (r.sales || '—')}
                        </td>
                        <td className="px-2">
                          {r.status === 'UPDATE' && (r.before?.scm || null) !== r.scm ? (
                            <span><s className="text-on-surface-variant/60">{r.before?.scm || '—'}</s> → <b>{r.scm || '—'}</b></span>
                          ) : (r.scm || '—')}
                        </td>
                        <td className="px-2 text-error">{r.error || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pastePreview.length > 200 && (
                  <p className="text-xs text-on-surface-variant p-2">แสดง 200 จาก {pastePreview.length}</p>
                )}
              </div>
            )}

            {pasteMsg && <p className="text-sm text-error">{pasteMsg}</p>}

            <div className="flex gap-2 justify-end pt-2 border-t border-outline-variant/15">
              <button type="button" onClick={closePaste} className="btn-secondary"
                disabled={pasteSaving}>ปิด / Close</button>
              <button type="button" onClick={applyPaste} className="btn-primary"
                disabled={pasteSaving || !pastePreview ||
                  (pasteSummary !== null && pasteSummary.new + pasteSummary.update === 0)}>
                {pasteSaving ? 'กำลังบันทึก…'
                  : pasteSummary
                  ? `✓ ยืนยันบันทึก (${pasteSummary.new + pasteSummary.update} รายการ)`
                  : 'ยืนยันบันทึก / Confirm'}
              </button>
            </div>
          </div>
        </EditModal>
      )}
    </section>
  );
}

/* =========================================================================
 * NOTIFY RECIPIENTS — รายชื่ออีเมลรับแจ้งเตือน Reject (admin only)
 * ======================================================================= */
interface RecipientRow {
  id: number;
  email: string;
  name: string | null;
  role_label: string | null;
  enabled: boolean;
}

interface SendLogRow {
  id: number;
  order_id: number | null;
  order_no: string | null;
  ncr_no: string | null;
  recipient_count: number;
  recipient_emails: string | null;
  attached_pdf: boolean;
  status: string;
  error_detail: string | null;
  sent_at: string;
}

function NotifyRecipientsPane({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [sendHistory, setSendHistory] = useState<SendLogRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<RecipientRow> | null>(null);
  const [msg, setMsg] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<{
    subject: string; html: string; recipients: string[];
    order_no: string; ncr_no: string | null;
    pdfDataUri: string | null; pdfFilename: string | null;
  } | null>(null);
  // Offscreen PDF source — when set, hidden NcrReport renders + useEffect generates PDF
  // mode tells what to do after PDF is ready: show preview OR send test email
  const [pdfSrc, setPdfSrc] = useState<{
    order: any; details: any[]; ncr: any; creator: string | null;
    mode: 'preview' | 'send';
  } | null>(null);
  const ncrPdfRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('notification_recipients')
      .select('*').order('email');
    setRows((data as RecipientRow[]) || []);
    setLoading(false);
  };
  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data } = await supabase.from('notification_send_log')
      .select('*').order('sent_at', { ascending: false }).limit(50);
    setSendHistory((data as SendLogRow[]) || []);
    setHistoryLoading(false);
  };
  useEffect(() => { load(); loadHistory(); }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    const email = (editing.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { setMsg('กรุณากรอกอีเมลที่ถูกต้อง'); return; }
    const payload = {
      email,
      name: (editing.name || '').trim() || null,
      role_label: (editing.role_label || '').trim() || null,
      enabled: editing.enabled ?? true
    };
    const { error } = editing.id
      ? await supabase.from('notification_recipients').update(payload).eq('id', editing.id)
      : await supabase.from('notification_recipients').insert(payload);
    if (error) { setMsg('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setEditing(null); await load();
  };

  const toggle = async (r: RecipientRow) => {
    await supabase.from('notification_recipients').update({ enabled: !r.enabled }).eq('id', r.id);
    await load();
  };

  const del = async (id: number) => {
    if (!confirm('ลบรายชื่อนี้?')) return;
    await supabase.from('notification_recipients').delete().eq('id', id);
    await load();
  };

  const loadRejectPayload = async () => {
    const { data: orderRow } = await supabase.from('qc_orders')
      .select('*').eq('status', 'Reject')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!orderRow) return null;
    const [detailsRes, ncrRes, creatorRes] = await Promise.all([
      supabase.from('qc_order_details').select('*').eq('order_id', orderRow.id).order('id'),
      supabase.from('ncr_reports').select('*').eq('order_id', orderRow.id).maybeSingle(),
      orderRow.created_by
        ? supabase.from('profiles').select('full_name').eq('id', orderRow.created_by).maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    return {
      order: orderRow,
      details: (detailsRes.data as any[]) || [],
      ncr: ncrRes.data,
      creator: (creatorRes.data as any)?.full_name || null
    };
  };

  const sendTest = async () => {
    setMsg(''); setTestSending(true);
    try {
      const payload = await loadRejectPayload();
      if (!payload) { setMsg('ไม่พบ Reject order ในระบบสำหรับทดสอบ'); setTestSending(false); return; }
      // Trigger offscreen render → useEffect generates PDF → actually sends email
      setPdfSrc({ ...payload, mode: 'send' });
    } catch (e: any) {
      setMsg('❌ ' + (e?.message || 'error'));
      setTestSending(false);
    }
  };

  const showPreview = async () => {
    setMsg(''); setPreview(null); setPreviewLoading(true);
    try {
      const payload = await loadRejectPayload();
      if (!payload) { setMsg('ไม่พบ Reject order ในระบบสำหรับ preview'); setPreviewLoading(false); return; }
      setPdfSrc({ ...payload, mode: 'preview' });
    } catch (e: any) {
      setMsg('❌ ' + (e?.message || 'error'));
      setPreviewLoading(false);
    }
  };

  // When pdfSrc is set + offscreen NcrReport mounts, render → PDF base64 → fetch email HTML
  useEffect(() => {
    if (!pdfSrc || !ncrPdfRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfFilename = `${pdfSrc.ncr?.ncr_no || pdfSrc.order.order_no}.pdf`;
        const pdfDataUri = await generatePdfDataUri(ncrPdfRef.current!, pdfFilename);

        if (cancelled) return;

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';

        if (pdfSrc.mode === 'preview') {
          // Fetch rendered email HTML (no send) — pair it with the PDF data URI in modal
          const r = await fetch('/api/notify-reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ order_id: pdfSrc.order.id, preview: true })
          });
          const j = await r.json();
          if (cancelled) return;
          if (r.ok && j.ok) {
            setPreview({
              subject: j.subject, html: j.html, recipients: j.recipients,
              order_no: j.order_no, ncr_no: j.ncr_no,
              pdfDataUri, pdfFilename
            });
          } else {
            setMsg(`❌ ${j.error || 'preview failed'}`);
          }
        } else {
          // mode === 'send' → actually send email with PDF attached
          const r = await fetch('/api/notify-reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              order_id: pdfSrc.order.id,
              pdf_base64: pdfDataUri,
              pdf_filename: pdfFilename
            })
          });
          const j = await r.json();
          if (cancelled) return;
          if (r.ok && j.ok) setMsg(`✅ ส่งทดสอบสำเร็จ (${j.recipients} ผู้รับ${j.attached_pdf ? ' · แนบ PDF' : ''})`);
          else setMsg(`❌ ${j.error || j.skipped || 'ส่งไม่สำเร็จ'}`);
          // refresh history so the new send shows up
          loadHistory();
        }
      } catch (e: any) {
        if (!cancelled) setMsg('❌ ' + (e?.message || 'error'));
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
          setTestSending(false);
          setPdfSrc(null);  // unmount offscreen render after capture
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdfSrc]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display font-bold text-lg">📧 Reject Notification Recipients</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            อีเมลในรายการ enabled จะได้รับแจ้งเตือนทุกครั้งที่บันทึก Order = Reject
            {!canEdit && <span className="ml-1 italic">(qc_admin: ดูข้อมูล + ส่งทดสอบ + ดู preview ได้ — แก้รายชื่อต้องใช้ admin)</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={showPreview} disabled={previewLoading} className="btn-secondary text-sm">
            {previewLoading ? 'กำลังโหลด…' : '👁️ Preview email'}
          </button>
          <button onClick={sendTest} disabled={testSending} className="btn-secondary text-sm">
            {testSending ? 'กำลังส่ง…' : '✉️ ส่งทดสอบ / Test send'}
          </button>
          {canEdit && (
            <button onClick={() => setEditing({ enabled: true })} className="btn-primary text-sm">+ เพิ่มอีเมล</button>
          )}
        </div>
      </div>
      {msg && <div className={`rounded-md px-3 py-2 text-sm ${msg.startsWith('✅') ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-error'}`}>{msg}</div>}

      {loading ? (
        <p className="text-sm text-on-surface-variant">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant italic">ยังไม่มีรายชื่อ — กด "+ เพิ่มอีเมล" เพื่อเริ่มต้น</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-on-surface-variant">
            <tr className="border-b border-outline-variant/20">
              <th className="text-left py-2 px-2">Email</th>
              <th className="text-left py-2 px-2">Name</th>
              <th className="text-left py-2 px-2">Role / Label</th>
              <th className="text-center py-2 px-2">Enabled</th>
              <th className="text-right py-2 px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-outline-variant/10 hover:bg-surface-low">
                <td className="py-2 px-2 font-mono text-xs">{r.email}</td>
                <td className="py-2 px-2">{r.name || '—'}</td>
                <td className="py-2 px-2 text-on-surface-variant">{r.role_label || '—'}</td>
                <td className="py-2 px-2 text-center">
                  {canEdit ? (
                    <button onClick={() => toggle(r)}
                      className={`chip text-[10px] ${r.enabled ? 'bg-primary-container text-on-primary-container' : 'bg-surface-high text-on-surface-variant'}`}>
                      {r.enabled ? '✓ ON' : '○ OFF'}
                    </button>
                  ) : (
                    <span className={`chip text-[10px] ${r.enabled ? 'bg-primary-container text-on-primary-container' : 'bg-surface-high text-on-surface-variant'}`}>
                      {r.enabled ? '✓ ON' : '○ OFF'}
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-right space-x-2">
                  {canEdit && <>
                    <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">แก้ไข</button>
                    <button onClick={() => del(r.id)} className="text-xs text-error hover:underline">ลบ</button>
                  </>}
                  {!canEdit && <span className="text-xs text-on-surface-variant italic">read-only</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Send History — last 50 sends */}
      <div className="pt-6 border-t border-outline-variant/15">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div>
            <h3 className="font-display font-semibold">📜 ประวัติการส่ง / Send History</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">50 รายการล่าสุด</p>
          </div>
          <button onClick={loadHistory} disabled={historyLoading} className="btn-secondary text-xs">
            {historyLoading ? 'กำลังโหลด…' : '🔄 รีเฟรช'}
          </button>
        </div>
        {historyLoading ? (
          <p className="text-sm text-on-surface-variant">กำลังโหลด…</p>
        ) : sendHistory.length === 0 ? (
          <p className="text-sm text-on-surface-variant italic">ยังไม่มีประวัติการส่ง</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-on-surface-variant">
                <tr className="border-b border-outline-variant/20">
                  <th className="text-left py-2 px-2">เวลา / When</th>
                  <th className="text-left py-2 px-2">Order No</th>
                  <th className="text-left py-2 px-2">NCR No</th>
                  <th className="text-center py-2 px-2">ผู้รับ</th>
                  <th className="text-center py-2 px-2">PDF</th>
                  <th className="text-center py-2 px-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {sendHistory.map(r => (
                  <tr key={r.id} className="border-b border-outline-variant/10 hover:bg-surface-low">
                    <td className="py-2 px-2 text-xs font-mono whitespace-nowrap">
                      {new Date(r.sent_at).toLocaleString('en-GB', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs">{r.order_no || '—'}</td>
                    <td className="py-2 px-2 font-mono text-xs">{r.ncr_no || '—'}</td>
                    <td className="py-2 px-2 text-center" title={r.recipient_emails || ''}>{r.recipient_count}</td>
                    <td className="py-2 px-2 text-center">{r.attached_pdf ? '📎' : '—'}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`chip text-[10px] ${
                        r.status === 'success' ? 'bg-primary-container text-on-primary-container' :
                        r.status === 'failed' ? 'bg-error-container text-error' :
                        'bg-surface-high text-on-surface-variant'
                      }`} title={r.error_detail || ''}>
                        {r.status === 'success' ? '✓ Sent' :
                         r.status === 'failed' ? '✗ Failed' :
                         '○ Skipped'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && canEdit && (
        <EditModal title={editing.id ? 'แก้ไขผู้รับ' : 'เพิ่มผู้รับ'} onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Email *" value={editing.email}
              onChange={v => setEditing({ ...editing, email: v })}
              placeholder="user@example.com" />
            <Field label="Name" value={editing.name}
              onChange={v => setEditing({ ...editing, name: v })}
              placeholder="ชื่อผู้รับ (ไม่บังคับ)" />
            <Field label="Role / Label" value={editing.role_label}
              onChange={v => setEditing({ ...editing, role_label: v })}
              placeholder="เช่น PCM Team, QC Manager, Sales" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.enabled ?? true}
                onChange={e => setEditing({ ...editing, enabled: e.target.checked })} />
              เปิดใช้งาน / Enabled
            </label>
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}

      {/* Offscreen NCR PDF render — mounted only when generating preview */}
      {pdfSrc && pdfSrc.ncr && (
        <div style={{ position: 'fixed', left: '-99999px', top: 0, width: '794px', pointerEvents: 'none' }}>
          <NcrReport
            ref={ncrPdfRef}
            ncr={pdfSrc.ncr}
            order={pdfSrc.order}
            details={pdfSrc.details}
            createdByName={pdfSrc.creator}
          />
        </div>
      )}

      {/* Email Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setPreview(null)}>
          <div className="fixed inset-0 bg-inverse/50 backdrop-blur-sm" />
          <div className="relative bg-surface-lowest rounded-lg shadow-ambient w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-outline-variant/15 sticky top-0 bg-surface-lowest rounded-t-lg z-10">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-display font-bold">👁️ Email Preview</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Order: <span className="font-mono">{preview.order_no}</span>
                    {preview.ncr_no && <> · NCR: <span className="font-mono">{preview.ncr_no}</span></>}
                  </p>
                </div>
                <button onClick={() => setPreview(null)} className="btn-secondary text-sm">ปิด / Close</button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm">
                <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">Subject</div>
                <div className="font-medium mt-0.5">{preview.subject}</div>
              </div>
              <div className="text-sm">
                <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">To ({preview.recipients.length})</div>
                <div className="text-xs font-mono mt-0.5">
                  {preview.recipients.length === 0 ? <span className="italic text-on-surface-variant">— ไม่มีผู้รับที่ enabled —</span> : preview.recipients.join(', ')}
                </div>
              </div>
              <div className="text-sm">
                <div className="text-[11px] uppercase tracking-wide text-on-surface-variant mb-1">Body (HTML preview)</div>
                <iframe
                  title="Email preview"
                  srcDoc={preview.html}
                  style={{ width: '100%', height: '50vh', border: '1px solid #e5e7eb', borderRadius: 4, background: '#fff' }}
                  sandbox=""
                />
              </div>

              {preview.pdfDataUri && (
                <div className="text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                      📎 PDF Attachment ({preview.pdfFilename})
                    </div>
                    <a
                      href={preview.pdfDataUri}
                      download={preview.pdfFilename || 'preview.pdf'}
                      className="text-xs text-primary hover:underline"
                    >
                      ⬇ ดาวน์โหลด
                    </a>
                  </div>
                  <iframe
                    title="NCR PDF preview"
                    src={preview.pdfDataUri}
                    style={{ width: '100%', height: '60vh', border: '1px solid #e5e7eb', borderRadius: 4, background: '#fff' }}
                  />
                </div>
              )}

              <p className="text-[11px] text-on-surface-variant italic">
                💡 Preview นี้แสดงข้อมูลเดียวกับที่จะถูกส่งจริง (ดึงจาก Reject order ล่าสุด) — ไม่ได้ส่ง email ออกไป
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* =========================================================================
 * USERS
 * ======================================================================= */
interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

const DEFAULT_ROLES = ['admin', 'qc_admin', 'operator', 'viewer'];

const ROLE_LABELS: Record<string, string> = {
  admin:    'admin (Admin System) — ทุกสิทธิ์',
  qc_admin: 'qc_admin (QC Admin) — จัดการ + อนุมัติ',
  operator: 'operator (QC Staff) — บันทึก QC',
  viewer:   'viewer — ดูอย่างเดียว'
};

function UsersPane() {
  const { profile: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<UserRow> & { password?: string; _isNew?: boolean }) | null>(null);
  const [msg, setMsg] = useState('');
  const [pwBanner, setPwBanner] = useState<{ email: string; password: string } | null>(null);

  // Generate a random password (easy to read, ~12 chars, no confusing chars like 0/O/l/I)
  const generatePassword = () => {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const specials = '!@#$';
    const pick = (s: string, n: number) =>
      Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('');
    const pwd = (pick(letters, 7) + pick(digits, 4) + pick(specials, 1))
      .split('').sort(() => Math.random() - 0.5).join('');
    if (editing) setEditing({ ...editing, password: pwd });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
  };

  const apiCall = async (method: string, body?: any, query?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin-users${query || ''}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const { users } = await apiCall('GET');
        setRows(users || []);
      } else {
        const { data } = await supabase.from('profiles').select('*').order('role');
        setRows(data || []);
      }
    } catch (ex: any) {
      setMsg(ex.message);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [isAdmin]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    try {
      const passwordSet = editing.password?.trim();
      if (editing._isNew) {
        if (!editing.email || !passwordSet || !editing.role) {
          setMsg('กรอก Email, Password, Role'); return;
        }
        await apiCall('POST', {
          email: editing.email, password: passwordSet,
          full_name: editing.full_name, role: editing.role
        });
      } else {
        const patch: any = { id: editing.id };
        if (editing.email !== undefined) patch.email = editing.email;
        if (passwordSet) patch.password = passwordSet;
        if (editing.full_name !== undefined) patch.full_name = editing.full_name;
        if (editing.role) patch.role = editing.role;
        await apiCall('PATCH', patch);
      }
      // Show banner with password (only if one was set)
      if (passwordSet && editing.email) {
        setPwBanner({ email: editing.email, password: passwordSet });
      }
      setEditing(null);
      await load();
    } catch (ex: any) { setMsg(ex.message); }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`ลบ ${u.email}?`)) return;
    try {
      await apiCall('DELETE', null, `?id=${encodeURIComponent(u.id)}`);
      await load();
    } catch (ex: any) { alert(ex.message); }
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display font-bold text-lg">Users ({rows.length})</h2>
        {isAdmin && (
          <button className="btn-primary text-sm" onClick={() => setEditing({ _isNew: true, role: 'operator' })}>+ เพิ่มผู้ใช้ / Add User</button>
        )}
      </div>

      {!isAdmin && (
        <p className="text-xs text-on-surface-variant mb-3">
          เฉพาะ role <b>admin</b> เท่านั้นที่จัดการ user ได้
        </p>
      )}
      {msg && <p className="text-sm text-error mb-3">{msg}</p>}

      {pwBanner && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-300 p-3">
          <div className="flex items-start gap-3">
            <span className="text-xl">🔑</span>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm text-amber-900">
                รหัสผ่านใหม่ของ {pwBanner.email} ถูกตั้งแล้ว
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                ⚠️ <b>จดหรือ copy ตอนนี้</b> — เมื่อปิด banner รหัสจะไม่แสดงอีก (Supabase เก็บเป็น hash)
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <code className="bg-white border border-amber-200 rounded px-2 py-1 font-mono text-sm">
                  {pwBanner.password}
                </code>
                <button onClick={() => copyToClipboard(pwBanner.password)}
                  className="btn-secondary text-xs py-1 px-2">📋 Copy</button>
              </div>
            </div>
            <button onClick={() => setPwBanner(null)}
              className="text-amber-700 hover:text-amber-900 text-lg leading-none shrink-0">×</button>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-on-surface-variant">กำลังโหลด…</p> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <th className="py-2">Name</th><th>Email</th><th>Role</th>{isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-outline-variant/15 hover:bg-surface-low/30">
                <td className="py-2">{r.full_name || '—'}</td>
                <td className="font-mono text-xs">{r.email}</td>
                <td><span className="chip chip-active">{r.role}</span></td>
                {isAdmin && (
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-tertiary text-xs py-1 px-2" onClick={() => setEditing({ ...r })}>แก้ไข</button>
                    {r.id !== me?.id && (
                      <button className="text-xs text-error hover:underline ml-2" onClick={() => remove(r)}>ลบ</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EditModal title={editing._isNew ? 'เพิ่ม User' : `แก้ไข User: ${editing.email}`} onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            <Field
              label={editing._isNew ? 'Email *' : 'Email'}
              value={editing.email}
              onChange={v => setEditing({ ...editing, email: v })}
              placeholder="user@cometsintertrade.com"
            />
            <Field label="Full Name" value={editing.full_name} onChange={v => setEditing({ ...editing, full_name: v })} />
            <RoleSelect
              value={editing.role || 'operator'}
              extraOptions={rows.map(r => r.role).filter(Boolean)}
              onChange={v => setEditing({ ...editing, role: v })}
            />
            <div>
              <label className="field-label">
                {editing._isNew ? 'Password *' : 'รีเซ็ตรหัส / Reset Password'}
              </label>
              <div className="flex gap-2">
                <input className="field-input flex-1 font-mono"
                  value={editing.password || ''}
                  onChange={e => setEditing({ ...editing, password: e.target.value })}
                  placeholder={editing._isNew ? 'อย่างน้อย 6 ตัวอักษร / Min 6 chars' : 'เว้นว่างถ้าไม่เปลี่ยน / Leave blank to keep'} />
                <button type="button" onClick={generatePassword}
                  className="btn-secondary text-xs whitespace-nowrap"
                  title="สุ่มรหัส 12 ตัว">
                  🎲 สุ่ม
                </button>
              </div>
              {!editing._isNew && (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  ⚠️ กรอกรหัสใหม่เพื่อรีเซ็ต — เก่าจะถูกแทนทันทีหลังบันทึก หลังบันทึกระบบจะแสดงรหัสให้ครั้งเดียวเพื่อจดไว้
                </p>
              )}
            </div>
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}
    </section>
  );
}

/* =========================================================================
 * Shared helpers
 * ======================================================================= */
function EditModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-inverse/40 backdrop-blur-sm" />
      <div className="relative bg-surface-lowest rounded-lg shadow-ambient max-w-lg w-full max-h-[85vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface-lowest border-b border-outline-variant/15 px-5 py-3 flex items-center justify-between">
          <h3 className="font-display font-bold">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value?: string | null; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input className="field-input" value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <select className="field-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function RoleSelect({ value, extraOptions, onChange }: { value: string; extraOptions: string[]; onChange: (v: string) => void }) {
  const allRoles = Array.from(new Set([...DEFAULT_ROLES, ...extraOptions]));
  const isCustom = !allRoles.includes(value);
  const [showCustom, setShowCustom] = useState<boolean>(isCustom);

  return (
    <div>
      <label className="field-label">Role *</label>
      <select
        className="field-select"
        value={showCustom ? '__custom__' : value}
        onChange={e => {
          if (e.target.value === '__custom__') {
            setShowCustom(true);
            onChange('');
          } else {
            setShowCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        {allRoles.map(r => (
          <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
        ))}
        <option value="__custom__">+ Role อื่น (กรอกเอง) / Custom role…</option>
      </select>
      {showCustom && (
        <input
          className="field-input mt-2"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="พิมพ์ชื่อ role ใหม่ / Type new role name"
          autoFocus
        />
      )}
    </div>
  );
}

function ComboField({ label, value, options, onChange, placeholder }: { label: string; value?: string | null; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const listId = `combo-${label.replace(/\s+/g, '-')}`;
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        list={listId}
        value={value || ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}
