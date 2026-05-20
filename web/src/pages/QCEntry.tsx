import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { parseSapCode } from '../lib/utils';
import SuccessModal, { OrderDraft } from '../components/SuccessModal';

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

  const [orderDate, setOrderDate] = useState(today);          // วันที่ตรวจ / Inspection Date
  const [receivedDate, setReceivedDate] = useState('');        // วันที่รับเข้า / Received Date (optional)
  const [projectBriefNo, setProjectBriefNo] = useState('');
  const [previewOrderNo, setPreviewOrderNo] = useState('');    // peek next QC<YYMM><seq4>
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
  const [originalDocChoice, setOriginalDocChoice] = useState('');   // dropdown selection or '__custom__'
  const [originalDocCustom, setOriginalDocCustom] = useState('');

  const [details, setDetails] = useState<DetailRow[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [defectQuery, setDefectQuery] = useState('');
  const [staging, setStaging] = useState<DefectItem[]>([]);

  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState<OrderDraft | null>(null);

  // brand_responsibilities cache: normalized brand key → { sales, scm }
  const [brandMap, setBrandMap] = useState<Map<string, { sales: string | null; scm: string | null }>>(new Map());

  // Suppliers list — cached at mount for the Sup Code dropdown
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Normalize: strip leading *, ", ' / trim / lowercase — to bridge "*BEET" ↔ "BEET"
  const normalizeBrand = (s: string) => s.replace(/^[*"']+/, '').trim().toLowerCase();

  // Lookups
  useEffect(() => {
    supabase.from('defects').select('defect_code,symptom,reason').limit(5000)
      .then(({ data }) => setDefects((data as Defect[]) || []));

    supabase.from('brand_responsibilities').select('brand,sales,scm').then(({ data }) => {
      const m = new Map<string, { sales: string | null; scm: string | null }>();
      for (const r of ((data as { brand: string; sales: string | null; scm: string | null }[]) || [])) {
        const key = normalizeBrand(r.brand || '');
        if (key) m.set(key, { sales: r.sales, scm: r.scm });
      }
      setBrandMap(m);
    });

    supabase.from('suppliers').select('sup_code,supplier_name,sup_sap_code')
      .order('sup_code')
      .then(({ data }) => setSuppliers((data as Supplier[]) || []));
  }, []);

  // Resolve SAP → material → brand → brand_responsibilities (cached) → sales/scm (debounced)
  useEffect(() => {
    setMaterial(null);
    const code = sapCode.trim();
    if (!code) { setSalesVal(''); setScmVal(''); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('materials')
        .select('sap_code,description,product_category,brand,sales,scm').eq('sap_code', code).maybeSingle();
      const m = (data as Material) || null;
      setMaterial(m);

      // Sales/SCM resolution:
      //   1. material.brand → normalized → lookup brand_responsibilities (authoritative live source)
      //   2. fallback to materials.sales/scm (snapshot at material upload time)
      const br = m?.brand ? brandMap.get(normalizeBrand(m.brand)) : null;
      setSalesVal(br?.sales || m?.sales || '');
      setScmVal(br?.scm || m?.scm || '');
    }, 400);
    return () => clearTimeout(t);
  }, [sapCode, brandMap]);

  // Preview next order_no for the chosen inspection date (peek only — not reserved)
  useEffect(() => {
    if (!orderDate) { setPreviewOrderNo(''); return; }
    supabase.rpc('peek_next_order_no', { p_date: orderDate }).then(({ data, error }) => {
      if (error || !data) { setPreviewOrderNo(''); return; }
      setPreviewOrderNo(String(data));
    });
  }, [orderDate]);


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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    const sample = typeof sampleSize === 'number' ? sampleSize : parseInt(String(sampleSize));
    if (!projectBriefNo.trim()) { setMsg('กรุณากรอก Project Brief No.'); return; }
    if (!sapCode || !sample) { setMsg('กรุณากรอก SAP Code และจำนวนตรวจสอบ'); return; }
    if (!orderStatus) { setMsg('กรุณาเลือกสถานะ Order Status'); return; }
    if (!profile?.id) { setMsg('ไม่พบข้อมูลผู้ใช้ — กรุณา login ใหม่'); return; }

    const originalDocWith = originalDocChoice === '__custom__'
      ? (originalDocCustom.trim() || null)
      : (originalDocChoice || null);

    setDraft({
      order_date: orderDate,
      received_date: receivedDate || null,
      project_brief_no: projectBriefNo.trim(),
      preview_order_no: previewOrderNo || null,
      original_doc_with: originalDocWith,
      created_by_name: profile.full_name || null,
      sap_code: sapCode.trim(),
      material_description: material?.description || null,
      brand: material?.brand || null,
      sales: salesVal || null,
      scm: scmVal || null,
      sup_code: supplier?.sup_code || null,
      supplier_name: supplier?.supplier_name || null,
      lot_no: lotNo.trim() || null,
      received_qty: receivedQty === '' ? null : +receivedQty,
      sample_size: sample,
      status: orderStatus,
      note: note.trim() || null,
      details: details.map(d => ({
        defects: d.defects,
        critical_rank: d.critical_rank,
        quantity: d.quantity,
        images: d.images
      })),
      created_by: profile.id
    });
  };

  const handleSaved = (orderNo: string, ncrNo: string | null) => {
    setReceivedDate(''); setProjectBriefNo(''); setSapCode(''); setSupSapCode(''); setSalesVal(''); setScmVal('');
    setLotNo(''); setReceivedQty(''); setSampleSize(''); setOrderStatus('');
    setNote(''); setOriginalDocChoice(''); setOriginalDocCustom('');
    setDetails([]); setStaging([]);
    setMsg(`✅ บันทึก Order ${orderNo} สำเร็จ${ncrNo ? ` — NCR: ${ncrNo}` : ''}`);
  };

  return (
    <>
    {draft && (
      <SuccessModal
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={(orderNo, ncrNo) => handleSaved(orderNo, ncrNo)}
      />
    )}
    <form onSubmit={submit} className={`space-y-6 ${pass === null ? '' : pass ? 'precision-strip-pass' : 'precision-strip-fail'}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">บันทึกการสุ่มตรวจ / QC Entry</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            ผู้บันทึก / Inspector: {profile?.full_name}
            {previewOrderNo && (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-xs">
                  📋 {previewOrderNo}
                  <span className="text-on-surface-variant font-sans font-normal">(ประมาณ / preview)</span>
                </span>
              </>
            )}
          </p>
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
        <div className="md:col-span-3">
          <label className="field-label">Project Brief No. *</label>
          <input className="field-input" required value={projectBriefNo}
            onChange={e => setProjectBriefNo(e.target.value)}
            placeholder="หมายเลขใบ Project Brief" />
        </div>
        <div>
          <label className="field-label">วันที่รับเข้า / Received Date</label>
          <input type="date" className="field-input" value={receivedDate}
            onChange={e => setReceivedDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">วันที่ตรวจ / Inspection Date *</label>
          <input type="date" required className="field-input" value={orderDate}
            onChange={e => setOrderDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">เลขที่ Order / Order No (ประมาณ)</label>
          <div className="field-input bg-surface-low text-on-surface-variant font-mono cursor-not-allowed">
            {previewOrderNo || '—'}
          </div>
        </div>
        <div className="md:col-span-3">
          <label className="field-label">รหัส SAP / SAP Code *</label>
          <input className="field-input" value={sapCode} onChange={e => setSapCode(e.target.value)} placeholder="เช่น 42741000 หรือ 42741000-1" />
        </div>
        <Display label="รายละเอียดสินค้า / Description" value={material?.description} className="md:col-span-3" />
        {/* SAP breakdown — derived from sap_code */}
        {(() => {
          const p = parseSapCode(sapCode);
          return <>
            <Display label="ประเภท / Item Type"          value={p.itemType || null} />
            <Display label="ที่มา / Item Source"          value={p.itemSource || null} />
            <Display label="หมวด SAP / Item Category"     value={p.itemCategory || null} />
            <Display label="กลุ่ม SAP / Item Group"       value={p.itemGroup || null} />
            <Display label="กลุ่มย่อย / Sub-Item Group"   value={p.subItemGroup || null} />
            <Display label="Running No"                   value={p.runningNo || null} />
            <Display label="Revision"                     value={p.revision || null} />
          </>;
        })()}
        <Display label="กลุ่มสินค้า (Master) / Product Category" value={material?.product_category} />
        <Display label="แบรนด์ / Brand" value={material?.brand} />
        <Display label="ฝ่ายขาย / Sales" value={salesVal || null} />
        <Display label="SCM" value={scmVal || null} />

        <div className="md:col-span-3">
          <label className="field-label">รหัสผู้จัดจำหน่าย / Sup Code</label>
          <select className="field-select"
            value={supplier?.sup_code || ''}
            onChange={e => {
              const code = e.target.value;
              if (!code) { setSupplier(null); setSupSapCode(''); return; }
              const s = suppliers.find(x => x.sup_code === code) || null;
              setSupplier(s);
              setSupSapCode(s?.sup_sap_code || '');
            }}>
            <option value="">— เลือก / Select —</option>
            {suppliers.map(s => (
              <option key={s.sup_code} value={s.sup_code}>
                {s.sup_sap_code ? `${s.sup_sap_code}/${s.sup_code}` : s.sup_code}
              </option>
            ))}
          </select>
        </div>

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

      <section className="section space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">เอกสารต้นฉบับ / Original Documents</label>
            <select className="field-select"
              value={originalDocChoice}
              onChange={e => {
                setOriginalDocChoice(e.target.value);
                if (e.target.value !== '__custom__') setOriginalDocCustom('');
              }}>
              <option value="">— เลือก / Select —</option>
              <option value="คุณอู๋">คุณอู๋</option>
              <option value="WH">WH</option>
              <option value="PD">PD</option>
              <option value="SCM">SCM</option>
              <option value="__custom__">+ อื่น ๆ (พิมพ์เอง) / Other…</option>
            </select>
            {originalDocChoice === '__custom__' && (
              <input className="field-input mt-2" autoFocus
                value={originalDocCustom}
                onChange={e => setOriginalDocCustom(e.target.value)}
                placeholder="พิมพ์ชื่อผู้ถือเอกสาร" />
            )}
          </div>
          <div>
            <label className="field-label">ผู้บันทึก / Recorded By</label>
            <div className="field-input bg-surface-low text-on-surface-variant cursor-not-allowed">
              {profile?.full_name || '—'}
            </div>
          </div>
        </div>
        <div>
          <label className="field-label">หมายเหตุ / Remarks</label>
          <textarea rows={3} className="field-input" value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </section>

      {msg && <div className={`rounded-md px-3 py-2 text-sm ${msg.startsWith('✅') ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-error'}`}>{msg}</div>}

      <div className="flex justify-end gap-3">
        <button type="submit" className="btn-primary">
          ตรวจสอบและบันทึก / Review &amp; Save
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
