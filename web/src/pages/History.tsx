import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/utils';

interface Order {
  id: number;
  order_no: string;
  order_date: string;
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
  good_qty: number;
  defect_qty: number;
  critical_qty: number;
  major_qty: number;
  minor_qty: number;
  defect_percent: number;
  status: string;
  note: string | null;
  created_at: string;
  edit_approved: boolean;
  edit_reason: string | null;
  edit_approved_at: string | null;
  approved: boolean;
  approved_at: string | null;
  created_by: string | null;
}

interface Detail {
  id: number;
  defect_code: string;
  symptom: string;
  critical_rank: string;
  quantity: number;
  images: string[];
}

export default function History() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const isAdminRole = profile?.role === 'admin' || profile?.role === 'qc_admin';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Edit-request modal (เดิมคือ "อนุมัติแก้ไข")
  const [editRequestOrderId, setEditRequestOrderId] = useState<number | null>(null);
  const [editReason, setEditReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    const { data } = await supabase.from('qc_orders').select('*')
      .order('created_at', { ascending: false }).limit(200);
    setOrders((data as Order[]) || []);
    setLoading(false);
  };

  const toggleExpand = async (orderId: number) => {
    if (expanded === orderId) { setExpanded(null); return; }
    setExpanded(orderId);
    setDetailLoading(true);
    const { data } = await supabase.from('qc_order_details')
      .select('id,defect_code,symptom,critical_rank,quantity,images')
      .eq('order_id', orderId).order('id');
    setDetails((data as Detail[]) || []);
    setDetailLoading(false);
  };

  // อนุมัติทันที (ไม่ต้องแก้ไข)
  const approveOrder = async (orderId: number) => {
    if (!confirm('ยืนยันอนุมัติ Order นี้?')) return;
    await supabase.from('qc_orders').update({
      approved: true,
      approved_by: profile?.id,
      approved_at: new Date().toISOString()
    }).eq('id', orderId);
    await loadOrders();
  };

  // ขอให้แก้ไข (พร้อมเหตุผล)
  const requestEdit = async () => {
    if (!editRequestOrderId || !editReason.trim()) return;
    setSubmitting(true);
    await supabase.from('qc_orders').update({
      edit_approved: true,
      edit_reason: editReason.trim(),
      edit_approved_by: profile?.id,
      edit_approved_at: new Date().toISOString()
    }).eq('id', editRequestOrderId);
    await supabase.from('qc_order_edit_log').insert({
      order_id: editRequestOrderId,
      edit_reason: editReason.trim(),
      approved_by: profile?.id
    });
    setSubmitting(false);
    setEditRequestOrderId(null);
    setEditReason('');
    await loadOrders();
  };

  const filtered = orders.filter(o => {
    // Status filter
    if (statusFilter) {
      if (statusFilter === 'edit_pending') { if (!o.edit_approved) return false; }
      else if (statusFilter === 'approved') { if (!o.approved) return false; }
      else if (statusFilter === 'pending_approval') { if (o.approved) return false; }
      else if (o.status !== statusFilter) return false;   // inspection_result filter
    }
    if (!q) return true;
    const s = q.toLowerCase();
    return o.order_no.toLowerCase().includes(s) ||
      (o.sap_code || '').toLowerCase().includes(s) ||
      (o.material_description || '').toLowerCase().includes(s) ||
      (o.brand || '').toLowerCase().includes(s) ||
      (o.supplier_name || '').toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">ประวัติการบันทึก / History</h1>
          <p className="text-sm text-on-surface-variant mt-1">{orders.length} รายการ / records</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="field-select max-w-[180px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">ทุกสถานะ / All Status</option>
            <optgroup label="ผลตรวจ / Inspection">
              <option value="Accept">ผ่าน / Accept</option>
              <option value="Accept Lot">รับ Lot / Accept Lot</option>
              <option value="Reject">ไม่ผ่าน / Reject</option>
            </optgroup>
            <optgroup label="อนุมัติ / Approval">
              <option value="pending_approval">⏳ รออนุมัติ / Pending</option>
              <option value="approved">✓ อนุมัติแล้ว / Approved</option>
            </optgroup>
            <option value="edit_pending">✏️ รอแก้ไข / Pending Edit</option>
          </select>
          <input className="field-input max-w-xs" placeholder="ค้นหา Order No, SAP, Brand…"
            value={q} onChange={e => setQ(e.target.value)} />
          <button onClick={() => nav('/entry')} className="btn-primary text-sm whitespace-nowrap">
            + บันทึกใหม่ / New
          </button>
        </div>
      </div>

      {(() => {
        if (loading) return <div className="text-center py-12 text-on-surface-variant">กำลังโหลด…</div>;
        if (filtered.length === 0) return <div className="text-center py-12 text-on-surface-variant">ไม่พบข้อมูล</div>;

        // Group by status (approved overrides — goes to "อนุมัติ" group)
        const groups: Array<{ key: string; label: string; color: string; items: Order[] }> = [
          { key: 'approved',   label: '✓ อนุมัติแล้ว / Approved',  color: 'bg-primary text-white',                 items: [] },
          { key: 'accept',     label: 'ผ่าน / Accept',              color: 'bg-primary-container text-on-primary-container', items: [] },
          { key: 'acceptlot',  label: 'รับ Lot / Accept Lot',       color: 'bg-primary-container text-on-primary-container', items: [] },
          { key: 'reject',     label: '❌ ไม่ผ่าน / Reject',         color: 'bg-error-container text-error',         items: [] },
          { key: 'editing',    label: '✏️ รอแก้ไข / Pending Edit',  color: 'bg-amber-100 text-amber-800',            items: [] },
          { key: 'other',      label: 'อื่น ๆ / Other',             color: 'bg-surface-high text-on-surface',        items: [] }
        ];
        const byKey: Record<string, Order[]> = {};
        groups.forEach(g => byKey[g.key] = g.items);
        for (const o of filtered) {
          if (o.approved)              byKey.approved.push(o);
          else if (o.edit_approved)    byKey.editing.push(o);
          else if (o.status === 'Accept')      byKey.accept.push(o);
          else if (o.status === 'Accept Lot')  byKey.acceptlot.push(o);
          else if (o.status === 'Reject')      byKey.reject.push(o);
          else                                 byKey.other.push(o);
        }
        const visibleGroups = groups.filter(g => g.items.length > 0);

        return (
          <div className="space-y-6">
            {visibleGroups.map(g => (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-2 sticky top-[64px] bg-surface/90 backdrop-blur-sm py-2 z-10">
                  <span className={`chip text-xs ${g.color}`}>{g.label}</span>
                  <span className="text-xs text-on-surface-variant">({g.items.length})</span>
                </div>
                <div className="space-y-2">
                  {g.items.map(o => (
            <div key={o.id}>
              <button type="button" onClick={() => toggleExpand(o.id)}
                className={`w-full text-left card transition hover:shadow-lg ${expanded === o.id ? 'ring-2 ring-primary/20' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-display font-bold text-base">{o.order_no}</span>
                      <span className="chip text-[10px]">{fmtDate(o.order_date)}</span>
                      {/* Inspection result — Accept / Accept Lot / Reject only */}
                      {(o.status === 'Accept' || o.status === 'Accept Lot') && (
                        <span className="chip text-[10px] bg-primary-container text-on-primary-container">{o.status}</span>
                      )}
                      {o.status === 'Reject' && (
                        <span className="chip text-[10px] bg-error-container text-error">Reject</span>
                      )}
                      {/* Approval status — Pending or Approved (mutually exclusive) */}
                      {o.approved ? (
                        <span className="chip text-[10px] bg-primary-container text-on-primary-container">✓ อนุมัติแล้ว / Approved</span>
                      ) : (
                        <span className="chip text-[10px] bg-surface-high text-on-surface-variant">⏳ รออนุมัติ / Pending</span>
                      )}
                      {o.edit_approved && (
                        <span className="chip text-[10px] bg-amber-100 text-amber-800">✏️ รอแก้ไข / Pending Edit</span>
                      )}
                    </div>
                    <div className="text-sm text-on-surface-variant truncate">
                      <span className="font-mono mr-2">{o.sap_code}</span>
                      {o.material_description}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-on-surface-variant">
                      {o.brand && <span>Brand: <b className="text-on-surface">{o.brand}</b></span>}
                      {o.supplier_name && <span>Supplier: <b className="text-on-surface">{o.supplier_name}</b></span>}
                      {o.lot_no && <span>Lot: <b className="text-on-surface">{o.lot_no}</b></span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-display font-bold text-2xl ${o.defect_percent > 0 ? 'text-error' : 'text-primary'}`}>
                      {Number(o.defect_percent).toFixed(2)}%
                    </div>
                    <div className="flex gap-1.5 mt-1 justify-end text-[10px]">
                      <span className="chip">C:{o.critical_qty}</span>
                      <span className="chip">M:{o.major_qty}</span>
                      <span className="chip">m:{o.minor_qty}</span>
                    </div>
                    <div className="text-[10px] text-on-surface-variant mt-1">
                      ตรวจ/Inspected {o.sample_size} / ดี/Good {o.good_qty} / เสีย/Defect {o.defect_qty}
                    </div>
                  </div>
                </div>
              </button>

              {expanded === o.id && (
                <div className="ml-4 mt-2 bg-surface-low rounded-md p-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <InfoField label="รหัส SAP / SAP Code" value={o.sap_code} />
                    <InfoField label="รายละเอียด / Description" value={o.material_description} />
                    <InfoField label="ฝ่ายขาย / Sales" value={o.sales} />
                    <InfoField label="SCM" value={o.scm} />
                    <InfoField label="รหัส Sup / Sup Code" value={o.sup_code} />
                    <InfoField label="ผู้จัดจำหน่าย / Supplier" value={o.supplier_name} />
                    <InfoField label="จำนวนรับ / Received Qty" value={o.received_qty != null ? String(o.received_qty) : null} />
                    <InfoField label="จำนวนตรวจสอบ / Sample Size" value={String(o.sample_size)} />
                  </div>
                  {o.note && (
                    <div className="text-sm">
                      <span className="text-[11px] uppercase tracking-wide text-on-surface-variant mr-1">หมายเหตุ / Remarks:</span>
                      {o.note}
                    </div>
                  )}

                  {/* Edit reason display */}
                  {o.edit_approved && o.edit_reason && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
                      <span className="text-[11px] uppercase tracking-wide text-amber-700 mr-1">เหตุผลที่อนุมัติแก้ไข / Edit Reason:</span>
                      <span className="text-amber-900">{o.edit_reason}</span>
                    </div>
                  )}

                  <h4 className="font-display font-semibold text-sm pt-2">รายการของเสีย / Defect List</h4>
                  {detailLoading ? (
                    <p className="text-sm text-on-surface-variant">กำลังโหลด…</p>
                  ) : details.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">ไม่มีรายการของเสีย</p>
                  ) : (
                    <div className="space-y-2">
                      {details.map(d => (
                        <div key={d.id} className="bg-surface-lowest rounded-md p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-mono text-xs text-on-surface-variant mr-2">{d.defect_code}</span>
                              <span className="text-sm">{d.symptom}</span>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <span className={`chip text-[10px] ${
                                d.critical_rank === 'Critical' ? 'bg-error/10 text-error' :
                                d.critical_rank === 'Major' ? 'bg-amber-100 text-amber-800' :
                                'bg-surface-highest text-on-surface-variant'
                              }`}>{d.critical_rank}</span>
                              <span className="chip chip-active text-[10px]">x{d.quantity}</span>
                            </div>
                          </div>
                          {d.images && d.images.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {d.images.map((url, j) => (
                                <a key={j} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt="" className="h-14 w-14 rounded object-cover hover:ring-2 ring-primary transition" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-3 border-t border-outline-variant/15 flex-wrap">
                    {isAdminRole && !o.edit_approved && !o.approved && (
                      <>
                        <button type="button" onClick={e => { e.stopPropagation(); approveOrder(o.id); }}
                          className="btn-primary text-sm">
                          ✓ อนุมัติ / Approve
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); setEditRequestOrderId(o.id); }}
                          className="btn-secondary text-sm">
                          ✏️ ต้องแก้ไข / Need Edit
                        </button>
                      </>
                    )}
                    {o.edit_approved && (isAdminRole || o.created_by === profile?.id) && (
                      <button type="button" onClick={e => { e.stopPropagation(); nav(`/edit/${o.id}`); }}
                        className="btn-primary text-sm">
                        แก้ไขข้อมูล / Edit
                      </button>
                    )}
                    {o.edit_approved && !isAdminRole && o.created_by !== profile?.id && (
                      <span className="text-xs text-on-surface-variant italic">
                        รอเจ้าของแก้ไข / Awaiting owner's edit
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Edit Request Modal */}
      {editRequestOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditRequestOrderId(null)}>
          <div className="fixed inset-0 bg-inverse/40 backdrop-blur-sm" />
          <div className="relative bg-surface-lowest rounded-lg shadow-ambient max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-outline-variant/15">
              <h3 className="font-display font-bold">ต้องแก้ไข / Need Edit</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Order: {orders.find(o => o.id === editRequestOrderId)?.order_no}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="field-label">เหตุผลที่ให้แก้ไข / Edit Reason *</label>
                <textarea className="field-input" rows={3} required autoFocus
                  value={editReason} onChange={e => setEditReason(e.target.value)}
                  placeholder="เช่น ข้อมูลจำนวนตรวจไม่ถูกต้อง, กรอก SAP Code ผิด..." />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setEditRequestOrderId(null); setEditReason(''); }} className="btn-secondary">ยกเลิก / Cancel</button>
                <button onClick={requestEdit} disabled={!editReason.trim() || submitting} className="btn-primary">
                  {submitting ? 'กำลังบันทึก… / Saving…' : 'ยืนยัน / Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</div>
      <div className="font-medium">{value || '—'}</div>
    </div>
  );
}
