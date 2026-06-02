import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn, profile } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (profile) nav('/'); }, [profile, nav]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const trimmed = email.trim();
      // Allow login with just employee ID — auto-append company domain
      const fullEmail = trimmed.includes('@') ? trimmed : `${trimmed}@cometsintertrade.com`;
      const { error } = await signIn(fullEmail, password);
      setBusy(false);
      if (error) setErr(error);
      else nav('/');
    } catch (ex: any) {
      setBusy(false);
      setErr(ex?.message || 'เกิดข้อผิดพลาด');
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-lg bg-gradient-to-br from-primary to-primary-dim grid place-items-center text-white font-display font-bold text-2xl shadow-ambient">Q</div>
          <h1 className="mt-4 font-display font-bold text-3xl tracking-tight">QC Inspection</h1>
          <p className="mt-1 text-sm text-on-surface-variant">ระบบสุ่มตรวจคุณภาพ / Quality Control Inspection System</p>
        </div>

        <form onSubmit={submit} className="card space-y-5">
          <div>
            <label className="field-label">User</label>
            <input type="text" required autoFocus className="field-input"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="รหัสพนักงาน" />
          </div>
          <div>
            <label className="field-label">รหัสผ่าน / Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required className="field-input pr-10"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-surface-low text-on-surface-variant hover:text-on-surface transition"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน / Hide password' : 'แสดงรหัสผ่าน / Show password'}
                title={showPassword ? 'ซ่อนรหัสผ่าน / Hide' : 'แสดงรหัสผ่าน / Show'}
                tabIndex={-1}>
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {err && <div className="rounded-md bg-error-container px-3 py-2 text-sm text-error">{err}</div>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ… / Signing in…' : 'เข้าสู่ระบบ / Sign In'}</button>
          <p className="text-xs text-center text-on-surface-variant">
            บัญชีผู้ใช้ถูกสร้างโดย Admin เท่านั้น / Account created by Admin only
          </p>
        </form>
      </div>
    </div>
  );
}
