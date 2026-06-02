import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate, getProductType } from '../lib/utils';
import * as XLSX from 'xlsx';

interface Material {
  sap_code: string;
  description: string | null;
  product_category: string | null;
  base_uom: string | null;
  product_category_id: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

interface UploadLog {
  id: number;
  file_name: string;
  uploaded_by: string;
  uploaded_at: string;
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  error_count: number;
}

type RowStatus = 'new' | 'update' | 'error';

interface PreviewRow {
  excelRow: number;
  status: RowStatus;
  errorMsg?: string;
  data: {
    sap_code: string;
    description: string;
    product_category: string;
    base_uom: string;
    product_category_id: string;
  };
}

type SortField = 'sap_code' | 'description' | 'product_category' | 'base_uom' | 'product_category_id';

export default function Materials() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'qc_admin';

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLog, setLastLog] = useState<UploadLog | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('sap_code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    // Supabase / PostgREST has a default max-rows of 1000 per request — page through to fetch all
    const all: Material[] = [];
    const CHUNK = 1000;
    for (let from = 0; ; from += CHUNK) {
      const { data, error } = await supabase.from('materials')
        .select('*').order('sap_code').range(from, from + CHUNK - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as Material[]));
      if (data.length < CHUNK) break;
    }
    const logRes = await supabase.from('material_upload_log').select('*').order('uploaded_at', { ascending: false }).limit(1);
    setMaterials(all);
    setLastLog((logRes.data as UploadLog[])?.[0] || null);
    setLoading(false);
  };

  // 7-day stale check (admin only)
  const isStale = useMemo(() => {
    if (!isAdmin) return false;
    if (materials.length === 0) return false;
    const latest = materials.reduce((max, m) => {
      const t = m.updated_at ? new Date(m.updated_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    if (!latest) return true;
    const days = (Date.now() - latest) / (1000 * 60 * 60 * 24);
    return days > 7;
  }, [materials, isAdmin]);

  // Distinct categories for filter
  const categoryOptions = useMemo(() =>
    Array.from(new Set(materials.map(m => m.product_category).filter(Boolean) as string[])).sort()
  , [materials]);

  const filtered = useMemo(() => {
    let list = materials;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(m =>
        m.sap_code.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }
    if (categoryFilter) {
      list = list.filter(m => m.product_category === categoryFilter);
    }
    if (typeFilter) {
      list = list.filter(m => getProductType(m.sap_code) === typeFilter);
    }
    list = [...list].sort((a, b) => {
      const av = String(a[sortField] ?? '').toLowerCase();
      const bv = String(b[sortField] ?? '').toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [materials, search, categoryFilter, typeFilter, sortField, sortDir]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  // Find header row in Excel by detecting the row containing "Material ID"
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportMsg(null);
    setParsing(true);
    setPreviewRows([]);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: '' }) as any[][];

      let headerIdx = -1;
      const matIdAliases = ['material id', 'material', 'material no', 'material no.', 'sap code'];
      for (let i = 0; i < Math.min(rows.length, 100); i++) {
        const row = (rows[i] || []).map(c => String(c).trim().toLowerCase());
        if (row.some(c => matIdAliases.includes(c))) { headerIdx = i; break; }
      }
      if (headerIdx === -1) {
        setImportMsg({ kind: 'err', text: 'ไม่พบหัวคอลัมน์ "Material ID" ในไฟล์ / Cannot find "Material ID" header row' });
        return;
      }

      const headers = (rows[headerIdx] || []).map(c => String(c).trim().toLowerCase());
      const findCol = (...aliases: string[]) => {
        for (const a of aliases) {
          const i = headers.indexOf(a.toLowerCase());
          if (i !== -1) return i;
        }
        return -1;
      };

      const colMatId = findCol(...matIdAliases);
      const colDesc  = findCol('material description', 'description');
      const colCat   = findCol('product category', 'category');
      const colUom   = findCol('base uom', 'uom', 'base unit');
      const colCatId = findCol('product category id', 'category id');

      const existing = new Set(materials.map(m => m.sap_code));
      const seenInFile = new Set<string>();
      const preview: PreviewRow[] = [];

      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((c: any) => c === '' || c == null)) continue;

        const matId = String(row[colMatId] ?? '').trim();
        const desc  = colDesc  >= 0 ? String(row[colDesc]  ?? '').trim() : '';
        const cat   = colCat   >= 0 ? String(row[colCat]   ?? '').trim() : '';
        const uom   = colUom   >= 0 ? String(row[colUom]   ?? '').trim() : '';
        const catId = colCatId >= 0 ? String(row[colCatId] ?? '').trim() : '';

        let status: RowStatus;
        let errorMsg: string | undefined;
        if (!matId) {
          status = 'error';
          errorMsg = 'Missing Material ID';
        } else if (seenInFile.has(matId)) {
          status = 'error';
          errorMsg = 'Duplicate in file';
        } else if (existing.has(matId)) {
          status = 'update';
          seenInFile.add(matId);
        } else {
          status = 'new';
          seenInFile.add(matId);
        }

        preview.push({
          excelRow: i + 1,
          status,
          errorMsg,
          data: { sap_code: matId, description: desc, product_category: cat, base_uom: uom, product_category_id: catId }
        });
      }

      setPreviewRows(preview);
    } catch (err: any) {
      setImportMsg({ kind: 'err', text: 'อ่านไฟล์ไม่สำเร็จ / Failed to read file: ' + (err?.message || err) });
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const cancelImport = () => {
    setPreviewRows([]);
    setFileName('');
    setImportMsg(null);
  };

  const summary = useMemo(() => ({
    total: previewRows.length,
    newCount: previewRows.filter(r => r.status === 'new').length,
    updateCount: previewRows.filter(r => r.status === 'update').length,
    errorCount: previewRows.filter(r => r.status === 'error').length
  }), [previewRows]);

  const confirmImport = async () => {
    if (!previewRows.length) return;
    if (!isAdmin) return;
    setImporting(true);
    setImportMsg(null);

    const userName = profile?.full_name || profile?.email || 'unknown';
    const validRows = previewRows.filter(r => r.status !== 'error');

    // Upsert in chunks of 500
    const CHUNK = 500;
    for (let i = 0; i < validRows.length; i += CHUNK) {
      const chunk = validRows.slice(i, i + CHUNK).map(r => ({
        sap_code: r.data.sap_code,
        description: r.data.description || null,
        product_category: r.data.product_category || null,
        base_uom: r.data.base_uom || null,
        product_category_id: r.data.product_category_id || null,
        updated_by: userName
      }));
      const { error } = await supabase.from('materials').upsert(chunk, { onConflict: 'sap_code' });
      if (error) {
        setImportMsg({ kind: 'err', text: 'Import failed: ' + error.message });
        setImporting(false);
        return;
      }
    }

    // Insert log row
    await supabase.from('material_upload_log').insert({
      file_name: fileName,
      uploaded_by: userName,
      total_rows: summary.total,
      inserted_count: summary.newCount,
      updated_count: summary.updateCount,
      error_count: summary.errorCount
    });

    setImportMsg({
      kind: 'ok',
      text: `✓ นำเข้าสำเร็จ / Imported — New: ${summary.newCount}, Updated: ${summary.updateCount}, Errors: ${summary.errorCount}`
    });
    setPreviewRows([]);
    setFileName('');
    setImporting(false);
    await loadAll();
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button type="button" onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary text-left w-full">
      <span>{label}</span>
      {sortField === field && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Material Management</h1>
          <p className="text-sm text-on-surface-variant mt-1">จัดการข้อมูล Master Material — {materials.length.toLocaleString()} รายการ / records</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing || importing}
                className="btn-primary text-sm"
              >
                {parsing ? 'กำลังอ่านไฟล์… / Parsing…' : '📤 Upload Material File'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Last upload + warning */}
      <div className="rounded-lg bg-surface-low p-3 flex items-center gap-3 flex-wrap text-sm">
        {lastLog ? (
          <span className="text-on-surface-variant">
            <span className="text-[11px] uppercase tracking-wide text-on-surface-variant mr-1">Last Upload:</span>
            <b className="text-on-surface">{fmtDate(lastLog.uploaded_at)}</b>
            <span className="text-on-surface-variant"> {new Date(lastLog.uploaded_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="mx-1">·</span>
            <span>by <b className="text-on-surface">{lastLog.uploaded_by}</b></span>
            <span className="mx-1">·</span>
            <span>{lastLog.file_name}</span>
            <span className="mx-1">·</span>
            <span className="chip text-[10px] bg-primary-container text-on-primary-container">+{lastLog.inserted_count} new</span>
            <span className="chip text-[10px] bg-amber-100 text-amber-800 ml-1">~{lastLog.updated_count} updated</span>
            {lastLog.error_count > 0 && <span className="chip text-[10px] bg-error-container text-error ml-1">{lastLog.error_count} errors</span>}
          </span>
        ) : (
          <span className="text-on-surface-variant">ยังไม่มีประวัติการอัปโหลด / No upload history yet</span>
        )}
        {isStale && (
          <span className="ml-auto chip text-xs bg-amber-100 text-amber-800">
            ⚠️ Material data has not been updated for more than 7 days. Please upload the latest file.
          </span>
        )}
      </div>

      {/* Import message */}
      {importMsg && (
        <div className={`rounded-md px-4 py-3 text-sm ${importMsg.kind === 'ok' ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-error'}`}>
          {importMsg.text}
        </div>
      )}

      {/* Preview Section */}
      {previewRows.length > 0 && (
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display font-bold text-lg">ตรวจสอบก่อนนำเข้า / Preview Before Import</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">ไฟล์ / File: <b className="text-on-surface">{fileName}</b></p>
            </div>
            <div className="flex gap-2">
              <button onClick={cancelImport} disabled={importing} className="btn-secondary text-sm">ยกเลิก / Cancel</button>
              <button onClick={confirmImport} disabled={importing || summary.newCount + summary.updateCount === 0} className="btn-primary text-sm">
                {importing ? 'กำลังนำเข้า… / Importing…' : `✓ ยืนยันนำเข้า / Confirm Import (${summary.newCount + summary.updateCount})`}
              </button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex gap-2 flex-wrap text-xs">
            <span className="chip">Total: <b className="ml-1">{summary.total}</b></span>
            <span className="chip bg-primary-container text-on-primary-container">🟢 New: <b className="ml-1">{summary.newCount}</b></span>
            <span className="chip bg-amber-100 text-amber-800">🟡 Update: <b className="ml-1">{summary.updateCount}</b></span>
            {summary.errorCount > 0 && <span className="chip bg-error-container text-error">🔴 Error: <b className="ml-1">{summary.errorCount}</b></span>}
          </div>

          {/* Preview table (first 50 rows) */}
          <div className="overflow-x-auto rounded-md border border-outline-variant/30 max-h-[400px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-mid sticky top-0 z-10">
                <tr className="text-left text-[11px] uppercase tracking-wide text-on-surface-variant">
                  <th className="px-3 py-2 w-14">Row</th>
                  <th className="px-3 py-2 w-24">Status</th>
                  <th className="px-3 py-2">Material ID</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">UoM</th>
                  <th className="px-3 py-2">Cat. ID</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 50).map((r, i) => (
                  <tr key={i} className={`border-t border-outline-variant/15 ${
                    r.status === 'new' ? 'bg-primary-container/30' :
                    r.status === 'update' ? 'bg-amber-50' :
                    'bg-error-container/40'
                  }`}>
                    <td className="px-3 py-1.5 text-on-surface-variant text-xs">{r.excelRow}</td>
                    <td className="px-3 py-1.5">
                      {r.status === 'new' && <span className="chip text-[10px] bg-primary-container text-on-primary-container">🟢 New</span>}
                      {r.status === 'update' && <span className="chip text-[10px] bg-amber-100 text-amber-800">🟡 Update</span>}
                      {r.status === 'error' && <span className="chip text-[10px] bg-error-container text-error" title={r.errorMsg}>🔴 Error</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{r.data.sap_code || <span className="text-error italic">— missing —</span>}</td>
                    <td className="px-3 py-1.5">{r.data.description}</td>
                    <td className="px-3 py-1.5">{r.data.product_category}</td>
                    <td className="px-3 py-1.5">{r.data.base_uom}</td>
                    <td className="px-3 py-1.5">{r.data.product_category_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length > 50 && (
              <div className="px-3 py-2 text-xs text-on-surface-variant border-t border-outline-variant/15 bg-surface-low">
                แสดง 50 แถวแรกจากทั้งหมด {previewRows.length.toLocaleString()} แถว / Showing first 50 of {previewRows.length.toLocaleString()} rows
              </div>
            )}
          </div>
        </section>
      )}

      {/* Filters + Data Table */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="ค้นหา Material ID หรือ Description / Search…"
            className="field-input max-w-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="field-select max-w-[140px]" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">ทุกประเภท / All Types</option>
            <option value="FG">FG (Finished)</option>
            <option value="SG">SG (Semi-FG)</option>
            <option value="Bulk">Bulk</option>
            <option value="PK">PK (Packaging)</option>
            <option value="RM">RM (Raw Material)</option>
            <option value="Other">Other</option>
          </select>
          <select className="field-select max-w-[220px]" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">ทุกหมวด / All Categories</option>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs text-on-surface-variant ml-auto">
            แสดง {filtered.length.toLocaleString()} / {materials.length.toLocaleString()} รายการ
          </span>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-on-surface-variant">กำลังโหลด… / Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant">ไม่พบข้อมูล / No data</div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-mid sticky top-0 z-10">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-on-surface-variant">
                    <th className="px-3 py-2"><SortHeader field="sap_code" label="Material ID" /></th>
                    <th className="px-3 py-2 whitespace-nowrap">ประเภท / Type</th>
                    <th className="px-3 py-2"><SortHeader field="description" label="Description" /></th>
                    <th className="px-3 py-2"><SortHeader field="product_category" label="Product Category" /></th>
                    <th className="px-3 py-2"><SortHeader field="base_uom" label="Base UoM" /></th>
                    <th className="px-3 py-2"><SortHeader field="product_category_id" label="Cat. ID" /></th>
                    <th className="px-3 py-2 whitespace-nowrap">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 1000).map(m => (
                    <tr key={m.sap_code} className="border-t border-outline-variant/15 hover:bg-surface-low">
                      <td className="px-3 py-1.5 font-mono">{m.sap_code}</td>
                      <td className="px-3 py-1.5"><span className="chip text-[10px]">{getProductType(m.sap_code) || '—'}</span></td>
                      <td className="px-3 py-1.5">{m.description || '—'}</td>
                      <td className="px-3 py-1.5">{m.product_category || '—'}</td>
                      <td className="px-3 py-1.5">{m.base_uom || '—'}</td>
                      <td className="px-3 py-1.5">{m.product_category_id || '—'}</td>
                      <td className="px-3 py-1.5 text-xs text-on-surface-variant whitespace-nowrap">
                        {m.updated_at ? fmtDate(m.updated_at) : '—'}
                        {m.updated_by && <span className="block text-[10px]">by {m.updated_by}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 1000 && (
                <div className="px-3 py-2 text-xs text-on-surface-variant border-t border-outline-variant/15 bg-surface-low">
                  แสดง 1,000 แถวแรก — กรุณาใช้ตัวกรองเพิ่มเติม / Showing first 1,000 — please apply filters
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
