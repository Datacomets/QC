import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn, profile } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (profile) nav('/'); }, [profile, nav]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { error } = await signIn(email.trim(), password);
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
            <label className="field-label">อีเมล / Email</label>
            <input type="email" required autoFocus className="field-input"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@cometsintertrade.com" />
          </div>
          <div>
            <label className="field-label">รหัสผ่าน / Password</label>
            <input type="password" required className="field-input"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" />
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
