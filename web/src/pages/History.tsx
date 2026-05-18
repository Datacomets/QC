import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate, getProductType, sapBreakdownLabel } from '../lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import OrderReport from '../components/OrderReport';
import OrderListReport from '../components/OrderListReport';
import NcrReport from '../components/NcrReport';

interface Order {
  id: number;
  order_no: string;
  order_date: string;
  received_date: string | null;
  project_brief_no: string | null;
  original_doc_with: string | null;
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
  approved_by: string | null;
  approved_by_name: string | null;
  // Status-specific approval columns
  accept_approved: boolean;
  accept_approved_by: string | null;
  accept_approved_at: string | null;
  accept_approved_by_name: string | null;
  acceptlot_approved: boolean;
  acceptlot_approved_by: string | null;
  acceptlot_approved_at: string | null;
  acceptlot_approved_by_name: string | null;
  reject_approved: boolean;
  reject_approved_by: string | null;
  reject_approved_at: string | null;
  reject_approved_by_name: string | null;
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

interface NcrRow {
  id: number;
  ncr_no: string;
  order_id: number;
  problem_found: string | null;
  root_cause: string | null;
  corrective: string | null;
  follow_up: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
}

const NCR_STATUS_LIST = ['Open', 'In Progress', 'Closed'] as const;
const NCR_STATUS_STYLE: Record<string, string> = {
  'Open':         'bg-error-container text-error',
  'In Progress':  'bg-amber-100 text-amber-800',
  'Closed':       'bg-primary-container text-on-primary-container'
};

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

  // Profiles for showing approver names + populating approval dropdown
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [profilesList, setProfilesList] = useState<{ id: string; full_name: string; role: string }[]>([]);

  // Approve modal state
  const [approveOrderRef, setApproveOrderRef] = useState<Order | null>(null);
  const [approverChoice, setApproverChoice] = useState<string>('');  // user id, '__custom__', or ''
  const [approverCustom, setApproverCustom] = useState<string>('');
  const [approving, setApproving] = useState(false);

  // NCR state (per order_id)
  const [ncrs, setNcrs] = useState<Record<number, NcrRow>>({});
  const [ncrDrafts, setNcrDrafts] = useState<Record<number, Partial<NcrRow>>>({});
  const [ncrSavingId, setNcrSavingId] = useState<number | null>(null);
  const [ncrModal, setNcrModal] = useState<NcrRow | null>(null);  // NCR currently shown in modal
  const [ncrModalDetails, setNcrModalDetails] = useState<Detail[]>([]);
  const [ncrModalDetailsLoading, setNcrModalDetailsLoading] = useState(false);
  const [ncrPdf, setNcrPdf] = useState<NcrRow | null>(null);
  const [ncrPdfDetails, setNcrPdfDetails] = useState<Detail[]>([]);
  const [ncrPdfLoading, setNcrPdfLoading] = useState(false);
  const [ncrPdfDownloading, setNcrPdfDownloading] = useState(false);
  const ncrPdfRef = useRef<HTMLDivElement>(null);

  // Edit-request modal (เดิมคือ "อนุมัติแก้ไข")
  const [editRequestOrderId, setEditRequestOrderId] = useState<number | null>(null);
  const [editReason, setEditReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // PDF state
  const [pdfOrder, setPdfOrder] = useState<Order | null>(null);
  const [pdfDetails, setPdfDetails] = useState<Detail[]>([]);
  const [pdfCreatorName, setPdfCreatorName] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [showSummaryPdf, setShowSummaryPdf] = useState(false);
  const [summaryDownloading, setSummaryDownloading] = useState(false);
  const orderPdfRef = useRef<HTMLDivElement>(null);
  const summaryPdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    const ordersP = supabase.from('qc_orders').select('*')
      .order('created_at', { ascending: false }).limit(200);
    const ncrsP = supabase.from('ncr_reports').select('*');
    const profilesP = supabase.from('profiles').select('id,full_name,role').order('full_name');
    const [ordersRes, ncrsRes, profilesRes] = await Promise.all([ordersP, ncrsP, profilesP]);
    setOrders((ordersRes.data as Order[]) || []);

    const map: Record<number, NcrRow> = {};
    for (const n of ((ncrsRes.data as NcrRow[]) || [])) {
      map[n.order_id] = n;
    }
    setNcrs(map);

    const plist = ((profilesRes.data as any[]) || []).filter(p => p.full_name);
    const pmap: Record<string, string> = {};
    for (const p of plist) {
      if (p.id) pmap[p.id] = p.full_name || '';
    }
    setProfilesMap(pmap);
    setProfilesList(plist);

    setLoading(false);
  };

