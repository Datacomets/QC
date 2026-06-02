import { forwardRef } from 'react';
import { fmtDate, getProductType } from '../lib/utils';

interface NcrInfo {
  ncr_no: string;
  status: string;
  problem_found: string | null;
  root_cause: string | null;
  corrective: string | null;
  follow_up: string | null;
  created_at: string;
  closed_at: string | null;
}

interface OrderInfo {
  order_no: string;
  order_date: string;
  received_date?: string | null;
  project_brief_no?: string | null;
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
}

interface DefectDetail {
  defect_code: string;
  symptom: string;
  critical_rank: string;
  quantity: number;
  unit: string | null;
  images: string[];
}

interface Props {
  ncr: NcrInfo;
  order: OrderInfo;
  details: DefectDetail[];
  createdByName?: string | null;
}

const NcrReport = forwardRef<HTMLDivElement, Props>(function NcrReport({ ncr, order, details, createdByName }, ref) {
  return (
    <div
      ref={ref}
      style={{
        width: '794px',  // A4 portrait at 96 DPI
        minHeight: '1123px',
        background: '#ffffff',
        color: '#000000',
        padding: '40px',
        fontFamily: '"Inter", "Sarabun", sans-serif',
        fontSize: '12px',
        lineHeight: 1.5,
        boxSizing: 'border-box'
      }}
    >
      {/* HEADER */}
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.5px' }}>COMETS INTERTRADE CO., LTD.</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>NON-CONFORMANCE REPORT (NCR)</div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>รายงานข้อบกพร่องสินค้า</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px' }}>
            <div><b>NCR No:</b> <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{ncr.ncr_no}</span></div>
            <div style={{ marginTop: '2px' }}><b>Date:</b> {fmtDate(ncr.created_at)}</div>
            <div style={{ marginTop: '2px' }}>
              <b>Status:</b>{' '}
              <span style={{
                display: 'inline-block',
                padding: '1px 8px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 700,
                background: ncr.status === 'Open' ? '#fee2e2' : ncr.status === 'In Progress' ? '#fef3c7' : '#dcfce7',
                color: ncr.status === 'Open' ? '#991b1b' : ncr.status === 'In Progress' ? '#92400e' : '#166534'
              }}>{ncr.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: ORDER INFORMATION */}
      <Section number="1" title="ORDER INFORMATION" titleTh="ข้อมูล Order">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <tbody>
            <Row label1="Order No" value1={order.order_no} label2="Project Brief No." value2={order.project_brief_no || '-'} />
            <Row label1="Received Date" value1={order.received_date ? fmtDate(order.received_date) : '-'} label2="Inspection Date" value2={fmtDate(order.order_date)} />
            <Row label1="SAP Code" value1={order.sap_code} label2="Type" value2={getProductType(order.sap_code) || '-'} />
            <Row label1="Description" value1={order.material_description || '-'} colSpan2 />
            <Row label1="Brand" value1={order.brand || '-'} label2="Inspection Result" value2={order.status} />
            <Row label1="Supplier" value1={order.supplier_name || '-'} label2="Sup Code" value2={order.sup_code || '-'} />
            <Row label1="Lot No" value1={order.lot_no || '-'} label2="Received Qty" value2={order.received_qty != null ? String(order.received_qty) : '-'} />
            <Row label1="Sales" value1={order.sales || '-'} label2="SCM" value2={order.scm || '-'} />
          </tbody>
        </table>
      </Section>

      {/* SECTION 2: INSPECTION SUMMARY */}
      <Section number="2" title="INSPECTION SUMMARY" titleTh="สรุปผลการตรวจ">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={cellTh}>Sample Size</th>
              <th style={cellTh}>Good Qty</th>
              <th style={cellTh}>Defect Qty</th>
              <th style={cellTh}>Critical</th>
              <th style={cellTh}>Major</th>
              <th style={cellTh}>Minor</th>
              <th style={cellTh}>Defect %</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={cellTd}>{order.sample_size}</td>
              <td style={cellTd}>{order.good_qty}</td>
              <td style={{ ...cellTd, color: '#991b1b', fontWeight: 700 }}>{order.defect_qty}</td>
              <td style={cellTd}>{order.critical_qty}</td>
              <td style={cellTd}>{order.major_qty}</td>
              <td style={cellTd}>{order.minor_qty}</td>
              <td style={{ ...cellTd, color: '#991b1b', fontWeight: 700 }}>{Number(order.defect_percent).toFixed(2)}%</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* SECTION 3: DEFECT DETAILS */}
      <Section number="3" title="DEFECT DETAILS" titleTh="รายการของเสีย">
        {details.length === 0 ? (
          <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#999' }}>No defect details / ไม่มีรายการของเสีย</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {details.map((d, i) => (
              <div key={i} style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '8px', fontSize: '11px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 80px', gap: '8px' }}>
                  <div><b>Code:</b> <span style={{ fontFamily: 'monospace' }}>{d.defect_code}</span></div>
                  <div><b>Symptom:</b> {d.symptom}</div>
                  <div><b>Rank:</b> {d.critical_rank}</div>
                  <div style={{ textAlign: 'right' }}><b>Qty:</b> {d.quantity}{d.unit ? ` ${d.unit}` : ''}</div>
                </div>
                {d.images && d.images.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {d.images.map((url, j) => (
                      <img
                        key={j}
                        src={url}
                        crossOrigin="anonymous"
                        alt=""
                        style={{ width: 90, height: 90, objectFit: 'cover', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 4: ANALYSIS & ACTION */}
      <Section number="4" title="ANALYSIS & ACTION" titleTh="การวิเคราะห์และแก้ไข">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <FieldBox label="4.1 Problem Found" labelTh="ปัญหาที่พบ" value={ncr.problem_found} minHeight={60} />
          <FieldBox label="4.2 Root Cause" labelTh="สาเหตุของปัญหา" value={ncr.root_cause} minHeight={60} />
          <FieldBox label="4.3 Corrective & Preventive Action" labelTh="การแก้ไขและป้องกัน" value={ncr.corrective} minHeight={80} />
          <FieldBox label="4.4 Follow-up" labelTh="การติดตามผล" value={ncr.follow_up} minHeight={60} />
        </div>
      </Section>

      {/* SECTION 5: SIGNATURES */}
      <Section number="5" title="SIGNATURES" titleTh="ลงนาม">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginTop: '20px' }}>
          {[
            { role: 'QC Inspector', th: 'ผู้ตรวจสอบ', name: createdByName || '', date: fmtDate(ncr.created_at) },
            { role: 'QC Admin', th: 'หัวหน้า QC', name: '', date: '' },
            { role: 'PCM Manager', th: 'ผู้จัดการ PCM', name: '', date: '' }
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '10px' }}>
              <div style={{ borderBottom: '1px solid #000', height: '40px' }}></div>
              <div style={{ fontWeight: 700, marginTop: '4px' }}>{s.role}</div>
              <div style={{ color: '#666' }}>{s.th}</div>
              <div style={{ marginTop: '4px' }}>{s.name || ' '}</div>
              <div style={{ color: '#666' }}>{s.date || ' '}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* FOOTER */}
      <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid #ddd', fontSize: '9px', color: '#666', textAlign: 'center' }}>
        Generated by QC Inspection System · {new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · NCR {ncr.ncr_no}
      </div>
    </div>
  );
});

