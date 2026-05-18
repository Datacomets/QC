import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getProductType } from '../lib/utils';

type Rank = 'Critical' | 'Major' | 'Minor';

interface DraftDefect {
  defects: { code: string; symptom: string }[];
  critical_rank: Rank;
  quantity: number;
  images: { file: File; preview: string }[];
}

interface OrderDraft {
  order_date: string;                     // วันที่ตรวจ / Inspection Date (required)
  received_date: string | null;            // วันที่รับเข้า / Received Date (optional)
  preview_order_no: string | null;         // peeked QC<YYMM><seq4> for display only
  project_brief_no: string;
  sap_code: string;
  material_description: string | null;
  brand: string | null;
  sales: string | null;
  scm: string | null;
  sup_code: string | null;
  supplier_name: string | null;
  lot_no: string | null;
  received_qty: number | null;
  sample_size: number;
  status: 'Accept' | 'Accept Lot' | 'Reject';
  note: string | null;
  details: DraftDefect[];
  created_by: string;
}

interface ProfileRow { id: string; full_name: string; role: string }

interface Props {
  draft: OrderDraft;
  onClose: () => void;
  onSaved: (orderNo: string, ncrNo: string | null) => void;
}

export default function SuccessModal({ draft, onClose, onSaved }: Props) {
  // Editable order fields (Sales/SCM read-only — sourced from brand_responsibilities)
  const [orderDate, setOrderDate] = useState(draft.order_date);
  const [receivedDate, setReceivedDate] = useState(draft.received_date || '');
  const [lotNo, setLotNo] = useState(draft.lot_no || '');
  const [receivedQty, setReceivedQty] = useState<number | ''>(draft.received_qty ?? '');
  const [sampleSize, setSampleSize] = useState(draft.sample_size);
  const [note, setNote] = useState(draft.note || '');
  const [details, setDetails] = useState<DraftDefect[]>(draft.details);

  // Approver
  const [approvers, setApprovers] = useState<ProfileRow[]>([]);
  const [approverChoice, setApproverChoice] = useState('');
  const [approverCustom, setApproverCustom] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [savedInfo, setSavedInfo] = useState<{ orderNo: string; ncrNo: string | null } | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, role')
      .in('role', ['admin', 'qc_admin'])
      .order('full_name')
      .then(({ data }) => setApprovers(((data as ProfileRow[]) || []).filter(p => p.full_name)));
  }, []);

  const totalDefect = details.reduce((s, d) => s + Number(d.quantity || 0), 0);
  const pct = sampleSize > 0 ? (totalDefect / sampleSize) * 100 : 0;
  const critTotal = details.filter(d => d.critical_rank === 'Critical').reduce((s, d) => s + Number(d.quantity || 0), 0);
  const majTotal  = details.filter(d => d.critical_rank === 'Major').reduce((s, d) => s + Number(d.quantity || 0), 0);
  const minTotal  = details.filter(d => d.critical_rank === 'Minor').reduce((s, d) => s + Number(d.quantity || 0), 0);

  const hasApprover = approverChoice === '__custom__'
    ? approverCustom.trim().length > 0
    : !!approverChoice;

  const isDirty = useMemo(() => {
    return orderDate !== draft.order_date
      || receivedDate !== (draft.received_date || '')
      || lotNo !== (draft.lot_no || '')
      || (receivedQty === '' ? null : Number(receivedQty)) !== draft.received_qty
      || sampleSize !== draft.sample_size
      || note !== (draft.note || '')
      || details !== draft.details;
  }, [orderDate, receivedDate, lotNo, receivedQty, sampleSize, note, details, draft]);

  const saveLabel = saving ? 'กำลังบันทึก…'
    : hasApprover ? '✓ บันทึก + ยืนยัน / Save & Confirm'
    : '✓ บันทึก / Save';

  // ----- Defect editor -----
  const updDetail = (i: number, patch: Partial<DraftDefect>) => {
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
    const newImgs = Array.from(files).slice(0, remaining).map(f => ({
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

  const uploadImages = async (orderId: number, detailIdx: number, imgs: { file: File }[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const img of imgs) {
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

  const handleClose = () => {
    if (saving) return;
    if (!savedInfo && (isDirty || hasApprover)) {
      if (!confirm('มีการเปลี่ยนแปลงในขั้นตอนตรวจสอบ — ยกเลิกการบันทึก Order หรือไม่?\nDiscard this review? (Form data will be kept so you can edit and re-submit)')) return;
    }
    onClose();
  };

  const handleSave = async () => {
    setErr('');

    // Approver resolution
    let approverId: string | null = null;
    let approverName: string | null = null;
    if (approverChoice === '__custom__') {
      approverName = approverCustom.trim();
      if (!approverName) { setErr('กรุณาพิมพ์ชื่อผู้อนุมัติ'); return; }
    } else if (approverChoice) {
      const p = approvers.find(x => x.id === approverChoice);
      if (!p) { setErr('ไม่พบผู้ใช้ที่เลือก'); return; }
      approverId = p.id;
      approverName = p.full_name;
    }

    if (!sampleSize || sampleSize < 1) { setErr('จำนวนตรวจสอบต้องมากกว่า 0'); return; }

    setSaving(true);

    // Build qc_orders INSERT payload
    const insertRow: Record<string, unknown> = {
      order_date: orderDate,
      received_date: receivedDate || null,
      project_brief_no: draft.project_brief_no,
      sap_code: draft.sap_code,
      material_description: draft.material_description,
      brand: draft.brand,
      sales: draft.sales,
      scm: draft.scm,
      sup_code: draft.sup_code,
      supplier_name: draft.supplier_name,
      lot_no: lotNo.trim() || null,
      received_qty: receivedQty === '' ? null : Number(receivedQty),
      sample_size: sampleSize,
      status: draft.status,
      note: note.trim() || null,
      created_by: draft.created_by
    };

    if (approverName) {
      const now = new Date().toISOString();
      insertRow.approved = true;
      insertRow.approved_by = approverId;
      insertRow.approved_by_name = approverName;
      insertRow.approved_at = now;
      const sfx = draft.status === 'Accept' ? 'accept'
        : draft.status === 'Accept Lot' ? 'acceptlot'
        : 'reject';
      insertRow[`${sfx}_approved`] = true;
      insertRow[`${sfx}_approved_by`] = approverId;
      insertRow[`${sfx}_approved_by_name`] = approverName;
      insertRow[`${sfx}_approved_at`] = now;
    }

    const { data: order, error } = await supabase.from('qc_orders')
      .insert(insertRow).select('id, order_no').single();
    if (error || !order) {
      setSaving(false);
      setErr('บันทึก Order ไม่สำเร็จ: ' + (error?.message || ''));
      return;
    }

    // Upload images + insert qc_order_details
    if (details.length) {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        const imageUrls = d.images.length ? await uploadImages(order.id, i, d.images) : [];
        const primaryCode = d.defects[0]?.code;
        const combinedSymptom = d.defects.map(df => `${df.code}: ${df.symptom}`).join(', ');
        rows.push({
          order_id: order.id,
          defect_code: primaryCode,
          symptom: combinedSymptom,
          critical_rank: d.critical_rank,
          quantity: Number(d.quantity),
          images: imageUrls
        });
      }
      const { error: e2 } = await supabase.from('qc_order_details').insert(rows);
      if (e2) {
        setSaving(false);
        setErr('บันทึกรายการของเสียไม่สำเร็จ: ' + e2.message);
        return;
      }
    }

    // NCR fallback (DB trigger should handle this, but fallback if not)
    let ncrNo: string | null = null;
    if (draft.status === 'Reject') {
      const { data: existingNcr } = await supabase.from('ncr_reports')
        .select('ncr_no').eq('order_id', order.id).maybeSingle();
      if (existingNcr) {
        ncrNo = existingNcr.ncr_no;
      } else {
        const { data: newNcr } = await supabase.from('ncr_reports').insert({
          order_id: order.id, order_no: order.order_no, created_by: draft.created_by
        }).select('ncr_no').single();
        ncrNo = newNcr?.ncr_no || null;
      }
    }

    setSaving(false);
    setSavedInfo({ orderNo: order.order_no, ncrNo });
    onSaved(order.order_no, ncrNo);
  };

  // ----- Render: Success view (after save) -----
  if (savedInfo) {
    return <SuccessView
      orderNo={savedInfo.orderNo}
      ncrNo={savedInfo.ncrNo}
      status={draft.status}
      onClose={onClose}
    />;
  }

  // ----- Render: Review/edit view (before save) -----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="fixed inset-0 bg-inverse/40 backdrop-blur-sm" />
      <div className="relative bg-surface-lowest rounded-lg shadow-ambient max-w-3xl w-full max-h-[92vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-primary-container px-6 py-4 rounded-t-lg z-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary grid place-items-center text-white text-lg font-bold">✓</div>
            <div className="flex-1">
              <h2 className="font-display font-bold text-lg text-on-primary-container">ตรวจสอบก่อนบันทึก / Review Before Saving</h2>
              <p className="text-sm text-on-primary-container/80">
                ⚠ ข้อมูล <b>ยังไม่ได้บันทึก</b> — แก้ไขที่ผิด เลือกผู้อนุมัติ แล้วกด <b>บันทึก</b> เพื่อยืนยัน
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Info grid: editable + readonly */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <ReadField label="เลขที่ Order (ประมาณ) / Order No (preview)"
              value={draft.preview_order_no || '— จะถูกกำหนดตอนบันทึก —'} mono className="col-span-2" />
            <ReadField label="Project Brief No." value={draft.project_brief_no} mono className="col-span-2" />
            <EditField label="วันที่รับเข้า / Received Date" type="date" value={receivedDate} onChange={setReceivedDate} />
            <EditField label="วันที่ตรวจ / Inspection Date *" type="date" value={orderDate} onChange={setOrderDate} />
            <ReadField label="รหัส SAP / SAP Code" value={draft.sap_code} mono className="col-span-2" />
            <ReadField label="รายละเอียด / Description" value={draft.material_description} className="col-span-2" />
            <ReadField label="ประเภท / Type" value={getProductType(draft.sap_code)} />
            <ReadField label="แบรนด์ / Brand" value={draft.brand} />
            <ReadField label="ฝ่ายขาย / Sales" value={draft.sales} />
            <ReadField label="SCM" value={draft.scm} />
            <ReadField label="รหัส Sup / Sup Code" value={draft.sup_code} className="col-span-2" />
            <EditField label="หมายเลข Lot / Lot No." value={lotNo} onChange={setLotNo} />
            <EditField label="จำนวนรับ / Received" type="number"
              value={receivedQty === '' ? '' : String(receivedQty)}
              onChange={v => setReceivedQty(v === '' ? '' : Math.max(0, Number(v) || 0))} />
            <EditField label="จำนวนตรวจสอบ / Sample Size *" type="number"
              value={String(sampleSize)}
              onChange={v => setSampleSize(Math.max(0, Number(v) || 0))} />
            <ReadField label="สถานะ / Status" value={draft.status} chipColor={
              draft.status === 'Reject' ? 'bg-error/10 text-error'
              : draft.status === 'Accept' ? 'bg-primary/10 text-primary'
              : 'bg-amber-100 text-amber-800'
            } />
          </div>

          <div>
            <label className="field-label">หมายเหตุ / Remarks</label>
            <textarea className="field-input" rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ℹ️ ฟิลด์ที่แก้ไม่ได้ใน popup (SAP / สถานะ / เพิ่ม defect ใหม่) — กด <b>Cancel</b> แล้วแก้ในฟอร์ม
          </div>

          {/* Defect editor */}
          <div className="bg-surface-low rounded-md p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-display font-semibold text-sm">รายการของเสีย / Defects ({details.length})</h3>
              <div className={`font-display font-bold text-xl ${pct > 0 ? 'text-error' : 'text-primary'}`}>
                {pct.toFixed(2)}%
              </div>
            </div>
            <div className="flex gap-2 text-xs mb-3 flex-wrap">
              <span className="chip">Critical: <b className="ml-1">{critTotal}</b></span>
              <span className="chip">Major: <b className="ml-1">{majTotal}</b></span>
              <span className="chip">Minor: <b className="ml-1">{minTotal}</b></span>
              <span className="chip chip-active">รวม: <b className="ml-1">{totalDefect}</b></span>
            </div>

            {details.length === 0 ? (
              <p className="text-sm text-on-surface-variant">ไม่มีรายการของเสีย / No defects</p>
            ) : (
              <div className="space-y-3">
                {details.map((d, i) => (
                  <div key={i} className="bg-surface-lowest rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-on-surface-variant">{d.defects.map(x => x.code).join(', ')}</div>
                        <div className="text-sm">{d.defects.map(x => x.symptom).join(', ')}</div>
                      </div>
                      <button type="button" onClick={() => rmDetail(i)}
                        className="text-xs text-error hover:underline shrink-0">ลบ / Del</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-on-surface-variant">Rank</label>
                        <select className="field-select text-sm" value={d.critical_rank}
                          onChange={e => updDetail(i, { critical_rank: e.target.value as Rank })}>
                          <option value="Critical">Critical</option>
                          <option value="Major">Major</option>
                          <option value="Minor">Minor</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-on-surface-variant">จำนวน / Qty</label>
                        <input type="number" min="0" className="field-input text-sm text-right"
                          value={d.quantity}
                          onChange={e => updDetail(i, { quantity: Math.max(0, Number(e.target.value) || 0) })} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {d.images.map((img, j) => (
                        <div key={j} className="relative group">
                          <img src={img.preview} alt="" className="h-14 w-14 rounded object-cover bg-surface-mid" />
                          <button type="button" onClick={() => rmImage(i, j)}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-error text-white text-[10px] font-bold grid place-items-center opacity-0 group-hover:opacity-100 transition">
                            x
                          </button>
                        </div>
                      ))}
                      {d.images.length < 3 && (
                        <label className="h-14 w-14 rounded bg-surface-mid flex flex-col items-center justify-center cursor-pointer hover:bg-surface-high transition text-on-surface-variant">
                          <span className="text-lg leading-none">+</span>
                          <span className="text-[9px]">{d.images.length}/3</span>
                          <input type="file" accept="image/*" multiple className="hidden"
                            onChange={(e: ChangeEvent<HTMLInputElement>) => addImages(i, e.target.files)} />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Approver */}
          <div className="bg-primary-container/40 rounded-md p-4 space-y-3 border border-primary/20">
            <div>
              <h3 className="font-display font-semibold text-sm">เลือกผู้อนุมัติ / Select Approver</h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                เลือกแล้วกดบันทึก = ยืนยัน Order ทันที — เว้นว่างถ้ายังไม่ต้องการยืนยันตอนนี้ (ไปยืนยันในหน้าประวัติทีหลังได้)
              </p>
            </div>
            <div>
              <label className="field-label">ผู้อนุมัติ / Approver</label>
              <select className="field-select"
                value={approverChoice}
                onChange={e => { setApproverChoice(e.target.value); if (e.target.value !== '__custom__') setApproverCustom(''); }}>
                <option value="">— ไม่อนุมัติตอนนี้ / Skip approval —</option>
                {approvers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.role === 'admin' ? 'Admin System' : 'QC Admin'})
                  </option>
                ))}
                <option value="__custom__">+ พิมพ์ชื่อเอง / Custom name…</option>
              </select>
            </div>
            {approverChoice === '__custom__' && (
              <div>
                <label className="field-label">ชื่อผู้อนุมัติ / Approver Name *</label>
                <input className="field-input" autoFocus value={approverCustom}
                  onChange={e => setApproverCustom(e.target.value)}
                  placeholder="เช่น คุณสมชาย ใจดี" />
              </div>
            )}
          </div>

          {err && <div className="rounded-md bg-error-container px-3 py-2 text-sm text-error">{err}</div>}
        </div>

        <div className="sticky bottom-0 bg-surface-lowest px-6 py-4 border-t border-outline-variant/15 flex gap-2 justify-end">
          <button onClick={handleClose} className="btn-secondary" disabled={saving}>
            ยกเลิก / Cancel
          </button>
          <button onClick={handleSave} className="btn-primary"
            disabled={saving || (approverChoice === '__custom__' && !approverCustom.trim())}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ orderNo, ncrNo, status, onClose }: {
  orderNo: string; ncrNo: string | null; status: string; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-inverse/40 backdrop-blur-sm" />
      <div className="relative bg-surface-lowest rounded-lg shadow-ambient max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="bg-primary-container px-6 py-4 rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary grid place-items-center text-white text-lg font-bold">✓</div>
            <h2 className="font-display font-bold text-lg text-on-primary-container">บันทึกข้อมูลสำเร็จ / Saved Successfully</h2>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">เลขที่ Order / Order No.</div>
            <div className="font-mono font-bold text-lg">{orderNo}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">สถานะ / Status</div>
            <span className={`chip ${
              status === 'Reject' ? 'bg-error/10 text-error'
              : status === 'Accept' ? 'bg-primary/10 text-primary'
              : 'bg-amber-100 text-amber-800'
            }`}>{status}</span>
          </div>
          {status === 'Reject' && ncrNo && (
            <div className="rounded-md bg-error-container border border-error/30 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-error grid place-items-center text-white font-bold shrink-0">!</div>
                <div>
                  <div className="font-display font-bold text-sm text-error">NCR Auto-Created</div>
                  <div className="text-sm text-error mt-0.5">เลขที่ NCR: <b className="font-mono">{ncrNo}</b></div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-outline-variant/15">
          <button onClick={onClose} className="btn-primary w-full">เสร็จสิ้น / Done</button>
        </div>
      </div>
    </div>
  );
}

function ReadField({ label, value, className = '', mono = false, chipColor }: {
  label: string; value?: string | null; className?: string; mono?: boolean; chipColor?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</div>
      {chipColor && value ? (
        <span className={`chip ${chipColor} mt-1`}>{value}</span>
      ) : (
        <div className={`text-on-surface font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
      )}
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text', className = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      <input className="field-input" type={type} value={value}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export type { OrderDraft, DraftDefect };
