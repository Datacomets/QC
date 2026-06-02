// One-time seed of 5 employees as Supabase users.
// Login email = <employee_id>@cometsintertrade.com — user logs in with employee ID.
// Run:  node scripts/seed-users-batch.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

const USERS = [
  { emp: '10503', first: 'ธิดารัตน์',  last: 'จันทร์เดช',   nick: 'เบลล์', role: 'qc_admin', pass: '03LOv6'   },
  { emp: '11045', first: 'รุ่งรัตน์',  last: 'ธงวิชัย',     nick: 'อิ๋ว',   role: 'operator', pass: '65kE2G'   },
  { emp: '11262', first: 'สายธาร',    last: 'เขียวจันทร์', nick: 'ปอ',    role: 'operator', pass: '2gtP20'   },
  { emp: '11379', first: 'อาภัทธสา',  last: 'แก้วสุวรรณ',   nick: 'บูม',   role: 'operator', pass: 'v8vrlp'   },
  { emp: '11181', first: 'วรสุนาถ',   last: 'คุณพรม',      nick: 'แทม',   role: 'admin',    pass: 'Admin123' },
];

const { data: existing, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) { console.error('Cannot list users:', listErr.message); process.exit(1); }
const existingByEmail = new Map(existing.users.map(u => [u.email, u]));

for (const u of USERS) {
  const email = `${u.emp}@cometsintertrade.com`;
  const full_name = `${u.first} ${u.last} (${u.nick})`;
  const found = existingByEmail.get(email);
  if (found) {
    console.log(`↻ Update ${email} — ${full_name} [${u.role}] pass=${u.pass}`);
    await sb.auth.admin.updateUserById(found.id, {
      password: u.pass,
      email_confirm: true,
      user_metadata: { full_name, role: u.role }
    });
    const { error: upsertErr } = await sb.from('profiles').upsert({
      id: found.id, email, full_name, role: u.role
    });
    if (upsertErr) console.error('  profile error:', upsertErr.message);
  } else {
    console.log(`+ Create ${email} — ${full_name} [${u.role}] pass=${u.pass}`);
    const { data, error } = await sb.auth.admin.createUser({
      email, password: u.pass, email_confirm: true,
      user_metadata: { full_name, role: u.role }
    });
    if (error) { console.error('  create error:', error.message); continue; }
    const { error: upsertErr } = await sb.from('profiles').upsert({
      id: data.user.id, email, full_name, role: u.role
    });
    if (upsertErr) console.error('  profile error:', upsertErr.message);
  }
}

console.log('\n✅ Done.');
