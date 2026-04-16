import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('qc_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setOrders((data as Order[]) || []);
    setLoading(false);
  };

  const toggleExpand = async (orderId: number) => {
    if (expanded === orderId) { setExpanded(null); return; }
    setExpanded(orderId);
    setDetailLoading(true);
    const { data } = await supabase
      .from('qc_order_details')
      .select('id,defect_code,symptom,critical_rank,quantity,images')
      .eq('order_id', orderId)
      .order('id');
    setDetails((data as Detail[]) || []);
    setDetailLoading(false);
  };

  const filtered = orders.filter(o => {
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
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">ประวัติการบันทึก</h1>
          <p className="text-sm text-on-surface-variant mt-1">{orders.length} รายการ</p>
        </div>
        <input className="field-input max-w-xs" placeholder="ค้นหา Order No, SAP, Brand…"
          value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-on-surface-variant">กำลังโหลด…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-on-surface-variant">ไม่พบข้อมูล</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => (
            <div key={o.id}>
              <button type="button" onClick={() => toggleExpand(o.id)}
                className={`w-full text-left card transition hover:shadow-lg ${expanded === o.id ? 'ring-2 ring-primary/20' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-display font-bold text-base">{o.order_no}</span>
                      <span className="chip text-[10px]">{o.order_date}</span>
                      <span className={`chip text-[10px] ${
                        o.status === 'Accept' ? 'bg-primary-container text-on-primary-container' :
                        o.status === 'Reject' ? 'bg-error-container text-error' :
                        ''}`}>{o.status}</span>
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
                      ตรวจ {o.sample_size} / ดี {o.good_qty} / เสีย {o.defect_qty}
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {expanded === o.id && (
                <div className="ml-4 mt-2 bg-surface-low rounded-md p-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <InfoField label="SAP Code" value={o.sap_code} />
                    <InfoField label="รายละเอียด" value={o.material_description} />
                    <InfoField label="Sales" value={o.sales} />
                    <InfoField label="SCM" value={o.scm} />
                    <InfoField label="Sup Code" value={o.sup_code} />
                    <InfoField label="Supplier" value={o.supplier_name} />
                    <InfoField label="จำนวนรับ" value={o.received_qty != null ? String(o.received_qty) : null} />
                    <InfoField label="จำนวนตรวจสอบ" value={String(o.sample_size)} />
                  </div>
                  {o.note && (
                    <div className="text-sm">
                      <span className="text-[11px] uppercase tracking-wide text-on-surface-variant mr-1">หมายเหตุ:</span>
                      {o.note}
                    </div>
                  )}
                  <h4 className="font-display font-semibold text-sm pt-2">รายการของเสีย</h4>
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
                </div>
              )}
            </div>
          ))}
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
