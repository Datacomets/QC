// Follow-up migration:
//   1. INSERT new brands found in Sales/Sales_Customer x Sales.xlsx that are NOT yet in brand_responsibilities
//   2. UPDATE qc_orders.sales — ONLY for orders with order_date >= 2026-03-26 — to reflect the new Excel mapping
//
// Run: node scripts/sales-followup.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const CUTOFF_DATE = '2026-03-26'; // inclusive — only orders from this date onwards are eligible

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

// Build CUSTOMER BRAND → SALES NAME map (and TEAM info for reference)
const wb = XLSX.readFile('Sales/Sales_Customer x Sales.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { range: 1 });
const brandToSales = new Map();
for (const r of rows) {
  const brand = String(r['CUSTOMER BRAND'] || '').trim();
  const name = String(r['SALES NAME'] || '').trim();
  if (!brand || !name) continue;
  brandToSales.set(brand, name);
}
console.log(`📋 CUSTOMER BRAND → SALES NAME entries: ${brandToSales.size}`);

// ============================================================
// PART 1 — INSERT new brands into brand_responsibilities
// ============================================================
console.log('\n=== PART 1: Insert new brands into brand_responsibilities ===');
const { data: existingBR } = await sb.from('brand_responsibilities').select('brand');
const existingSet = new Set((existingBR || []).map(b => b.brand));
const toInsert = [];
for (const [brand, sales] of brandToSales) {
  if (!existingSet.has(brand)) {
    toInsert.push({ brand, sales, scm: null, updated_at: new Date().toISOString() });
  }
}
console.log(`Found ${toInsert.length} brands in Excel that don't exist in brand_responsibilities.`);
console.log('Sample of new brands to insert:');
toInsert.slice(0, 10).forEach(b => console.log(`  + ${b.brand}  (sales = ${b.sales})`));
if (toInsert.length > 10) console.log(`  ...and ${toInsert.length - 10} more`);

let insertedCount = 0, insertErrors = 0;
const CHUNK = 50;
for (let i = 0; i < toInsert.length; i += CHUNK) {
  const batch = toInsert.slice(i, i + CHUNK);
  const { error } = await sb.from('brand_responsibilities').insert(batch);
  if (error) {
    console.error(`  ❌ Batch ${i / CHUNK + 1}: ${error.message}`);
    insertErrors++;
  } else {
    insertedCount += batch.length;
  }
}
console.log(`✅ brand_responsibilities: ${insertedCount} new rows inserted, ${insertErrors} batch errors`);

// ============================================================
// PART 2 — UPDATE qc_orders.sales for order_date >= CUTOFF_DATE
// ============================================================
console.log(`\n=== PART 2: Update qc_orders.sales (order_date >= ${CUTOFF_DATE}) ===`);
// Paginate orders
const orders = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('qc_orders')
    .select('id,order_no,brand,sales,order_date')
    .gte('order_date', CUTOFF_DATE)
    .range(from, from + 999);
  if (error) { console.error('Query error:', error.message); break; }
  if (!data || !data.length) break;
  orders.push(...data);
  if (data.length < 1000) break;
}
console.log(`Loaded ${orders.length} orders dated >= ${CUTOFF_DATE}.`);

let willUpdate = 0, alreadyMatch = 0, noBrand = 0, noMapping = 0;
const updatePlan = [];
for (const o of orders) {
  if (!o.brand) { noBrand++; continue; }
  const expected = brandToSales.get(o.brand);
  if (!expected) { noMapping++; continue; }
  if (o.sales === expected) { alreadyMatch++; continue; }
  willUpdate++;
  updatePlan.push({ id: o.id, order_no: o.order_no, brand: o.brand, oldSales: o.sales, newSales: expected });
}
console.log(`  alreadyMatch: ${alreadyMatch}`);
console.log(`  willUpdate: ${willUpdate}`);
console.log(`  no brand on order: ${noBrand}`);
console.log(`  brand not in Excel mapping: ${noMapping}`);
console.log('\nSample updates:');
updatePlan.slice(0, 10).forEach(u =>
  console.log(`  ${u.order_no} [${u.brand}]: "${u.oldSales || '-'}" → "${u.newSales}"`)
);
if (updatePlan.length > 10) console.log(`  ...and ${updatePlan.length - 10} more`);

let updatedCount = 0, updateErrors = 0;
for (const u of updatePlan) {
  const { error } = await sb.from('qc_orders').update({ sales: u.newSales }).eq('id', u.id);
  if (error) { console.error(`  ❌ Order ${u.order_no}: ${error.message}`); updateErrors++; }
  else updatedCount++;
}
console.log(`✅ qc_orders.sales: ${updatedCount} rows updated, ${updateErrors} errors`);

console.log('\n🎉 Migration done.');
