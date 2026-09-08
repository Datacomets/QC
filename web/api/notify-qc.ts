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

/**
 * SECOND SAFETY NET — while this is set, every mail goes to these addresses and
 * nowhere else, whatever the routing worked out.
 *
 * Defaults ON, pointed at the admin mailbox, so that turning QC_MAIL_ENABLED on
 * cannot by itself put mail in front of 34 people. Real routing still runs, and
 * the message carries a banner naming everyone it *would* have gone to, so the
 * rules can be checked against live orders from one inbox.
 *
 * To go fully live, set QC_MAIL_ONLY_TO=off — a deliberate second step, taken
 * once the redirected mail looks right.
 */
const MAIL_ONLY_TO = (() => {
  const raw = process.env.QC_MAIL_ONLY_TO ?? 'sls03@cometsintertrade.com';
  if (raw.trim().toLowerCase() === 'off') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
})();

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
 * Defect photos ride along inside the message instead of being linked.
 *
 * A linked <img src="https://…supabase.co/…"> is fetched from Storage by every
 * reader, every time they open the mail. At 34 recipients and ~150 KB a photo
 * that is 34 downloads per photo per open, and the Free plan's 5 GB of monthly
 * egress does not survive it — a busy day of Reject mails alone projects to
 * about 15 GB a month.
 *
 * Embedded, the server reads each photo from Storage once while building the
 * message and the bytes then travel over SMTP, which costs nothing against the
 * database quota. Same picture in the reader's inbox, 34x less egress, and the
 * photos still show with images-off or after the bucket is locked down.
 *
 * The ceiling exists because mail servers reject large messages — Gmail cuts
 * off at 25 MB — and base64 inflates whatever is attached by about a third.
 * Anything past the ceiling falls back to a link rather than being dropped.
 */
const MAX_EMBED_BYTES  = 8 * 1024 * 1024;   // ~10.7 MB once base64-encoded
const MAX_EMBED_IMAGES = 40;
const EMBED_TIMEOUT_MS = 8000;

/** url -> the cid it was embedded under. A url that is absent stays a link. */
type EmbeddedImages = Map<string, string>;

/**
 * The NCR PDF the app renders in the browser when a Reject is saved.
 *
 * Generated client-side because that is where the NCR layout component lives;
 * this endpoint only forwards it. Passed per-request rather than fetched,
 * so a sweep — which has no browser — simply sends without one.
 */
type PdfAttachment = { filename: string; base64: string };

/** One row of public.brand_responsibilities — who owns a brand. */
type BrandOwner = { brand: string; sales: string | null; scm: string | null };

/** One row of public.brand_standards (patch-37). */
type BrandStandard = {
  brand_key: string; brand_standard: string; ambiguous: boolean; candidates: string | null;
};

/** The bits of public.suppliers the mail names a manufacturer by. */
type Supplier = {
  sup_code: string | null; sup_sap_code: string | null; supplier_name: string | null;
};

/**
 * Everything the mail needs looked up that does not live on the order row.
 * Resolved once per request and handed down, so a sweep of 200 orders does not
 * re-query the same reference data 200 times.
 */
type MailRefs = {
  brands: Map<string, BrandStandard>;   // keyed on normalizeBrand()
  suppliers: Supplier[];
  defectNames: Map<string, string>;     // defect_code -> symptom, per order
};

/**
 * Must stay identical to normalize() in scripts/gen-brand-standards.mjs.
 *
 * The workbook spells the same brand several ways and marks obsolete entries
 * with a leading * or . — "*2P", ".LA GLACE", "beW" — so both sides of the
 * lookup get flattened the same way before they are compared.
 */
