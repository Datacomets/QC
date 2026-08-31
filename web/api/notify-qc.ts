/**
 * QC result notification.
 *
 * Port of the Google Apps Script "QC MAIL AUTOMATION FLOW V8" that ran on the
 * AppSheet spreadsheet. Same behaviour, three mechanisms swapped:
 *
 *   Mail_Config sheet   -> public.mail_recipients      (patch-29/30/31)
 *   GmailApp thread     -> SMTP + In-Reply-To/References headers
 *   5-minute trigger    -> Vercel Cron calling ?sweep=1
 *
 * The two things that make it safe to call often are kept exactly:
 *
 *   snapshot   A SHA-256 over the fields worth mailing about. Unchanged hash
 *              means nothing material changed, so nothing is sent. This is what
 *              lets a sweep run every 5 minutes without spamming anyone.
 *
 *   threading  The first mail's Message-ID is stored on the order; later mails
 *              reference it, so an updated result lands under the original in
 *              the recipient's inbox rather than starting a new conversation.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

const SMTP_HOST = process.env.SMTP_HOST!;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASS = process.env.SMTP_PASS!;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'QC Inspection';
const CRON_SECRET = process.env.CRON_SECRET || '';

/**
 * MASTER SWITCH — off unless someone deliberately turns it on.
 *
 * Nothing leaves this endpoint until QC_MAIL_ENABLED is set to exactly "true"
 * in the Vercel environment. Every call still runs the full pipeline and
 * returns precisely what it *would* have sent and to whom, so the routing can
 * be checked against real orders without a single email going out.
 *
 * Deliberately an env var rather than a row in a table: turning live mail on
 * for ~34 people, some of them executives, should take a conscious act in the
 * hosting console, not a checkbox someone can hit by accident in the Admin UI.
 *
 * To go live: Vercel -> Settings -> Environment Variables -> QC_MAIL_ENABLED=true,
 * then redeploy. To stop it again, delete the variable.
 */
const MAIL_ENABLED = process.env.QC_MAIL_ENABLED === 'true';

/** Below this, only the standing "every order" recipients hear about it.
 *  Matches the 3% floor in the routing rules. */
const NOTIFY_FLOOR_PCT = 3;

/** How far back a sweep looks. Mirrors SWEEP_DAYS in the Apps Script. */
const SWEEP_DAYS = 30;

/** Statuses that are a final verdict and therefore worth mailing. Anything
 *  else (a half-filled draft) is skipped — GATE 1 in sendQcResultMail_. */
const FINAL_STATUSES = ['Accept', 'Accept Lot', 'Reject', 'ของเข้า ICT'];

const ICT = 'ของเข้า ICT';

/**
 * Which of the order's own responsible people are mailed, per status.
 *
 * This is the shape of the rule itself, not a preference, so it lives here
 * rather than in the recipients table: below the floor only the brand's SCM is
 * told; a plain Accept adds the buyer; anything with product moving or being
 * rejected adds Sales too.
 */
const ASSIGNED_BY_STATUS: Record<string, string[]> = {
  __below__:     ['scm'],
  'Accept':      ['scm', 'pcm', 'pur'],
  'Accept Lot':  ['scm', 'pcm', 'pur', 'sales'],
  'Reject':      ['scm', 'pcm', 'pur', 'sales'],
  [ICT]:         ['scm', 'pcm', 'pur', 'sales']
};

const FLAG_BY_STATUS: Record<string, string> = {
  'Accept': 'on_accept',
  'Accept Lot': 'on_accept_lot',
  'Reject': 'on_reject',
  [ICT]: 'on_ict'
};

/** Second digit of the defect code names where the defect came from.
 *  DEFECT_CODE_SOURCE_BY_DIGIT2 in the Apps Script. */
const DEFECT_SOURCE: Record<string, string> = {
  '1': 'Logo/สิ่งพิมพ์',
  '2': 'Appearance/ลักษณะที่ปรากฎ',
  '3': 'Function/การใช้งาน',
  '4': 'Component/ส่วนประกอบ',
  '5': 'Bulk/ตัวยา',
  '6': 'Machine/เครื่องจักร'
};

interface Recipient {
  id: number; name: string; nickname: string | null; role: string; email: string;
  active: boolean; by_assignment: boolean; on_every: boolean;
  on_accept: boolean; on_accept_lot: boolean; on_reject: boolean; on_ict: boolean;
  aliases: string[] | null; fallback_for: string[] | null;
}

