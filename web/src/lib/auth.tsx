import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase, Profile } from './supabase';

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({} as AuthState);

async function loadProfileData(userId: string): Promise<Profile | null> {
  try {
    const result = await Promise.race([
      supabase.from('profiles').select('id,email,full_name,role').eq('id', userId).single().then(r => r),
      new Promise<null>(res => setTimeout(() => res(null), 8000))
    ]);
    if (!result || result.error) return null;
    return (result.data as Profile) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileRef = useRef<Profile | null>(null);
  const loadedUserId = useRef<string | null>(null);

  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; setLoading(false); } };
    const timer = setTimeout(finish, 6000);

    // Initial session
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const userId = data.session.user.id;
        const p = await loadProfileData(userId);
        if (p) { setProfile(p); loadedUserId.current = userId; }
      }
      finish();
    }).catch(() => finish());

    // Subscribe to auth changes.
    // Critical: only clear profile on explicit SIGNED_OUT or actual null session.
    // TOKEN_REFRESHED / USER_UPDATED should NOT reload/clear profile.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setProfile(null);
        loadedUserId.current = null;
        finish();
        return;
      }
      const userId = session.user.id;
      // Already have profile for this user → keep it, don't refetch
      if (loadedUserId.current === userId && profileRef.current) {
        finish();
        return;
      }
      const p = await loadProfileData(userId);
      if (p) { setProfile(p); loadedUserId.current = userId; }
      // If load failed but we have an old profile, keep it (do nothing)
      finish();
    });

    return () => { clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  const signIn: AuthState['signIn'] = async (email, password) => {
    try {
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Login timeout — กรุณาลองใหม่')), 10000))
      ]);
      const { data, error } = result;
      if (error) return { error: error.message };
      if (data.user) {
        const p = await loadProfileData(data.user.id);
        if (p) { setProfile(p); loadedUserId.current = data.user.id; }
      }
      return {};
    } catch (ex: any) {
      return { error: ex?.message || 'การเชื่อมต่อล้มเหลว กรุณาลองใหม่' };
    }
  };

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch {}
    setProfile(null);
    loadedUserId.current = null;
  };

  return <Ctx.Provider value={{ profile, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
