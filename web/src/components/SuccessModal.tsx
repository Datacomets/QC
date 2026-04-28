import { fmtDate } from '../lib/utils';

interface DefectSummary {
  defect_code: string;
  symptom: string;
  critical_rank: string;
  quantity: number;
  images: { preview: string }[];
}

interface OrderSummary {
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
  status?: string;
  ncr_no?: string | null;
  note: string | null;
  details: DefectSummary[];
}

interface Props {
  order: OrderSummary;
  onClose: () => void;
}

export default function SuccessModal({ order, onClose }: Props) {
  const totalDefect = order.details.reduce((s, d) => s + d.quantity, 0);
  const pct = order.sample_size > 0 ? (totalDefect / order.sample_size) * 100 : 0;
  const critTotal = order.details.filter(d => d.critical_rank === 'Critical').reduce((s, d) => s + d.quantity, 0);
  const majTotal = order.details.filter(d => d.critical_rank === 'Major').reduce((s, d) => s + d.quantity, 0);
  const minTotal = order.details.filter(d => d.critical_rank === 'Minor').reduce((s, d) => s + d.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-inverse/40 backdrop-blur-sm" />
      <div className="relative bg-surface-lowest rounded-lg shadow-ambient max-w-lg w-full max-h-[85vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-primary-container px-6 py-4 rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary grid place-items-center text-white text-lg font-bold">✓</div>
            <div>
              <h2 className="font-display font-bold text-lg text-on-primary-container">บันทึกข้อมูลสำเร็จ / Saved Successfully</h2>
              <p className="text-sm text-on-primary-container/80">เลขที่ / Order No. {order.order_no}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Order info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="วันที่ / Date" value={fmtDate(order.order_date)} />
            <Field label="รหัส SAP / SAP Code" value={order.sap_code} />
            <Field label="รายละเอียด / Description" value={order.material_description} className="col-span-2" />
            <Field label="แบรนด์ / Brand" value={order.brand} />
            <Field label="ฝ่ายขาย / Sales" value={order.sales} />
            <Field label="SCM" value={order.scm} />
            <Field label="รหัส Sup / Sup Code" value={order.sup_code} />
            <Field label="ผู้จัดจำหน่าย / Supplier" value={order.supplier_name} className="col-span-2" />
            <Field label="หมายเลข Lot / Lot No." value={order.lot_no} />
            <Field label="จำนวนรับ / Received" value={order.received_qty != null ? String(order.received_qty) : null} />
            <Field label="จำนวนตรวจสอบ / Sample Size" value={String(order.sample_size)} />
            {order.status && <Field label="สถานะ / Status" value={order.status} />}
          </div>

          {/* NCR notice */}
          {order.status === 'Reject' && order.ncr_no && (
            <div className="rounded-md bg-error-container border border-error/30 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-error grid place-items-center text-white font-bold shrink-0">!</div>
                <div>
                  <div className="font-display font-bold text-sm text-error">สร้าง NCR อัตโนมัติ / NCR Auto-Created</div>
                  <div className="text-sm text-error mt-0.5">เลขที่ NCR: <b className="font-mono">{order.ncr_no}</b></div>
                  <div className="text-xs text-error/80 mt-1">เนื่องจากสถานะเป็น Reject ระบบจะสร้าง NCR เพื่อติดตามการแก้ไข</div>
                </div>
              </div>
            </div>
          )}

          {/* Defect summary */}
          <div className="bg-surface-low rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm">สรุปของเสีย / Defect Summary</h3>
              <div className={`font-display font-bold text-2xl ${pct > 0 ? 'text-error' : 'text-primary'}`}>
                {pct.toFixed(2)}%
              </div>
            </div>
            <div className="flex gap-2 text-xs mb-3">
              <span className="chip">Critical: <b className="ml-1">{critTotal}</b></span>
              <span className="chip">Major: <b className="ml-1">{majTotal}</b></span>
              <span className="chip">Minor: <b className="ml-1">{minTotal}</b></span>
              <span className="chip chip-active">รวม: <b className="ml-1">{totalDefect}</b></span>
            </div>

            {order.details.length > 0 ? (
              <div className="space-y-2">
                {order.details.map((d, i) => (
                  <div key={i} className="bg-surface-lowest rounded-md p-3">
                    <div className="flex items-start justify-between gap-2">
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
                    {d.images.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {d.images.map((img, j) => (
                          <img key={j} src={img.preview} alt="" className="h-12 w-12 rounded object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">ไม่มีรายการของเสีย</p>
            )}
          </div>

          {order.note && (
            <div>
              <label className="text-[11px] uppercase tracking-wide text-on-surface-variant">หมายเหตุ / Remarks</label>
              <p className="text-sm mt-0.5">{order.note}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-surface-lowest px-6 py-4 border-t border-outline-variant/15">
          <button onClick={onClose} className="btn-primary w-full">ปิด / Close</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, className = '' }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</div>
      <div className="text-on-surface font-medium">{value || '—'}</div>
    </div>
  );
}

export type { OrderSummary, DefectSummary };
