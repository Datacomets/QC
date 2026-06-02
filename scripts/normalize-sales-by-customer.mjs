// One-time migration: align brand_responsibilities.sales (and materials.sales)
// to "SALES NAME" defined in Sales/Sales_Customer x Sales.xlsx
// (the official Customer-Brand-Sales mapping).
//
// Run: node scripts/normalize-sales-by-customer.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

// 1. Build CUSTOMER BRAND → SALES NAME map (and TEAM info for reference)
const wb = XLSX.readFile('Sales/Sales_Customer x Sales.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { range: 1 }); // header row is index 1
const brandToSales = new Map();
for (const r of rows) {
  const brand = String(r['CUSTOMER BRAND'] || '').trim();
  const name = String(r['SALES NAME'] || '').trim();
  if (!brand || !name) continue;
  brandToSales.set(brand, name); // last occurrence wins (Excel has 1:1 anyway)
}
console.log(`📋 CUSTOMER BRAND → SALES NAME: ${brandToSales.size} entries`);

// 2. Load current brand_responsibilities
const { data: brs } = await sb.from('brand_responsibilities').select('brand,sales,scm');
console.log(`\nbrand_responsibilities: ${brs?.length || 0} rows`);

// 3. Plan updates
let toUpdate = 0, alreadyMatch = 0, noMapping = 0, noSalesYet = 0;
const updates = [];
for (const r of brs || []) {
  const expected = brandToSales.get(r.brand);
  if (!expected) { noMapping++; continue; }
  if (!r.sales) { noSalesYet++; updates.push({ brand: r.brand, oldSales: null, newSales: expected }); continue; }
  if (r.sales === expected) { alreadyMatch++; continue; }
  toUpdate++;
  updates.push({ brand: r.brand, oldSales: r.sales, newSales: expected });
}
console.log(`  alreadyMatch: ${alreadyMatch}`);
console.log(`  toUpdate (different): ${toUpdate}`);
console.log(`  noSalesYet (filled in by Excel): ${noSalesYet}`);
console.log(`  noMappingInExcel (skip): ${noMapping}`);

console.log('\n--- Update plan (sample) ---');
updates.slice(0, 15).forEach(u => {
  const arrow = u.oldSales ? `"${u.oldSales}" → "${u.newSales}"` : `<empty> → "${u.newSales}"`;
  console.log(`  ${u.brand}: ${arrow}`);
});
if (updates.length > 15) console.log(`  ...and ${updates.length - 15} more`);

// 4. Apply updates
console.log('\n--- Applying updates ---');
let applied = 0, errors = 0;
for (const u of updates) {
  const { error } = await sb.from('brand_responsibilities')
    .update({ sales: u.newSales, updated_at: new Date().toISOString() })
    .eq('brand', u.brand);
  if (error) { console.error(`  ❌ ${u.brand}: ${error.message}`); errors++; }
  else applied++;
}
console.log(`✅ brand_responsibilities.sales: ${applied} updated, ${errors} errors`);

// 5. Optionally update materials.sales (snapshot) for matching brands
//    materials.sales is only used as fallback when brand_responsibilities lookup misses
//    So updating it keeps fallback consistent.
console.log('\n--- Updating materials.sales (fallback snapshot) ---');
let matChanged = 0, matErrors = 0;
for (const [brand, expectedSales] of brandToSales) {
  const { error, count } = await sb.from('materials')
    .update({ sales: expectedSales }, { count: 'exact' })
    .eq('brand', brand)
    .neq('sales', expectedSales);
  if (error) { console.error(`  ❌ ${brand}: ${error.message}`); matErrors++; continue; }
  if (count && count > 0) matChanged += count;
}
console.log(`✅ materials.sales: ${matChanged} rows updated, ${matErrors} errors`);

console.log('\n🎉 Migration done.');
