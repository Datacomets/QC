import { forwardRef } from 'react';
import { fmtDate, getProductType } from '../lib/utils';

interface OrderRow {
  order_no: string;
  order_date: string;
  sap_code: string;
  material_description: string | null;
  brand: string | null;
  supplier_name: string | null;
  lot_no: string | null;
  sample_size: number;
  defect_qty: number;
  critical_qty: number;
  major_qty: number;
  minor_qty: number;
  defect_percent: number;
  status: string;
  approved?: boolean;
}

interface Props {
  orders: OrderRow[];
  filterSummary?: string;
}

const OrderListReport = forwardRef<HTMLDivElement, Props>(function OrderListReport({ orders, filterSummary }, ref) {
  const totals = orders.reduce(
    (acc, o) => ({
      sample: acc.sample + (o.sample_size || 0),
      defect: acc.defect + (o.defect_qty || 0),
      crit: acc.crit + (o.critical_qty || 0),
      maj: acc.maj + (o.major_qty || 0),
      min: acc.min + (o.minor_qty || 0),
      accept: acc.accept + (o.status === 'Accept' ? 1 : 0),
      acceptLot: acc.acceptLot + (o.status === 'Accept Lot' ? 1 : 0),
      reject: acc.reject + (o.status === 'Reject' ? 1 : 0),
      approved: acc.approved + (o.approved ? 1 : 0)
    }),
    { sample: 0, defect: 0, crit: 0, maj: 0, min: 0, accept: 0, acceptLot: 0, reject: 0, approved: 0 }
  );
  const avgDefectPct = totals.sample > 0 ? (totals.defect / totals.sample) * 100 : 0;

  return (
    <div
      ref={ref}
      style={{
        width: '1123px',  // A4 landscape
        minHeight: '794px',
        background: '#ffffff',
        color: '#000000',
        padding: '32px',
        fontFamily: '"Inter", "Sarabun", sans-serif',
        fontSize: '10px',
        lineHeight: 1.45,
        boxSizing: 'border-box'
      }}
    >
      {/* HEADER */}
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.5px' }}>COMETS INTERTRADE CO., LTD.</div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px' }}>QC INSPECTION — SUMMARY REPORT</div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>รายงานสรุปการสุ่มตรวจคุณภาพ</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px' }}>
            <div><b>Total Orders:</b> {orders.length}</div>
            <div><b>Generated:</b> {new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            {filterSummary && <div style={{ marginTop: '2px', maxWidth: '400px' }}><b>Filter:</b> {filterSummary}</div>}
          </div>
        </div>
      </div>

      {/* SUMMARY METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', marginBottom: '14px' }}>
        <Metric label="Total Orders" value={orders.length.toString()} />
        <Metric label="Accept (incl. Lot)" value={(totals.accept + totals.acceptLot).toString()} color="#1e40af" />
        <Metric label="Reject" value={totals.reject.toString()} color="#991b1b" />
        <Metric label="Approved" value={totals.approved.toString()} color="#166534" />
        <Metric label="Total Defects" value={totals.defect.toString()} color="#991b1b" />
        <Metric label="Avg Defect %" value={avgDefectPct.toFixed(2) + '%'} color="#92400e" />
      </div>

      {/* ORDERS TABLE */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
        <thead>
          <tr style={{ background: '#1e3a5f', color: '#fff' }}>
            <th style={th}>#</th>
            <th style={th}>Order No</th>
            <th style={th}>Date</th>
            <th style={th}>SAP</th>
            <th style={th}>Type</th>
            <th style={{ ...th, width: '22%' }}>Description</th>
            <th style={th}>Brand</th>
            <th style={{ ...th, width: '15%' }}>Supplier</th>
            <th style={th}>Lot</th>
            <th style={{ ...th, textAlign: 'right' }}>Sample</th>
            <th style={{ ...th, textAlign: 'right' }}>Defect</th>
            <th style={{ ...th, textAlign: 'center' }}>C</th>
            <th style={{ ...th, textAlign: 'center' }}>M</th>
            <th style={{ ...th, textAlign: 'center' }}>m</th>
            <th style={{ ...th, textAlign: 'right' }}>%</th>
            <th style={{ ...th, textAlign: 'center' }}>Result</th>
            <th style={{ ...th, textAlign: 'center' }}>Approval</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => (
            <tr key={o.order_no} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{o.order_no}</td>
              <td style={td}>{fmtDate(o.order_date)}</td>
              <td style={{ ...td, fontFamily: 'monospace' }}>{o.sap_code}</td>
              <td style={td}>{getProductType(o.sap_code)}</td>
              <td style={{ ...td, fontSize: '8.5px' }}>{truncate(o.material_description, 50)}</td>
              <td style={td}>{o.brand || '-'}</td>
              <td style={{ ...td, fontSize: '8.5px' }}>{truncate(o.supplier_name, 30)}</td>
              <td style={td}>{o.lot_no || '-'}</td>
              <td style={{ ...td, textAlign: 'right' }}>{o.sample_size}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: o.defect_qty > 0 ? 700 : 400, color: o.defect_qty > 0 ? '#991b1b' : '#000' }}>{o.defect_qty}</td>
              <td style={{ ...td, textAlign: 'center' }}>{o.critical_qty || '-'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{o.major_qty || '-'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{o.minor_qty || '-'}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: Number(o.defect_percent) > 0 ? 700 : 400, color: Number(o.defect_percent) > 0 ? '#991b1b' : '#000' }}>
                {Number(o.defect_percent).toFixed(2)}%
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontWeight: 700, fontSize: '8.5px',
                  background: o.status === 'Reject' ? '#fee2e2' : o.status === 'Accept' || o.status === 'Accept Lot' ? '#dbeafe' : '#f3f4f6',
                  color: o.status === 'Reject' ? '#991b1b' : o.status === 'Accept' || o.status === 'Accept Lot' ? '#1e40af' : '#6b7280'
                }}>{o.status || '-'}</span>
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontWeight: 700, fontSize: '8.5px',
                  background: o.approved ? '#dcfce7' : '#f3f4f6',
                  color: o.approved ? '#166534' : '#6b7280'
                }}>{o.approved ? '✓ Approved' : 'Pending'}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#f3f4f6', fontWeight: 700 }}>
            <td style={td} colSpan={9}>TOTAL</td>
            <td style={{ ...td, textAlign: 'right' }}>{totals.sample}</td>
            <td style={{ ...td, textAlign: 'right', color: '#991b1b' }}>{totals.defect}</td>
            <td style={{ ...td, textAlign: 'center' }}>{totals.crit}</td>
            <td style={{ ...td, textAlign: 'center' }}>{totals.maj}</td>
            <td style={{ ...td, textAlign: 'center' }}>{totals.min}</td>
            <td style={{ ...td, textAlign: 'right', color: '#991b1b' }}>{avgDefectPct.toFixed(2)}%</td>
            <td style={{ ...td, textAlign: 'center' }}>—</td>
            <td style={{ ...td, textAlign: 'center' }}>—</td>
          </tr>
        </tfoot>
      </table>

      {/* FOOTER */}
      <div style={{ marginTop: '14px', paddingTop: '8px', borderTop: '1px solid #ddd', fontSize: '9px', color: '#666', textAlign: 'center' }}>
        Generated by QC Inspection System · {orders.length} orders · Comets Intertrade Co., Ltd.
      </div>
    </div>
  );
});

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '6px 8px' }}>
      <div style={{ fontSize: '8.5px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: color || '#000', marginTop: '2px' }}>{value}</div>
    </div>
  );
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '-';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

const th: React.CSSProperties = { padding: '5px 6px', textAlign: 'left', fontWeight: 700, fontSize: '8.5px', border: '1px solid #1e3a5f', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '4px 6px', border: '1px solid #e5e7eb', verticalAlign: 'top' };

export default OrderListReport;
