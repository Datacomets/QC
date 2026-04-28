import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS (Vercel same-origin, but be safe)
  res.setHeader('Content-Type', 'application/json');

  if (!SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server not configured (missing SUPABASE_SECRET_KEY)' });
  }

  // ---- 1) Verify caller is authenticated and is an admin ----
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid session' });

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admin only' });

  // ---- 2) Service-role client for admin operations ----
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
  });

  try {
    if (req.method === 'GET') {
      const { data: { users } } = await admin.auth.admin.listUsers();
      const { data: profiles } = await admin.from('profiles').select('*');
      const merged = users.map(u => {
        const p = profiles?.find(p => p.id === u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: p?.full_name || null,
          role: p?.role || 'operator',
          email_confirmed: !!u.email_confirmed_at,
          last_sign_in_at: u.last_sign_in_at
        };
      });
      return res.status(200).json({ users: merged });
    }

    if (req.method === 'POST') {
      const { email, password, full_name, role } = req.body as {
        email: string; password: string; full_name: string; role: string;
      };
      if (!email || !password || !role) return res.status(400).json({ error: 'Missing fields' });

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name, role }
      });
      if (error) return res.status(400).json({ error: error.message });
      await admin.from('profiles').upsert({
        id: data.user.id, email, full_name: full_name || null, role
      });
      return res.status(200).json({ ok: true, id: data.user.id });
    }

    if (req.method === 'PATCH') {
      const { id, password, full_name, role } = req.body as {
        id: string; password?: string; full_name?: string; role?: string;
      };
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const patch: any = {};
      if (password) patch.password = password;
      if (full_name !== undefined || role !== undefined) {
        patch.user_metadata = { full_name, role };
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.auth.admin.updateUserById(id, patch);
        if (error) return res.status(400).json({ error: error.message });
      }
      const profilePatch: any = {};
      if (full_name !== undefined) profilePatch.full_name = full_name;
      if (role !== undefined) profilePatch.role = role;
      if (Object.keys(profilePatch).length) {
        await admin.from('profiles').update(profilePatch).eq('id', id);
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id as string) || (req.body as any)?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (id === userData.user.id) return res.status(400).json({ error: 'ลบตัวเองไม่ได้' });
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (ex: any) {
    return res.status(500).json({ error: ex?.message || 'Internal error' });
  }
}
