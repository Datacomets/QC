import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmtDate } from '../lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Order {
  id: number;
  order_no: string;
  order_date: string;
  sap_code: string;
  material_description: string | null;
  brand: string | null;
  supplier_name: string | null;
  sample_size: number;
  defect_qty: number;
  critical_qty: number;
  major_qty: number;
  minor_qty: number;
  defect_percent: number;
  status: string;
  approved: boolean;
  created_by: string | null;
}

interface Detail {
  defect_code: string;
  symptom: string;
  quantity: number;
  order_id: number;
}

interface Profile { id: string; full_name: string | null; email: string; }

const STATUS_COLORS: Record<string, string> = {
  Accept: '#005db6',
  'Accept Lot': '#0288d1',
  Reject: '#ba1a1a'
};

export default function Dashboard() {
  const reportRef = useRef<HTMLDivElement>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [details, setDetails] = useState<Detail[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [inspectorFilter, setInspectorFilter] = useState('');

  // Scorecard
  // Scorecard uses supplierFilter directly

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [ordersRes, detailsRes, profilesRes] = await Promise.all([
      supabase.from('qc_orders').select('*').order('order_date', { ascending: false }).limit(5000),
      supabase.from('qc_order_details').select('defect_code,symptom,quantity,order_id').limit(20000),
      supabase.from('profiles').select('id,full_name,email')
    ]);
    setOrders(ordersRes.data || []);
    setDetails(detailsRes.data || []);
    setProfiles(profilesRes.data || []);
    setLoading(false);
  };

  // Filtered data
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (dateFrom && o.order_date < dateFrom) return false;
      if (dateTo && o.order_date > dateTo) return false;
      if (supplierFilter && (o.supplier_name || '') !== supplierFilter) return false;
      if (brandFilter && (o.brand || '') !== brandFilter) return false;
      if (productFilter) {
        const term = productFilter.toLowerCase();
        const text = `${o.sap_code} ${o.material_description || ''}`.toLowerCase();
        if (!text.includes(term)) return false;
      }
      if (inspectorFilter && o.created_by !== inspectorFilter) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo, supplierFilter, brandFilter, productFilter, inspectorFilter]);

  // Distinct dropdown options (from all data, not filtered)
  const supplierOptions = useMemo(() => Array.from(new Set(orders.map(o => o.supplier_name).filter(Boolean) as string[])).sort(), [orders]);
  const brandOptions = useMemo(() => Array.from(new Set(orders.map(o => o.brand).filter(Boolean) as string[])).sort(), [orders]);

  // Metrics
  const metrics = useMemo(() => {
    const total = filtered.length;
    const accept = filtered.filter(o => o.status === 'Accept').length;
    const acceptLot = filtered.filter(o => o.status === 'Accept Lot').length;
    const reject = filtered.filter(o => o.status === 'Reject').length;
    const approved = filtered.filter(o => o.approved).length;
    const pendingApproval = filtered.filter(o => !o.approved).length;
    const totalSample = filtered.reduce((s, o) => s + (o.sample_size || 0), 0);
    const totalDefect = filtered.reduce((s, o) => s + (o.defect_qty || 0), 0);
    const avgDefectPct = totalSample > 0 ? (totalDefect / totalSample) * 100 : 0;
    return { total, accept, acceptLot, reject, approved, pendingApproval, avgDefectPct, totalSample, totalDefect };
  }, [filtered]);

  // Defect rate trend (by month)
  const trendData = useMemo(() => {
    const map = new Map<string, { sample: number; defect: number }>();
    for (const o of filtered) {
      const ym = o.order_date?.slice(0, 7); // YYYY-MM
      if (!ym) continue;
      const cur = map.get(ym) || { sample: 0, defect: 0 };
      cur.sample += o.sample_size || 0;
      cur.defect += o.defect_qty || 0;
      map.set(ym, cur);
    }
    return Array.from(map.entries())
      .sort()
      .map(([ym, v]) => ({
        period: ym,
        rate: v.sample > 0 ? +(v.defect / v.sample * 100).toFixed(2) : 0,
        defect: v.defect, sample: v.sample
      }));
  }, [filtered]);

  // Inspection result distribution
  const statusData = useMemo(() => [
    { name: 'Accept', value: metrics.accept, color: STATUS_COLORS.Accept },
    { name: 'Accept Lot', value: metrics.acceptLot, color: STATUS_COLORS['Accept Lot'] },
    { name: 'Reject', value: metrics.reject, color: STATUS_COLORS.Reject }
  ].filter(d => d.value > 0), [metrics]);

  // Top suppliers by defect rate
  const topSuppliers = useMemo(() => {
    const map = new Map<string, { sample: number; defect: number; count: number }>();
    for (const o of filtered) {
      const key = o.supplier_name || '(ไม่ระบุ)';
      const cur = map.get(key) || { sample: 0, defect: 0, count: 0 };
      cur.sample += o.sample_size || 0;
      cur.defect += o.defect_qty || 0;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name: name.length > 28 ? name.slice(0, 28) + '…' : name,
        fullName: name,
        rate: v.sample > 0 ? +(v.defect / v.sample * 100).toFixed(2) : 0,
        defect: v.defect, count: v.count
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);
  }, [filtered]);

  // Top defects
  const topDefects = useMemo(() => {
    const filteredOrderIds = new Set(filtered.map(o => o.id));
    const map = new Map<string, { qty: number; symptom: string }>();
    for (const d of details) {
      if (!filteredOrderIds.has(d.order_id)) continue;
      const key = (d.defect_code || '').split(',')[0].trim() || '?';
      const cur = map.get(key) || { qty: 0, symptom: d.symptom || '' };
      cur.qty += d.quantity || 0;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({
        code,
        symptom: v.symptom.length > 40 ? v.symptom.slice(0, 40) + '…' : v.symptom,
        qty: v.qty
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [filtered, details]);

  // Supplier Scorecard
  const scorecard = useMemo(() => {
    if (!supplierFilter) return null;
    const ordersForSupplier = orders.filter(o => o.supplier_name === supplierFilter);
    const total = ordersForSupplier.length;
    const accept = ordersForSupplier.filter(o => o.status === 'Accept' || o.status === 'Accept Lot').length;
    const reject = ordersForSupplier.filter(o => o.status === 'Reject').length;
    const acceptRate = total > 0 ? (accept / total) * 100 : 0;
    const sample = ordersForSupplier.reduce((s, o) => s + (o.sample_size || 0), 0);
    const defect = ordersForSupplier.reduce((s, o) => s + (o.defect_qty || 0), 0);
    const defectPct = sample > 0 ? (defect / sample) * 100 : 0;

    const orderIds = new Set(ordersForSupplier.map(o => o.id));
    const defectMap = new Map<string, { qty: number; symptom: string }>();
    for (const d of details) {
      if (!orderIds.has(d.order_id)) continue;
      const key = (d.defect_code || '').split(',')[0].trim() || '?';
      const cur = defectMap.get(key) || { qty: 0, symptom: d.symptom || '' };
      cur.qty += d.quantity || 0;
      defectMap.set(key, cur);
    }
    const topDefects = Array.from(defectMap.entries())
      .map(([code, v]) => ({ code, symptom: v.symptom, qty: v.qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return { total, accept, reject, acceptRate, defectPct, topDefects };
  }, [supplierFilter, orders, details]);

  // Reset filters
  const resetFilters = () => {
    setDateFrom(''); setDateTo(''); setSupplierFilter(''); setBrandFilter(''); setProductFilter(''); setInspectorFilter('');
  };

  // Export Excel
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summary = [
      ['Dashboard Report', ''],
      ['Filter Date', `${dateFrom || 'all'} → ${dateTo || 'all'}`],
      ['Filter Supplier', supplierFilter || 'all'],
      ['Filter Brand', brandFilter || 'all'],
      ['Filter Product', productFilter || 'all'],
      [],
      ['Metric', 'Value'],
      ['Total Orders', metrics.total],
      ['Accept', metrics.accept],
      ['Accept Lot', metrics.acceptLot],
      ['Reject', metrics.reject],
      ['Approved', metrics.approved],
      ['Pending Approval', metrics.pendingApproval],
      ['Avg Defect %', metrics.avgDefectPct.toFixed(2)],
      ['Total Sample Size', metrics.totalSample],
      ['Total Defect Qty', metrics.totalDefect]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

    // Orders sheet
    const ordersSheet = filtered.map(o => ({
      'Order No': o.order_no,
      'Date': fmtDate(o.order_date),
      'Status': o.status,
      'SAP Code': o.sap_code,
      'Description': o.material_description,
      'Brand': o.brand,
      'Supplier': o.supplier_name,
      'Sample': o.sample_size,
      'Defect': o.defect_qty,
      'Critical': o.critical_qty,
      'Major': o.major_qty,
      'Minor': o.minor_qty,
      'Defect %': Number(o.defect_percent).toFixed(2)
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordersSheet), 'Orders');

    // Top Suppliers
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topSuppliers.map(s => ({
      Supplier: s.fullName, Orders: s.count, 'Defect %': s.rate, 'Total Defect': s.defect
    }))), 'Top Suppliers');

    // Top Defects
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topDefects.map(d => ({
      'Defect Code': d.code, Symptom: d.symptom, Quantity: d.qty
    }))), 'Top Defects');

    XLSX.writeFile(wb, `QC-Dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Export PDF
  const [exporting, setExporting] = useState(false);
  const exportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, backgroundColor: '#f8f9fa', useCORS: true });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;
      pdf.addImage(img, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
      while (heightLeft > 0) {
        position = 10 - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(img, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`QC-Dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setExporting(false); }
  };

  if (loading) return <div className="p-8 text-on-surface-variant">กำลังโหลด… / Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-on-surface-variant mt-1">ภาพรวมการสุ่มตรวจคุณภาพ / QC Overview</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="btn-secondary text-sm">📊 Excel</button>
          <button onClick={exportPDF} disabled={exporting} className="btn-secondary text-sm">
            {exporting ? 'กำลังสร้าง…' : '📄 PDF'}
          </button>
        </div>
      </div>

      {/* Filters - compact */}
      <section className="rounded-lg bg-surface-low p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-on-surface-variant font-medium">Filters:</span>
          <input type="date" title="From" className="field-input !py-1 !px-2 !text-xs w-[120px]"
            value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-on-surface-variant">→</span>
          <input type="date" title="To" className="field-input !py-1 !px-2 !text-xs w-[120px]"
            value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <select className="field-select !py-1 !px-2 !text-xs max-w-[160px]" title="Supplier"
            value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
            <option value="">Supplier: ทั้งหมด</option>
            {supplierOptions.map(s => <option key={s} value={s}>{s.length > 30 ? s.slice(0, 30) + '…' : s}</option>)}
          </select>
          <select className="field-select !py-1 !px-2 !text-xs max-w-[120px]" title="Brand"
            value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
            <option value="">Brand: ทั้งหมด</option>
            {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input className="field-input !py-1 !px-2 !text-xs w-[140px]" placeholder="Product / SAP…"
            value={productFilter} onChange={e => setProductFilter(e.target.value)} />
          <select className="field-select !py-1 !px-2 !text-xs max-w-[140px]" title="Inspector"
            value={inspectorFilter} onChange={e => setInspectorFilter(e.target.value)}>
            <option value="">ผู้ตรวจ: ทั้งหมด</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
          <button onClick={resetFilters} className="text-xs text-primary hover:underline ml-auto">รีเซ็ต / Reset</button>
        </div>
      </section>

      <div ref={reportRef} className="space-y-5 bg-surface">
        {/* Metrics cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Total Orders" value={metrics.total.toLocaleString()} sub="ใบสุ่มตรวจทั้งหมด" />
          <Metric label="Accept" value={(metrics.accept + metrics.acceptLot).toLocaleString()} sub="ผ่าน + Accept Lot" color="primary" />
          <Metric label="Reject" value={metrics.reject.toLocaleString()} sub="ไม่ผ่าน" color="error" />
          <Metric label="Avg Defect %" value={metrics.avgDefectPct.toFixed(2) + '%'} sub={`${metrics.totalDefect} / ${metrics.totalSample}`} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status Distribution Pie */}
          <Card title="Order Status">
            {statusData.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name, value}) => `${name}: ${value}`}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Defect Rate trend */}
          <Card title="Defect Rate Trend (รายเดือน)" className="lg:col-span-2">
            {trendData.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e9ec" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Line type="monotone" dataKey="rate" stroke="#005db6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Suppliers */}
          <Card title="Top Suppliers (Defect Rate)">
            {topSuppliers.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topSuppliers} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e9ec" />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={150} />
                  <Tooltip formatter={(v: any, _n, p: any) => [`${v}% (${p.payload.count} orders)`, 'Defect Rate']} />
                  <Bar dataKey="rate" fill="#ba1a1a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Top Defects */}
          <Card title="Top Defects (Quantity)">
            {topDefects.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topDefects} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e9ec" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="symptom" tick={{ fontSize: 10 }} width={180} />
                  <Tooltip formatter={(v: any, _n, p: any) => [`${v} items (${p.payload.code})`, 'Quantity']} />
                  <Bar dataKey="qty" fill="#005db6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Supplier Scorecard - shown only when Supplier filter is selected */}
        {supplierFilter && scorecard && (
          <section className="section">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-bold text-lg">Supplier Scorecard</h2>
              <span className="text-sm text-on-surface-variant truncate max-w-[60%]">{supplierFilter}</span>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label="Total Orders" value={String(scorecard.total)} sub="ใบทั้งหมด" />
                <Metric label="Accept Rate" value={scorecard.acceptRate.toFixed(1) + '%'} sub={`${scorecard.accept} / ${scorecard.total}`} color="primary" />
                <Metric label="Reject" value={String(scorecard.reject)} sub="ไม่ผ่าน" color="error" />
                <Metric label="Defect %" value={scorecard.defectPct.toFixed(2) + '%'} sub="เฉลี่ย" color="amber" />
              </div>

              <div className="bg-surface-lowest rounded-md p-4">
                <h3 className="font-display font-semibold text-sm mb-2">Top 5 Defects ของ Supplier นี้</h3>
                {scorecard.topDefects.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">ไม่มีรายการของเสีย</p>
                ) : (
                  <ul className="space-y-1.5">
                    {scorecard.topDefects.map((d, i) => (
                      <li key={i} className="flex items-center justify-between text-sm border-b border-outline-variant/15 pb-1.5">
                        <span className="flex-1">
                          <span className="font-mono text-xs text-on-surface-variant mr-2">{d.code}</span>
                          {d.symptom}
                        </span>
                        <span className="chip chip-active text-[10px]">x{d.qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
        {!supplierFilter && (
          <p className="text-xs text-on-surface-variant text-center py-2">
            💡 เลือก Supplier ในฟิลเตอร์ด้านบน เพื่อดู Supplier Scorecard
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: 'primary' | 'error' | 'amber' }) {
  const colorMap: any = {
    primary: 'text-primary',
    error: 'text-error',
    amber: 'text-amber-700'
  };
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wider text-on-surface-variant">{label}</div>
      <div className={`font-display font-bold text-3xl mt-1 ${colorMap[color || ''] || ''}`}>{value}</div>
      {sub && <div className="text-xs text-on-surface-variant mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      <h3 className="font-display font-semibold text-sm mb-3">{title}</h3>
      {children}
    </div>
  );
}

function NoData() {
  return <div className="h-[240px] grid place-items-center text-on-surface-variant text-sm">ไม่มีข้อมูล / No Data</div>;
}