  const ncrUpdateDraft = (orderId: number, patch: Partial<NcrRow>) => {
    setNcrDrafts(d => ({ ...d, [orderId]: { ...d[orderId], ...patch } }));
  };

  const ncrValOf = (n: NcrRow, field: keyof NcrRow): string => {
    const draft = ncrDrafts[n.order_id];
    if (draft && field in draft) return (draft as any)[field] ?? '';
    return (n as any)[field] ?? '';
  };

  const saveNcr = async (n: NcrRow) => {
    const draft = ncrDrafts[n.order_id];
    if (!draft) return;
    setNcrSavingId(n.order_id);
    const patch: any = { ...draft };
    if (draft.status === 'Closed' && n.status !== 'Closed') patch.closed_at = new Date().toISOString();
    else if (draft.status && draft.status !== 'Closed' && n.status === 'Closed') patch.closed_at = null;
    const { error } = await supabase.from('ncr_reports').update(patch).eq('id', n.id);
    setNcrSavingId(null);
    if (error) { alert('บันทึก NCR ไม่สำเร็จ: ' + error.message); return; }
    setNcrDrafts(d => { const x = { ...d }; delete x[n.order_id]; return x; });
    await loadOrders();
  };

  const openNcrModal = async (n: NcrRow) => {
    setNcrModal(n);
    setNcrModalDetails([]);
    setNcrModalDetailsLoading(true);
    const { data } = await supabase.from('qc_order_details')
      .select('id,defect_code,symptom,critical_rank,quantity,images')
      .eq('order_id', n.order_id).order('id');
    setNcrModalDetails((data as Detail[]) || []);
    setNcrModalDetailsLoading(false);
  };

  const closeNcrModal = () => {
    setNcrModal(null);
    setNcrModalDetails([]);
  };

  const openNcrPdf = async (n: NcrRow) => {
    setNcrPdf(n);
    setNcrPdfLoading(true);
    setNcrPdfDetails([]);
    const { data } = await supabase.from('qc_order_details')
      .select('id,defect_code,symptom,critical_rank,quantity,images')
      .eq('order_id', n.order_id).order('id');
    setNcrPdfDetails((data as Detail[]) || []);
    setNcrPdfLoading(false);
  };

