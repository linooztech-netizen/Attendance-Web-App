import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

function Navbar({ user, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="28" height="34" viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="92" height="112" rx="12" fill="#1a1a1a" stroke="#f97316" strokeWidth="6"/>
          <rect x="14" y="14" width="72" height="46" rx="6" fill="#0d0d0d" stroke="#f97316" strokeWidth="4"/>
          <circle cx="50" cy="37" r="11" fill="#f97316"/>
          <polyline points="43,37 48,43 57,30" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="32" cy="68" r="5" fill="#f97316"/>
          <circle cx="50" cy="68" r="5" fill="#f97316" fillOpacity="0.4"/>
          <circle cx="68" cy="68" r="5" fill="#f97316" fillOpacity="0.2"/>
          <rect x="18" y="78" width="64" height="36" rx="8" fill="#0d0d0d" stroke="#f97316" strokeWidth="4"/>
          <path d="M50 110 C41 110 34 103 34 94 C34 85 41 78 50 78" stroke="#f97316" strokeWidth="4" strokeLinecap="round" fill="none"/>
          <path d="M50 104 C43 104 38 99 38 94 C38 89 43 84 50 84" stroke="#f97316" strokeWidth="4" strokeLinecap="round" fill="none"/>
          <path d="M50 98 C45 98 42 96 42 94 C42 92 45 90 50 90" stroke="#f97316" strokeWidth="4" strokeLinecap="round" fill="none"/>
        </svg>
        Employee <span>Attendance</span>
      </div>
      <div className="navbar-right">
        <span className="navbar-user">{user.name}</span>
        <span className="navbar-role">Admin</span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Logout</button>
      </div>
    </nav>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3 className="modal-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ── OVERVIEW ──────────────────────────────────────────────────────────────────
function Overview({ stats }) {
  if (!stats) return <p className="text-muted">Loading...</p>;
  return (
    <div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{stats.total_managers}</div><div className="stat-label">Managers</div></div>
        <div className="stat-card"><div className="stat-value">{stats.total_oes}</div><div className="stat-label">OEs Active</div></div>
        <div className="stat-card"><div className="stat-value">{stats.total_stores}</div><div className="stat-label">Stores</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--green)' }}>{stats.today_checkins}</div><div className="stat-label">Today Check-Ins</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--yellow)' }}>{stats.today_checkouts}</div><div className="stat-label">Today Check-Outs</div></div>
      </div>
    </div>
  );
}

