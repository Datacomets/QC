import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

// Map old role names from user's SQL → our system roles
const roleMap = {
  'Admin System': 'admin',
  'Admin': 'qc_admin',
  'QC Staff': 'operator',
  'Viewer': 'viewer'
};

// Pad password if < 6 chars (Supabase Auth minimum)
function padPwd(p) {
  if (!p) return 'Comets00';
  if (p.length >= 6) return p;
  return p + '00'.slice(0, 6 - p.length) || (p + '000000').slice(0, 6);
}

const NEW_USERS = [
  { name: 'อิ๋ว',    email: 'aewrungrut@gmail.com',           password: '65kE2G', roleSrc: 'QC Staff'    },
  { name: 'Por',     email: 'saitan.kj27@gmail.com',          password: '2gtP20', roleSrc: 'QC Staff'    },
  { name: 'เบล',     email: 'qc02@cometsintertrade.com',      password: '03LOv6', roleSrc: 'Admin'       },
  { name: 'Admin',   email: 'sls03@cometsintertrade.com',     password: 'Admin',  roleSrc: 'Admin System'},
  { name: 'พี่พลอย', email: 'pcm04@cometsintertrade.com',     password: '1AkpC',  roleSrc: 'Viewer'      },
  { name: 'พี่เมย์', email: 'pcm02@cometsintertrade.com',     password: 'je8De',  roleSrc: 'Viewer'      },
  { name: 'พี่แป๊ะ', email: 'pcm38@cometsintertrade.com',     password: 'M6cc',   roleSrc: 'Viewer'      },
  { name: 'พี่กิ๊ฟ', email: 'pcm36@cometsintertrade.com',     password: 'G4va',   roleSrc: 'Viewer'      },
];

// 1) Delete all existing users
console.log('🗑️  Deleting existing users…');
const { data: existing } = await sb.auth.admin.listUsers();
for (const u of existing.users) {
  console.log(`   - ${u.email}`);
  await sb.auth.admin.deleteUser(u.id);
}

// 2) Create new users
console.log('\n➕ Creating new users…');
const finalPwds = [];
for (const u of NEW_USERS) {
  const password = padPwd(u.password);
  const role = roleMap[u.roleSrc] || u.roleSrc;
  finalPwds.push({ email: u.email, original: u.password, used: password, role });

  const { data, error } = await sb.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: u.name, role }
  });
  if (error) {
    console.error(`   ❌ ${u.email}: ${error.message}`);
    continue;
  }
  await sb.from('profiles').upsert({
    id: data.user.id, email: u.email, full_name: u.name, role
  });
  console.log(`   ✅ ${u.email} (${role}) → ${u.name}`);
}

// 3) Report final passwords
console.log('\n📋 Final credentials:');
console.log('Email                                        | Password    | Role');
console.log('---------------------------------------------|-------------|----------');
for (const p of finalPwds) {
  const note = p.original !== p.used ? ` (was: ${p.original})` : '';
  console.log(`${p.email.padEnd(45)}| ${p.used.padEnd(12)}| ${p.role}${note}`);
}