  const downloadNcrPdf = async () => {
    if (!ncrPdfRef.current || !ncrPdf) return;
    setNcrPdfDownloading(true);
    try {
      const imgs = ncrPdfRef.current.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(img =>
        img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
      ));
      const canvas = await html2canvas(ncrPdfRef.current, { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = -(imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(`${ncrPdf.ncr_no}.pdf`);
    } finally {
      setNcrPdfDownloading(false);
    }
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
  const openApproveModal = (order: Order) => {
    setApproveOrderRef(order);
    setApproverChoice('');
    setApproverCustom('');
  };

  const closeApproveModal = () => {
    setApproveOrderRef(null);
    setApproverChoice('');
    setApproverCustom('');
  };

  const submitApproval = async () => {
    if (!approveOrderRef) return;

    let approverName = '';
    let approverId: string | null = null;
    if (approverChoice === '__custom__') {
      approverName = approverCustom.trim();
      if (!approverName) { alert('กรุณาพิมพ์ชื่อผู้อนุมัติ'); return; }
    } else if (approverChoice) {
      const p = profilesList.find(x => x.id === approverChoice);
      if (!p) { alert('ไม่พบผู้ใช้ที่เลือก'); return; }
      approverName = p.full_name;
      approverId = p.id;
    } else {
      alert('กรุณาเลือกผู้อนุมัติ');
      return;
    }

    setApproving(true);
    const order = approveOrderRef;
    const now = new Date().toISOString();
    const patch: any = {
      approved: true,
      approved_by: approverId,
      approved_by_name: approverName,
      approved_at: now
    };

    if (order.status === 'Accept') {
      patch.accept_approved = true;
      patch.accept_approved_by = approverId;
      patch.accept_approved_by_name = approverName;
      patch.accept_approved_at = now;
    } else if (order.status === 'Accept Lot') {
      patch.acceptlot_approved = true;
      patch.acceptlot_approved_by = approverId;
      patch.acceptlot_approved_by_name = approverName;
      patch.acceptlot_approved_at = now;
    } else if (order.status === 'Reject') {
      patch.reject_approved = true;
      patch.reject_approved_by = approverId;
      patch.reject_approved_by_name = approverName;
      patch.reject_approved_at = now;
    }

    const { error } = await supabase.from('qc_orders').update(patch).eq('id', order.id);
    setApproving(false);
    if (error) { alert('อนุมัติไม่สำเร็จ: ' + error.message); return; }
    closeApproveModal();
    await loadOrders();
  };

  // PDF: open single order
  const openOrderPdf = async (o: Order) => {
    setPdfOrder(o);
    setPdfLoading(true);
    setPdfDetails([]);
    setPdfCreatorName(null);

    const detailsP = supabase.from('qc_order_details')
      .select('id,defect_code,symptom,critical_rank,quantity,images')
      .eq('order_id', o.id).order('id');
    const creatorP = o.created_by
      ? supabase.from('profiles').select('full_name').eq('id', o.created_by).single()
      : Promise.resolve({ data: null });

    const [det, cr] = await Promise.all([detailsP, creatorP]);
    setPdfDetails((det.data as Detail[]) || []);
    setPdfCreatorName(((cr as any).data?.full_name) || null);
    setPdfLoading(false);
  };

  const closeOrderPdf = () => {
    setPdfOrder(null);
    setPdfDetails([]);
    setPdfCreatorName(null);
  };

  const downloadOrderPdf = async () => {
    if (!orderPdfRef.current || !pdfOrder) return;
    setPdfDownloading(true);
    try {
      const imgs = orderPdfRef.current.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(img =>
        img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
      ));
      const canvas = await html2canvas(orderPdfRef.current, { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = -(imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(`${pdfOrder.order_no}.pdf`);
    } finally {
      setPdfDownloading(false);
    }
  };

  // PDF: summary report (all filtered orders)
  const downloadSummaryPdf = async () => {
    setShowSummaryPdf(true);
    // Wait for the hidden template to render
    await new Promise(res => setTimeout(res, 100));
    if (!summaryPdfRef.current) { setShowSummaryPdf(false); return; }
    setSummaryDownloading(true);
    try {
      const canvas = await html2canvas(summaryPdfRef.current, { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('l', 'mm', 'a4');  // landscape
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = -(imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      const today = new Date().toISOString().slice(0, 10);
      pdf.save(`QC-Summary-${today}.pdf`);
    } finally {
      setSummaryDownloading(false);
      setShowSummaryPdf(false);
    }
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
          <button onClick={downloadSummaryPdf} disabled={summaryDownloading || filtered.length === 0}
                  className="btn-secondary text-sm whitespace-nowrap"
                  title="ดาวน์โหลดรายงานรวม (PDF) / Download summary PDF">
            {summaryDownloading ? 'กำลังสร้าง…' : `📥 PDF รวม (${filtered.length})`}
          </button>
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
                      {/* Approval status — Pending or Approved (status-specific label) */}
                      {o.approved ? (
                        <span className="chip text-[10px] bg-primary-container text-on-primary-container">
                          ✓ {o.accept_approved ? 'รับ Accept Approved' :
                              o.acceptlot_approved ? 'รับ Lot AcceptLot Approved' :
                              o.reject_approved ? 'ปฏิเสธ Reject Approved' :
                              'อนุมัติแล้ว / Approved'}
                        </span>
                      ) : (
                        <span className="chip text-[10px] bg-surface-high text-on-surface-variant">⏳ รออนุมัติ / Pending</span>
                      )}
                      {o.edit_approved && (
                        <span className="chip text-[10px] bg-amber-100 text-amber-800">✏️ รอแก้ไข / Pending Edit</span>
                      )}
                      {ncrs[o.id] && (
                        <span className={`chip text-[10px] ${NCR_STATUS_STYLE[ncrs[o.id].status] || 'bg-error-container text-error'}`}>
                          📋 {ncrs[o.id].ncr_no} · {ncrs[o.id].status}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-on-surface-variant truncate">
                      <span className="font-mono mr-2">{o.sap_code}</span>
                      {getProductType(o.sap_code) && (
                        <span className="chip text-[10px] mr-2">{getProductType(o.sap_code)}</span>
                      )}
                      {o.material_description}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-on-surface-variant">
                      {o.brand && <span>Brand: <b className="text-on-surface">{o.brand}</b></span>}
                      {o.supplier_name && <span>Supplier: <b className="text-on-surface">{o.supplier_name}</b></span>}
                      {o.lot_no && <span>Lot: <b className="text-on-surface">{o.lot_no}</b></span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-display font-bold text-2xl ${
                      o.status === 'Accept Lot' ? 'text-on-surface-variant' :
                      o.defect_percent > 0 ? 'text-error' : 'text-primary'
                    }`}>
                      {o.status === 'Accept Lot' ? '—' : `${Number(o.defect_percent).toFixed(2)}%`}
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
                  {sapBreakdownLabel(o.sap_code) && (
                    <div className="text-[11px] text-on-surface-variant -mt-1">
                      🏷️ {sapBreakdownLabel(o.sap_code)}
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <InfoField label="Project Brief No." value={o.project_brief_no} />
                    <InfoField label="วันที่รับเข้า / Received Date" value={o.received_date ? fmtDate(o.received_date) : null} />
                    <InfoField label="วันที่ตรวจ / Inspection Date" value={fmtDate(o.order_date)} />
                    <InfoField label="รหัส SAP / SAP Code" value={o.sap_code} />
                    <InfoField label="ประเภท / Type" value={getProductType(o.sap_code)} />
                    <InfoField label="รายละเอียด / Description" value={o.material_description} />
                    <InfoField label="ฝ่ายขาย / Sales" value={o.sales} />
                    <InfoField label="SCM" value={o.scm} />
                    <InfoField label="รหัส Sup / Sup Code" value={o.sup_code} />
                    <InfoField label="ผู้จัดจำหน่าย / Supplier" value={o.supplier_name} />
                    <InfoField label="จำนวนรับ / Received Qty" value={o.received_qty != null ? String(o.received_qty) : null} />
                    <InfoField label="จำนวนตรวจสอบ / Sample Size" value={String(o.sample_size)} />
                    <InfoField label="เอกสารต้นฉบับอยู่ที่ / Original Doc With" value={o.original_doc_with} />
                    <InfoField label="ผู้บันทึก / Recorded By" value={profilesMap[o.created_by || ''] || null} />
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

                  {/* Approval info — per status */}
                  {o.approved && (
                    <div className="rounded-md bg-primary-container/40 border border-primary/20 px-3 py-2 text-sm">
                      <div className="text-[11px] uppercase tracking-wide text-on-primary-container mb-1">
                        การอนุมัติ / Approval Record
                      </div>
                      {o.accept_approved && (
                        <ApprovalLine label="✓ ยืนยันรับ / Confirm Accept"
                          by={o.accept_approved_by_name || profilesMap[o.accept_approved_by || ''] || '—'}
                          at={o.accept_approved_at} />
                      )}
                      {o.acceptlot_approved && (
                        <ApprovalLine label="✓ ยืนยันรับ Lot / Confirm Accept Lot"
                          by={o.acceptlot_approved_by_name || profilesMap[o.acceptlot_approved_by || ''] || '—'}
                          at={o.acceptlot_approved_at} />
                      )}
                      {o.reject_approved && (
                        <ApprovalLine label="✓ ยืนยันการปฏิเสธ / Confirm Reject"
                          by={o.reject_approved_by_name || profilesMap[o.reject_approved_by || ''] || '—'}
                          at={o.reject_approved_at} />
                      )}
                      {/* Fallback for legacy data without status-specific columns */}
                      {!o.accept_approved && !o.acceptlot_approved && !o.reject_approved && (
                        <ApprovalLine label="✓ อนุมัติแล้ว / Approved"
                          by={o.approved_by_name || profilesMap[o.approved_by || ''] || '—'}
                          at={o.approved_at} />
                      )}
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
                    <button type="button" onClick={e => { e.stopPropagation(); openOrderPdf(o); }}
                      className="btn-secondary text-sm">
                      📄 PDF
                    </button>
                    {ncrs[o.id] && (
                      <button type="button" onClick={e => { e.stopPropagation(); openNcrModal(ncrs[o.id]); }}
                        className="btn-secondary text-sm">
                        📋 NCR · {ncrs[o.id].ncr_no}
                      </button>
                    )}
                    {/* Approve button — Operator only (Operator chooses the approver) */}
                    {profile?.role === 'operator' && !o.edit_approved && !o.approved && (
                      <button type="button" onClick={e => { e.stopPropagation(); openApproveModal(o); }}
                        className="btn-primary text-sm">
                        {o.status === 'Accept'     ? '✓ ยืนยันรับ / Confirm Accept' :
                         o.status === 'Accept Lot' ? '✓ ยืนยันรับ Lot / Confirm Accept Lot' :
                         o.status === 'Reject'     ? '✓ ยืนยันการปฏิเสธ / Confirm Reject' :
                                                     '✓ อนุมัติ / Approve'}
                      </button>
                    )}
                    {/* Need Edit — admin/qc_admin only */}
                    {isAdminRole && !o.edit_approved && !o.approved && (
                      <button type="button" onClick={e => { e.stopPropagation(); setEditRequestOrderId(o.id); }}
                        className="btn-secondary text-sm">
                        ✏️ ต้องแก้ไข / Need Edit
                      </button>
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

      {/* Approve Modal — เลือกชื่อผู้อนุมัติ */}
      {approveOrderRef && (() => {
        const o = approveOrderRef;
        const statusLabel = o.status === 'Accept' ? 'ยืนยันรับ / Confirm Accept'
                          : o.status === 'Accept Lot' ? 'ยืนยันรับ Lot / Confirm Accept Lot'
                          : o.status === 'Reject' ? 'ยืนยันการปฏิเสธ / Confirm Reject'
                          : 'อนุมัติ / Approve';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeApproveModal}>
            <div className="fixed inset-0 bg-inverse/40 backdrop-blur-sm" />
            <div className="relative bg-surface-lowest rounded-lg shadow-ambient max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-outline-variant/15">
                <h3 className="font-display font-bold">✓ {statusLabel}</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Order: <span className="font-mono">{o.order_no}</span> · ผลตรวจ / Result: <b className="text-on-surface">{o.status}</b>
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="field-label">ผู้อนุมัติ / Approver *</label>
                  <select className="field-select"
                    value={approverChoice}
                    onChange={e => { setApproverChoice(e.target.value); if (e.target.value !== '__custom__') setApproverCustom(''); }}
                    autoFocus>
                    <option value="">— เลือกผู้อนุมัติ / Select Approver —</option>
                    {profilesList
                      .filter(p => p.role === 'qc_admin' || p.role === 'admin')
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.role === 'admin' ? 'Admin System' : 'QC Admin'})
                        </option>
                      ))}
                    <option value="__custom__">+ พิมพ์ชื่อเอง / Custom name…</option>
                  </select>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    แสดงเฉพาะ Role ที่อนุมัติได้ (Admin / QC Admin) — ถ้าผู้อนุมัติอยู่นอกระบบให้เลือก "พิมพ์ชื่อเอง"
                  </p>
                </div>
                {approverChoice === '__custom__' && (
                  <div>
                    <label className="field-label">ชื่อผู้อนุมัติ / Approver Name *</label>
                    <input className="field-input" autoFocus
                      value={approverCustom}
                      onChange={e => setApproverCustom(e.target.value)}
                      placeholder="เช่น คุณสมชาย ใจดี" />
                  </div>
                )}
                <div className="rounded-md bg-surface-low px-3 py-2 text-xs text-on-surface-variant">
                  ⚠️ ระบบจะบันทึกชื่อนี้เป็นผู้อนุมัติ Order — กรุณาตรวจสอบให้ถูกต้องก่อนยืนยัน
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={closeApproveModal} className="btn-secondary">ยกเลิก / Cancel</button>
                  <button onClick={submitApproval}
                    disabled={approving || !approverChoice || (approverChoice === '__custom__' && !approverCustom.trim())}
                    className="btn-primary">
                    {approving ? 'กำลังบันทึก…' : '✓ ยืนยัน / Confirm'}
                  </button>
                </div>
              </div>
            </div>
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

      {/* Per-Order PDF Preview Modal */}
      {pdfOrder && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
             onClick={closeOrderPdf}>
          <div className="fixed inset-0 bg-inverse/50 backdrop-blur-sm" />
          <div className="relative bg-surface-lowest rounded-lg shadow-ambient w-full max-w-4xl my-8"
               onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between sticky top-0 bg-surface-lowest rounded-t-lg z-10">
              <div>
                <h3 className="font-display font-bold text-lg">QC Inspection Report</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{pdfOrder.order_no}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={downloadOrderPdf} disabled={pdfLoading || pdfDownloading}
                        className="btn-primary text-sm">
                  {pdfDownloading ? 'กำลังสร้าง PDF…' : '📥 ดาวน์โหลด PDF / Download'}
                </button>
                <button onClick={closeOrderPdf} className="btn-secondary text-sm">ปิด / Close</button>
              </div>
            </div>
            <div className="p-5 bg-surface">
              {pdfLoading ? (
                <div className="text-center py-12 text-on-surface-variant">กำลังโหลดข้อมูล…</div>
              ) : (
                <div className="overflow-auto">
                  <OrderReport
                    ref={orderPdfRef}
                    order={pdfOrder}
                    details={pdfDetails}
                    createdByName={pdfCreatorName}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NCR Edit Modal (form + actions) */}
      {ncrModal && (() => {
        const n = ncrModal;
        const order = orders.find(o => o.id === n.order_id);
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
               onClick={closeNcrModal}>
            <div className="fixed inset-0 bg-inverse/50 backdrop-blur-sm" />
            <div className="relative bg-surface-lowest rounded-lg shadow-ambient w-full max-w-3xl my-8"
                 onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between sticky top-0 bg-surface-lowest rounded-t-lg z-10 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display font-bold text-lg">📋 ใบ NCR</h3>
                  <span className="font-mono text-sm text-on-surface-variant">{n.ncr_no}</span>
                  <span className={`chip text-[10px] ${NCR_STATUS_STYLE[n.status] || ''}`}>{n.status}</span>
                  {order && <span className="chip text-[10px] bg-surface-high text-on-surface-variant">Order: <b className="ml-1 font-mono">{order.order_no}</b></span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openNcrPdf(n)} className="btn-secondary text-sm">📄 PDF</button>
                  <button onClick={closeNcrModal} className="btn-secondary text-sm">ปิด / Close</button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="text-xs text-on-surface-variant flex gap-3 flex-wrap">
                  <span>สร้างเมื่อ / Created: <b className="text-on-surface">{fmtDate(n.created_at)}</b></span>
                  {n.closed_at && <span>· ปิดเมื่อ / Closed: <b className="text-on-surface">{fmtDate(n.closed_at)}</b></span>}
                </div>

                {/* Order Information section */}
                {order && (
                  <div className="rounded-md bg-surface-low border border-outline-variant/20 p-4">
                    <div className="font-display font-semibold text-sm mb-3 text-on-surface">
                      ข้อมูล Order / Order Information
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <InfoField label="เลขที่ Order / Order No" value={order.order_no} />
                      <InfoField label="วันที่ตรวจ / Inspection Date" value={fmtDate(order.order_date)} />
                      <InfoField label="ผลตรวจ / Result" value={order.status} />
                      <InfoField label="รหัส SAP / SAP Code" value={order.sap_code} />
                      <InfoField label="ประเภท / Type" value={getProductType(order.sap_code)} />
                      <InfoField label="แบรนด์ / Brand" value={order.brand} />
                      <div className="col-span-2 md:col-span-3">
                        <InfoField label="รายละเอียด / Description" value={order.material_description} />
                      </div>
                      <div className="col-span-2">
                        <InfoField label="ผู้จัดจำหน่าย / Supplier" value={order.supplier_name} />
                      </div>
                      <InfoField label="รหัส Sup / Sup Code" value={order.sup_code} />
                      <InfoField label="หมายเลข Lot / Lot No" value={order.lot_no} />
                      <InfoField label="ฝ่ายขาย / Sales" value={order.sales} />
                      <InfoField label="SCM" value={order.scm} />
                    </div>

                    {/* Inspection summary table */}
                    <div className="mt-3 pt-3 border-t border-outline-variant/15">
                      <div className="text-[11px] uppercase tracking-wide text-on-surface-variant mb-2">
                        สรุปผลการตรวจ / Inspection Summary
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-center text-xs">
                        <SummaryCell label="Sample" value={order.sample_size} />
                        <SummaryCell label="Good" value={order.good_qty} />
                        <SummaryCell label="Defect" value={order.defect_qty} highlight />
                        <SummaryCell label="Critical" value={order.critical_qty} />
                        <SummaryCell label="Major" value={order.major_qty} />
                        <SummaryCell label="Minor" value={order.minor_qty} />
                        <SummaryCell label="Defect %" value={Number(order.defect_percent).toFixed(2) + '%'} highlight />
                      </div>
                    </div>

                    {/* Note */}
                    {order.note && (
                      <div className="mt-3 pt-3 border-t border-outline-variant/15">
                        <div className="text-[11px] uppercase tracking-wide text-on-surface-variant mb-1">
                          หมายเหตุ / Remarks
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{order.note}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Defect Details section */}
                <div className="rounded-md bg-surface-low border border-outline-variant/20 p-4">
                  <div className="font-display font-semibold text-sm mb-3 text-on-surface">
                    รายการของเสีย / Defect Details
                  </div>
                  {ncrModalDetailsLoading ? (
                    <p className="text-sm text-on-surface-variant text-center py-4">กำลังโหลด…</p>
                  ) : ncrModalDetails.length === 0 ? (
                    <p className="text-sm text-on-surface-variant italic">ไม่มีรายการของเสีย / No defect details</p>
                  ) : (
                    <div className="space-y-2">
                      {ncrModalDetails.map(d => (
                        <div key={d.id} className="bg-surface-lowest rounded-md p-3 border border-outline-variant/10">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
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
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {d.images.map((url, j) => (
                                <a key={j} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt="" className="h-16 w-16 rounded object-cover hover:ring-2 ring-primary transition" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">ปัญหาที่พบ / Problem Found</label>
                    <textarea className="field-input" rows={3}
                      value={ncrValOf(n, 'problem_found')}
                      onChange={e => ncrUpdateDraft(n.order_id, { problem_found: e.target.value })}
                      disabled={!isAdminRole}
                      placeholder="อธิบายปัญหาที่พบ" />
                  </div>
                  <div>
                    <label className="field-label">สาเหตุของปัญหา / Root Cause</label>
                    <textarea className="field-input" rows={3}
                      value={ncrValOf(n, 'root_cause')}
                      onChange={e => ncrUpdateDraft(n.order_id, { root_cause: e.target.value })}
                      disabled={!isAdminRole}
                      placeholder="สาเหตุที่แท้จริง" />
                  </div>
                  <div>
                    <label className="field-label">การแก้ไข / Corrective Action</label>
                    <textarea className="field-input" rows={3}
                      value={ncrValOf(n, 'corrective')}
                      onChange={e => ncrUpdateDraft(n.order_id, { corrective: e.target.value })}
                      disabled={!isAdminRole}
                      placeholder="วิธีแก้ + ป้องกันการเกิดซ้ำ" />
                  </div>
                  <div>
                    <label className="field-label">การติดตามผล / Follow-up</label>
                    <textarea className="field-input" rows={3}
                      value={ncrValOf(n, 'follow_up')}
                      onChange={e => ncrUpdateDraft(n.order_id, { follow_up: e.target.value })}
                      disabled={!isAdminRole}
                      placeholder="ผลการตรวจสอบหลังแก้ไข" />
                  </div>
                </div>

                {isAdminRole && (
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-outline-variant/15">
                    <label className="field-label !mb-0">สถานะ NCR / Status:</label>
                    <select className="field-select max-w-[160px]"
                      value={ncrValOf(n, 'status') || 'Open'}
                      onChange={e => ncrUpdateDraft(n.order_id, { status: e.target.value })}>
                      {NCR_STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="ml-auto flex gap-2">
                      {ncrDrafts[n.order_id] && (
                        <button type="button" onClick={() => {
                          setNcrDrafts(d => { const x = { ...d }; delete x[n.order_id]; return x; });
                        }} className="btn-secondary text-sm">ยกเลิก / Cancel</button>
                      )}
                      <button type="button" onClick={async () => {
                        await saveNcr(n);
                        setNcrModal(prev => prev ? { ...prev, ...(ncrDrafts[n.order_id] || {}) } : null);
                      }}
                        disabled={!ncrDrafts[n.order_id] || ncrSavingId === n.order_id}
                        className="btn-primary text-sm">
                        {ncrSavingId === n.order_id ? 'กำลังบันทึก…' : '✓ บันทึก NCR / Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* NCR PDF Modal */}
      {ncrPdf && (() => {
        const order = orders.find(o => o.id === ncrPdf.order_id);
        if (!order) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
               onClick={() => { setNcrPdf(null); setNcrPdfDetails([]); }}>
            <div className="fixed inset-0 bg-inverse/50 backdrop-blur-sm" />
            <div className="relative bg-surface-lowest rounded-lg shadow-ambient w-full max-w-4xl my-8"
                 onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between sticky top-0 bg-surface-lowest rounded-t-lg z-10">
                <div>
                  <h3 className="font-display font-bold text-lg">ใบ NCR / NCR Document</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{ncrPdf.ncr_no}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={downloadNcrPdf} disabled={ncrPdfDownloading} className="btn-primary text-sm">
                    {ncrPdfDownloading ? 'กำลังสร้าง PDF…' : '📥 ดาวน์โหลด PDF'}
                  </button>
                  <button onClick={() => { setNcrPdf(null); setNcrPdfDetails([]); }} className="btn-secondary text-sm">ปิด / Close</button>
                </div>
              </div>
              <div className="p-5 bg-surface">
                {ncrPdfLoading ? (
                  <div className="text-center py-12 text-on-surface-variant">กำลังโหลดข้อมูล…</div>
                ) : (
                  <div className="overflow-auto">
                    <NcrReport
                      ref={ncrPdfRef}
                      ncr={ncrPdf}
                      order={order as any}
                      details={ncrPdfDetails}
                      createdByName={null}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Hidden Summary Template (rendered offscreen during download) */}
      {showSummaryPdf && (
        <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <OrderListReport
            ref={summaryPdfRef}
            orders={filtered}
            filterSummary={[
              statusFilter ? `Status: ${statusFilter}` : null,
              q ? `Search: "${q}"` : null
            ].filter(Boolean).join(' · ') || undefined}
          />
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

function ApprovalLine({ label, by, at }: { label: string; by: string; at: string | null }) {
  return (
    <div className="text-sm flex flex-wrap gap-x-4 gap-y-1">
      <span className="font-medium">{label}</span>
      <span className="text-on-surface-variant">โดย / by <b className="text-on-surface">{by}</b></span>
      {at && <span className="text-on-surface-variant">เมื่อ / on <b className="text-on-surface">{fmtDate(at)}</b></span>}
    </div>
  );
}

function SummaryCell({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded px-2 py-1.5 ${highlight ? 'bg-error-container/40 text-error' : 'bg-surface-mid'}`}>
      <div className="text-[10px] uppercase tracking-wide text-on-surface-variant">{label}</div>
      <div className="font-display font-bold">{value}</div>
    </div>
  );
}
