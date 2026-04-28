import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import QCEntry from './pages/QCEntry';
import History from './pages/History';
import Admin from './pages/Admin';
import Guide from './pages/Guide';
import QCEdit from './pages/QCEdit';
import Dashboard from './pages/Dashboard';
import Materials from './pages/Materials';
import Shell from './components/Shell';

function Protected({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="p-8 text-on-surface-variant">กำลังโหลด…</div>;
  if (!profile) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected><Shell /></Protected>}>
          <Route path="/" element={<History />} />
          <Route path="/entry" element={<QCEntry />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/edit/:orderId" element={<QCEdit />} />
          <Route path="/dashboard" element={<Protected roles={['admin', 'qc_admin', 'viewer']}><Dashboard /></Protected>} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/admin" element={<Protected roles={['admin', 'qc_admin']}><Admin /></Protected>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
