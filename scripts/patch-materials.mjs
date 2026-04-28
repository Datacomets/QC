import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

const SCM_FILE = path.join(ROOT, '09.04.26ประกบชื่อผู้รับผิดชอบSCM.xlsx');
const wb = XLSX.readFile(SCM_FILE);

// 1. Build Brand → Sales/SCM mapping from Sales Respon sheet
const salesRespon = XLSX.utils.sheet_to_json(wb.Sheets['Sales Respon']);
const brandMap = new Map();
for (const r of salesRespon) {
  const brand = (r.Brand || '').toString().trim();
  if (!brand) continue;
  brandMap.set(brand.toUpperCase(), {
    sales: (r.Sales || '').toString().trim() || null,
    scm: (r.SCM || '').toString().trim() || null
  });
}
console.log(`📋 Sales Respon: ${brandMap.size} brand mappings`);

// 2. Read Material sheet with all fields
const matRows = XLSX.utils.sheet_to_json(wb.Sheets['Material']);
console.log(`📋 Material sheet: ${matRows.length} rows`);

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s === '0') return null;
  return s;
};

let updated = 0;
let skipped = 0;
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const updates = [];
for (const r of matRows) {
  const sapCode = String(r['Material ID']).trim();
  if (!sapCode) continue;

  let sales = clean(r['Sales']);
  let scm = clean(r['SCM']);
  const brand = clean(r['Brand']);

  // Fill from Sales Respon if missing
  if (brand && (!sales || !scm)) {
    const mapping = brandMap.get(brand.toUpperCase());
    if (mapping) {
      if (!sales && mapping.sales) sales = mapping.sales;
      if (!scm && mapping.scm) scm = mapping.scm;
    }
  }

  updates.push({
    sap_code: sapCode,
    description: clean(r['Material Description']),
    product_category: clean(r['Product Category name']),
    base_uom: clean(r['Base UoM']),
    brand: brand,
    sales: sales,
    scm: scm
  });
}

console.log(`📦 Updating ${updates.length} materials...`);
for (const batch of chunk(updates, 500)) {
  const { error } = await sb.from('materials').upsert(batch, { onConflict: 'sap_code' });
  if (error) { console.error('❌', error.message); throw error; }
  updated += batch.length;
  process.stdout.write(`  ${updated}/${updates.length}\r`);
}

// Verify
const { count: withBrand } = await sb.from('materials').select('*', {count:'exact', head:true}).not('brand', 'is', null);
const { count: withSales } = await sb.from('materials').select('*', {count:'exact', head:true}).not('sales', 'is', null);
const { count: withScm } = await sb.from('materials').select('*', {count:'exact', head:true}).not('scm', 'is', null);

console.log(`\n✅ Done. brand: ${withBrand}, sales: ${withSales}, scm: ${withScm}`);
