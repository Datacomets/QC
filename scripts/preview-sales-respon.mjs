// Preview "Sales Respon" sheet — read-only, no DB writes
import XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = '09.04.26ประกบชื่อผู้รับผิดชอบSCM.xlsx';

const wb = XLSX.readFile(path.join(ROOT, FILE));
console.log('📄 File:', FILE);
console.log('📑 All sheets:', wb.SheetNames);
console.log('');

const sheet = wb.Sheets['Sales Respon'];
if (!sheet) {
  console.error('❌ Sheet "Sales Respon" not found');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet);
console.log(`📊 Total rows in "Sales Respon": ${rows.length}`);
console.log(`📋 Columns: ${Object.keys(rows[0] || {}).join(', ')}`);
console.log('');

// Show first 50 rows
console.log('--- First 50 rows ---');
console.table(rows.slice(0, 50));

// Show all unique brands
const brands = new Set();
const dupes = new Map();
for (const r of rows) {
  const b = (r.Brand || '').toString().trim();
  if (!b) continue;
  dupes.set(b, (dupes.get(b) || 0) + 1);
  brands.add(b);
}
console.log('');
console.log(`🏷️  Unique brands: ${brands.size}`);
const duplicateBrands = [...dupes.entries()].filter(([_, n]) => n > 1);
if (duplicateBrands.length) {
  console.log('⚠️  Duplicate brands found:');
  console.table(duplicateBrands.map(([brand, count]) => ({ brand, count })));
}
