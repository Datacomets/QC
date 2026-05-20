import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { sapBreakdownLabel } from '../lib/utils';

type Rank = 'Critical' | 'Major' | 'Minor';
interface DetailRow { defect_code: string; symptom: string; critical_rank: Rank; quantity: number; existingImages: string[]; newImages: { file: File; preview: string }[]; }

export default function QCEdit() {
  const { orderId } = useParams<{ orderId: string }>();
  const { profile } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [orderNo, setOrderNo] = useState('');
  const [editReason, setEditReason] = useState('');
  // Track whether the order was approved before this edit
  // (used to decide whether to clear approval state on save)
  const [wasApproved, setWasApproved] = useState(false);
  const [orderDate, setOrderDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [projectBriefNo, setProjectBriefNo] = useState('');
  const [sapCode, setSapCode] = useState('');
  const [materialDesc, setMaterialDesc] = useState('');
  const [brand, setBrand] = useState('');
  const [sales, setSales] = useState('');
  const [scm, setScm] = useState('');
  const [supCode, setSupCode] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [receivedQty, setReceivedQty] = useState<number | ''>('');
  const [sampleSize, setSampleSize] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [defects, setDefects] = useState<{ defect_code: string; symptom: string }[]>([]);
  const [defectQuery, setDefectQuery] = useState('');
  const [staging, setStaging] = useState<{ code: string; symptom: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Load existing order
  useEffect(() => {
    if (!orderId) return;
    (async () => {
      const { data: order } = await supabase.from('qc_orders').select('*').eq('id', +orderId).single();
      if (!order) { nav('/'); return; }

      // Authorization: owner OR admin/qc_admin can edit any order anytime
      const isAdminRole = profile?.role === 'admin' || profile?.role === 'qc_admin';
      const isOwner = order.created_by === profile?.id;
      if (!isOwner && !isAdminRole) {
        alert('คุณไม่มีสิทธิ์แก้ไข Order นี้\nYou don\'t have permission to edit this Order');
        nav('/');
        return;
      }

      // Track approval state to decide whether to clear it on save
      setWasApproved(!!order.approved);

      setOrderNo(order.order_no);
      setEditReason(order.edit_reason || '');
      setOrderDate(order.order_date);
      setReceivedDate(order.received_date || '');
      setProjectBriefNo(order.project_brief_no || '');
      setSapCode(order.sap_code || '');
      setMaterialDesc(order.material_description || '');
      setBrand(order.brand || '');
      setSales(order.sales || '');
      setScm(order.scm || '');
      setSupCode(order.sup_code || '');
      setSupplierName(order.supplier_name || '');
      setLotNo(order.lot_no || '');
      setReceivedQty(order.received_qty ?? '');
      setSampleSize(order.sample_size);
      setNote(order.note || '');
      setStatus(['Accept', 'Accept Lot', 'Reject'].includes(order.status) ? order.status : '');

      const { data: dets } = await supabase.from('qc_order_details')
        .select('defect_code,symptom,critical_rank,quantity,images')
        .eq('order_id', +orderId).order('id');
      setDetails((dets || []).map((d: any) => ({
        defect_code: d.defect_code || '',
        symptom: d.symptom || '',
        critical_rank: d.critical_rank as Rank,
        quantity: d.quantity,
        existingImages: d.images || [],
        newImages: []
      })));
      setLoading(false);
    })();
    supabase.from('defects').select('defect_code,symptom').limit(5000)
      .then(({ data }) => setDefects(data || []));
  }, [orderId, nav]);

  const totals = useMemo(() => {
    const crit = details.filter(d => d.critical_rank === 'Critical').reduce((s, d) => s + (+d.quantity || 0), 0);
    const maj = details.filter(d => d.critical_rank === 'Major').reduce((s, d) => s + (+d.quantity || 0), 0);
    const min = details.filter(d => d.critical_rank === 'Minor').reduce((s, d) => s + (+d.quantity || 0), 0);
    const tot = crit + maj + min;
    const size = typeof sampleSize === 'number' ? sampleSize : 0;
    return { crit, maj, min, tot, pct: size > 0 ? (tot / size) * 100 : 0 };
  }, [details, sampleSize]);

  const filteredDefects = useMemo(() => {
    const q = defectQuery.toLowerCase().trim();
    if (!q) return defects.slice(0, 20);
    return defects.filter(d => d.defect_code.toLowerCase().includes(q) || d.symptom.toLowerCase().includes(q)).slice(0, 20);
  }, [defectQuery, defects]);

  const toggleStaging = (d: { defect_code: string; symptom: string }) => {
    if (staging.some(s => s.code === d.defect_code)) setStaging(staging.filter(s => s.code !== d.defect_code));
    else setStaging([...staging, { code: d.defect_code, symptom: d.symptom }]);
  };

  const addGroup = () => {
    if (!staging.length) return;
    setDetails([...details, {
      defect_code: staging.map(s => s.code).join(', '),
      symptom: staging.map(s => s.symptom).join(', '),
      critical_rank: 'Minor', quantity: 1, existingImages: [], newImages: []
    }]);
    setStaging([]); setDefectQuery('');
  };

  const updDetail = (i: number, patch: Partial<DetailRow>) => setDetails(details.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  const rmDetail = (i: number) => { details[i].newImages.forEach(img => URL.revokeObjectURL(img.preview)); setDetails(details.filter((_, idx) => idx !== i)); };
  const rmExistingImg = (di: number, ii: number) => { const imgs = [...details[di].existingImages]; imgs.splice(ii, 1); updDetail(di, { existingImages: imgs }); };

  const addNewImages = (i: number, files: FileList | null) => {
    if (!files) return;
    const total = details[i].existingImages.length + details[i].newImages.length;
    const remaining = 3 - total;
    if (remaining <= 0) return;
    const newImgs = Array.from(files).slice(0, remaining).map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    updDetail(i, { newImages: [...details[i].newImages, ...newImgs] });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(''); setSaving(true);
    const sample = typeof sampleSize === 'number' ? sampleSize : parseInt(String(sampleSize));
    if (!sample) { setMsg('กรุณากรอกจำนวนตรวจสอบ'); setSaving(false); return; }
    if (!status) { setMsg('กรุณาเลือกผลตรวจ / Please select inspection result'); setSaving(false); return; }

    // Build update payload
    const updateRow: Record<string, unknown> = {
      received_date: receivedDate || null,
      project_brief_no: projectBriefNo.trim() || null,
      sap_code: sapCode.trim(), material_description: materialDesc, brand, sales, scm,
      sup_code: supCode.trim() || null, supplier_name: supplierName || null,
      lot_no: lotNo.trim() || null,
      received_qty: receivedQty === '' ? null : +receivedQty,
      sample_size: sample, note: note.trim() || null, status,
    };

    // Edit on previously-approved order → return to Pending (data changed after approval
    // → re-approval required to restore audit integrity)
    if (wasApproved) {
      Object.assign(updateRow, {
        approved: false, approved_by: null, approved_by_name: null, approved_at: null,
        accept_approved: false, accept_approved_by: null, accept_approved_by_name: null, accept_approved_at: null,
        acceptlot_approved: false, acceptlot_approved_by: null, acceptlot_approved_by_name: null, acceptlot_approved_at: null,
        reject_approved: false, reject_approved_by: null, reject_approved_by_name: null, reject_approved_at: null
      });
    }

    const { error } = await supabase.from('qc_orders').update(updateRow).eq('id', +orderId!);
    if (error) { setMsg('แก้ไขไม่สำเร็จ: ' + error.message); setSaving(false); return; }

    // Delete old details and re-insert
    await supabase.from('qc_order_details').delete().eq('order_id', +orderId!);

    if (details.length) {
      const rows = [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        const imageUrls = [...d.existingImages];
        // Upload new images
        for (const img of d.newImages) {
          const ext = img.file.name.split('.').pop() || 'jpg';
          const path = `${orderId}/${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from('defect-images').upload(path, img.file);
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('defect-images').getPublicUrl(path);
            imageUrls.push(urlData.publicUrl);
          }
        }
        rows.push({
          order_id: +orderId!,
          defect_code: d.defect_code, symptom: d.symptom,
          critical_rank: d.critical_rank, quantity: +d.quantity,
          images: imageUrls
        });
      }
      const { error: e2 } = await supabase.from('qc_order_details').insert(rows);
      if (e2) { setMsg('บันทึกรายการของเสียไม่สำเร็จ: ' + e2.message); setSaving(false); return; }
    }

    // Audit log: insert a fresh row for every edit (best-effort; ignore if table missing)
    const { error: logErr } = await supabase.from('qc_order_edit_log').insert({
      order_id: +orderId!,
      edit_reason: 'แก้ไขข้อมูล / Direct edit',
      edited_by: profile?.id,
      edited_at: new Date().toISOString()
    });
    if (logErr && !/schema cache|does not exist/i.test(logErr.message)) {
      // unexpected failure — log to console but don't block the save
      console.warn('Edit log insert failed:', logErr.message);
    }

    setSaving(false);
    nav('/');
  };

  if (loading) return <div className="p-8 text-on-surface-variant">กำลังโหลด…</div>;

  return (
    <form onSubmit={submit} className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">แก้ไขใบสุ่มตรวจ / Edit QC Order</h1>
          <p className="text-sm text-on-surface-variant mt-1">เลขที่ / Order No. {orderNo} • ผู้แก้ไข / Editor: {profile?.full_name}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-on-surface-variant">% ของเสีย / Defect Rate</div>
          <div className={`font-display font-bold text-4xl ${totals.pct > 0 ? 'text-error' : 'text-primary'}`}>
            {totals.pct.toFixed(2)}<span className="text-lg align-top">%</span>
          </div>
        </div>
      </div>

      {editReason && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
          <span className="font-semibold text-amber-800">เหตุผลที่อนุมัติแก้ไข / Edit Reason: </span>
          <span className="text-amber-900">{editReason}</span>
        </div>
      )}

      {wasApproved && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
          <span className="font-semibold text-blue-800">⚠ Order นี้ถูกอนุมัติไปแล้ว / Order Already Approved: </span>
          <span className="text-blue-900">
            หลังบันทึก สถานะการอนุมัติจะถูกรีเซ็ตเป็น Pending (ต้อง re-approve ใหม่)
          </span>
        </div>
      )}

      {/* Order info */}
      <section className="section grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-3">
          <label className="field-label">Project Brief No.</label>
          <input className="field-input" value={projectBriefNo}
            onChange={e => setProjectBriefNo(e.target.value)} />
        </div>
        <div>
          <label className="field-label">วันที่รับเข้า / Received Date</label>
          <input type="date" className="field-input" value={receivedDate}
            onChange={e => setReceivedDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">วันที่ตรวจ / Inspection Date</label>
          <input type="date" className="field-input bg-surface-mid" value={orderDate} disabled />
        </div>
        <div>
          <label className="field-label">ผลตรวจ / Inspection Result</label>
          <select className="field-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">— เลือก / Select —</option>
            <option value="Accept">ผ่าน / Accept</option>
            <option value="Accept Lot">รับ Lot / Accept Lot</option>
            <option value="Reject">ไม่ผ่าน / Reject</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="field-label">รหัส SAP / SAP Code</label>
          <input className="field-input" value={sapCode} onChange={e => setSapCode(e.target.value)} />
          {sapBreakdownLabel(sapCode) && (
            <p className="text-[11px] text-on-surface-variant mt-1">🏷️ {sapBreakdownLabel(sapCode)}</p>
          )}
        </div>
        <div className="md:col-span-3">
          <label className="field-label">รายละเอียดสินค้า / Description</label>
          <input className="field-input" value={materialDesc} onChange={e => setMaterialDesc(e.target.value)} />
        </div>
        <EditField label="แบรนด์ / Brand" value={brand} onChange={setBrand} />
        <EditField label="ฝ่ายขาย / Sales" value={sales} onChange={setSales} />
        <EditField label="SCM" value={scm} onChange={setScm} />
        <EditField label="รหัส Sup / Sup Code" value={supCode} onChange={setSupCode} />
        <div className="md:col-span-2">
          <label className="field-label">ผู้จัดจำหน่าย / Supplier</label>
          <input className="field-input" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
        </div>
        <EditField label="หมายเลข Lot / Lot No." value={lotNo} onChange={setLotNo} />
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
      </section>

      {/* Defects */}
      <section className="section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg">รายการของเสีย / Defect List</h2>
          <div className="flex gap-2 text-xs">
            <span className="chip">C: <b className="ml-1">{totals.crit}</b></span>
            <span className="chip">M: <b className="ml-1">{totals.maj}</b></span>
            <span className="chip">m: <b className="ml-1">{totals.min}</b></span>
            <span className="chip chip-active">รวม: <b className="ml-1">{totals.tot}</b></span>
          </div>
        </div>

        <div className="relative">
          <input className="field-input" placeholder="ค้นหารหัสของเสีย เพื่อเพิ่ม…"
            value={defectQuery} onChange={e => setDefectQuery(e.target.value)} />
          {defectQuery && (
            <div className="absolute z-10 mt-1 w-full rounded-md bg-surface-lowest shadow-ambient max-h-80 overflow-auto">
              <div className="flex items-center justify-between px-4 py-2 bg-surface-low sticky top-0 gap-2">
                <span className="text-xs text-on-surface-variant">เลือกแล้ว {staging.length}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setStaging([]); setDefectQuery(''); }}
                    className="text-xs text-on-surface-variant hover:underline">ยกเลิก</button>
                  <button type="button" onClick={addGroup} disabled={!staging.length}
                    className="text-xs text-primary font-semibold hover:underline disabled:opacity-40">เพิ่มในรายการ ({staging.length})</button>
                </div>
              </div>
              {filteredDefects.map(d => {
                const sel = staging.some(s => s.code === d.defect_code);
                return (
                  <button type="button" key={d.defect_code} onClick={() => toggleStaging(d)}
                    className={`flex items-center gap-3 w-full text-left px-4 py-2 hover:bg-surface-low ${sel ? 'bg-primary-container/50' : ''}`}>
                    <span className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-primary border-primary text-white' : 'border-outline-variant'}`}>
                      {sel && <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
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
                    className="col-span-2 text-xs text-error hover:underline text-right pt-2">ลบ</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {d.existingImages.map((url, j) => (
                    <div key={`e${j}`} className="relative group">
                      <img src={url} alt="" className="h-16 w-16 rounded-md object-cover" />
                      <button type="button" onClick={() => rmExistingImg(i, j)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-error text-white text-[10px] font-bold grid place-items-center opacity-0 group-hover:opacity-100 transition">x</button>
                    </div>
                  ))}
                  {d.newImages.map((img, j) => (
                    <div key={`n${j}`} className="relative group">
                      <img src={img.preview} alt="" className="h-16 w-16 rounded-md object-cover" />
                      <button type="button" onClick={() => { URL.revokeObjectURL(img.preview); const ni = [...d.newImages]; ni.splice(j, 1); updDetail(i, { newImages: ni }); }}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-error text-white text-[10px] font-bold grid place-items-center opacity-0 group-hover:opacity-100 transition">x</button>
                    </div>
                  ))}
                  {(d.existingImages.length + d.newImages.length) < 3 && (
                    <label className="h-16 w-16 rounded-md bg-surface-mid flex flex-col items-center justify-center cursor-pointer hover:bg-surface-high transition text-on-surface-variant">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-[9px] mt-0.5">{d.existingImages.length + d.newImages.length}/3</span>
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => addNewImages(i, e.target.files)} />
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

      {msg && <div className="rounded-md bg-error-container px-3 py-2 text-sm text-error">{msg}</div>}

      <div className="flex justify-between">
        <button type="button" onClick={() => nav('/')} className="btn-secondary">ยกเลิก / Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'กำลังบันทึก… / Saving…' : 'บันทึกการแก้ไข / Save Changes'}
        </button>
      </div>
    </form>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input className="field-input" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
