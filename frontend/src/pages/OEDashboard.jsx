import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { getDeviceFingerprint, getDeviceName } from '../utils/device';

function fmtTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('GPS not supported by your browser')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => {
        const msgs = { 1: 'Location access denied. Allow location in browser settings.', 2: 'Location unavailable. Try again.', 3: 'Location timed out. Try again.' };
        reject(new Error(msgs[err.code] || 'Could not get location'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export default function OEDashboard() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [todayData, setTodayData] = useState({ visits: [], openVisit: null, roster: null, today: '' });
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [checkingInStore, setCheckingInStore] = useState(null);

  const deviceFP = getDeviceFingerprint();
  const deviceName = getDeviceName();

  const load = useCallback(async () => {
    const [p, t, h] = await Promise.all([
      api.get('/api/oe/profile').catch(() => null),
      api.get('/api/oe/today').catch(() => ({ visits: [], openVisit: null, roster: null })),
      api.get('/api/oe/attendance').catch(() => [])
    ]);
    setProfile(p);
    setTodayData(t || {});
    setHistory(h || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCheckIn(store) {
    setError(''); setStatus(`Getting GPS location...`);
    setGpsLoading(true); setCheckingInStore(store.id);
    try {
      const loc = await getLocation();
      setStatus(`Checking in to ${store.store_code}...`);
      await api.post('/api/oe/checkin', { ...loc, store_id: store.id, device_fingerprint: deviceFP, device_name: deviceName });
      setStatus('');
      await load();
    } catch (e) {
      setStatus('');
      setError(e.message);
    } finally { setGpsLoading(false); setCheckingInStore(null); }
  }

  async function handleCheckOut() {
    setError(''); setStatus('Getting GPS location...');
    setGpsLoading(true);
    try {
      const loc = await getLocation();
      setStatus('Checking out...');
      await api.post('/api/oe/checkout', { ...loc, device_fingerprint: deviceFP });
      setStatus('');
      await load();
    } catch (e) {
      setStatus('');
      setError(e.message);
    } finally { setGpsLoading(false); }
  }

  const assignedStores = profile?.assigned_stores || [];
  const openVisit = todayData.openVisit;
  const visits = todayData.visits || [];
  const roster = todayData.roster;
  const isDeviceError = error.includes('not registered') || error.includes('device');

  return (
    <div className="app">
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
          Site<span>Watch</span>
        </div>
        <div className="navbar-right">
          <span className="navbar-user">{user?.name}</span>
          <span className="navbar-role">OE</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="main" style={{ maxWidth: 680 }}>

        {/* Date + Roster */}
        <div className="card" style={{ textAlign: 'center', padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {todayData.today && new Date(todayData.today + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          {roster && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text3)' }}>
              Scheduled: <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{roster.shift_start || '—'} → {roster.shift_end || '—'}</span>
              {roster.day_type && roster.day_type !== 'normal' && <span style={{ marginLeft: 8, color: '#3b82f6', fontWeight: 600, textTransform: 'capitalize' }}>{roster.day_type.replace('_', ' ')}</span>}
            </div>
          )}
        </div>

        {/* Status / Error */}
        {status && <div className="alert alert-info" style={{ marginBottom: 12 }}>{status}</div>}
        {error && (
          <div className={`alert ${isDeviceError ? 'alert-warning' : 'alert-error'}`} style={{ marginBottom: 12 }}>
            {isDeviceError ? '📱 ' : ''}{error}
            {isDeviceError && <div className="text-sm" style={{ marginTop: 4 }}>Your manager will see the approval request in their dashboard.</div>}
          </div>
        )}

        {/* Active Visit — CHECK OUT */}
        {openVisit && (
          <div className="oe-checkin-card" style={{ marginBottom: 16 }}>
            <div className="checkin-status">🟢</div>
            <div className="checkin-label">CHECKED IN AT</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--orange)', marginBottom: 4 }}>{openVisit.store_code || 'Store'}</div>
            <div className="checkin-time">{fmtTime(openVisit.check_in_time)}</div>
            <div style={{ marginBottom: 20 }} />
            <button className="btn btn-xl" style={{ background: 'var(--yellow)', color: '#000', fontWeight: 700 }} onClick={handleCheckOut} disabled={gpsLoading}>
              {gpsLoading && !checkingInStore ? '⏳ Please wait...' : '✗ CHECK OUT'}
            </button>
          </div>
        )}

        {/* Assigned Stores — CHECK IN */}
        {assignedStores.length > 0 ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Your Stores</div>
            {assignedStores.map(store => {
              const visitedToday = visits.find(v => String(v.store_id) === String(store.id));
              const isOpen = openVisit && String(openVisit.store_id) === String(store.id);
              const isCompleted = visitedToday && visitedToday.check_out_time;

              return (
                <div key={store.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{store.store_code}</div>
                    {store.name && <div className="text-muted text-sm">{store.name}</div>}
                    <div className="text-muted text-sm">Radius: {store.radius_meters}m</div>
                    {visitedToday && (
                      <div style={{ fontSize: 11, marginTop: 3, color: isOpen ? '#22c55e' : 'var(--text3)' }}>
                        {fmtTime(visitedToday.check_in_time)}
                        {visitedToday.check_out_time ? ` → ${fmtTime(visitedToday.check_out_time)}` : ' → ongoing'}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 12 }}>
                    {isOpen ? (
                      <span className="badge badge-green">Active</span>
                    ) : isCompleted ? (
                      <span className="badge badge-green">✓ Done</span>
                    ) : openVisit ? (
                      <span className="text-muted text-sm" style={{ fontSize: 11 }}>Check out first</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => handleCheckIn(store)} disabled={gpsLoading}>
                        {gpsLoading && checkingInStore === store.id ? '⏳' : 'CHECK IN'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          !openVisit && <div className="alert alert-warning" style={{ marginBottom: 16 }}>No stores assigned. Contact your manager.</div>
        )}

        {/* Device status */}
        <div className="card" style={{ marginBottom: 16, padding: '10px 16px' }}>
          <div className="text-muted text-sm" style={{ marginBottom: 4 }}>Your Device</div>
          {profile?.device_fingerprint
            ? <span className="badge badge-green">📱 {profile.device_name || 'Registered'} — Active</span>
            : <span className="badge badge-yellow">📱 {deviceName} — Will register on first check-in</span>}
        </div>

        {/* Today's Visits */}
        {visits.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Today's Visits</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Store</th><th>Check In</th><th>Check Out</th><th>Distance</th></tr></thead>
                <tbody>{visits.map(v => (
                  <tr key={v.id}>
                    <td className="primary">{v.store_code || '—'}</td>
                    <td style={{ color: 'var(--green)' }}>{fmtTime(v.check_in_time) || '—'}</td>
                    <td style={{ color: v.check_out_time ? 'var(--yellow)' : 'var(--text3)' }}>
                      {fmtTime(v.check_out_time) || 'Ongoing'}
                    </td>
                    <td>{v.check_in_distance != null ? Math.round(v.check_in_distance) + 'm' : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attendance History */}
        <div className="card">
          <div className="card-title">Recent Attendance</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Store</th><th>Check In</th><th>Check Out</th></tr></thead>
              <tbody>{history.map(r => (
                <tr key={r.id}>
                  <td className="primary">{r.date}</td>
                  <td>{r.store_code || '—'}</td>
                  <td style={{ color: 'var(--green)' }}>{fmtTime(r.check_in_time) || <span className="text-muted">—</span>}</td>
                  <td style={{ color: 'var(--yellow)' }}>{fmtTime(r.check_out_time) || <span className="text-muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
            {history.length === 0 && <p className="text-muted" style={{ padding: 20 }}>No attendance records yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
