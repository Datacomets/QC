// One-time migration: normalize materials.brand + brand_responsibilities.brand
// to the "Brand Standard" defined in Sales/Company Brand Standard.xlsx
//
// Run: node scripts/normalize-brand-standard.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

// 1. Build Brand → Brand Standard map (resolve conflicts by FIRST occurrence)
const wb = XLSX.readFile('Sales/Company Brand Standard.xlsx');
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const brandMap = new Map();
for (const r of rows) {
  const b = String(r['Brand'] || '').trim();
  const s = String(r['Brand Standard'] || '').trim();
  if (!b || !s || brandMap.has(b)) continue;
  brandMap.set(b, s);
}
console.log(`📋 Brand → Standard mapping: ${brandMap.size} entries`);

// 2. Update materials.brand
console.log('\n=== Updating materials.brand ===');
let matChanged = 0, matErrors = 0;
for (const [raw, std] of brandMap) {
  if (raw === std) continue;
  const { error, count } = await sb.from('materials')
    .update({ brand: std }, { count: 'exact' })
    .eq('brand', raw);
  if (error) { console.error(`  ❌ ${raw} → ${std}: ${error.message}`); matErrors++; continue; }
  if (count && count > 0) {
    matChanged += count;
    if (count >= 50) console.log(`  ↻ ${raw} → ${std} (${count} rows)`);
  }
}
console.log(`✅ materials.brand: ${matChanged} rows changed, ${matErrors} errors`);

// 3. Update brand_responsibilities.brand
// (brand is PK — handle conflicts: if standard row already exists, delete raw row instead)
console.log('\n=== Updating brand_responsibilities.brand ===');
let brChanged = 0, brDeleted = 0, brErrors = 0;
const { data: brs } = await sb.from('brand_responsibilities').select('brand,sales,scm');
const existingBrandSet = new Set((brs || []).map(b => b.brand));
for (const [raw, std] of brandMap) {
  if (raw === std) continue;
  if (!existingBrandSet.has(raw)) continue;
  if (existingBrandSet.has(std)) {
    // Standard row already exists → delete the raw row
    const { error } = await sb.from('brand_responsibilities').delete().eq('brand', raw);
    if (error) { console.error(`  ❌ delete ${raw}: ${error.message}`); brErrors++; }
    else { brDeleted++; console.log(`  🗑  delete ${raw} (standard ${std} already exists)`); }
  } else {
    // No conflict — just update
    const { error } = await sb.from('brand_responsibilities')
      .update({ brand: std })
      .eq('brand', raw);
    if (error) { console.error(`  ❌ update ${raw} → ${std}: ${error.message}`); brErrors++; }
    else { brChanged++; console.log(`  ↻ ${raw} → ${std}`); }
    existingBrandSet.delete(raw);
    existingBrandSet.add(std);
  }
}
console.log(`✅ brand_responsibilities: ${brChanged} updated, ${brDeleted} deleted (dup), ${brErrors} errors`);

// 4. Optional — Update qc_orders.brand snapshot for historical consistency
//    (commented out — brand on qc_orders is a snapshot at save time, not necessarily wrong to keep historical)
// console.log('\n=== Updating qc_orders.brand ===');
// for (const [raw, std] of brandMap) {
//   if (raw === std) continue;
//   await sb.from('qc_orders').update({ brand: std }).eq('brand', raw);
// }

console.log('\n🎉 Migration done.');
