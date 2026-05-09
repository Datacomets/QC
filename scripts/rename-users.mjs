import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

const RENAMES = [
  { email: 'saitan.kj27@gmail.com',    newName: 'สายธาร เขียวจันทร์' },
  { email: 'aewrungrut@gmail.com',     newName: 'รุ่งรัตน์ ธงวิชัย' },
  { email: 'qc02@cometsintertrade.com', newName: 'ธิดารัตน์ จันทร์เดช' }
];

console.log('🔍 Looking up users…');
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 });
if (listErr) { console.error(listErr.message); process.exit(1); }

for (const r of RENAMES) {
  const u = list.users.find(x => (x.email || '').toLowerCase() === r.email.toLowerCase());
  if (!u) { console.log(`   ⚠️  ${r.email} → not found, skip`); continue; }

  // 1) auth.users metadata
  const { error: aErr } = await sb.auth.admin.updateUserById(u.id, {
    user_metadata: { ...(u.user_metadata || {}), full_name: r.newName }
  });
  if (aErr) { console.log(`   ❌ auth ${r.email}: ${aErr.message}`); continue; }

  // 2) profiles.full_name
  const { error: pErr } = await sb.from('profiles').update({ full_name: r.newName }).eq('id', u.id);
  if (pErr) { console.log(`   ❌ profile ${r.email}: ${pErr.message}`); continue; }

  console.log(`   ✅ ${r.email} → ${r.newName}`);
}

console.log('\nDone.');