// ---------- Sub-components ----------
function Section({ number, title, titleTh, children }: { number: string; title: string; titleTh: string; children: any }) {
  return (
    <div style={{ marginBottom: '16px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      <div style={{ background: '#1e3a5f', color: '#fff', padding: '4px 10px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', borderRadius: '3px 3px 0 0' }}>
        {number}. {title} <span style={{ fontWeight: 400, opacity: 0.85 }}>· {titleTh}</span>
      </div>
      <div style={{ border: '1px solid #d1d5db', borderTop: 'none', padding: '10px', borderRadius: '0 0 3px 3px' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label1, value1, label2, value2, colSpan2 }: any) {
  if (colSpan2) {
    return (
      <tr>
        <td style={{ ...labelTd, width: '20%' }}>{label1}</td>
        <td style={{ ...valueTd }} colSpan={3}>{value1}</td>
      </tr>
    );
  }
  return (
    <tr>
      <td style={{ ...labelTd, width: '20%' }}>{label1}</td>
      <td style={{ ...valueTd, width: '30%' }}>{value1}</td>
      <td style={{ ...labelTd, width: '20%' }}>{label2}</td>
      <td style={{ ...valueTd, width: '30%' }}>{value2}</td>
    </tr>
  );
}

function FieldBox({ label, labelTh, value, minHeight }: { label: string; labelTh: string; value: string | null; minHeight: number }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
        {label} <span style={{ fontWeight: 400, color: '#666' }}>· {labelTh}</span>
      </div>
      <div style={{
        border: '1px solid #d1d5db',
        borderRadius: '3px',
        padding: '8px',
        minHeight: `${minHeight}px`,
        whiteSpace: 'pre-wrap',
        fontSize: '11px',
        background: '#fafafa',
        color: value ? '#000' : '#bbb',
        fontStyle: value ? 'normal' : 'italic'
      }}>
        {value || '(ยังไม่ได้กรอก / Not filled yet)'}
      </div>
    </div>
  );
}

const labelTd: React.CSSProperties = { padding: '4px 8px', background: '#f9fafb', fontWeight: 700, border: '1px solid #e5e7eb', verticalAlign: 'top' };
const valueTd: React.CSSProperties = { padding: '4px 8px', border: '1px solid #e5e7eb', verticalAlign: 'top' };
const cellTh: React.CSSProperties = { padding: '6px 8px', border: '1px solid #d1d5db', fontWeight: 700, fontSize: '10px' };
const cellTd: React.CSSProperties = { padding: '6px 8px', border: '1px solid #d1d5db' };

export default NcrReport;
