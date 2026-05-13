import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

console.log('🔍 Checking patches applied on Supabase…\n');

// Patch 10 — status-specific approval columns on qc_orders
const p10cols = ['accept_approved', 'acceptlot_approved', 'reject_approved'];
// Patch 11 — *_by_name columns on qc_orders
const p11cols = ['approved_by_name', 'accept_approved_by_name'];
// Patch 14 — SAP breakdown columns on qc_orders + materials
const p14cols = ['sap_base', 'sap_item_type', 'sap_item_group'];

async function pickOne(table) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) return { error: error.message };
  return { row: data?.[0] || {}, count: data?.length || 0 };
}

async function checkColumns(table, cols, label) {
  const { row, error } = await pickOne(table);
  if (error) { console.log(`   ❌ ${label}: cannot read ${table} — ${error}`); return; }
  if (!row) { console.log(`   ⚠️  ${label}: ${table} has no rows yet — column existence cannot be verified`); return; }
  const missing = cols.filter(c => !(c in row));
  if (missing.length === 0) {
    console.log(`   ✅ ${label}: all columns present (${cols.join(', ')})`);
  } else {
    console.log(`   ❌ ${label}: missing ${missing.join(', ')}`);
  }
}

console.log('Patch 10 — status-specific approval columns');
await checkColumns('qc_orders', p10cols, 'qc_orders');

console.log('\nPatch 11 — approver name (text) columns');
await checkColumns('qc_orders', p11cols, 'qc_orders');

console.log('\nPatch 14 — SAP breakdown columns');
await checkColumns('qc_orders', p14cols, 'qc_orders');
await checkColumns('materials',  p14cols, 'materials');

// Patch 12 — RLS profiles_read_all (test by reading profiles as anon — too complex)
// Patch 13 — RLS qc_orders_update for operator (test by simulated role — too complex)
// → Both verified by behaviour: if Operator can confirm any order, patch 13 ok; if approver dropdown shows all, patch 12 ok

// Check sample data filled
console.log('\nSample data check:');
const { data: orders } = await sb.from('qc_orders').select('order_no, sap_code, sap_item_type, sap_item_group, sap_running_no, approved, accept_approved, acceptlot_approved').limit(3);
if (orders?.length) {
  for (const o of orders) {
    console.log(`   Order ${o.order_no}: SAP=${o.sap_code} → type=${o.sap_item_type || '-'} group=${o.sap_item_group || '-'} run=${o.sap_running_no || '-'} | approved=${o.approved} accept=${o.accept_approved} lot=${o.acceptlot_approved}`);
  }
} else {
  console.log('   (no orders to verify)');
}

console.log('\n📋 Notes:');
console.log('   • Patch 12 (profiles RLS) — verify in app: Operator should see qc_admin/admin in approve dropdown');
console.log('   • Patch 13 (qc_orders RLS) — verify in app: Operator should be able to confirm any order successfully');