interface Detail {
  defect_code: string | null; symptom: string | null;
  critical_rank: string; quantity: number; unit: string | null;
  images: string[] | null;
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const esc = (v: unknown) =>
  String(v === null || v === undefined || v === '' ? '-' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Same rule as public.nickname_of(): parenthesised form wins, else the last
 *  underscore-separated part. The two systems spell people differently and the
 *  nickname is the only part written identically in both. */
function nicknameOf(s?: string | null): string {
  const v = (s || '').trim();
  if (!v) return '';
  const m = v.match(/\(([^)]*)\)/);
  return norm(m ? m[1] : v.split('_').pop() || '');
}

const fmtNum = (n: unknown) =>
  n === null || n === undefined || isNaN(Number(n)) ? '-' : Number(n).toLocaleString('en-US');

function fmtDate(s?: string | null) {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Several defect codes and symptoms can share one row, comma-separated.
 *  Slash is deliberately not a separator — English symptom names use it
 *  ("ถลอก/ Peeling"). */
const splitMulti = (v?: string | null) =>
  String(v || '').replace(/ /g, ' ').trim()
    .split(/\s*[,，、;；]\s*|\n+/).map(s => s.trim()).filter(Boolean);

/* -------------------------------------------------------------------------- */
/* defect cross-check — validateDefectLines_                                  */
/* -------------------------------------------------------------------------- */

function validateDefects(defectQty: number, lines: Detail[]) {
  const sum = lines.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
  const qtyNoSymptom: number[] = [];
  const symptomNoQty: number[] = [];

  lines.forEach((d, i) => {
    const q = Number(d.quantity) || 0;
    const sym = String(d.symptom || '').trim();
    if (q > 0 && !sym) qtyNoSymptom.push(i + 1);
    if (sym && q <= 0) symptomNoQty.push(i + 1);
  });

  if (defectQty <= 0) {
    return sum > 0
      ? { ok: false, status: 'เกิน', message: `ไม่มีของเสีย แต่มีรายการ Defect รวม = ${sum} กรุณาตรวจสอบและลบรายการที่ไม่จำเป็น` }
      : { ok: true, status: 'ครบ', message: 'ไม่มีของเสีย ไม่ต้องกรอกอาการ Defect' };
  }
  if (!lines.length)
    return { ok: false, status: 'ไม่ครบ', message: `มีของเสีย = ${defectQty} แต่ยังไม่มีรายการ Defect กรุณาเพิ่มให้ครบ` };
  if (qtyNoSymptom.length)
    return { ok: false, status: 'ขาดอาการ Defect', message: `กรอกจำนวนแล้วแต่ยังไม่เลือกอาการ ในรายการที่ ${qtyNoSymptom.join(', ')}` };
  if (symptomNoQty.length)
    return { ok: false, status: 'ขาดจำนวน Defect', message: `เลือกอาการแล้วแต่ยังไม่กรอกจำนวน ในรายการที่ ${symptomNoQty.join(', ')}` };
  if (sum < defectQty)
    return { ok: false, status: 'ไม่ครบ', message: `ของเสีย = ${defectQty} แต่รวมรายการ Defect = ${sum} ขาดอีก ${defectQty - sum}` };
  if (sum > defectQty)
    return { ok: false, status: 'เกิน', message: `ของเสีย = ${defectQty} แต่รวมรายการ Defect = ${sum} เกินมา ${sum - defectQty}` };
  return { ok: true, status: 'ครบ', message: 'Defect ครบแล้ว' };
}

/* -------------------------------------------------------------------------- */
/* who gets it                                                                */
/* -------------------------------------------------------------------------- */

function findRecipient(people: Recipient[], person?: string | null) {
  const raw = norm(person || '');
  if (!raw) return null;
  // An alias is a human's explicit statement about a spelling, so it outranks
  // the nickname heuristic.
  const byAlias = people.find(r => (r.aliases || []).some(a => norm(a) === raw));
  if (byAlias) return byAlias;
  const nick = nicknameOf(raw);
  return nick ? people.find(r => r.nickname && norm(r.nickname) === nick) || null : null;
}

interface Resolved { email: string; name: string; why: string }

function resolveRecipients(
  people: Recipient[],
  order: any,
  status: string,
  ratePct: number
): { list: Resolved[]; skipped: Resolved[] } {
  const list: Resolved[] = [];
  const skipped: Resolved[] = [];
  const seen = new Set<string>();

  const add = (r: Recipient | null, why: string) => {
    if (!r) return;
    const key = r.email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    (r.active ? list : skipped).push({ email: r.email, name: r.name, why });
  };

  // ICT is mailed at any defect rate; everything else has a floor.
  const above = status === ICT || ratePct >= NOTIFY_FLOOR_PCT;
  const fields = ASSIGNED_BY_STATUS[above ? status : '__below__']
    || ASSIGNED_BY_STATUS.__below__;

  for (const f of fields) {
    const person = order[f] as string | null;
    const hit = findRecipient(people, person);
    if (hit && hit.by_assignment) {
      add(hit, `${f.toUpperCase()} ของใบนี้ — ${person}`);
      continue;
    }
    // No owner (a 'Non Active' placeholder, an unknown name, or someone whose
    // by_assignment is off): fall back to whoever covers that role.
    const stand = people.filter(r => r.active && (r.fallback_for || []).includes(f));
    stand.forEach(s => add(s, `รับแทน ${f.toUpperCase()} — ใบนี้ไม่มีผู้รับผิดชอบ (${person || 'ว่าง'})`));
  }

  for (const r of people) {
    if (r.on_every) { add(r, 'รับทุกฉบับ'); continue; }
    if (!above) continue;
    const flag = FLAG_BY_STATUS[status];
    if (flag && (r as any)[flag]) add(r, `รับตามสถานะ ${status}`);
  }

  return { list, skipped };
}

/* -------------------------------------------------------------------------- */
/* snapshot — buildImportantSnapshot_                                         */
/* -------------------------------------------------------------------------- */

function buildSnapshot(order: any, lines: Detail[], check: { status: string }) {
  const important = {
    order_no: order.order_no, order_date: order.order_date, status: order.status,
    received_qty: order.received_qty, sample_size: order.sample_size,
    good_qty: order.good_qty, defect_qty: order.defect_qty, defect_percent: order.defect_percent,
    critical_qty: order.critical_qty, major_qty: order.major_qty, minor_qty: order.minor_qty,
    project_brief_no: order.project_brief_no, sap_code: order.sap_code,
    material_description: order.material_description, lot_no: order.lot_no,
    brand: order.brand, supplier_name: order.supplier_name,
    pcm: order.pcm, pur: order.pur, scm: order.scm, sales: order.sales,
    approved_by_name: order.approved_by_name,
    reject_approved_by_name: order.reject_approved_by_name,
    accept_approved_by_name: order.accept_approved_by_name,
    acceptlot_approved_by_name: order.acceptlot_approved_by_name,
    note: order.note,
    defect_check: check.status,
    lines: lines.map(d => ({
      code: d.defect_code, symptom: d.symptom, rank: d.critical_rank,
      qty: d.quantity, images: (d.images || []).length
    }))
  };
  return createHash('sha256').update(JSON.stringify(important), 'utf8').digest('hex');
}

function buildSummary(order: any, lines: Detail[], check: { status: string; message: string }) {
  const sum = lines.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
  const imgs = lines.reduce((s, d) => s + (d.images || []).length, 0);
  return [
    'มีการเปลี่ยนแปลงข้อมูลสำคัญ',
    `สถานะ Defect: ${check.status}`,
    `รายละเอียด: ${check.message}`,
    `Order Status: ${order.status}`,
    `วันที่รับเข้า: ${fmtDate(order.order_date)}`,
    `จำนวนรับ: ${fmtNum(order.received_qty)}`,
    `จำนวนตรวจสอบ: ${fmtNum(order.sample_size)}`,
    `ของดี: ${fmtNum(order.good_qty)}`,
    `ของเสีย: ${fmtNum(order.defect_qty)}`,
    `รวม Quantity Defect: ${sum}`,
    `จำนวนรายการ Defect: ${lines.length}`,
    `จำนวนรูป Defect: ${imgs}`,
    `SAP CODE: ${order.sap_code || '-'}`,
    `Lot No.: ${order.lot_no || '-'}`,
    `PCM: ${order.pcm || '-'}`,
    `PUR: ${order.pur || '-'}`,
    `SCM: ${order.scm || '-'}`,
    `Sales: ${order.sales || '-'}`
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* the email                                                                  */
/* -------------------------------------------------------------------------- */

function themeFor(status: string, ratePct: number) {
  if (status === 'Reject') {
    if (ratePct >= 10) return { bg: '#7F1D1D', ac: '#450A0A', tx: '#FFFFFF', level: 'Reject >= 10%' };
    if (ratePct >= 5)  return { bg: '#B91C1C', ac: '#7F1D1D', tx: '#FFFFFF', level: 'Reject >= 5%' };
    return { bg: '#FEE2E2', ac: '#DC2626', tx: '#991B1B', level: 'Reject >= 3%' };
  }
  if (status === 'Accept Lot') return { bg: '#FBF0D5', ac: '#E0A400', tx: '#7A5200', level: 'Accept Lot' };
  return { bg: '#E1F5EE', ac: '#1D9E75', tx: '#0F6E56', level: status || 'Accept' };
}

const row = (l: string, v: unknown) =>
  `<tr><td style="color:#666;padding:2px 12px 2px 0;white-space:nowrap">${esc(l)}</td>` +
  `<td style="padding:2px 0"><b>${esc(v)}</b></td></tr>`;

function defectRowsHtml(lines: Detail[], sampleSize: number) {
  if (!lines.length)
    return `<tr><td colspan="6" style="border:1px solid #ccc;padding:8px">- ไม่พบรายการ Defect</td></tr>`;

  return lines.map((d, i) => {
    const codes = splitMulti(d.defect_code);
    const syms = splitMulti(d.symptom);
    const n = Math.max(codes.length, syms.length, 1);

    const blocks = Array.from({ length: n }, (_, k) => {
      const code = codes[k] || codes[0] || '';
      const sym = syms[k] || syms[0] || String(d.symptom || '');
      const src = code.length >= 2 ? DEFECT_SOURCE[code.charAt(1)] || '-' : '-';
      const sep = k < n - 1
        ? 'margin-bottom:14px;padding-bottom:10px;border-bottom:1px dashed #ddd'
        : '';
      return `<div style="line-height:1.45;${sep}">
        <div><b>อาการที่ ${k + 1}</b></div>
        <div>รหัสอาการของเสีย <b>${esc(code || '-')}</b></div>
        <div>${esc(sym || '-')}</div>
        <div>บริเวณที่พบ : <b>${esc(src)}</b></div>
      </div>`;
    }).join('');

    // Images are public Storage URLs, so <img src> works without attaching
    // anything — no inline CID juggling, and the mail stays small.
    const imgs = (d.images || []).length
      ? (d.images || []).map(u =>
          `<img src="${esc(u)}" width="170" style="width:170px;height:auto;margin:2px;border:1px solid #ccc;display:inline-block;vertical-align:top">`
        ).join('')
      : '-';

    const q = Number(d.quantity) || 0;
    const pct = q > 0 && sampleSize > 0 ? `${((q / sampleSize) * 100).toFixed(2)}%` : '';

    return `<tr>
      <td style="border:1px solid #ccc;padding:8px;text-align:center;width:45px">${i + 1}</td>
      <td style="border:1px solid #ccc;padding:8px;width:310px">${blocks}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:center;width:70px;font-weight:bold">${q > 0 ? fmtNum(q) : ''}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:center;width:80px;font-weight:bold">${pct}</td>
      <td style="border:1px solid #ccc;padding:8px;text-align:center;width:90px">${esc(d.critical_rank)}</td>
      <td style="border:1px solid #ccc;padding:8px;width:240px">${imgs}</td>
    </tr>`;
  }).join('');
}

function buildMail(order: any, lines: Detail[], status: string, ratePct: number,
                   theme: ReturnType<typeof themeFor>, action: string,
                   check: { ok: boolean; status: string; message: string }) {
  const pct = `${ratePct.toFixed(2)}%`;
  const headline =
    `ขออนุญาต${action}การสุ่มตรวจ Project Brief: ${order.project_brief_no || '-'}` +
    ` Lot: ${order.lot_no || '-'} Sapcode: ${order.sap_code || '-'}` +
    ` รายละเอียดสินค้า: ${order.material_description || '-'}`;

  // A mismatch between the header count and the lines is worth showing the
  // reader rather than quietly mailing numbers that do not add up.
  const alert = check.ok ? '' :
    `<div style="margin:0 0 14px;padding:10px 12px;border-left:5px solid #DC2626;background:#FEE2E2;color:#991B1B">
       <b>⚠️ ตรวจพบข้อมูล Defect ไม่สอดคล้อง (${esc(check.status)})</b><br>${esc(check.message)}
     </div>`;

  const html = `<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#222">
    <div style="font-size:15px;font-weight:bold;margin-bottom:10px">${esc(headline)}</div>

    <div style="background:${theme.bg};border-left:6px solid ${theme.ac};padding:12px 16px;margin-bottom:16px;border-radius:4px">
      <div style="font-size:18px;font-weight:bold;color:${theme.tx}">${esc(theme.level)} — %ของเสีย = ${pct}</div>
      <div style="font-size:14px;color:${theme.tx}">โปรดตรวจสอบข้อมูลกับทาง QC เพื่อยืนยันจำนวน Defect</div>
    </div>

    ${alert}
    <p>เรียน ผู้เกี่ยวข้อง</p>
    <p>ระบบตรวจพบ Order QC ที่มี %ของเสียอยู่ในระดับ <b style="color:${theme.tx}">${pct}</b></p>

    <h3>ข้อมูล Order</h3>
    <table style="border-collapse:collapse">
      ${row('Order Id', order.order_no)}${row('วันที่รับเข้า', fmtDate(order.order_date))}
      ${row('วันที่ตรวจสอบ', fmtDate(order.received_date))}${row('Project Brief No.', order.project_brief_no)}
      ${row('Order Status', status)}${row('แบรนด์', order.brand)}${row('SAP CODE', order.sap_code)}
      ${row('รายละเอียดสินค้า', order.material_description)}${row('Lot No.', order.lot_no)}
      ${row('ผู้ผลิต', order.supplier_name)}
    </table>

    <h3>ผลการตรวจสอบ</h3>
    <table style="border-collapse:collapse">
      ${row('จำนวนรับ', fmtNum(order.received_qty))}${row('จำนวนตรวจสอบ', fmtNum(order.sample_size))}
      ${row('ของดี', fmtNum(order.good_qty))}${row('ของเสีย', fmtNum(order.defect_qty))}
      ${row('Critical', fmtNum(order.critical_qty))}${row('Major', fmtNum(order.major_qty))}
      ${row('Minor', fmtNum(order.minor_qty))}
      <tr><td style="color:#666;padding:2px 12px 2px 0">%ของเสีย</td>
          <td style="padding:2px 0"><b style="color:${theme.tx};font-size:16px">${pct}</b></td></tr>
    </table>

    <h3>รายการ Defect ที่พบ (${lines.length} รายการ)</h3>
    <table style="border-collapse:collapse;border:1px solid #ccc;table-layout:fixed;width:840px;max-width:100%">
      <tr style="background:#f0f0f0">
        <th style="border:1px solid #ccc;padding:8px;width:45px">ลำดับ</th>
        <th style="border:1px solid #ccc;padding:8px;width:310px">รายละเอียดอาการ Defect</th>
        <th style="border:1px solid #ccc;padding:8px;width:70px">จำนวน</th>
        <th style="border:1px solid #ccc;padding:8px;width:80px">% ของเสีย</th>
        <th style="border:1px solid #ccc;padding:8px;width:90px">Critical</th>
        <th style="border:1px solid #ccc;padding:8px;width:240px">รูปภาพ</th>
      </tr>
      ${defectRowsHtml(lines, Number(order.sample_size) || 0)}
    </table>

    <h3>ผู้รับผิดชอบ / การอนุมัติ</h3>
    <table style="border-collapse:collapse">
      ${row('PCM', order.pcm)}${row('PUR', order.pur)}${row('SCM', order.scm)}${row('Sales', order.sales)}
      ${row('ผู้อนุมัติ', order.approved_by_name)}
    </table>

    <p>รบกวนผู้เกี่ยวข้องประสานงานกับทีม QC เพื่อตรวจสอบข้อมูลและดำเนินการในขั้นตอนถัดไปค่ะ</p>
    <p>ขอบคุณค่ะ</p>
  </div>`;

  const subject =
    `[QC Order ${order.order_no}] ขออนุญาต${action}การสุ่มตรวจ` +
    ` Project Brief: ${order.project_brief_no || '-'} Lot: ${order.lot_no || '-'}` +
    ` Sapcode: ${order.sap_code || '-'} รายละเอียดสินค้า: ${order.material_description || '-'}`;

  return { subject, html };
}

/* -------------------------------------------------------------------------- */
/* one order                                                                  */
/* -------------------------------------------------------------------------- */

async function processOrder(
  admin: any, people: Recipient[], order: any,
  transporter: nodemailer.Transporter | null,
  triggeredBy: string | null, dryRun: boolean
) {
  const status = String(order.status || '').trim();
  if (!FINAL_STATUSES.includes(status))
    return { order_no: order.order_no, action: 'skipped', reason: `status_not_final:${status}` };

  const sample = Number(order.sample_size) || 0;
  if (status !== ICT && sample <= 0)
    return { order_no: order.order_no, action: 'skipped', reason: 'no_sample_size' };

  const { data: detailData } = await admin
    .from('qc_order_details')
    .select('defect_code,symptom,critical_rank,quantity,unit,images')
    .eq('order_id', order.id).order('id');
  const lines = (detailData as Detail[]) || [];

  const defectQty = Number(order.defect_qty) || 0;
  const check = validateDefects(defectQty, lines);
  const ratePct = sample > 0 ? (defectQty / sample) * 100 : 0;

  // Write the verdict back whether or not a mail goes out, so QC sees the
  // mismatch in the app even on a quiet sweep.
  if (order.qc_defect_check_status !== check.status || order.qc_defect_alert !== (check.ok ? null : check.message)) {
    await admin.from('qc_orders').update({
      qc_defect_check_status: check.status,
      qc_defect_alert: check.ok ? null : check.message,
      qc_defect_alert_at: new Date().toISOString()
    }).eq('id', order.id);
  }

  const snapshot = buildSnapshot({ ...order, status }, lines, check);
  if (order.mail_last_snapshot && order.mail_last_snapshot === snapshot)
    return { order_no: order.order_no, action: 'skipped', reason: 'no_material_change' };

  const { list, skipped } = resolveRecipients(people, order, status, ratePct);
  if (!list.length) {
    await admin.from('qc_orders').update({
      mail_last_action: 'SKIPPED',
      mail_change_summary: `ไม่มีผู้รับที่เปิดใช้งาน — ถูกข้าม ${skipped.length} คน`
    }).eq('id', order.id);
    return { order_no: order.order_no, action: 'skipped', reason: 'no_recipients', skipped };
  }

  const theme = themeFor(status, ratePct);
  const isReply = Boolean(order.mail_message_id);
  const { subject, html } = buildMail(order, lines, status, ratePct, theme,
    isReply ? 'อัปเดตผล' : 'แจ้งผล', check);

  if (dryRun) {
    return {
      order_no: order.order_no,
      action: 'DRY_RUN',
      would_be: isReply ? 'REPLY' : 'NEW',
      reason: MAIL_ENABLED ? 'dry_run_requested' : 'ปิดการส่งเมลอยู่ (QC_MAIL_ENABLED ยังไม่ได้ตั้ง)',
      status, defect_pct: Number(ratePct.toFixed(2)),
      defect_check: check.status,
      recipients: list, skipped, subject
    };
  }
  if (!transporter) return { order_no: order.order_no, action: 'failed', reason: 'smtp_not_configured' };

  const summary = buildSummary(order, lines, check);
  let action = isReply ? 'REPLY' : 'NEW';
  let messageId: string | null = order.mail_message_id || null;

  try {
    const info = await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to: list.map(r => `"${r.name}" <${r.email}>`).join(', '),
      subject,
      html,
      text: 'อีเมลนี้เป็น HTML กรุณาเปิดด้วยโปรแกรมที่รองรับ',
      ...(isReply && order.mail_message_id
        ? { inReplyTo: order.mail_message_id, references: [order.mail_message_id] }
        : {})
    });
    // Keep the FIRST message id: every later mail must reference the root of
    // the thread, not the previous reply, or clients start a new conversation.
    if (!messageId) messageId = info.messageId || null;
  } catch (e: any) {
    await admin.from('notification_send_log').insert({
      order_id: order.id, order_no: order.order_no,
      recipient_count: list.length, recipient_emails: list.map(r => r.email).join(', '),
      attached_pdf: false, status: 'failed', error_detail: e?.message || 'send failed',
      triggered_by: triggeredBy
    });
    await admin.from('qc_orders').update({ mail_last_action: 'FAILED' }).eq('id', order.id);
    return { order_no: order.order_no, action: 'failed', reason: e?.message };
  }

  // Snapshot is saved only after a successful send, so a failure retries next
  // sweep instead of being silently marked as handled.
  await admin.from('qc_orders').update({
    mail_message_id: messageId,
    mail_last_sent_at: new Date().toISOString(),
    mail_send_count: (Number(order.mail_send_count) || 0) + 1,
    mail_last_action: action,
    mail_last_snapshot: snapshot,
    mail_change_summary: summary
  }).eq('id', order.id);

  await admin.from('notification_send_log').insert({
    order_id: order.id, order_no: order.order_no,
    recipient_count: list.length, recipient_emails: list.map(r => r.email).join(', '),
    attached_pdf: false, status: 'success', triggered_by: triggeredBy
  });

  return {
    order_no: order.order_no, action, status,
    defect_pct: Number(ratePct.toFixed(2)), defect_check: check.status,
    recipients: list.length, skipped: skipped.length
  };
}

/* -------------------------------------------------------------------------- */
/* handler                                                                    */
/* -------------------------------------------------------------------------- */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

  const sweep = req.query.sweep === '1' || req.query.sweep === 'true';
  // The master switch forces dry-run. A caller can ask for dry-run on its own,
  // but no caller can ask to actually send while the switch is off.
  const dryRun = !MAIL_ENABLED || req.query.dry === '1' || req.body?.dry_run === true;

  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

  // Two callers, two ways in: a person clicking send in the app, or the cron.
  let triggeredBy: string | null = null;
  if (sweep) {
    const auth = req.headers.authorization || '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.query.key || '');
    if (!CRON_SECRET || given !== CRON_SECRET)
      return res.status(401).json({ error: 'Unauthorized sweep' });
  } else {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false }
    });
    const { data: u, error } = await userClient.auth.getUser();
    if (error || !u?.user) return res.status(401).json({ error: 'Invalid token' });
    const { data: prof } = await admin.from('profiles').select('role').eq('id', u.user.id).single();
    if (!prof || prof.role === 'viewer')
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ส่งอีเมล' });
    triggeredBy = u.user.id;
  }

  const { data: peopleData, error: pplErr } = await admin
    .from('mail_recipients')
    .select('id,name,nickname,role,email,active,by_assignment,on_every,on_accept,on_accept_lot,on_reject,on_ict,aliases,fallback_for');
  if (pplErr) return res.status(500).json({ error: 'โหลดรายชื่อผู้รับไม่ได้: ' + pplErr.message });
  const people = (peopleData as Recipient[]) || [];

  const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS)
    ? nodemailer.createTransport({
        host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      })
    : null;

  if (sweep) {
    const since = new Date(Date.now() - SWEEP_DAYS * 86400000).toISOString().slice(0, 10);
    const { data: orders } = await admin.from('qc_orders').select('*')
      .gte('order_date', since).in('status', FINAL_STATUSES)
      .order('created_at', { ascending: false }).limit(200);

    const results = [];
    for (const o of (orders as any[]) || []) {
      try { results.push(await processOrder(admin, people, o, transporter, null, dryRun)); }
      catch (e: any) { results.push({ order_no: o.order_no, action: 'failed', reason: e?.message }); }
    }
    const tally = results.reduce((m: Record<string, number>, r: any) => {
      m[r.action] = (m[r.action] || 0) + 1; return m;
    }, {});
    return res.status(200).json({
      ok: true, sweep: true, mail_enabled: MAIL_ENABLED,
      scanned: results.length, tally, results
    });
  }

  const orderId = Number(req.body?.order_id ?? req.query.order_id);
  if (!orderId) return res.status(400).json({ error: 'Missing order_id' });
  const { data: order } = await admin.from('qc_orders').select('*').eq('id', orderId).single();
  if (!order) return res.status(404).json({ error: 'ไม่พบ Order' });

  const result = await processOrder(admin, people, order, transporter, triggeredBy, dryRun);
  return res.status(200).json({
    ok: result.action !== 'failed', mail_enabled: MAIL_ENABLED, ...result
  });
}
