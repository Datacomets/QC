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

const wb = XLSX.readFile(path.join(ROOT, '09.04.26ประกบชื่อผู้รับผิดชอบSCM.xlsx'));
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sales Respon']);

const map = new Map();
for (const r of rows) {
  const brand = (r.Brand || '').toString().trim();
  if (!brand) continue;
  const sales = (r.Sales || '').toString().trim() || null;
  const scm = (r.SCM || '').toString().trim() || null;
  if (!sales && !scm) continue;
  map.set(brand, { brand, sales, scm });
}

const data = [...map.values()];
console.log(`📋 Importing ${data.length} brand mappings...`);

const { error } = await sb.from('brand_responsibilities').upsert(data, { onConflict: 'brand' });
if (error) { console.error('❌', error.message); process.exit(1); }

const { count } = await sb.from('brand_responsibilities').select('*', { count: 'exact', head: true });
console.log(`✅ Done. Total: ${count} brands`);
