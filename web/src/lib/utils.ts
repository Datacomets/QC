/** Format integer with thousand separators (e.g. 12345 → "12,345"). Returns '—' for null/undefined. */
export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US');
}

/** ฝ่ายจัดซื้อ — PCM list (จากไฟล์ "รายชื่อฝ่ายจัดซื้อ01.06.26.xlsx") */
export const PCM_LIST = [
  'เดือนเพ็ญ ขวัญมงคลทอง (พลอย)',
  'พัณณ์ภัสร์ บัตรพันธนะ (เมย์)',
  'ปาลิตา รุ่งเรืองจาตุรันต์ (กลาส)',
  'ธัญชนก รักษาศิริ (น้ำผึ้ง)',
  'นิชนันท์ วงษ์วรรษที (ฝ้าย)',
  'วัชราภรณ์ สุดใจ (นุ่น)',
  'อัจฉราภรณ์ สถาปนศิริ (ไนน์)',
  'ยศวดี รัตนกุล (ตีตี้)',
  'สุปราณี อินทร์ชัย (มิ้นท์)',
];

/** ฝ่ายจัดซื้อ — PUR list */
export const PUR_LIST = [
  'วัชราภรณ์ รักษ์วงษ์ (มด)',
  'สุพัตรา มีสุข (โบว์)',
  'ณัฐฐาพร เอี่ยมแทน (สายป่าน)',
  'น้ำเพชร รอบคอบ (โปเต้)',
  'กาญจนา ถาวงษ์กลาง (นก)',
];

/** Format date string to DD-MM-YYYY */
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Format date+time to DD/MM/YYYY HH:mm */
export function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/**
 * SAP Code structure (Comets Intertrade)
 *
 *   <type><source><category><group><sub><run3>[-<rev>]
 *   ^1    ^2     ^3        ^4    ^5  ^6-8
 *
 * Examples:
 *   "42741000"   → PK · TRADING · SOFT COMPONENTS · INNER · Paper Inner Box · Run 000
 *   "42741000-1" → … (Revision 1)
 */

const POS1_ITEM_TYPE: Record<string, string> = {
  '1': 'FG', '2': 'SG', '3': 'Bulk', '4': 'PK', '5': 'RM',
  '8': 'SPARE PART', '9': 'OPERATION SUPPLY', '0': 'OTHER'
};

const POS2_SOURCE: Record<string, string> = {
  '1': 'PRODUCTION', '2': 'TRADING', '3': 'CUSTOMER SUPPLY', '4': 'CONSIGNMENT'
};

const POS3_CATEGORY: Record<string, string> = {
  '1': 'MAKEUP', '2': 'FACIAL CARE', '3': 'HAIR CARE', '4': 'BODY CARE',
  '5': 'FRAGRANCE', '6': 'BEAUTY ACCESSORY', '7': 'SOFT COMPONENTS', '0': 'OTHER'
};

const POS4_ITEM_GROUP: Record<string, string> = {
  '1': 'GIFT BOX', '2': 'CARD', '3': 'DOME', '4': 'INNER', '5': 'CARTON',
  '6': 'STICKER', '7': 'LABEL', '8': 'WRAP', '9': 'PACK', '0': 'OTHER'
};

const POS5_SUB_GROUP: Record<string, Record<string, string>> = {
  '1': { '1': 'Paper Gift Box', '2': 'Insert Gift Box', '3': 'Tray for Gift Box', '4': 'PVC Gift Box' },
  '2': { '1': 'Paper Slide Card', '2': 'Paper Blister Card', '3': 'Gift Card' },
  '3': { '1': 'Slide Dome', '2': 'Blister Dome' },
  '4': { '1': 'Paper Inner Box', '2': 'Insert Inner Box', '3': 'PVC Inner Box' },
  '5': { '1': 'Carton', '2': 'Partition' },
  '6': { '1': 'Shade STK', '2': 'FDA STK', '3': 'Bottom STK', '4': 'Common (Plain) STK', '5': 'Pop up STK' },
  '7': { '1': 'Bottle Label', '2': 'Inner Label', '3': 'Leaflet', '4': 'Tag' },
  '8': { '1': 'Shrink', '2': 'Foil', '3': 'Film Pallet' },
  '9': { '1': 'Plastic Bag', '2': 'OPP Bag' },
  '0': { '0': 'OTHER' }
};

export interface SapCodeParts {
  itemType: string;        // pos 1
  itemSource: string;      // pos 2
  itemCategory: string;    // pos 3
  itemGroup: string;       // pos 4
  subItemGroup: string;    // pos 5 (depends on pos 4)
  runningNo: string;       // pos 6-8
  revision: string | null; // after "-"
  raw: string;
}

/** Parse a Comets SAP code into its component parts. Tolerant of length 5–8 + optional `-rev`. */
export function parseSapCode(sap: string | null | undefined): SapCodeParts {
  const empty: SapCodeParts = {
    itemType: '', itemSource: '', itemCategory: '', itemGroup: '',
    subItemGroup: '', runningNo: '', revision: null, raw: sap || ''
  };
  if (!sap) return empty;
  const trimmed = sap.trim();
  const dashIdx = trimmed.indexOf('-');
  const main     = dashIdx >= 0 ? trimmed.slice(0, dashIdx) : trimmed;
  const revision = dashIdx >= 0 ? trimmed.slice(dashIdx + 1) : null;

  const p1 = main.charAt(0) || '';
  const p2 = main.charAt(1) || '';
  const p3 = main.charAt(2) || '';
  const p4 = main.charAt(3) || '';
  const p5 = main.charAt(4) || '';
  const running = main.length >= 6 ? main.slice(5) : '';

  return {
    itemType:     POS1_ITEM_TYPE[p1] || '',
    itemSource:   POS2_SOURCE[p2] || '',
    itemCategory: POS3_CATEGORY[p3] || '',
    itemGroup:    POS4_ITEM_GROUP[p4] || '',
    subItemGroup: POS5_SUB_GROUP[p4]?.[p5] || '',
    runningNo:    running,
    revision,
    raw:          trimmed
  };
}

/** Backward-compat — returns just the item type label (pos 1). */
export function getProductType(sapCode: string | null | undefined): string {
  return parseSapCode(sapCode).itemType;
}

/** Compact one-line summary, e.g. "PK · TRADING · SOFT COMPONENTS · INNER › Paper Inner Box (Run 000)" */
export function sapBreakdownLabel(sap: string | null | undefined): string {
  const p = parseSapCode(sap);
  if (!p.itemType) return '';
  const parts = [p.itemType, p.itemSource, p.itemCategory, p.itemGroup].filter(Boolean);
  let s = parts.join(' · ');
  if (p.subItemGroup) s += ` › ${p.subItemGroup}`;
  if (p.runningNo)    s += ` (Run ${p.runningNo})`;
  if (p.revision)     s += ` · Rev ${p.revision}`;
  return s;
}
