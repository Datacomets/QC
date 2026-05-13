// Seed brand_responsibilities from "Sales Respon" sheet in the SCM Excel file.
//
// Usage:
//   node scripts/seed-brand-respon.mjs              # apply changes
//   node scripts/seed-brand-respon.mjs --dry-run    # preview only
//   node scripts/seed-brand-respon.mjs --file=...   # use a different Excel file
//
// What it does:
//   • Reads sheet "Sales Respon" (columns: Brand | Sales | SCM)
//   • Dedupes by Brand (last occurrence wins)
//   • Diffs against DB → classifies NEW / UPDATED / UNCHANGED
//   • In normal mode: applies upsert and reports counts
//   • In --dry-run mode: shows what would change without writing
//
// Does NOT delete brands in DB that are missing from Excel — that's a manual step.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find(a => a.startsWith('--file='));
const FILE = fileArg ? fileArg.slice(7) : '09.04.26ประกบชื่อผู้รับผิดชอบSCM.xlsx';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

console.log(`📄 Reading: ${FILE}`);
const wb = XLSX.readFile(path.join(ROOT, FILE));
const sheet = wb.Sheets['Sales Respon'];
if (!sheet) { console.error('❌ Sheet "Sales Respon" not found'); process.exit(1); }
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const incoming = new Map();
for (const r of rows) {
  const brand = (r.Brand || '').toString().trim();
  if (!brand) continue;
  const sales = (r.Sales || '').toString().trim() || null;
  const scm = (r.SCM || '').toString().trim() || null;
  incoming.set(brand, { brand, sales, scm });
}

// Pull current DB state
const { data: existing, error: e1 } = await sb.from('brand_responsibilities').select('brand, sales, scm');
if (e1) { console.error('❌ Failed to read existing data:', e1.message); process.exit(1); }
const byBrand = new Map(existing.map(r => [r.brand, r]));

// Classify
const newRows = [], updatedRows = [], unchangedRows = [];
for (const [brand, inc] of incoming) {
  const cur = byBrand.get(brand);
  if (!cur) {
    newRows.push(inc);
  } else if ((cur.sales || null) !== inc.sales || (cur.scm || null) !== inc.scm) {
    updatedRows.push({ ...inc, _before: { sales: cur.sales, scm: cur.scm } });
  } else {
    unchangedRows.push(inc);
  }
}
const missingInExcel = existing.filter(r => !incoming.has(r.brand));

console.log('');
console.log('─'.repeat(60));
console.log(`📊 SUMMARY ${dryRun ? '(DRY-RUN — nothing will be written)' : ''}`);
console.log('─'.repeat(60));
console.log(`  In Excel:        ${incoming.size} brands`);
console.log(`  In DB:           ${existing.length} brands`);
console.log(`  ✨ NEW:          ${newRows.length}`);
console.log(`  📝 UPDATED:      ${updatedRows.length}`);
console.log(`  ✓  UNCHANGED:    ${unchangedRows.length}`);
console.log(`  ⚠️  In DB but NOT in Excel: ${missingInExcel.length} (won't be deleted automatically)`);

if (newRows.length) {
  console.log('\n✨ NEW brands:');
  console.table(newRows.slice(0, 20).map(r => ({ brand: r.brand, sales: r.sales, scm: r.scm })));
  if (newRows.length > 20) console.log(`  …and ${newRows.length - 20} more`);
}
if (updatedRows.length) {
  console.log('\n📝 UPDATED brands:');
  console.table(updatedRows.slice(0, 20).map(r => ({
    brand: r.brand,
    sales_before: r._before.sales,
    sales_after: r.sales,
    scm_before: r._before.scm,
    scm_after: r.scm
  })));
  if (updatedRows.length > 20) console.log(`  …and ${updatedRows.length - 20} more`);
}
if (missingInExcel.length) {
  console.log('\n⚠️  In DB but NOT in Excel (skipped):');
  console.table(missingInExcel.slice(0, 10).map(r => ({ brand: r.brand, sales: r.sales, scm: r.scm })));
  if (missingInExcel.length > 10) console.log(`  …and ${missingInExcel.length - 10} more`);
}

if (dryRun) {
  console.log('\n🟡 DRY-RUN complete. Run without --dry-run to apply.');
  process.exit(0);
}

if (newRows.length === 0 && updatedRows.length === 0) {
  console.log('\n✅ Nothing to change.');
  process.exit(0);
}

const payload = [...newRows, ...updatedRows.map(r => ({ brand: r.brand, sales: r.sales, scm: r.scm }))];
const { error: e2 } = await sb.from('brand_responsibilities').upsert(payload, { onConflict: 'brand' });
if (e2) { console.error('❌ Upsert failed:', e2.message); process.exit(1); }

const { count } = await sb.from('brand_responsibilities').select('*', { count: 'exact', head: true });
console.log(`\n✅ Applied. DB total now: ${count} brands.`);
