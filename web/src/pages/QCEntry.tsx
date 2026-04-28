import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import SuccessModal, { OrderSummary } from '../components/SuccessModal';

type Rank = 'Critical' | 'Major' | 'Minor';
interface Material { sap_code: string; description: string | null; product_category: string | null; brand: string | null; sales: string | null; scm: string | null; }
interface Supplier { sup_code: string; supplier_name: string; sup_sap_code: string | null; }
interface Defect { defect_code: string; symptom: string; reason: string | null; }
interface DefectItem { code: string; symptom: string; }
interface ImageFile { file: File; preview: string; }
interface DetailRow { defects: DefectItem[]; critical_rank: Rank; quantity: number; images: ImageFile[]; }

export default function QCEntry() {
  const { profile } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const [orderDate, setOrderDate] = useState(today);
  const [sapCode, setSapCode] = useState('');
  const [material, setMaterial] = useState<Material | null>(null);
  const [supSapCode, setSupSapCode] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [salesVal, setSalesVal] = useState('');
  const [scmVal, setScmVal] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [receivedQty, setReceivedQty] = useState<number | ''>('');
  const [sampleSize, setSampleSize] = useState<number | ''>('');
  const [orderStatus, setOrderStatus] = useState<'Accept' | 'Accept Lot' | 'Reject' | ''>('');
  const [note, setNote] = useState('');

  const [details, setDetails] = useState<DetailRow[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [defectQuery, setDefectQuery] = useState('');
  const [staging, setStaging] = useState<DefectItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [successOrder, setSuccessOrder] = useState<OrderSummary | null>(null);

  // Lookups
  useEffect(() => {
    supabase.from('defects').select('defect_code,symptom,reason').limit(5000)
      .then(({ data }) => setDefects((data as Defect[]) || []));
  }, []);

  // Resolve SAP → material (debounced)
  useEffect(() => {
    setMaterial(null);
    const code = sapCode.trim();
    if (!code) { setSalesVal(''); setScmVal(''); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('materials')
        .select('sap_code,description,product_category,brand,sales,scm').eq('sap_code', code).maybeSingle();
      const m = (data as Material) || null;
      setMaterial(m);
      setSalesVal(m?.sales || '');
      setScmVal(m?.scm || '');
    }, 400);
    return () => clearTimeout(t);
  }, [sapCode]);

  // Resolve Sup SAP Code → supplier
  useEffect(() => {
    setSupplier(null);
    const code = supSapCode.trim();
    if (!code) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('suppliers')
        .select('sup_code,supplier_name,sup_sap_code').eq('sup_sap_code', code).maybeSingle();
      setSupplier((data as Supplier) || null);
    }, 400);
    return () => clearTimeout(t);
  }, [supSapCode]);

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

  const toggleStaging = (d: Defect) => {
    if (staging.some(s => s.code === d.defect_code)) {
      setStaging(staging.filter(s => s.code !== d.defect_code));
    } else {
      setStaging([...staging, { code: d.defect_code, symptom: d.symptom }]);
    }
  };

  const addGroup = () => {
    if (staging.length === 0) return;
    setDetails([...details, { defects: staging, critical_rank: 'Minor', quantity: 1, images: [] }]);
    setStaging([]);
    setDefectQuery('');
  };

  const updDetail = (i: number, patch: Partial<DetailRow>) => {
    setDetails(details.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  };
  const rmDetail = (i: number) => {
    details[i].images.forEach(img => URL.revokeObjectURL(img.preview));
    setDetails(details.filter((_, idx) => idx !== i));
  };

  const addImages = (i: number, files: FileList | null) => {
    if (!files) return;
    const current = details[i].images;
    const remaining = 3 - current.length;
    if (remaining <= 0) return;
    const newImgs: ImageFile[] = Array.from(files).slice(0, remaining).map(f => ({
      file: f, preview: URL.createObjectURL(f)
    }));
    updDetail(i, { images: [...current, ...newImgs] });
  };

  const rmImage = (detailIdx: number, imgIdx: number) => {
    const imgs = [...details[detailIdx].images];
    URL.revokeObjectURL(imgs[imgIdx].preview);
    imgs.splice(imgIdx, 1);
    updDetail(detailIdx, { images: imgs });
  };

  const uploadImages = async (orderId: number, detailIdx: number): Promise<string[]> => {
    const urls: string[] = [];
    for (const img of details[detailIdx].images) {
      const ext = img.file.name.split('.').pop() || 'jpg';
      const path = `${orderId}/${detailIdx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error } = await supabase.storage.from('defect-images').upload(path, img.file);
      if (!error) {
        const { data } = supabase.storage.from('defect-images').getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    return urls;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(''); setSaving(true);
    const sample = typeof sampleSize === 'number' ? sampleSize : parseInt(String(sampleSize));
    if (!sapCode || !sample) { setMsg('กรุณากรอก SAP Code และจำนวนตรวจสอบ'); setSaving(false); return; }
    if (!orderStatus) { setMsg('กรุณาเลือกสถานะ Order Status'); setSaving(false); return; }

    const { data: order, error } = await supabase.from('qc_orders').insert({
      order_date: orderDate,
      sap_code: sapCode.trim(),
      material_description: material?.description,
      brand: material?.brand, sales: salesVal || null, scm: scmVal || null,
      sup_code: supplier?.sup_code || null,
      supplier_name: supplier?.supplier_name,
      lot_no: lotNo.trim() || null,
      received_qty: receivedQty === '' ? null : +receivedQty,
      sample_size: sample,
      status: orderStatus,
      note: note.trim() || null,
      created_by: profile?.id
    }).select('id, order_no').single();

    if (error || !order) { setMsg('บันทึกไม่สำเร็จ: ' + (error?.message || '')); setSaving(false); return; }

    if (details.length) {
      const rows = [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        const imageUrls = d.images.length > 0 ? await uploadImages(order.id, i) : [];
        const primaryCode = d.defects[0]?.code;
        const combinedSymptom = d.defects.map(df => `${df.code}: ${df.symptom}`).join(', ');
        rows.push({
          order_id: order.id,
          defect_code: primaryCode, symptom: combinedSymptom,
          critical_rank: d.critical_rank, quantity: +d.quantity,
          images: imageUrls
        });
      }
      const { error: e2 } = await supabase.from('qc_order_details').insert(rows);
      if (e2) { setMsg('บันทึกรายการของเสียไม่สำเร็จ: ' + e2.message); setSaving(false); return; }
    }

    // Fallback: auto-create NCR if status = Reject (in case DB trigger not applied)
    let ncrNo: string | null = null;
    if (orderStatus === 'Reject') {
      const { data: existingNcr } = await supabase.from('ncr_reports').select('ncr_no').eq('order_id', order.id).maybeSingle();
      if (existingNcr) {
        ncrNo = existingNcr.ncr_no;
      } else {
        const { data: newNcr } = await supabase.from('ncr_reports').insert({
          order_id: order.id, order_no: order.order_no, created_by: profile?.id
        }).select('ncr_no').single();
        ncrNo = newNcr?.ncr_no || null;
      }
    }

    const summary: OrderSummary = {
      order_no: order.order_no,
      order_date: orderDate,
      sap_code: sapCode.trim(),
      material_description: material?.description || null,
      brand: material?.brand || null,
      sales: salesVal || null,
      scm: scmVal || null,
      sup_code: supplier?.sup_code || null,
      supplier_name: supplier?.supplier_name || null,
      lot_no: lotNo.trim() || null,
      received_qty: receivedQty === '' ? null : +receivedQty,
      sample_size: typeof sampleSize === 'number' ? sampleSize : parseInt(String(sampleSize)),
      status: orderStatus,
      ncr_no: ncrNo,
      note: note.trim() || null,
      details: details.map(d => ({
        defect_code: d.defects.map(x => x.code).join(', '),
        symptom: d.defects.map(x => x.symptom).join(', '),
        critical_rank: d.critical_rank,
        quantity: d.quantity,
        images: d.images
      }))
    };
    setSuccessOrder(summary);
    setSaving(false);
    setSapCode(''); setSupSapCode(''); setSalesVal(''); setScmVal(''); setLotNo(''); setReceivedQty(''); setSampleSize(''); setOrderStatus(''); setNote(''); setDetails([]); setStaging([]);
  };

  return (
    <>
    {successOrder && (
      <SuccessModal order={successOrder} onClose={() => setSuccessOrder(null)} />
    )}
    <form onSubmit={submit} className={`space-y-6 ${pass === null ? '' : pass ? 'precision-strip-pass' : 'precision-strip-fail'}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">บันทึกการสุ่มตรวจ / QC Entry</h1>
          <p className="text-sm text-on-surface-variant mt-1">ผู้บันทึก / Inspector: {profile?.full_name}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-on-surface-variant">% ของเสีย / Defect Rate</div>
          <div className={`font-display font-bold text-5xl ${pass === false ? 'text-error' : 'text-primary'}`}>
            {totals.pct.toFixed(2)}<span className="text-xl align-top">%</span>
          </div>
        </div>
      </div>

      {/* Master info */}
      <section className="section grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="field-label">วันที่ / Date</label>
          <input type="date" className="field-input" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="field-label">รหัส SAP / SAP Code</label>
          <input className="field-input" value={sapCode} onChange={e => setSapCode(e.target.value)} placeholder="เช่น 1110001" />
        </div>
        <Display label="รายละเอียดสินค้า / Description" value={material?.description} className="md:col-span-3" />
        <Display label="กลุ่มสินค้า / Category" value={material?.product_category} />
        <Display label="แบรนด์ / Brand" value={material?.brand} />
        <div>
          <label className="field-label">ฝ่ายขาย / Sales</label>
          <input className="field-input" value={salesVal} onChange={e => setSalesVal(e.target.value)} />
        </div>
        <div>
          <label className="field-label">SCM</label>
          <input className="field-input" value={scmVal} onChange={e => setScmVal(e.target.value)} />
        </div>

        <div>
          <label className="field-label">รหัส Sup SAP / Vendor Code</label>
          <input className="field-input" value={supSapCode} onChange={e => setSupSapCode(e.target.value)} placeholder="เช่น 10000138" />
        </div>
        <Display label="รหัสผู้จัดจำหน่าย / Sup Code" value={supplier?.sup_code} />
        <Display label="ผู้จัดจำหน่าย / Supplier" value={supplier?.supplier_name} />

        <div>
          <label className="field-label">หมายเลข Lot / Lot No.</label>
          <input className="field-input" value={lotNo} onChange={e => setLotNo(e.target.value)} />
        </div>
        <div>
          <label className="field-label">จำนวนรับ / Received Qty</label>
          <input type="number" min="0" className="field-input"
            value={receivedQty} onChange={e => setReceivedQty(e.target.value === '' ? '' : +e.target.value)} />
        </div>
        <div>
          <label className="field-label">จำนวนตรวจสอบ / Sample Size *</label>
          <input type="number" min="1" required className="field-input"
            value={sampleSize} onChange={e => setSampleSize(e.target.value === '' ? '' : +e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <label className="field-label">สถานะ / Order Status *</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(['Accept', 'Accept Lot', 'Reject'] as const).map(s => (
              <button type="button" key={s}
                onClick={() => setOrderStatus(s)}
                className={`rounded-md px-3 py-2.5 text-sm font-semibold transition border ${
                  orderStatus === s
                    ? s === 'Reject'
                      ? 'bg-error text-white border-error shadow-ambient'
                      : 'bg-primary text-white border-primary shadow-ambient'
                    : 'bg-surface-lowest border-outline-variant/40 text-on-surface-variant hover:bg-surface-low'
                }`}>
                {s === 'Accept' && 'ผ่าน / Accept'}
                {s === 'Accept Lot' && 'รับ Lot / Accept Lot'}
                {s === 'Reject' && 'ไม่ผ่าน / Reject'}
              </button>
            ))}
          </div>
          {orderStatus === 'Reject' && (
            <p className="mt-2 text-xs text-error">
              ⚠ เมื่อบันทึก จะสร้าง NCR (Non-Conformance Report) อัตโนมัติ / NCR will be auto-created
            </p>
          )}
        </div>
      </section>

      {/* Defects */}
      <section className="section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg">รายการของเสีย / Defect List</h2>
          <div className="flex gap-2 text-xs">
            <span className="chip">Critical: <b className="ml-1 text-on-surface">{totals.crit}</b></span>
            <span className="chip">Major: <b className="ml-1 text-on-surface">{totals.maj}</b></span>
            <span className="chip">Minor: <b className="ml-1 text-on-surface">{totals.min}</b></span>
            <span className="chip chip-active">รวม/Total: <b className="ml-1">{totals.tot}</b></span>
          </div>
        </div>

        <div className="relative">
          <input className="field-input" placeholder="ค้นหารหัสของเสีย / Search defect code or symptom… (เลือกได้หลายอัน)"
            value={defectQuery} onChange={e => setDefectQuery(e.target.value)} />
          {defectQuery && (
            <div className="absolute z-10 mt-1 w-full rounded-md bg-surface-lowest shadow-ambient max-h-80 overflow-auto">
              <div className="flex items-center justify-between px-4 py-2 bg-surface-low sticky top-0 gap-2">
                <span className="text-xs text-on-surface-variant">
                  เลือกแล้ว / Selected: {staging.length} อาการ / symptom(s)
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setStaging([]); setDefectQuery(''); }}
                    className="text-xs text-on-surface-variant hover:underline">ยกเลิก / Cancel</button>
                  <button type="button" onClick={addGroup} disabled={staging.length === 0}
                    className="text-xs text-primary font-semibold hover:underline disabled:opacity-40">
                    เพิ่มในรายการ / Add ({staging.length})
                  </button>
                </div>
              </div>
              {filteredDefects.map(d => {
                const selected = staging.some(x => x.code === d.defect_code);
                return (
                  <button type="button" key={d.defect_code} onClick={() => toggleStaging(d)}
                    className={`flex items-center gap-3 w-full text-left px-4 py-2 hover:bg-surface-low ${selected ? 'bg-primary-container/50' : ''}`}>
                    <span className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-primary border-primary text-white' : 'border-outline-variant'}`}>
                      {selected && <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                    </span>
                    <span className="font-mono text-xs text-on-surface-variant">{d.defect_code}</span>
                    <span className="text-sm flex-1 truncate">{d.symptom}</span>
                  </button>
                );
              })}
              {filteredDefects.length === 0 && <div className="px-4 py-3 text-sm text-on-surface-variant">ไม่พบ</div>}
            </div>
          )}
        </div>

        {details.length > 0 && (
          <div className="mt-4 space-y-3">
            {details.map((d, i) => (
              <div key={i} className="bg-surface-lowest rounded-md p-4 space-y-3">
                <div className="grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-5">
                    <div className="font-mono text-xs text-on-surface-variant">
                      {d.defects.map(x => x.code).join(', ')}
                    </div>
                    <div className="text-sm">
                      {d.defects.map(x => x.symptom).join(', ')}
                    </div>
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
                    className="col-span-2 text-xs text-error hover:underline text-right pt-2">ลบ / Del</button>
                </div>
                {/* Image upload 1-3 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {d.images.map((img, j) => (
                    <div key={j} className="relative group">
                      <img src={img.preview} alt={`defect-${i}-${j}`}
                        className="h-16 w-16 rounded-md object-cover bg-surface-mid" />
                      <button type="button" onClick={() => rmImage(i, j)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-error text-white text-[10px] font-bold
                                   grid place-items-center opacity-0 group-hover:opacity-100 transition">
                        x
                      </button>
                    </div>
                  ))}
                  {d.images.length < 3 && (
                    <label className="h-16 w-16 rounded-md bg-surface-mid flex flex-col items-center justify-center
                                      cursor-pointer hover:bg-surface-high transition text-on-surface-variant">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-[9px] mt-0.5">{d.images.length}/3</span>
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => addImages(i, e.target.files)} />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <label className="field-label">หมายเหตุ / Remarks</label>
        <textarea rows={3} className="field-input" value={note} onChange={e => setNote(e.target.value)} />
      </section>

      {msg && <div className={`rounded-md px-3 py-2 text-sm ${msg.startsWith('✅') ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-error'}`}>{msg}</div>}

      <div className="flex justify-end gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก… / Saving…' : 'บันทึก / Save'}
        </button>
      </div>
    </form>
    </>
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
