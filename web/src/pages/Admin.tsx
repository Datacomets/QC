import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Tab = 'suppliers' | 'defects' | 'users';

// Official standard list from SD-QC-1909-004-00 Rev02 (18-4-25)
const OFFICIAL_TYPES = [
  '1 Defect/ข้อเสียหาย(ซ่อมไม่ได้)',
  '2 Repair/ซ่อม',
  '3 Short Shipment/ส่งของขาด',
  '4 Scrap/ใช้ไม่ได้ (ทิ้ง)',
  '5 Supplier/ผู้ผลิต',
  '6 Customer/ลูกค้า'
];
const OFFICIAL_REASONS = [
  '1 Logo/สิ่งพิมพ์',
  '2 Appearance/ลักษณะที่ปรากฎ',
  '3 Function/การใช้งาน',
  '4 Component/ส่วนประกอบ',
  '5 Bulk/ตัวยา',
  '6 Machine/เครื่องจักร'
];

export default function Admin() {
  const [tab, setTab] = useState<Tab>('suppliers');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">จัดการระบบ / Admin</h1>
        <p className="text-sm text-on-surface-variant mt-1">จัดการ Master Data และผู้ใช้ / Manage Master Data & Users</p>
      </div>
      <div className="flex gap-2">
        <TabBtn id="suppliers" tab={tab} setTab={setTab}>ผู้จัดจำหน่าย / Suppliers</TabBtn>
        <TabBtn id="defects" tab={tab} setTab={setTab}>รหัสของเสีย / Defect Codes</TabBtn>
        <TabBtn id="users" tab={tab} setTab={setTab}>ผู้ใช้ / Users</TabBtn>
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

/* =========================================================================
 * SUPPLIERS
 * ======================================================================= */
interface SupplierRow {
  id: number;
  sup_code: string;
  sup_sap_code: string | null;
  supplier_name: string;
  category: string | null;
  status: string;
  purchase: string | null;
}

function SuppliersPane() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<SupplierRow> | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('sup_code').limit(2000);
    setRows((data as SupplierRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r =>
    !q || r.sup_code?.toLowerCase().includes(q.toLowerCase()) ||
    (r.sup_sap_code || '').toLowerCase().includes(q.toLowerCase()) ||
    r.supplier_name?.toLowerCase().includes(q.toLowerCase()));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    const payload = {
      sup_code: (editing.sup_code || '').trim(),
      sup_sap_code: (editing.sup_sap_code || '')?.toString().trim() || null,
      supplier_name: (editing.supplier_name || '').trim(),
      category: editing.category || null,
      status: editing.status || 'ACTIVE',
      purchase: editing.purchase || null
    };
    if (!payload.sup_code || !payload.supplier_name) { setMsg('กรุณากรอก Sup Code และชื่อ Supplier'); return; }

    const { error } = editing.id
      ? await supabase.from('suppliers').update(payload).eq('id', editing.id)
      : await supabase.from('suppliers').insert(payload);

    if (error) { setMsg('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setEditing(null);
    await load();
  };

  const remove = async (r: SupplierRow) => {
    if (!confirm(`ลบ ${r.sup_code} - ${r.supplier_name}?`)) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', r.id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await load();
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display font-bold text-lg">Suppliers ({rows.length})</h2>
        <div className="flex gap-2 items-center">
          <input className="field-input max-w-sm" placeholder="ค้นหา Sup Code, SAP, ชื่อ…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-primary text-sm" onClick={() => setEditing({ status: 'ACTIVE', purchase: 'Import' })}>+ เพิ่ม / Add Supplier</button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">กำลังโหลด…</p> : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-lowest">
              <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="py-2">Sup Code</th><th>SAP</th><th>Supplier</th><th>Category</th><th>Purchase</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(r => (
                <tr key={r.id} className="border-t border-outline-variant/15 hover:bg-surface-low/30">
                  <td className="py-2 font-mono">{r.sup_code}</td>
                  <td className="font-mono text-xs">{r.sup_sap_code || '—'}</td>
                  <td>{r.supplier_name}</td>
                  <td className="text-xs">{r.category || '—'}</td>
                  <td><span className="chip">{r.purchase}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-tertiary text-xs py-1 px-2" onClick={() => setEditing(r)}>แก้ไข</button>
                    <button className="text-xs text-error hover:underline ml-2" onClick={() => remove(r)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditModal title={editing.id ? 'แก้ไข Supplier' : 'เพิ่ม Supplier'} onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sup Code *" value={editing.sup_code} onChange={v => setEditing({ ...editing, sup_code: v })} />
              <Field label="SAP Code" value={editing.sup_sap_code} onChange={v => setEditing({ ...editing, sup_sap_code: v })} />
            </div>
            <Field label="Supplier Name *" value={editing.supplier_name} onChange={v => setEditing({ ...editing, supplier_name: v })} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Category" value={editing.category} onChange={v => setEditing({ ...editing, category: v })} />
              <SelectField label="Status" value={editing.status || 'ACTIVE'} options={['ACTIVE', 'INACTIVE']}
                onChange={v => setEditing({ ...editing, status: v })} />
              <SelectField label="Purchase" value={editing.purchase || 'Import'} options={['Import', 'Local']}
                onChange={v => setEditing({ ...editing, purchase: v })} />
            </div>
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}
    </section>
  );
}

/* =========================================================================
 * DEFECTS
 * ======================================================================= */
interface DefectRow {
  defect_code: string;
  symptom: string;
  reason: string | null;
  type: string | null;
}

function DefectsPane() {
  const [rows, setRows] = useState<DefectRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<DefectRow> & { _originalCode?: string }) | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('defects').select('*').order('defect_code').limit(10000);
    setRows((data as DefectRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Merge official standard + any distinct values from DB (in case DB has legacy values)
  const typeOptions = Array.from(new Set([
    ...OFFICIAL_TYPES,
    ...(rows.map(r => r.type).filter(Boolean) as string[])
  ]));
  const reasonOptions = Array.from(new Set([
    ...OFFICIAL_REASONS,
    ...(rows.map(r => r.reason).filter(Boolean) as string[])
  ]));

  const filtered = rows.filter(r =>
    !q || r.defect_code?.includes(q) ||
    (r.symptom || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.reason || '').toLowerCase().includes(q.toLowerCase()));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    const payload = {
      defect_code: (editing.defect_code || '').trim(),
      symptom: (editing.symptom || '').trim(),
      reason: editing.reason || null,
      type: editing.type || null
    };
    if (!payload.defect_code || !payload.symptom) { setMsg('กรุณากรอกรหัสและอาการ'); return; }

    if (editing._originalCode && editing._originalCode !== payload.defect_code) {
      // Changed PK: delete old, insert new
      await supabase.from('defects').delete().eq('defect_code', editing._originalCode);
    }
    const { error } = await supabase.from('defects').upsert(payload, { onConflict: 'defect_code' });
    if (error) { setMsg('บันทึกไม่สำเร็จ: ' + error.message); return; }
    setEditing(null);
    await load();
  };

  const remove = async (r: DefectRow) => {
    if (!confirm(`ลบ ${r.defect_code} - ${r.symptom}?`)) return;
    const { error } = await supabase.from('defects').delete().eq('defect_code', r.defect_code);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    await load();
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display font-bold text-lg">รหัสของเสีย ({rows.length})</h2>
        <div className="flex gap-2 items-center">
          <input className="field-input max-w-sm" placeholder="ค้นหา…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-primary text-sm" onClick={() => setEditing({})}>+ เพิ่ม / Add Defect Code</button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">กำลังโหลด…</p> : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-lowest">
              <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="py-2">Code</th><th>อาการ</th><th>Reason</th><th>Type</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(r => (
                <tr key={r.defect_code} className="border-t border-outline-variant/15 hover:bg-surface-low/30">
                  <td className="py-2 font-mono text-xs">{r.defect_code}</td>
                  <td>{r.symptom}</td>
                  <td className="text-xs text-on-surface-variant">{r.reason || '—'}</td>
                  <td className="text-xs text-on-surface-variant">{r.type || '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-tertiary text-xs py-1 px-2" onClick={() => setEditing({ ...r, _originalCode: r.defect_code })}>แก้ไข</button>
                    <button className="text-xs text-error hover:underline ml-2" onClick={() => remove(r)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <p className="text-xs text-on-surface-variant mt-2">แสดง 500 รายการแรก ใช้ค้นหาเพื่อกรอง</p>}
        </div>
      )}

      {editing && (
        <EditModal title={editing._originalCode ? 'แก้ไขรหัสของเสีย' : 'เพิ่มรหัสของเสีย'} onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            <ComboField label="Type (แหล่งที่มา)" value={editing.type} options={typeOptions}
              onChange={v => setEditing({ ...editing, type: v })} placeholder="เลือกหรือพิมพ์" />
            <ComboField label="Reason (จุดที่พบ)" value={editing.reason} options={reasonOptions}
              onChange={v => setEditing({ ...editing, reason: v })} placeholder="เลือกหรือพิมพ์" />
            <Field label="Running No. *" value={editing.defect_code} onChange={v => setEditing({ ...editing, defect_code: v })} placeholder="เช่น 11001" />
            <Field label="อาการ (Symptom) *" value={editing.symptom} onChange={v => setEditing({ ...editing, symptom: v })} placeholder="เช่น ไม่พิมพ์/Printing missing" />
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}
    </section>
  );
}

/* =========================================================================
 * USERS
 * ======================================================================= */
interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

const DEFAULT_ROLES = ['admin', 'qc_admin', 'operator', 'viewer'];

const ROLE_LABELS: Record<string, string> = {
  admin:    'admin (Admin System) — ทุกสิทธิ์',
  qc_admin: 'qc_admin (QC Admin) — จัดการ + อนุมัติ',
  operator: 'operator (QC Staff) — บันทึก QC',
  viewer:   'viewer — ดูอย่างเดียว'
};

function UsersPane() {
  const { profile: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<UserRow> & { password?: string; _isNew?: boolean }) | null>(null);
  const [msg, setMsg] = useState('');

  const apiCall = async (method: string, body?: any, query?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin-users${query || ''}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const load = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const { users } = await apiCall('GET');
        setRows(users || []);
      } else {
        const { data } = await supabase.from('profiles').select('*').order('role');
        setRows(data || []);
      }
    } catch (ex: any) {
      setMsg(ex.message);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [isAdmin]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg('');
    try {
      if (editing._isNew) {
        if (!editing.email || !editing.password || !editing.role) {
          setMsg('กรอก Email, Password, Role'); return;
        }
        await apiCall('POST', {
          email: editing.email, password: editing.password,
          full_name: editing.full_name, role: editing.role
        });
      } else {
        const patch: any = { id: editing.id };
        if (editing.password) patch.password = editing.password;
        if (editing.full_name !== undefined) patch.full_name = editing.full_name;
        if (editing.role) patch.role = editing.role;
        await apiCall('PATCH', patch);
      }
      setEditing(null);
      await load();
    } catch (ex: any) { setMsg(ex.message); }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`ลบ ${u.email}?`)) return;
    try {
      await apiCall('DELETE', null, `?id=${encodeURIComponent(u.id)}`);
      await load();
    } catch (ex: any) { alert(ex.message); }
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-display font-bold text-lg">Users ({rows.length})</h2>
        {isAdmin && (
          <button className="btn-primary text-sm" onClick={() => setEditing({ _isNew: true, role: 'operator' })}>+ เพิ่มผู้ใช้ / Add User</button>
        )}
      </div>

      {!isAdmin && (
        <p className="text-xs text-on-surface-variant mb-3">
          เฉพาะ role <b>admin</b> เท่านั้นที่จัดการ user ได้
        </p>
      )}
      {msg && <p className="text-sm text-error mb-3">{msg}</p>}

      {loading ? <p className="text-sm text-on-surface-variant">กำลังโหลด…</p> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <th className="py-2">Name</th><th>Email</th><th>Role</th>{isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-outline-variant/15 hover:bg-surface-low/30">
                <td className="py-2">{r.full_name || '—'}</td>
                <td className="font-mono text-xs">{r.email}</td>
                <td><span className="chip chip-active">{r.role}</span></td>
                {isAdmin && (
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-tertiary text-xs py-1 px-2" onClick={() => setEditing({ ...r })}>แก้ไข</button>
                    {r.id !== me?.id && (
                      <button className="text-xs text-error hover:underline ml-2" onClick={() => remove(r)}>ลบ</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EditModal title={editing._isNew ? 'เพิ่ม User' : `แก้ไข User: ${editing.email}`} onClose={() => { setEditing(null); setMsg(''); }}>
          <form onSubmit={save} className="space-y-4">
            {editing._isNew && (
              <Field label="Email *" value={editing.email} onChange={v => setEditing({ ...editing, email: v })} placeholder="user@cometsintertrade.com" />
            )}
            <Field label="Full Name" value={editing.full_name} onChange={v => setEditing({ ...editing, full_name: v })} />
            <RoleSelect
              value={editing.role || 'operator'}
              extraOptions={rows.map(r => r.role).filter(Boolean)}
              onChange={v => setEditing({ ...editing, role: v })}
            />
            {editing._isNew && (
              <Field label="Password *"
                value={editing.password} onChange={v => setEditing({ ...editing, password: v })}
                placeholder="อย่างน้อย 6 ตัวอักษร / Min 6 chars" />
            )}
            {msg && <p className="text-sm text-error">{msg}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => { setEditing(null); setMsg(''); }} className="btn-secondary">ยกเลิก</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </EditModal>
      )}
    </section>
  );
}

/* =========================================================================
 * Shared helpers
 * ======================================================================= */
function EditModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-inverse/40 backdrop-blur-sm" />
      <div className="relative bg-surface-lowest rounded-lg shadow-ambient max-w-lg w-full max-h-[85vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface-lowest border-b border-outline-variant/15 px-5 py-3 flex items-center justify-between">
          <h3 className="font-display font-bold">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value?: string | null; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input className="field-input" value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <select className="field-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function RoleSelect({ value, extraOptions, onChange }: { value: string; extraOptions: string[]; onChange: (v: string) => void }) {
  const allRoles = Array.from(new Set([...DEFAULT_ROLES, ...extraOptions]));
  const isCustom = !allRoles.includes(value);
  const [showCustom, setShowCustom] = useState<boolean>(isCustom);

  return (
    <div>
      <label className="field-label">Role *</label>
      <select
        className="field-select"
        value={showCustom ? '__custom__' : value}
        onChange={e => {
          if (e.target.value === '__custom__') {
            setShowCustom(true);
            onChange('');
          } else {
            setShowCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        {allRoles.map(r => (
          <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
        ))}
        <option value="__custom__">+ Role อื่น (กรอกเอง) / Custom role…</option>
      </select>
      {showCustom && (
        <input
          className="field-input mt-2"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="พิมพ์ชื่อ role ใหม่ / Type new role name"
          autoFocus
        />
      )}
    </div>
  );
}

function ComboField({ label, value, options, onChange, placeholder }: { label: string; value?: string | null; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const listId = `combo-${label.replace(/\s+/g, '-')}`;
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        list={listId}
        value={value || ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}
