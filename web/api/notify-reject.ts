import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

const SMTP_HOST = process.env.SMTP_HOST!;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASS = process.env.SMTP_PASS!;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'QC Inspection';

const APP_URL = 'https://web-mocha-three-44.vercel.app';

interface OrderRow {
  id: number;
  order_no: string;
  order_date: string;
  received_date: string | null;
  project_brief_no: string | null;
  sap_code: string;
  material_description: string | null;
  brand: string | null;
  sales: string | null;
  scm: string | null;
  sup_code: string | null;
  supplier_name: string | null;
  lot_no: string | null;
  sample_size: number;
  defect_qty: number;
  critical_qty: number;
  major_qty: number;
  minor_qty: number;
  defect_percent: number;
  status: string;
  note: string | null;
}

interface DetailRow {
  defect_code: string | null;
  symptom: string | null;
  critical_rank: string;
  quantity: number;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function buildEmail(order: OrderRow, details: DetailRow[], ncrNo: string | null): { subject: string; html: string; text: string } {
  const titleEn = order.material_description || order.sap_code;
  const subject = `🔴 [QC Reject] ${order.order_no} — ${titleEn}`;

  const defectRows = details.map(d => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #d1d5db;font-family:monospace;font-size:11px">${escapeHtml(d.defect_code)}</td>
      <td style="padding:6px 10px;border:1px solid #d1d5db;font-size:12px">${escapeHtml(d.symptom)}</td>
      <td style="padding:6px 10px;border:1px solid #d1d5db;font-size:12px;text-align:center">${escapeHtml(d.critical_rank)}</td>
      <td style="padding:6px 10px;border:1px solid #d1d5db;font-size:12px;text-align:right">${d.quantity}</td>
    </tr>
  `).join('');

  const defectTable = details.length === 0
    ? '<p style="font-size:12px;color:#666;font-style:italic">ไม่มีรายการของเสีย / No defect details</p>'
    : `
      <table style="border-collapse:collapse;width:100%;margin-top:8px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:6px 10px;border:1px solid #d1d5db;font-size:11px;text-align:left">Code</th>
            <th style="padding:6px 10px;border:1px solid #d1d5db;font-size:11px;text-align:left">Symptom</th>
            <th style="padding:6px 10px;border:1px solid #d1d5db;font-size:11px">Rank</th>
            <th style="padding:6px 10px;border:1px solid #d1d5db;font-size:11px;text-align:right">Qty</th>
          </tr>
        </thead>
        <tbody>${defectRows}</tbody>
      </table>`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,sans-serif;color:#000">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#991b1b;color:#fff;padding:16px 20px">
      <div style="font-size:18px;font-weight:700">🔴 QC Reject — รายการไม่ผ่าน</div>
      <div style="font-size:13px;opacity:0.9;margin-top:4px">New QC Reject order</div>
    </div>
    <div style="padding:20px">
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tbody>
          <tr><td style="padding:4px 0;font-size:12px;color:#666;width:40%">เลขที่ Order / Order No</td><td style="padding:4px 0;font-size:13px;font-weight:700;font-family:monospace">${escapeHtml(order.order_no)}</td></tr>
          ${ncrNo ? `<tr><td style="padding:4px 0;font-size:12px;color:#666">เลขที่ NCR / NCR No</td><td style="padding:4px 0;font-size:13px;font-weight:700;color:#991b1b;font-family:monospace">${escapeHtml(ncrNo)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;font-size:12px;color:#666">Project Brief No.</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.project_brief_no)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#666">วันที่ตรวจ / Inspection Date</td><td style="padding:4px 0;font-size:13px">${fmtDate(order.order_date)}</td></tr>
          ${order.received_date ? `<tr><td style="padding:4px 0;font-size:12px;color:#666">วันที่รับเข้า / Received</td><td style="padding:4px 0;font-size:13px">${fmtDate(order.received_date)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;font-size:12px;color:#666">SAP Code</td><td style="padding:4px 0;font-size:13px;font-family:monospace">${escapeHtml(order.sap_code)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#666">รายละเอียด / Description</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.material_description)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#666">แบรนด์ / Brand</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.brand)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#666">ผู้จัดจำหน่าย / Supplier</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.supplier_name)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#666">Lot No.</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.lot_no)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#666">Sales</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.sales)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#666">SCM</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.scm)}</td></tr>
        </tbody>
      </table>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:10px 14px;margin-bottom:16px">
        <div style="font-size:12px;color:#666">% ของเสีย / Defect Rate</div>
        <div style="font-size:24px;font-weight:700;color:#991b1b">${Number(order.defect_percent).toFixed(2)}%</div>
        <div style="font-size:11px;color:#666;margin-top:4px">
          ตรวจ ${order.sample_size} · เสีย ${order.defect_qty} · Critical ${order.critical_qty} · Major ${order.major_qty} · Minor ${order.minor_qty}
        </div>
      </div>

      <div style="font-size:13px;font-weight:700;margin-bottom:6px">รายการของเสีย / Defect List</div>
      ${defectTable}

      ${order.note ? `<div style="margin-top:16px;padding:10px 14px;background:#f9fafb;border-radius:4px;font-size:12px"><b>หมายเหตุ / Remarks:</b><br/>${escapeHtml(order.note)}</div>` : ''}

      <div style="margin-top:24px;text-align:center">
        <a href="${APP_URL}/" style="display:inline-block;padding:10px 20px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600">ดูรายละเอียดในระบบ / View in System →</a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:12px 20px;font-size:10px;color:#666;text-align:center;border-top:1px solid #e5e7eb">
      QC Inspection — Comets Intertrade · ${new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </div>
  </div>
</body></html>`;

  const text = `🔴 QC Reject — ${order.order_no}

เลขที่ Order: ${order.order_no}${ncrNo ? `\nเลขที่ NCR: ${ncrNo}` : ''}
Project Brief: ${order.project_brief_no || '—'}
วันที่ตรวจ: ${fmtDate(order.order_date)}
SAP: ${order.sap_code}
Brand: ${order.brand || '—'}
Supplier: ${order.supplier_name || '—'}
Lot: ${order.lot_no || '—'}

% ของเสีย: ${Number(order.defect_percent).toFixed(2)}%  (ตรวจ ${order.sample_size} · เสีย ${order.defect_qty})

รายการของเสีย:
${details.map(d => `• ${d.defect_code}: ${d.symptom} — ${d.critical_rank} x ${d.quantity}`).join('\n') || '(ไม่มี)'}

${order.note ? `หมายเหตุ: ${order.note}\n\n` : ''}ดูรายละเอียด: ${APP_URL}/
`;

  return { subject, html, text };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check — must be authenticated (anyone can trigger; it's a server-side validated send)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid session' });

  const body = (req.body || {}) as { order_id?: number };
  const orderId = body.order_id;
  if (!orderId) return res.status(400).json({ error: 'Missing order_id' });

  // Service-role for DB reads (avoids RLS issues on cross-table joins)
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
  });

  // Load order
  const { data: order, error: orderErr } = await admin
    .from('qc_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) return res.status(404).json({ error: 'Order not found' });

  // Server-side guard: only send for Reject status
  if (order.status !== 'Reject') {
    return res.status(200).json({ skipped: 'status_not_reject' });
  }

  // Load defect details
  const { data: details } = await admin
    .from('qc_order_details')
    .select('defect_code,symptom,critical_rank,quantity')
    .eq('order_id', orderId)
    .order('id');

  // Lookup NCR (auto-created by trigger on Reject)
  const { data: ncr } = await admin
    .from('ncr_reports')
    .select('ncr_no')
    .eq('order_id', orderId)
    .maybeSingle();

  // Load enabled recipients
  const { data: recipients } = await admin
    .from('notification_recipients')
    .select('email,name')
    .eq('enabled', true);

  const toList = (recipients || []).map(r => r.name ? `${r.name} <${r.email}>` : r.email);
  if (toList.length === 0) {
    return res.status(200).json({ skipped: 'no_recipients' });
  }

  // Build mail
  const mail = buildEmail(order as OrderRow, (details as DetailRow[]) || [], ncr?.ncr_no || null);

  // Send via SMTP
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return res.status(500).json({ error: 'SMTP not configured' });
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  try {
    const info = await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to: toList.join(', '),
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
    return res.status(200).json({ ok: true, message_id: info.messageId, recipients: toList.length });
  } catch (e: any) {
    console.error('SMTP send failed:', e?.message);
    return res.status(500).json({ error: 'Email send failed', detail: e?.message });
  }
}
