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

// ---------- Helpers ----------
const readSheet = (file, sheet) => {
  const wb = XLSX.readFile(path.join(ROOT, file));
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
};
const readSheetRaw = (file, sheet) => {
  const wb = XLSX.readFile(path.join(ROOT, file));
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null });
};
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const upsert = async (table, rows, conflict) => {
  if (!rows.length) return;
  for (const batch of chunk(rows, 500)) {
    const { error } = await sb.from(table).upsert(batch, { onConflict: conflict });
    if (error) { console.error(`  ❌ ${table}:`, error.message); throw error; }
  }
  console.log(`  ✅ ${table}: ${rows.length} rows`);
};

// ========================================================================
// 1. SUPPLIERS — combine ต่างประเทศ + ในประเทศ + Vendor purchase info
// ========================================================================
console.log('📦 Suppliers…');
const SUP_FILE = 'Sup/Supplier List_30.03.2026(Final).xlsx';

const foreign = readSheetRaw(SUP_FILE, 'ต่างประเทศ').slice(3)  // skip title+header
  .filter(r => r[3])  // SUP CODE in col D (index 3)
  .map(r => ({
    sup_code: String(r[3]).trim(),
    sup_sap_code: r[4] ? String(r[4]).trim() : null,
    supplier_name: (r[5] || '').toString().trim(),
    category: r[2] || null,
    status: r[1] || 'ACTIVE',
    purchase: 'Import'
  }));

const local = readSheet(SUP_FILE, 'ในประเทศ')
  .filter(r => r['SUP CODE'])
  .map(r => ({
    sup_code: String(r['SUP CODE']).trim(),
    sup_sap_code: null,
    supplier_name: (r['SUPPLIER NAME'] || '').toString().trim(),
    category: null,
    status: 'ACTIVE',
    purchase: 'Local'
  }));

const supMap = new Map();
[...foreign, ...local].forEach(s => { if (s.sup_code) supMap.set(s.sup_code, s); });
await upsert('suppliers', [...supMap.values()], 'sup_code');

// ========================================================================
// 2. DEFECTS — from SCM file Defect sheet (has code+symptom+reason+type)
// ========================================================================
console.log('📦 Defects…');
const SCM_FILE = '09.04.26ประกบชื่อผู้รับผิดชอบSCM.xlsx';
const defRows = readSheet(SCM_FILE, 'Defect');
const defMap = new Map();
for (const r of defRows) {
  const code = r['รหัสของเสีย'] ? String(r['รหัสของเสีย']).trim() : null;
  if (!code) continue;
  defMap.set(code, {
    defect_code: code,
    symptom: (r['ลักษณะอาการเสียSymptom'] || '').toString().trim(),
    reason: r['จุดที่พบอาการReason'] || null,
    type: r['แหล่งที่มาของปัญหาType'] || null
  });
}
await upsert('defects', [...defMap.values()], 'defect_code');

// ========================================================================
// 3. MATERIALS — from SCM file Material sheet (has Brand/Sales/SCM)
// ========================================================================
console.log('📦 Materials…');
const matRows = readSheet(SCM_FILE, 'Material')
  .filter(r => r['Material ID'])
  .map(r => ({
    sap_code: String(r['Material ID']).trim(),
    description: r['Material Description'] || null,
    product_category: r['Product Category name'] || null,
    base_uom: r['Base UoM'] || null,
    brand: r['Brand'] || null,
    sales: r['Sales'] || null,
    scm: r['SCM'] || null
  }));
// dedupe
const matMap = new Map();
matRows.forEach(m => matMap.set(m.sap_code, m));
await upsert('materials', [...matMap.values()], 'sap_code');

console.log('\n🎉 All master data seeded.');
