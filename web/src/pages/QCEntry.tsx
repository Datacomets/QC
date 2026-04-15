import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Rank = 'Critical' | 'Major' | 'Minor';
interface Material { sap_code: string; description: string | null; brand: string | null; sales: string | null; scm: string | null; }
interface Supplier { sup_code: string; supplier_name: string; sup_sap_code: string | null; }
interface Defect { defect_code: string; symptom: string; reason: string | null; }
interface DetailRow { defect_code: string; symptom: string; critical_rank: Rank; quantity: number; }

export default function QCEntry() {
  const { profile } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const [orderDate, setOrderDate] = useState(today);
  const [sapCode, setSapCode] = useState('');
  const [material, setMaterial] = useState<Material | null>(null);
  const [supCode, setSupCode] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [lotNo, setLotNo] = useState('');
  const [receivedQty, setReceivedQty] = useState<number | ''>('');
  const [sampleSize, setSampleSize] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const [details, setDetails] = useState<DetailRow[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [defectQuery, setDefectQuery] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Lookups
  useEffect(() => {
    supabase.from('defects').select('defect_code,symptom,reason').limit(5000)
      .then(({ data }) => setDefects((data as Defect[]) || []));
  }, []);

  // Resolve SAP → material (debounced)
  useEffect(() => {
    const code = sapCode.trim();
    if (!code) { setMaterial(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('materials')
        .select('sap_code,description,brand,sales,scm').eq('sap_code', code).maybeSingle();
      setMaterial((data as Material) || null);
    }, 250);
    return () => clearTimeout(t);
  }, [sapCode]);

  // Resolve Sup code → supplier
  useEffect(() => {
    const code = supCode.trim();
    if (!code) { setSupplier(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('suppliers')
        .select('sup_code,supplier_name,sup_sap_code').eq('sup_code', code).maybeSingle();
      setSupplier((data as Supplier) || null);
    }, 250);
    return () => clearTimeout(t);
  }, [supCode]);

  // Totals
  const totals = useMemo(() => {
    const crit = details.filter(d => d.critical_rank === 'Critical').reduce((s, d) => s + (+d.quantity || 0), 0);
    const maj  = details.filter(d => d.critical_rank === 'Major').reduce((s, d) => s + (+d.quantity || 0), 0);
    const min  = details.filter(d => d.critical_rank === 'Minor').reduce((s, d) => s + (+d.quantity || 0), 0);
    const tot = crit + maj + min;
    const size = typeof sampleSize === 'number' ? sampleSize : 0;
    const pct = size > 0 ? (tot / size) * 100 : 0;
    return { crit, maj, min, tot, pct };
  }, [details, sampleSize]);

  const pass = totals.pct === 0 && details.length === 0 ? null : totals.pct < 1.0; // placeholder threshold

  const filteredDefects = useMemo(() => {
    const q = defectQuery.toLowerCase().trim();
    if (!q) return defects.slice(0, 20);
    return defects.filter(d =>
      d.defect_code.toLowerCase().includes(q) || (d.symptom || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [defectQuery, defects]);

  const addDefect = (d: Defect) => {
    if (details.some(x => x.defect_code === d.defect_code)) return;
    setDetails([...details, { defect_code: d.defect_code, symptom: d.symptom, critical_rank: 'Minor', quantity: 1 }]);
    setDefectQuery('');
  };

  const updDetail = (i: number, patch: Partial<DetailRow>) => {
    setDetails(details.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  };
  const rmDetail = (i: number) => setDetails(details.filter((_, idx) => idx !== i));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(''); setSaving(true);
    const sample = typeof sampleSize === 'number' ? sampleSize : parseInt(String(sampleSize));
    if (!sapCode || !sample) { setMsg('กรุณากรอก SAP Code และจำนวนตรวจสอบ'); setSaving(false); return; }

    const { data: order, error } = await supabase.from('qc_orders').insert({
      order_date: orderDate,
      sap_code: sapCode.trim(),
      material_description: material?.description,
      brand: material?.brand, sales: material?.sales, scm: material?.scm,
      sup_code: supCode.trim() || null,
      supplier_name: supplier?.supplier_name,
      lot_no: lotNo.trim() || null,
      received_qty: receivedQty === '' ? null : +receivedQty,
      sample_size: sample,
      note: note.trim() || null,
      created_by: profile?.id
    }).select('id, order_no').single();

    if (error || !order) { setMsg('บันทึกไม่สำเร็จ: ' + (error?.message || '')); setSaving(false); return; }

    if (details.length) {
      const { error: e2 } = await supabase.from('qc_order_details').insert(
        details.map(d => ({
          order_id: order.id,
          defect_code: d.defect_code, symptom: d.symptom,
          critical_rank: d.critical_rank, quantity: +d.quantity
        }))
      );
      if (e2) { setMsg('บันทึกรายการของเสียไม่สำเร็จ: ' + e2.message); setSaving(false); return; }
    }

    setMsg(`✅ บันทึกสำเร็จ  เลขที่ ${order.order_no}`);
    setSaving(false);
    // Reset
    setSapCode(''); setSupCode(''); setLotNo(''); setReceivedQty(''); setSampleSize(''); setNote(''); setDetails([]);
  };

  return (
    <form onSubmit={submit} className={`space-y-6 ${pass === null ? '' : pass ? 'precision-strip-pass' : 'precision-strip-fail'}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">บันทึกการสุ่มตรวจ</h1>
          <p className="text-sm text-on-surface-variant mt-1">ผู้บันทึก: {profile?.full_name}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-on-surface-variant">% ของเสีย</div>
          <div className={`font-display font-bold text-5xl ${pass === false ? 'text-error' : 'text-primary'}`}>
            {totals.pct.toFixed(2)}<span className="text-xl align-top">%</span>
          </div>
        </div>
      </div>

      {/* Master info */}
      <section className="section grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="field-label">วันที่</label>
          <input type="date" className="field-input" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="field-label">SAP Code</label>
          <input className="field-input" value={sapCode} onChange={e => setSapCode(e.target.value)} placeholder="เช่น 1110001" />
          {material && <p className="mt-1 text-xs text-on-surface-variant">{material.description}</p>}
        </div>
        <Display label="Brand" value={material?.brand} />
        <Display label="Sales" value={material?.sales} />
        <Display label="SCM" value={material?.scm} />

        <div>
          <label className="field-label">Sup Code</label>
          <input className="field-input" value={supCode} onChange={e => setSupCode(e.target.value)} placeholder="เช่น A, 1L" />
        </div>
        <Display label="Supplier" value={supplier?.supplier_name} className="md:col-span-2" />

        <div>
          <label className="field-label">Lot No.</label>
          <input className="field-input" value={lotNo} onChange={e => setLotNo(e.target.value)} />
        </div>
        <div>
          <label className="field-label">จำนวนรับ</label>
          <input type="number" min="0" className="field-input"
            value={receivedQty} onChange={e => setReceivedQty(e.target.value === '' ? '' : +e.target.value)} />
        </div>
        <div>
          <label className="field-label">จำนวนตรวจสอบ *</label>
          <input type="number" min="1" required className="field-input"
            value={sampleSize} onChange={e => setSampleSize(e.target.value === '' ? '' : +e.target.value)} />
        </div>
      </section>

      {/* Defects */}
      <section className="section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg">รายการของเสีย</h2>
          <div className="flex gap-2 text-xs">
            <span className="chip">Critical: <b className="ml-1 text-on-surface">{totals.crit}</b></span>
            <span className="chip">Major: <b className="ml-1 text-on-surface">{totals.maj}</b></span>
            <span className="chip">Minor: <b className="ml-1 text-on-surface">{totals.min}</b></span>
            <span className="chip chip-active">รวม: <b className="ml-1">{totals.tot}</b></span>
          </div>
        </div>

        <div className="relative">
          <input className="field-input" placeholder="ค้นหารหัสของเสีย หรือชื่ออาการ…"
            value={defectQuery} onChange={e => setDefectQuery(e.target.value)} />
          {defectQuery && (
            <div className="absolute z-10 mt-1 w-full rounded-md bg-surface-lowest shadow-ambient max-h-72 overflow-auto">
              {filteredDefects.map(d => (
                <button type="button" key={d.defect_code} onClick={() => addDefect(d)}
                  className="block w-full text-left px-4 py-2 hover:bg-surface-low">
                  <span className="font-mono text-xs text-on-surface-variant mr-2">{d.defect_code}</span>
                  <span>{d.symptom}</span>
                </button>
              ))}
              {filteredDefects.length === 0 && <div className="px-4 py-3 text-sm text-on-surface-variant">ไม่พบ</div>}
            </div>
          )}
        </div>

        {details.length > 0 && (
          <div className="mt-4 space-y-2">
            {details.map((d, i) => (
              <div key={i} className="bg-surface-lowest rounded-md p-3 grid grid-cols-12 gap-3 items-center">
                <div className="col-span-6">
                  <div className="font-mono text-xs text-on-surface-variant">{d.defect_code}</div>
                  <div className="text-sm">{d.symptom}</div>
                </div>
                <div className="col-span-3">
                  <select className="field-select text-sm" value={d.critical_rank}
                    onChange={e => updDetail(i, { critical_rank: e.target.value as Rank })}>
                    <option value="Critical">Critical</option>
                    <option value="Major">Major</option>
                    <option value="Minor">Minor</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <input type="number" min="0" className="field-input text-sm text-right"
                    value={d.quantity} onChange={e => updDetail(i, { quantity: +e.target.value })} />
                </div>
                <button type="button" onClick={() => rmDetail(i)}
                  className="col-span-1 text-xs text-error hover:underline">ลบ</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <label className="field-label">หมายเหตุ</label>
        <textarea rows={3} className="field-input" value={note} onChange={e => setNote(e.target.value)} />
      </section>

      {msg && <div className={`rounded-md px-3 py-2 text-sm ${msg.startsWith('✅') ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-error'}`}>{msg}</div>}

      <div className="flex justify-end gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </form>
  );
}

function Display({ label, value, className = '' }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      <div className="field-input bg-surface-mid text-on-surface-variant">{value || '—'}</div>
    </div>
  );
}
