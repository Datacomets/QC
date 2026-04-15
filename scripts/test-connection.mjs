import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  process.exit(1);
}

const sb = createClient(url, secret, { auth: { persistSession: false } });

console.log('Testing connection to', url);

// Check if schema has been applied
const { data, error } = await sb.from('profiles').select('*').limit(1);
if (error) {
  if (error.message.includes('does not exist') || error.code === '42P01') {
    console.error('❌ Schema not applied yet. Please run supabase/schema.sql in the SQL editor first.');
  } else {
    console.error('❌ Error:', error);
  }
  process.exit(1);
}
console.log('✅ Connection OK. profiles table exists.');

// List auth users
const { data: users, error: e2 } = await sb.auth.admin.listUsers();
if (e2) {
  console.error('❌ Auth admin error:', e2);
  process.exit(1);
}
console.log(`✅ Auth OK. Existing users: ${users.users.length}`);
for (const u of users.users) console.log('  -', u.email);
