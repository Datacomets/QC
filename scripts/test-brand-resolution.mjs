// Test the SAP → material → brand_responsibilities → sales/scm resolution
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

const normalize = (s) => (s || '').replace(/^[*"']+/, '').trim().toLowerCase();

const { data: brs } = await sb.from('brand_responsibilities').select('brand,sales,scm');
const map = new Map();
for (const r of brs) map.set(normalize(r.brand), { sales: r.sales, scm: r.scm });
console.log(`✅ brand_resp cache loaded: ${map.size} brands`);

const tests = [
  { label: '🟢 EXACT MATCH',                  brand: '2P' },
  { label: '🟡 NORMALIZED (*2P→2P)',           brand: '*2P' },
  { label: '🟡 NORMALIZED (*AELOVA→AELOVA)',   brand: '*AELOVA' },
  { label: '🔴 NO MATCH (fallback to mat)',   brand: '*ACTIVE 8 PLUS' }
];

for (const t of tests) {
  const { data } = await sb.from('materials')
    .select('sap_code,brand,sales,scm')
    .eq('brand', t.brand).limit(1);
  if (!data || !data[0]) { console.log(`SKIP: ${t.label} (no material with brand=${t.brand})`); continue; }
  const mat = data[0];
  const br = mat.brand ? map.get(normalize(mat.brand)) : null;
  console.log(`\n=== ${t.label} ===`);
  console.log(`  SAP: ${mat.sap_code}  | Brand: ${JSON.stringify(mat.brand)}`);
  console.log(`  materials.sales/scm: ${JSON.stringify(mat.sales)} / ${JSON.stringify(mat.scm)}`);
  console.log(`  brand_resp lookup:`, br || '(no match)');
  console.log(`  → Final Sales: ${(br?.sales) || mat.sales || '(empty)'}`);
  console.log(`  → Final SCM:   ${(br?.scm) || mat.scm || '(empty)'}`);
}

// Also test: material with no brand
const { data: noBrandMat } = await sb.from('materials')
  .select('sap_code,brand,sales,scm')
  .is('brand', null).not('sales','is',null).limit(1);
if (noBrandMat?.[0]) {
  const m = noBrandMat[0];
  console.log(`\n=== ⚪ NO BRAND (uses materials.sales/scm) ===`);
  console.log(`  SAP: ${m.sap_code}  | Brand: ${m.brand}`);
  console.log(`  → Final Sales: ${m.sales || '(empty)'}`);
  console.log(`  → Final SCM:   ${m.scm || '(empty)'}`);
}