function normalizeBrand(s: unknown): string {
  return String(s || '').replace(/^[*".'\s]+/, '').trim().toUpperCase();
}

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
  // everything below.
  const byAlias = people.find(r => (r.aliases || []).some(a => norm(a) === raw));
  if (byAlias) return byAlias;

  // Then the whole name, which is what the order actually records. This step
  // was missing, and the nickname fallback below was deciding on its own:
  // QC26080192 records พลอยไพลิน_หอมเนียม_พลอย as Sales, and the mail went to
  // เดือนเพ็ญ_ขวัญมงคลทอง_พลอย at pcm04@ instead — a different person who
  // happens to share the nickname พลอย. 370 orders name พลอยไพลิน as Sales, so
  // that routed every one of them to the wrong inbox.
  //
  // Compared through personName() so the two spellings of one person meet:
  // an order may say พลอยไพลิน (พลอย) หอมเนียม while mail_recipients holds
  // พลอยไพลิน_หอมเนียม_พลอย, and a plain string compare would miss it and fall
  // through to the ambiguous nickname.
  const key = personName(person);
  const byName = people.find(r => norm(r.name) === raw || personName(r.name) === key);
  if (byName) return byName;

  // The nickname is the last resort, and only when it is unambiguous. Two
  // people answering to พลอย means the nickname cannot identify either of
  // them; returning null hands the order to whoever covers that role, which
  // is a visible gap rather than a confident delivery to the wrong person.
  const nick = nicknameOf(raw);
  if (!nick) return null;
  const byNick = people.filter(r => r.nickname && norm(r.nickname) === nick);
  return byNick.length === 1 ? byNick[0] : null;
}

interface Resolved { email: string; name: string; why: string }

function resolveRecipients(
  people: Recipient[],
  order: any,
  status: string,
  ratePct: number,
  owners: Map<string, BrandOwner> = new Map()
): { list: Resolved[]; skipped: Resolved[] } {
  // The rule is "SCM ตามแบรนด์ผู้รับผิดชอบ" — the brand's owner, not merely
  // whatever the order recorded. The entry form fills those fields from this
  // same table, so the two normally agree; where they cannot is the 297 orders
  // whose scm is blank, 89 of which belong to a brand this table does know.
  // Those were falling through to "รับแทน SCM" when a real owner exists.
  //
  // The order still wins when it names someone: it is the record of who
  // actually handled that lot, and a brand can change hands.
  const owner = owners.get(normalizeBrand(order.brand));
  const assigned = (f: string): string | null => {
    const own = String(order[f] ?? '').trim();
    if (own) return own;
    if (f === 'scm')   return owner?.scm   || null;
    if (f === 'sales') return owner?.sales || null;
    return null;
  };
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
    const person = assigned(f);
    const hit = findRecipient(people, person);
    if (hit && hit.by_assignment) {
      add(hit, `${f.toUpperCase()} ของใบนี้ — ${personName(person)}`);
      continue;
    }
    // No owner (a 'Non Active' placeholder, an unknown name, or someone whose
    // by_assignment is off): fall back to whoever covers that role.
    const stand = people.filter(r => r.active && (r.fallback_for || []).includes(f));
    stand.forEach(s => add(s, `รับแทน ${f.toUpperCase()} — ใบนี้ไม่มีผู้รับผิดชอบ (${personName(person) || 'ว่าง'})`));
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

/**
 * One display format for every person the mail names: ชื่อ_นามสกุล_ชื่อเล่น.
 *
 * The database holds two conventions side by side. Most rows already use this
 * underscore form, which patch-25 standardised on — 1,726 of the SCM values
 * alone — while 133 fields left over from the AppSheet import use parentheses,
 * and those put the nickname in either position: "อัญชิสา เดชยงค์ (ไอซ์)" but
 * also "สิริสุดา (กระต่าย) ชัญถาวร". Reading a mail where the same colleague
 * appears three different ways is the complaint this fixes.
 *
 * Underscore rows are only tidied — the stray space in "ภัทราภรณ์_นามะวงค์_ เอิญ"
 * goes. Parenthesised rows are rebuilt as first_last_nick, taking the nickname
 * from inside the brackets wherever they sit and the remaining words, in the
 * order written, as the name.
 *
 * Normalising at display time rather than rewriting the rows keeps whatever was
 * actually recorded — including a misspelling like บุษบา_มาาเยอะ_บุษ, which is
 * for a person to correct, not a formatter — and a name typed either way
 * tomorrow still comes out consistent.
 *
 * Anything carrying neither marker is passed through untouched. A role
 * placeholder ("Sales PK", "Non Active"), a bare nickname ("Mint") and a name
 * recorded with no nickname ("ธนวัฒ พิบูลย์สวัสดิ์") all look alike to this
 * function, and joining their words with underscores would turn "Non Active"
 * into a person and claim a surname the row never recorded.
 */
function personName(v: unknown): string {
  const raw = String(v ?? '').trim();
  if (!raw) return '';

  // Already the target form — just drop stray spaces around the separators.
  if (raw.includes('_'))
    return raw.split('_').map(x => x.trim()).filter(Boolean).join('_');

  // Parenthesised form: nickname inside the brackets, name around them.
  const m = raw.match(/^(.*?)\s*\(([^()]+)\)\s*(.*)$/);
  if (m) {
    const words = `${m[1].trim()} ${m[3].trim()}`.split(/\s+/).filter(Boolean);
    const nick = m[2].trim();
    if (words.length && nick) return [...words, nick].join('_');
    return words.join('_') || raw;
  }

  return raw;
}

const row = (l: string, v: unknown) =>
  `<tr><td style="color:#666;padding:2px 12px 2px 0;white-space:nowrap">${esc(l)}</td>` +
  `<td style="padding:2px 0"><b>${esc(v)}</b></td></tr>`;

/**
 * The manufacturer, named by code rather than by company name.
 *
 * QC asked for Sup Code / Sup SAP Code because the company name is what people
 * disagree about — "บริษัท ยูโร-กราฟิคส์ (88) จำกัด" is written a dozen ways
 * across the workbook and SAP, while the code is one value everyone can look up.
 *
 * qc_orders.sup_code is set on about half the orders (the import could not
 * resolve the rest), so fall back to matching the recorded name against the
 * suppliers table before giving up. If nothing matches, show the name that was
 * recorded — a name is more use to the reader than a blank cell.
 */
function supplierLabel(order: any, refs: MailRefs): string {
  const byCode = order.sup_code
    ? refs.suppliers.find(s => s.sup_code === order.sup_code)
    : null;
  const name = String(order.supplier_name || '').trim().toUpperCase();
  const hit = byCode
    || (name ? refs.suppliers.find(s => String(s.supplier_name || '').trim().toUpperCase() === name) : null);

  if (!hit) return String(order.supplier_name || '-');

  const parts = [hit.sup_code, hit.sup_sap_code].filter(Boolean);
  return parts.length ? parts.join(' / ') : String(hit.supplier_name || '-');
}

/**
 * The brand, checked against Sales/Company Brand Standard before it goes out.
 *
 * Three outcomes, and the mail is explicit about which one it is:
 *   corrected  the typed name maps to a different standard — show the standard,
 *              with what QC actually typed in brackets so nobody thinks the
 *              order says something it does not
 *   ambiguous  the workbook gives several standards for this brand depending on
 *              the owning company, which no field on the order records. ICT
 *              alone has six. Leave the name as typed and say so — printing one
 *              of six would put another customer's brand in front of staff.
 *   unknown    not in the workbook at all. Leave it and flag it, so the gap gets
 *              fixed in the source file rather than papered over here.
 */
function brandRow(order: any, refs: MailRefs): string {
  const typed = String(order.brand || '').trim();
  if (!typed) return row('แบรนด์', '-');

  const hit = refs.brands.get(normalizeBrand(typed));
  const note = (t: string, color: string) =>
    ` <span style="font-weight:normal;color:${color};font-size:12px">${esc(t)}</span>`;

  if (!hit) {
    return `<tr><td style="color:#666;padding:2px 12px 2px 0;white-space:nowrap">แบรนด์</td>` +
           `<td style="padding:2px 0"><b>${esc(typed)}</b>` +
           note('(ไม่พบในไฟล์มาตรฐานแบรนด์)', '#B45309') + `</td></tr>`;
  }
  if (hit.ambiguous) {
    return `<tr><td style="color:#666;padding:2px 12px 2px 0;white-space:nowrap">แบรนด์</td>` +
           `<td style="padding:2px 0"><b>${esc(typed)}</b>` +
           note(`(ชื่อนี้ตรงได้หลายมาตรฐาน: ${hit.candidates || ''} — ใช้ตามที่ QC บันทึก)`, '#B45309') +
           `</td></tr>`;
  }
  if (normalizeBrand(hit.brand_standard) === normalizeBrand(typed)) {
    return row('แบรนด์', hit.brand_standard);
  }
  return `<tr><td style="color:#666;padding:2px 12px 2px 0;white-space:nowrap">แบรนด์</td>` +
         `<td style="padding:2px 0"><b>${esc(hit.brand_standard)}</b>` +
         note(`(QC บันทึกว่า "${typed}")`, '#666') + `</td></tr>`;
}

function defectRowsHtml(lines: Detail[], sampleSize: number, defectNames: Map<string, string>,
                        embedded: EmbeddedImages) {
  if (!lines.length)
    return `<tr><td colspan="6" style="border:1px solid #ccc;padding:8px">- ไม่พบรายการ Defect</td></tr>`;

  return lines.map((d, i) => {
    const codes = splitMulti(d.defect_code);
    const syms = splitMulti(d.symptom);
    const n = Math.max(codes.length, syms.length, 1);

    const blocks = Array.from({ length: n }, (_, k) => {
      const code = codes[k] || codes[0] || '';
      // Pair the symptom to its CODE, not to its position.
      //
      // A line can carry several codes and several symptoms in one cell, and
      // the two lists are not always written in the same order — QC26050015
      // shows 12308 labelled "ถลอก" and 12304 labelled "สีไม่ตรง STD", which is
      // the other way round in the defects table. Zipping by index reproduces
      // that mix-up in the mail. The code is the reliable half, so the symptom
      // is looked up from it and the typed text is only a fallback for codes
      // that are not in the table.
      const sym = defectNames.get(code) || syms[k] || syms[0] || String(d.symptom || '');
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

    // An embedded photo is referenced by its cid; one that could not be
    // embedded — past the size ceiling, or it would not download — keeps the
    // public Storage URL so the reader still gets something.
    const imgs = (d.images || []).length
      ? (d.images || []).map(u => {
          const cid = embedded.get(u);
          const src = cid ? `cid:${cid}` : u;
          return `<img src="${esc(src)}" width="170" style="width:170px;height:auto;margin:2px;border:1px solid #ccc;display:inline-block;vertical-align:top">`;
        }).join('')
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

/**
 * Read each defect photo from Storage once, ready to be attached.
 *
 * Failures are per-photo and never fatal: a photo that will not download simply
 * stays a link in the message, which is what the mail did for everything before
 * this. A photo that arrives is counted against both ceilings before the next
 * one is fetched, so a pathological order cannot build a message no server will
 * accept.
 */
async function fetchImages(urls: string[]): Promise<{
  embedded: EmbeddedImages;
  attachments: { filename: string; content: Buffer; cid: string; contentType: string }[];
  skipped: number;
  bytes: number;
}> {
  const embedded: EmbeddedImages = new Map();
  const attachments: { filename: string; content: Buffer; cid: string; contentType: string }[] = [];
  let bytes = 0, skipped = 0;

  for (const url of urls) {
    if (embedded.has(url)) continue;
    if (attachments.length >= MAX_EMBED_IMAGES || bytes >= MAX_EMBED_BYTES) { skipped++; continue; }
    try {
      const ctl = AbortSignal.timeout ? AbortSignal.timeout(EMBED_TIMEOUT_MS) : undefined;
      const r = await fetch(url, ctl ? { signal: ctl } : {});
      if (!r.ok) { skipped++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || bytes + buf.length > MAX_EMBED_BYTES) { skipped++; continue; }

      const name = decodeURIComponent(url.split('/').pop() || 'photo.jpg');
      const cid = `img${attachments.length}@qc`;
      attachments.push({
        filename: name,
        content: buf,
        cid,
        contentType: r.headers.get('content-type') || (name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
      });
      embedded.set(url, cid);
      bytes += buf.length;
    } catch {
      skipped++;
    }
  }
  return { embedded, attachments, skipped, bytes };
}

function buildMail(order: any, lines: Detail[], status: string, ratePct: number,
                   theme: ReturnType<typeof themeFor>, action: string,
                   check: { ok: boolean; status: string; message: string },
                   refs: MailRefs, embedded: EmbeddedImages = new Map()) {
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
      ${row('Order Status', status)}${brandRow(order, refs)}${row('SAP CODE', order.sap_code)}
      ${row('รายละเอียดสินค้า', order.material_description)}${row('Lot No.', order.lot_no)}
      ${row('ผู้ผลิต', supplierLabel(order, refs))}
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
      ${defectRowsHtml(lines, Number(order.sample_size) || 0, refs.defectNames, embedded)}
    </table>

    <h3>ผู้รับผิดชอบ / การอนุมัติ</h3>
    <table style="border-collapse:collapse">
      ${row('PCM', personName(order.pcm))}${row('PUR', personName(order.pur))}${row('SCM', personName(order.scm))}${row('Sales', personName(order.sales))}
      ${row('ผู้อนุมัติ', personName(order.approved_by_name))}
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
  triggeredBy: string | null, dryRun: boolean,
  attachment: PdfAttachment | null = null,
  refs: { brands: Map<string, BrandStandard>; suppliers: Supplier[];
          owners?: Map<string, BrandOwner> } =
        { brands: new Map(), suppliers: [], owners: new Map() },
  onDemand = false
) {
  // Imported history is flagged so turning mail on cannot notify thousands of
  // orders closed months ago (patch-32).
  //
  // That danger is a SWEEP finding them all at once, and the sweep's own query
  // already filters mail_suppressed out, so this guard exists for the sweep's
  // benefit twice over. Blocking the button as well meant QC could not re-send
  // the result of an imported order even deliberately, one at a time, which is
  // a normal thing to want — someone asks what QC26080192 said and there is no
  // way to mail it. A person clicking แจ้งผลทางอีเมล on one order is the
  // opposite of an accidental mass send, so on-demand sends pass through.
  if (order.mail_suppressed && !onDemand)
    return { order_no: order.order_no, action: 'skipped', reason: 'mail_suppressed (ข้อมูลเก่าที่ import มา)' };

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

  const { list, skipped } = resolveRecipients(people, order, status, ratePct, refs.owners);
  if (!list.length) {
    await admin.from('qc_orders').update({
      mail_last_action: 'SKIPPED',
      mail_change_summary: `ไม่มีผู้รับที่เปิดใช้งาน — ถูกข้าม ${skipped.length} คน`
    }).eq('id', order.id);
    return { order_no: order.order_no, action: 'skipped', reason: 'no_recipients', skipped };
  }

  // Only the codes this order actually uses — the defects table has 4,536 rows
  // and PostgREST would cap a full read at 1,000 anyway.
  const codes = [...new Set(lines.flatMap(l => splitMulti(l.defect_code)))].filter(Boolean);
  const defectNames = new Map<string, string>();
  if (codes.length) {
    const { data: defs } = await admin
      .from('defects').select('defect_code,symptom').in('defect_code', codes);
    for (const d of (defs as { defect_code: string; symptom: string | null }[]) || []) {
      if (d.symptom) defectNames.set(d.defect_code, d.symptom);
    }
  }

  const theme = themeFor(status, ratePct);
  const isReply = Boolean(order.mail_message_id);

  // A dry run reports what would be sent, so there is no reason to pull
  // megabytes of photos out of Storage for it.
  const photoUrls = lines.flatMap(l => l.images || []).filter(Boolean);
  const photos = dryRun
    ? { embedded: new Map<string, string>(), attachments: [], skipped: 0, bytes: 0 }
    : await fetchImages(photoUrls);

  const { subject, html } = buildMail(order, lines, status, ratePct, theme,
    isReply ? 'อัปเดตผล' : 'แจ้งผล', check,
    { brands: refs.brands, suppliers: refs.suppliers, defectNames },
    photos.embedded);

  if (dryRun) {
    return {
      order_no: order.order_no,
      action: 'DRY_RUN',
      would_be: isReply ? 'REPLY' : 'NEW',
      reason: MAIL_ENABLED ? 'dry_run_requested' : 'ปิดการส่งเมลอยู่ (QC_MAIL_ENABLED ยังไม่ได้ตั้ง)',
      status, defect_pct: Number(ratePct.toFixed(2)),
      defect_check: check.status,
      recipients: list, skipped, subject,
      photos: photoUrls.length,
      attached_pdf: attachment ? attachment.filename : null,
      redirected_to: MAIL_ONLY_TO.length ? MAIL_ONLY_TO : null
    };
  }
  if (!transporter) return { order_no: order.order_no, action: 'failed', reason: 'smtp_not_configured' };

  const summary = buildSummary(order, lines, check);
  let action = isReply ? 'REPLY' : 'NEW';
  let messageId: string | null = order.mail_message_id || null;

  // While redirect is on, the real recipient list is shown at the top of the
  // message instead of being addressed — otherwise there is no way to check the
  // routing from a single test inbox.
  const redirected = MAIL_ONLY_TO.length > 0;
  const to = redirected
    ? MAIL_ONLY_TO.join(', ')
    : list.map(r => `"${personName(r.name)}" <${r.email}>`).join(', ');
  const body = redirected
    ? `<div style="font-family:Tahoma,Arial,sans-serif;font-size:13px;background:#FFF4CC;border:2px solid #E0A400;border-radius:4px;padding:12px 14px;margin-bottom:18px;color:#7A5200">
         <b>🔁 โหมดทดสอบ — เมลนี้ถูกส่งมาที่คุณคนเดียว ไม่ได้ส่งถึงผู้รับจริง</b>
         <div style="margin-top:8px">ถ้าเปิดใช้งานจริง เมลฉบับนี้จะส่งถึง <b>${list.length} คน</b>:</div>
         <ul style="margin:6px 0 0;padding-left:20px">
           ${list.map(r => `<li>${esc(personName(r.name))} &lt;${esc(r.email)}&gt; — ${esc(r.why)}</li>`).join('')}
         </ul>
         ${skipped.length ? `<div style="margin-top:8px">ถูกข้ามเพราะปิดสวิตช์ ${skipped.length} คน: ${skipped.map(s => esc(s.email)).join(', ')}</div>` : ''}
         <div style="margin-top:8px;font-size:12px">ปิดโหมดนี้ด้วยการตั้ง <code>QC_MAIL_ONLY_TO=off</code></div>
       </div>${html}`
    : html;

  try {
    const info = await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to,
      subject: redirected ? `[ทดสอบ] ${subject}` : subject,
      html: body,
      text: 'อีเมลนี้เป็น HTML กรุณาเปิดด้วยโปรแกรมที่รองรับ',
      attachments: [
        ...photos.attachments,
        ...(attachment
          ? [{
              filename: attachment.filename,
              content: Buffer.from(attachment.base64, 'base64'),
              contentType: 'application/pdf'
            }]
          : [])
      ],
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
      attached_pdf: Boolean(attachment), status: 'failed', error_detail: e?.message || 'send failed',
      triggered_by: triggeredBy
    });
    await admin.from('qc_orders').update({ mail_last_action: 'FAILED' }).eq('id', order.id);
    return { order_no: order.order_no, action: 'failed', reason: e?.message };
  }

  if (redirected) {
    // A redirected mail reached one test inbox, not the real recipients, so it
    // must not count as "this order has been notified". Saving the snapshot
    // would make the first real send after going live look like a no-change and
    // be skipped; storing the Message-ID would root the thread on a message
    // nobody else ever saw.
    action = 'TEST';
    await admin.from('qc_orders').update({
      mail_last_sent_at: new Date().toISOString(),
      mail_last_action: 'TEST',
      mail_change_summary: `ทดสอบ — ส่งไปที่ ${MAIL_ONLY_TO.join(', ')} เท่านั้น\nผู้รับจริงถ้าเปิดใช้งาน ${list.length} คน\n\n${summary}`
    }).eq('id', order.id);
  } else {
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
  }

  await admin.from('notification_send_log').insert({
    order_id: order.id, order_no: order.order_no,
    recipient_count: redirected ? MAIL_ONLY_TO.length : list.length,
    recipient_emails: redirected
      ? `[ทดสอบ] ${MAIL_ONLY_TO.join(', ')} · ผู้รับจริง ${list.length} คน`
      : list.map(r => r.email).join(', '),
    attached_pdf: Boolean(attachment), status: 'success', triggered_by: triggeredBy
  });

  return {
    order_no: order.order_no, action, status,
    defect_pct: Number(ratePct.toFixed(2)), defect_check: check.status,
    recipients: list.length, skipped: skipped.length,
    attached_pdf: Boolean(attachment),
    photos_embedded: photos.attachments.length,
    photos_linked: photos.skipped,
    photo_bytes: photos.bytes,
    redirected_to: redirected ? MAIL_ONLY_TO : null
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

  // Reference data the mail checks every order against, read once per request.
  // brand_standards is 455 rows and suppliers 166, so both fit in one response
  // well under PostgREST's 1,000-row cap.
  const [brandRes, supRes, ownerRes] = await Promise.all([
    admin.from('brand_standards').select('brand_key,brand_standard,ambiguous,candidates'),
    admin.from('suppliers').select('sup_code,sup_sap_code,supplier_name'),
    admin.from('brand_responsibilities').select('brand,sales,scm')
  ]);
  const brands = new Map<string, BrandStandard>();
  for (const b of (brandRes.data as BrandStandard[]) || []) brands.set(b.brand_key, b);
  const suppliers = (supRes.data as Supplier[]) || [];

  // Who owns each brand, keyed the way the brand itself is normalised, plus an
  // entry under the standard name so an order saying "2P" finds the row filed
  // under "2P ORIGINAL". An ambiguous brand is skipped for the same reason the
  // mail leaves its name alone: ICT resolves six ways and picking one would
  // hand the order to a stranger.
  const owners = new Map<string, BrandOwner>();
  for (const o of (ownerRes.data as BrandOwner[]) || []) {
    const key = normalizeBrand(o.brand);
    if (!key) continue;
    if (!owners.has(key)) owners.set(key, o);
    const std = brands.get(key);
    if (std && !std.ambiguous) {
      const alias = normalizeBrand(std.brand_standard);
      if (alias && !owners.has(alias)) owners.set(alias, o);
    }
  }

  // Missing brand_standards is not fatal: patch-37 may not have been run yet, and
  // a mail with the brand as typed beats no mail at all.
  if (brandRes.error) console.warn('brand_standards unavailable:', brandRes.error.message);
  if (ownerRes.error) console.warn('brand_responsibilities unavailable:', ownerRes.error.message);
  const refs = { brands, suppliers, owners };

  const transporter = (SMTP_HOST && SMTP_USER && SMTP_PASS)
    ? nodemailer.createTransport({
        host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      })
    : null;

  if (sweep) {
    const since = new Date(Date.now() - SWEEP_DAYS * 86400000).toISOString().slice(0, 10);
    const { data: orders } = await admin.from('qc_orders').select('*')
      .gte('order_date', since).in('status', FINAL_STATUSES).eq('mail_suppressed', false)
      .order('created_at', { ascending: false }).limit(200);

    const results = [];
    for (const o of (orders as any[]) || []) {
      try { results.push(await processOrder(admin, people, o, transporter, null, dryRun, null, refs)); }
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

  // A browser-generated PDF arrives as 'data:application/pdf;base64,...'.
  const rawPdf: string | undefined = req.body?.pdf_base64;
  const attachment: PdfAttachment | null = rawPdf
    ? {
        filename: String(req.body?.pdf_filename || `${order.order_no}.pdf`),
        base64: rawPdf.includes(',') ? rawPdf.split(',', 2)[1] : rawPdf
      }
    : null;

  const result = await processOrder(admin, people, order, transporter, triggeredBy, dryRun, attachment, refs, true);
  return res.status(200).json({
    ok: result.action !== 'failed', mail_enabled: MAIL_ENABLED, ...result
  });
}
