import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

const OLD_EMAIL = 'qc02@cometsintertrade.com';
const NEW_EMAIL = 'qc03@cometsintertrade.com';

console.log(`🔍 Looking up ${OLD_EMAIL}…`);
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 });
if (listErr) { console.error(listErr.message); process.exit(1); }

const u = list.users.find(x => (x.email || '').toLowerCase() === OLD_EMAIL.toLowerCase());
if (!u) { console.log(`❌ ${OLD_EMAIL} not found`); process.exit(1); }

console.log(`   Found: id=${u.id}, name=${u.user_metadata?.full_name || '?'}`);

// Check if NEW_EMAIL is already taken
const taken = list.users.find(x => (x.email || '').toLowerCase() === NEW_EMAIL.toLowerCase());
if (taken) {
  console.error(`❌ ${NEW_EMAIL} already exists in auth (id=${taken.id})`);
  process.exit(1);
}

// 1) auth.users
console.log(`🔧 Updating auth email…`);
const { error: aErr } = await sb.auth.admin.updateUserById(u.id, {
  email: NEW_EMAIL,
  email_confirm: true
});
if (aErr) { console.error(`❌ auth: ${aErr.message}`); process.exit(1); }

// 2) profiles.email
console.log(`🔧 Updating profile email…`);
const { error: pErr } = await sb.from('profiles').update({ email: NEW_EMAIL }).eq('id', u.id);
if (pErr) { console.error(`❌ profile: ${pErr.message}`); process.exit(1); }

console.log(`\n✅ Email changed:\n   ${OLD_EMAIL}\n   →\n   ${NEW_EMAIL}\n`);
console.log(`📋 Login credentials (password unchanged):`);
console.log(`   Email: ${NEW_EMAIL}`);
