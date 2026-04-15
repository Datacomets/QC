import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Tab = 'suppliers' | 'defects' | 'users';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('suppliers');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-on-surface-variant mt-1">จัดการ Master Data และผู้ใช้</p>
      </div>
      <div className="flex gap-2">
        <TabBtn id="suppliers" tab={tab} setTab={setTab}>Suppliers</TabBtn>
        <TabBtn id="defects" tab={tab} setTab={setTab}>รหัสของเสีย</TabBtn>
        <TabBtn id="users" tab={tab} setTab={setTab}>Users</TabBtn>
      </div>
      {tab === 'suppliers' && <SuppliersPane />}
      {tab === 'defects' && <DefectsPane />}
      {tab === 'users' && <UsersPane />}
    </div>
  );
}

function TabBtn({ id, tab, setTab, children }: any) {
  return (
    <button onClick={() => setTab(id)} className={`chip ${tab === id ? 'chip-active' : ''}`}>{children}</button>
  );
}

function SuppliersPane() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const load = async () => {
    const { data } = await supabase.from('suppliers').select('*').order('sup_code').limit(500);
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);
  const filtered = rows.filter(r =>
    !q || r.sup_code?.toLowerCase().includes(q.toLowerCase()) ||
    r.supplier_name?.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="font-display font-bold text-lg">Suppliers ({rows.length})</h2>
        <input className="field-input max-w-sm" placeholder="ค้นหา…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-lowest">
            <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <th className="py-2">Sup Code</th><th>SAP</th><th>Supplier</th><th>Category</th><th>Purchase</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-outline-variant/15">
                <td className="py-2 font-mono">{r.sup_code}</td>
                <td className="font-mono text-xs">{r.sup_sap_code || '—'}</td>
                <td>{r.supplier_name}</td>
                <td className="text-xs">{r.category || '—'}</td>
                <td><span className="chip">{r.purchase}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DefectsPane() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('defects').select('*').order('defect_code').limit(1000)
      .then(({ data }) => setRows(data || []));
  }, []);
  const filtered = rows.filter(r =>
    !q || r.defect_code?.includes(q) || (r.symptom || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="font-display font-bold text-lg">รหัสของเสีย ({rows.length})</h2>
        <input className="field-input max-w-sm" placeholder="ค้นหา…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-lowest">
            <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <th className="py-2">Code</th><th>อาการ</th><th>Reason</th><th>Type</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map(r => (
              <tr key={r.defect_code} className="border-t border-outline-variant/15">
                <td className="py-2 font-mono text-xs">{r.defect_code}</td>
                <td>{r.symptom}</td>
                <td className="text-xs text-on-surface-variant">{r.reason || '—'}</td>
                <td className="text-xs text-on-surface-variant">{r.type || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsersPane() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('profiles').select('*').order('role')
      .then(({ data }) => setRows(data || []));
  }, []);
  return (
    <section className="card">
      <h2 className="font-display font-bold text-lg mb-1">Users</h2>
      <p className="text-xs text-on-surface-variant mb-4">
        การสร้าง user ใหม่ต้องทำผ่าน script <code className="font-mono">npm run seed:users</code> (ต้องใช้ Service Key)
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
            <th className="py-2">Name</th><th>Email</th><th>Role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-outline-variant/15">
              <td className="py-2">{r.full_name}</td>
              <td className="font-mono text-xs">{r.email}</td>
              <td><span className="chip chip-active">{r.role}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
