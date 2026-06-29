import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import MapPicker from '../components/MapPicker';

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
        <span className="navbar-role">Manager</span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Logout</button>
      </div>
    </nav>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 680 } : {}}>
        <h3 className="modal-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function MyOEs({ stores }) {
  const [oes, setOes] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', store_id: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const data = await api.get('/api/manager/oes').catch(() => []);
    setOes(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm({ name: '', email: '', password: '', store_id: '' }); setError(''); setEditItem(null); setShowAdd(true); }
  function openEdit(o) { setForm({ name: o.name, email: o.email, password: '', store_id: o.store_id || '' }); setError(''); setEditItem(o); setShowAdd(true); }

  async function handleSave() {
    setError('');
    try {
      if (editItem) {
        const body = { name: form.name, email: form.email, store_id: form.store_id || null };
        if (form.password) body.password = form.password;
        await api.put(`/api/manager/oes/${editItem.id}`, body);
      } else {
        if (!form.name || !form.email || !form.password) { setError('Name, email, password required'); return; }
        await api.post('/api/manager/oes', { ...form, store_id: form.store_id || null });
      }
      setShowAdd(false); setSuccess(editItem ? 'OE updated' : 'OE added'); load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setError(e.message); }
  }

  async function toggleActive(o) {
    await api.put(`/api/manager/oes/${o.id}`, { is_active: o.is_active ? 0 : 1 });
    load();
  }

  async function resetDevice(o) {
    if (!confirm(`Reset registered device for ${o.name}? They will need to re-register on next check-in.`)) return;
    try {
      await api.delete(`/api/manager/oes/${o.id}/device`);
      setSuccess('Device reset successfully');
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch (e) { setError(e.message); }
  }

  const [deviceModal, setDeviceModal] = useState(null);
  const [deviceForm, setDeviceForm] = useState({ device_name: '' });

  function openDeviceModal(o) {
    setDeviceForm({ device_name: o.device_name || '' });
    setDeviceModal(o);
  }

  async function saveDevice() {
    try {
      await api.put(`/api/manager/oes/${deviceModal.id}`, { device_name: deviceForm.device_name, phone_number: deviceForm.phone_number });
      setDeviceModal(null);
      setSuccess('Device info saved');
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <div className="section-header">
        <div className="section-title">My Operation Executives ({oes.length}/200)</div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add OE</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Store</th><th>Device</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{oes.map(o => (
              <tr key={o.id}>
                <td className="primary">{o.name}</td>
                <td>{o.email}</td>
                <td>{o.store_code || <span className="badge badge-yellow">Not Assigned</span>}</td>
                <td>
                  {o.device_fingerprint
                    ? <span className="badge badge-green">📱 {o.device_name || 'Registered'}</span>
                    : <span className="badge badge-yellow">Not Registered</span>}
                </td>
                <td><span className={`badge ${o.is_active ? 'badge-green' : 'badge-red'}`}>{o.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(o)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDeviceModal(o)}>📱 Device Info</button>
                    {o.device_fingerprint && (
                      <button className="btn btn-ghost btn-sm" onClick={() => resetDevice(o)}>🔄 Reset</button>
                    )}
                    <button className={`btn btn-sm ${o.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(o)}>
                      {o.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {oes.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No OEs yet.</p>}
        </div>
      </div>

      {deviceModal && (
        <Modal title={`Device Info — ${deviceModal.name}`} onClose={() => setDeviceModal(null)}>
          <div className="form-group"><label className="form-label">Device Name / Model</label>
            <input className="form-input" placeholder="e.g. Samsung Galaxy S23" value={deviceForm.device_name}
              onChange={e => setDeviceForm(f => ({ ...f, device_name: e.target.value }))} /></div>
          {deviceModal.device_fingerprint && (
            <div className="alert alert-info" style={{ marginBottom: 12 }}>
              Auto-registered device: <strong>{deviceModal.device_name || 'Unknown'}</strong>
            </div>
          )}
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setDeviceModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveDevice}>Save</button>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title={editItem ? 'Edit OE' : 'Add Operation Executive'} onClose={() => setShowAdd(false)}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group"><label className="form-label">Full Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Email</label>
            <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">{editItem ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <input type="password" className="form-input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Assign Store</label>
            <select className="form-input" value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
              <option value="">-- No Store --</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.store_code}{s.name ? ` – ${s.name}` : ''}</option>)}
            </select>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Save' : 'Add OE'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stores({ onStoresChange }) {
  const [stores, setStores] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ store_code: '', name: '', latitude: '', longitude: '', radius_meters: '100' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const data = await api.get('/api/manager/stores').catch(() => []);
    const s = data || [];
    setStores(s);
    if (onStoresChange) onStoresChange(s);
  }, [onStoresChange]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm({ store_code: '', name: '', latitude: '', longitude: '', radius_meters: '100' });
    setError(''); setEditItem(null); setShowForm(true);
  }
  function openEdit(s) {
    setForm({ store_code: s.store_code, name: s.name || '', latitude: String(s.latitude), longitude: String(s.longitude), radius_meters: String(s.radius_meters) });
    setError(''); setEditItem(s); setShowForm(true);
  }

  async function handleSave() {
    setError('');
    if (!form.store_code || !form.latitude || !form.longitude) { setError('Store code, latitude, longitude required. Place a pin on the map.'); return; }
    try {
      const body = { ...form, latitude: parseFloat(form.latitude), longitude: parseFloat(form.longitude), radius_meters: parseInt(form.radius_meters) || 100 };
      if (editItem) {
        await api.put(`/api/manager/stores/${editItem.id}`, body);
      } else {
        await api.post('/api/manager/stores', body);
      }
      setShowForm(false); setSuccess(editItem ? 'Store updated' : 'Store added'); load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setError(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this store?')) return;
    await api.delete(`/api/manager/stores/${id}`);
    load();
  }

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      <div className="section-header">
        <div className="section-title">Stores ({stores.length})</div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Store</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Latitude</th><th>Longitude</th><th>Radius</th><th>Actions</th></tr></thead>
            <tbody>{stores.map(s => (
              <tr key={s.id}>
                <td className="primary">{s.store_code}</td>
                <td>{s.name || '—'}</td>
                <td>{s.latitude}</td>
                <td>{s.longitude}</td>
                <td><span className="badge badge-blue">{s.radius_meters}m</span></td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {stores.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No stores yet.</p>}
        </div>
      </div>

      {showForm && (
        <Modal title={editItem ? 'Edit Store' : 'Add Store'} onClose={() => setShowForm(false)} wide>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Store Code *</label>
              <input className="form-input" placeholder="e.g. STR001" value={form.store_code} onChange={e => setForm(f => ({ ...f, store_code: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Store Name</label>
              <input className="form-input" placeholder="e.g. Main Branch" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">Check-In Radius (meters)</label>
            <input type="number" className="form-input" placeholder="100" value={form.radius_meters}
              onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Store Location — Search or click on map to place pin</label>
            <MapPicker
              lat={form.latitude ? parseFloat(form.latitude) : null}
              lng={form.longitude ? parseFloat(form.longitude) : null}
              radius={parseInt(form.radius_meters) || 100}
              onChange={({ lat, lng }) => setForm(f => ({ ...f, latitude: String(lat), longitude: String(lng) }))}
            />
          </div>
          <div className="form-row" style={{ marginTop: 8 }}>
            <div className="form-group"><label className="form-label">Latitude (auto-filled from map)</label>
              <input type="number" step="any" className="form-input" value={form.latitude}
                onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Longitude (auto-filled from map)</label>
              <input type="number" step="any" className="form-input" value={form.longitude}
                onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} /></div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>{editItem ? 'Save' : 'Add Store'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DeviceRequests() {
  const [requests, setRequests] = useState([]);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const data = await api.get('/api/manager/device-requests').catch(() => []);
    setRequests(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handle(id, action) {
    try {
      const res = await api.put(`/api/manager/device-requests/${id}`, { action });
      setSuccess(res.message);
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch (e) { alert(e.message); }
  }

  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      <div className="section-title" style={{ marginBottom: 16 }}>
        Device Requests {pending.length > 0 && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>{pending.length} pending</span>}
      </div>
      {pending.length === 0 && <div className="alert alert-info" style={{ marginBottom: 16 }}>No pending device requests.</div>}
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Pending Approvals</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>OE Name</th><th>Device</th><th>Requested</th><th>Actions</th></tr></thead>
              <tbody>{pending.map(r => (
                <tr key={r.id}>
                  <td className="primary">{r.oe_name}<br /><span className="text-muted text-sm">{r.oe_email}</span></td>
                  <td>📱 {r.device_name || 'Unknown Device'}</td>
                  <td>{new Date(r.requested_at).toLocaleString()}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-success btn-sm" onClick={() => handle(r.id, 'approve')}>✓ Approve</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handle(r.id, 'deny')}>✗ Deny</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {resolved.length > 0 && (
        <div className="card">
          <div className="card-title">Recent History</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>OE Name</th><th>Device</th><th>Status</th><th>Resolved</th></tr></thead>
              <tbody>{resolved.slice(0, 20).map(r => (
                <tr key={r.id}>
                  <td className="primary">{r.oe_name}</td>
                  <td>{r.device_name || 'Unknown'}</td>
                  <td><span className={`badge ${r.status === 'approved' ? 'badge-green' : 'badge-red'}`}>{r.status}</span></td>
                  <td>{r.approved_at ? new Date(r.approved_at).toLocaleString() : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const DAY_TYPES = [
  { value: 'normal', label: 'Normal', color: '#f97316' },
  { value: 'OT', label: 'OT', color: '#f59e0b' },
  { value: 'weekoff', label: 'Week Off', color: '#3b82f6' },
  { value: 'compoff', label: 'Comp Off', color: '#8b5cf6' },
  { value: 'annual_leave', label: 'Annual Leave', color: '#22c55e' },
  { value: 'sick_leave', label: 'Sick Leave', color: '#ef4444' },
];

function Roster() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [oes, setOes] = useState([]);
  const [selectedOE, setSelectedOE] = useState('');
  const [rosterMap, setRosterMap] = useState({});
  const [editDay, setEditDay] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayStr = now.toLocaleDateString('en-CA');

  useEffect(() => { api.get('/api/manager/oes').then(d => setOes(d || [])).catch(() => {}); }, []);

  const loadRoster = useCallback(async () => {
    if (!selectedOE) return;
    const from = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const to = `${year}-${String(month+1).padStart(2,'0')}-${String(new Date(year,month+1,0).getDate()).padStart(2,'0')}`;
    const data = await api.get(`/api/manager/roster?from=${from}&to=${to}&oe_id=${selectedOE}`).catch(() => []);
    const map = {};
    (data || []).forEach(r => { map[r.date] = r; });
    setRosterMap(map);
  }, [selectedOE, year, month]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  function dateStr(d) { return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  function buildCalendar() {
    const days = [];
    const firstDow = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month+1, 0).getDate();
    for (let i = 0; i < firstDow; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  function openEdit(d) {
    const ds = dateStr(d);
    const e = rosterMap[ds] || {};
    setEditForm({ date: ds, shift_start: e.shift_start || '', shift_end: e.shift_end || '', day_type: e.day_type || 'normal', notes: e.notes || '' });
    setEditDay(ds);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.post('/api/manager/roster', { oe_id: selectedOE, date: editForm.date, shift_start: editForm.shift_start || null, shift_end: editForm.shift_end || null, day_type: editForm.day_type, notes: editForm.notes || null });
      setEditDay(null); setSuccess('Saved'); setTimeout(() => setSuccess(''), 2000);
      await loadRoster();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  const calendar = buildCalendar();
  const weeks = [];
  for (let i = 0; i < calendar.length; i += 7) weeks.push(calendar.slice(i, i+7));

  return (
    <div>
      {success && <div className="alert alert-success">{success}</div>}
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div className="section-title">Roster Calendar</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 'auto' }} value={selectedOE} onChange={e => setSelectedOE(e.target.value)}>
            <option value="">-- Select OE --</option>
            {oes.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className="form-input" style={{ width: 'auto' }} value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select className="form-input" style={{ width: 'auto' }} value={year} onChange={e => setYear(+e.target.value)}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {!selectedOE
        ? <div className="alert alert-info">Select an OE to view and manage their monthly roster.</div>
        : <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              {DAY_TYPES.map(t => (
                <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: t.color }} />
                  <span style={{ color: t.color }}>{t.label}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                {DOW.map(d => <div key={d} style={{ padding: '10px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>{d}</div>)}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: wi < weeks.length-1 ? '1px solid var(--border)' : 'none' }}>
                  {week.map((day, di) => {
                    if (!day) return <div key={di} style={{ minHeight: 88, background: 'var(--bg3)', opacity: 0.4, borderRight: di < 6 ? '1px solid var(--border)' : 'none' }} />;
                    const ds = dateStr(day);
                    const entry = rosterMap[ds];
                    const dt = DAY_TYPES.find(t => t.value === (entry?.day_type || 'normal'));
                    const isToday = ds === todayStr;
                    const hasMark = entry?.day_type && entry.day_type !== 'normal';
                    return (
                      <div key={di} onClick={() => openEdit(day)} style={{ minHeight: 88, borderRight: di < 6 ? '1px solid var(--border)' : 'none', padding: '6px 8px', cursor: 'pointer', background: hasMark ? `${dt.color}18` : 'transparent', transition: 'background 0.1s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#f97316' : hasMark ? dt.color : 'var(--text)' }}>{day}</span>
                          {isToday && <span style={{ fontSize: 8, background: '#f97316', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>TODAY</span>}
                        </div>
                        {entry?.shift_start && <div style={{ fontSize: 10, color: '#22c55e', lineHeight: 1.6 }}>▶ {entry.shift_start}</div>}
                        {entry?.shift_end && <div style={{ fontSize: 10, color: '#f59e0b', lineHeight: 1.6 }}>■ {entry.shift_end}</div>}
                        {hasMark && <div style={{ fontSize: 9, fontWeight: 700, color: dt.color, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{dt.label}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
      }

      {editDay && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditDay(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3 className="modal-title">Set Roster — {editDay}</h3>
            <div className="form-group">
              <label className="form-label">Day Type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {DAY_TYPES.map(t => (
                  <button key={t.value} onClick={() => setEditForm(f => ({ ...f, day_type: t.value }))} style={{ padding: '6px 14px', borderRadius: 20, border: `2px solid ${t.color}`, background: editForm.day_type === t.value ? t.color : 'transparent', color: editForm.day_type === t.value ? '#fff' : t.color, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {(editForm.day_type === 'normal' || editForm.day_type === 'OT') && (
              <div className="form-row">
                <div className="form-group"><label className="form-label">Shift Start</label>
                  <input type="time" className="form-input" value={editForm.shift_start} onChange={e => setEditForm(f => ({ ...f, shift_start: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Shift End</label>
                  <input type="time" className="form-input" value={editForm.shift_end} onChange={e => setEditForm(f => ({ ...f, shift_end: e.target.value }))} /></div>
              </div>
            )}
            <div className="form-group"><label className="form-label">Notes (optional)</label>
              <input className="form-input" placeholder="e.g. Cover shift, special event..." value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditDay(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManagerReports({ oes }) {
  const today = new Date().toISOString().split('T')[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [oeId, setOeId] = useState('');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function viewData() {
    setLoading(true); setError(''); setRows(null);
    try {
      const q = new URLSearchParams({ from, to });
      if (oeId) q.set('oe_id', oeId);
      setRows(await api.get(`/api/manager/attendance?${q}`));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  async function download() {
    try {
      const q = new URLSearchParams({ from, to, format: 'csv' });
      if (oeId) q.set('oe_id', oeId);
      await api.download(`/api/manager/attendance?${q}`);
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 16 }}>Attendance Reports</div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-row-3">
          <div className="form-group"><label className="form-label">From</label>
            <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">To</label>
            <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">OE (Optional)</label>
            <select className="form-input" value={oeId} onChange={e => setOeId(e.target.value)}>
              <option value="">All OEs</option>
              {oes.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" onClick={viewData} disabled={loading}>{loading ? 'Loading...' : 'View Report'}</button>
          <button className="btn btn-success" onClick={download}>⬇ Download CSV</button>
        </div>
      </div>
      {rows && (
        <div className="card">
          <p className="text-muted text-sm" style={{ marginBottom: 12 }}>{rows.length} records</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>OE Name</th><th>Store</th><th>Check In</th><th>Check Out</th><th>Distance</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id}>
                  <td className="primary">{r.date}</td>
                  <td>{r.oe_name}</td>
                  <td>{r.store_code || '—'}</td>
                  <td style={{ color: 'var(--green)' }}>{r.check_in_time ? r.check_in_time.replace('T', ' ').slice(0, 19) : '—'}</td>
                  <td style={{ color: 'var(--yellow)' }}>{r.check_out_time ? r.check_out_time.replace('T', ' ').slice(0, 19) : '—'}</td>
                  <td>{r.check_in_distance != null ? Math.round(r.check_in_distance) + 'm' : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No records.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = ['My OEs', 'Stores', 'Roster', 'Device Requests', 'Reports'];

export default function ManagerDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('My OEs');
  const [stores, setStores] = useState([]);
  const [oes, setOes] = useState([]);

  useEffect(() => {
    api.get('/api/manager/stores').then(d => setStores(d || [])).catch(() => {});
    api.get('/api/manager/oes').then(d => setOes(d || [])).catch(() => {});
  }, []);

  return (
    <div className="app">
      <Navbar user={user} onLogout={logout} />
      <div className="main">
        <div className="tabs">
          {TABS.map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        {tab === 'My OEs' && <MyOEs stores={stores} />}
        {tab === 'Stores' && <Stores onStoresChange={setStores} />}
        {tab === 'Roster' && <Roster />}
        {tab === 'Device Requests' && <DeviceRequests />}
        {tab === 'Reports' && <ManagerReports oes={oes} />}
      </div>
    </div>
  );
}
