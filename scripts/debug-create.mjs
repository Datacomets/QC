import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const { data, error } = await sb.auth.admin.createUser({
  email: 'test-debug@example.com', password: 'TestPass123!', email_confirm: true
});
console.log('data:', JSON.stringify(data), '\nerror:', error);
if (data?.user) await sb.auth.admin.deleteUser(data.user.id);
