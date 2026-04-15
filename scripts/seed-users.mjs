import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

const USERS = [
  { email: 'sls01@cometsintertrade.com', password: 'Comets@2026', role: 'admin',     full_name: 'Admin System' },
  { email: 'sls02@cometsintertrade.com', password: 'Comets@2026', role: 'operator',  full_name: 'พนักงานหน้างาน' },
  { email: 'sls03@cometsintertrade.com', password: 'Comets@2026', role: 'qc_admin',  full_name: 'Admin ตรวจงาน' },
];

const { data: existing } = await sb.auth.admin.listUsers();
const existingByEmail = new Map(existing.users.map(u => [u.email, u]));

for (const u of USERS) {
  const found = existingByEmail.get(u.email);
  if (found) {
    console.log(`↻ Updating ${u.email}`);
    await sb.auth.admin.updateUserById(found.id, {
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role }
    });
    await sb.from('profiles').upsert({
      id: found.id, email: u.email, full_name: u.full_name, role: u.role
    });
  } else {
    console.log(`+ Creating ${u.email}`);
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role }
    });
    if (error) { console.error('  ERROR:', error.message); continue; }
    await sb.from('profiles').upsert({
      id: data.user.id, email: u.email, full_name: u.full_name, role: u.role
    });
  }
}
console.log('✅ Users seeded');