// ── MANAGERS ─────────────────────────────────────────────────────────────────
function Managers() {
  const [managers, setManagers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const data = await api.get('/api/admin/managers').catch(() => []);
    setManagers(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm({ name: '', email: '', password: '' }); setError(''); setShowAdd(true); setEditItem(null); }
  function openEdit(m) { setForm({ name: m.name, email: m.email, password: '' }); setError(''); setEditItem(m); setShowAdd(true); }

  async function handleSave() {
    setError('');
    try {
      if (editItem) {
        const body = { name: form.name, email: form.email };
        if (form.password) body.password = form.password;
        await api.put(`/api/admin/managers/${editItem.id}`, body);
      } else {
        if (!form.name || !form.email || !form.password) { setError('All fields required'); return; }
        await api.post('/api/admin/managers', form);
      }
      setShowAdd(false); setSuccess(editItem ? 'Manager updated' : 'Manager added'); load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setError(e.message); }
  }

  async function toggleActive(m) {
    await api.put(`/api/admin/managers/${m.id}`, { is_active: m.is_active ? 0 : 1 });
    load();
  }

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      <div className="section-header">
        <div className="section-title">Managers ({managers.length})</div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Manager</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Email</th><th>OEs</th><th>Status</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody>{managers.map(m => (
              <tr key={m.id}>
                <td className="primary">{m.name}</td>
                <td>{m.email}</td>
                <td>{m.oe_count}</td>
                <td><span className={`badge ${m.is_active ? 'badge-green' : 'badge-red'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>{m.created_at?.slice(0,10)}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>Edit</button>
                    <button className={`btn btn-sm ${m.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(m)}>
                      {m.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {managers.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No managers yet.</p>}
        </div>
      </div>

      {showAdd && (
        <Modal title={editItem ? 'Edit Manager' : 'Add Manager'} onClose={() => setShowAdd(false)}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group"><label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Email</label>
            <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">{editItem ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <input type="password" className="form-input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Save' : 'Add Manager'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── ALL OES ───────────────────────────────────────────────────────────────────
function AllOEs() {
  const [oes, setOes] = useState([]);
  useEffect(() => { api.get('/api/admin/oes').then(d => setOes(d || [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="section-header"><div className="section-title">All Operation Executives ({oes.length})</div></div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Manager</th><th>Store</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{oes.map(o => (
              <tr key={o.id}>
                <td className="primary">{o.name}</td>
                <td>{o.email}</td>
                <td>{o.manager_name || <span className="text-muted">—</span>}</td>
                <td>{o.store_code || <span className="text-muted">Not assigned</span>}</td>
                <td><span className={`badge ${o.is_active ? 'badge-green' : 'badge-red'}`}>{o.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>{o.created_at?.slice(0,10)}</td>
              </tr>
            ))}</tbody>
          </table>
          {oes.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No OEs yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ── STORES ────────────────────────────────────────────────────────────────────
function AllStores() {
  const [stores, setStores] = useState([]);
  useEffect(() => { api.get('/api/admin/stores').then(d => setStores(d || [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="section-header"><div className="section-title">All Stores ({stores.length})</div></div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Store Code</th><th>Name</th><th>Latitude</th><th>Longitude</th><th>Radius (m)</th><th>Manager</th></tr></thead>
            <tbody>{stores.map(s => (
              <tr key={s.id}>
                <td className="primary">{s.store_code}</td>
                <td>{s.name || '—'}</td>
                <td>{s.latitude}</td>
                <td>{s.longitude}</td>
                <td>{s.radius_meters}</td>
                <td>{s.manager_name || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {stores.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No stores yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ── REPORTS ───────────────────────────────────────────────────────────────────
function Reports() {
  const today = new Date().toISOString().split('T')[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetch_data() {
    setLoading(true); setError(''); setRows(null);
    try {
      const data = await api.get(`/api/admin/attendance?from=${from}&to=${to}`);
      setRows(data);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  async function download() {
    setError('');
    try { await api.download(`/api/admin/attendance?from=${from}&to=${to}&format=csv`); }
    catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 16 }}>Download Attendance Report</div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From Date</label>
            <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To Date</label>
            <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={fetch_data} disabled={loading}>
            {loading ? 'Loading...' : 'View Report'}
          </button>
          <button className="btn btn-success" onClick={download}>⬇ Download CSV</button>
        </div>
      </div>

      {rows && (
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <span className="text-muted text-sm">{rows.length} records found</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Date</th><th>OE Name</th><th>Manager</th><th>Store</th>
                <th>Check In</th><th>Check Out</th><th>Distance (m)</th>
              </tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id}>
                  <td className="primary">{r.date}</td>
                  <td>{r.oe_name}</td>
                  <td>{r.manager_name || '—'}</td>
                  <td>{r.store_code || '—'}</td>
                  <td style={{ color: 'var(--green)' }}>{r.check_in_time ? r.check_in_time.replace('T',' ').slice(0,19) : <span className="text-muted">—</span>}</td>
                  <td style={{ color: 'var(--yellow)' }}>{r.check_out_time ? r.check_out_time.replace('T',' ').slice(0,19) : <span className="text-muted">—</span>}</td>
                  <td>{r.check_in_distance != null ? Math.round(r.check_in_distance) + 'm' : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No records for this period.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const TABS = ['Overview', 'Managers', 'OEs', 'Stores', 'Reports'];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('Overview');
  const [stats, setStats] = useState(null);

  useEffect(() => { api.get('/api/admin/stats').then(setStats).catch(() => {}); }, []);

  return (
    <div className="app">
      <Navbar user={user} onLogout={logout} />
      <div className="main">
        <div className="tabs">
          {TABS.map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        {tab === 'Overview' && <Overview stats={stats} />}
        {tab === 'Managers' && <Managers />}
        {tab === 'OEs' && <AllOEs />}
        {tab === 'Stores' && <AllStores />}
        {tab === 'Reports' && <Reports />}
      </div>
    </div>
  );
}
