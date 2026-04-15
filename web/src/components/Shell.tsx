import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Shell() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'qc_admin';

  return (
    <div className="min-h-screen bg-surface">
      <header className="glass sticky top-0 z-20 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary-dim grid place-items-center text-white font-display font-bold">Q</div>
          <div>
            <div className="font-display font-bold text-base leading-tight">The Precision Ledger</div>
            <div className="text-[11px] text-on-surface-variant -mt-0.5">QC Inspection System</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={({ isActive }) => `chip ${isActive ? 'chip-active' : ''}`}>บันทึก QC</NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `chip ${isActive ? 'chip-active' : ''}`}>Admin</NavLink>
          )}
          <div className="mx-3 text-xs text-on-surface-variant">
            <div className="font-semibold text-on-surface">{profile?.full_name}</div>
            <div className="uppercase tracking-wide">{profile?.role}</div>
          </div>
          <button onClick={async () => { await signOut(); nav('/login'); }} className="btn-tertiary">ออก</button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 md:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
