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
  const [todayData, setTodayData] = useState({ attendance: null, roster: null, today: '' });
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const deviceFP = getDeviceFingerprint();
  const deviceName = getDeviceName();

  const load = useCallback(async () => {
    const [p, t, h] = await Promise.all([
      api.get('/api/oe/profile').catch(() => null),
      api.get('/api/oe/today').catch(() => ({ attendance: null, roster: null })),
      api.get('/api/oe/attendance').catch(() => [])
    ]);
    setProfile(p);
    setTodayData(t || {});
    setHistory(h || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCheckIn() {
    setError(''); setStatus('Getting your GPS location...');
    setGpsLoading(true);
    try {
      const loc = await getLocation();
      setStatus('Verifying location & device...');
      await api.post('/api/oe/checkin', { ...loc, device_fingerprint: deviceFP, device_name: deviceName });
      setStatus('');
      await load();
    } catch (e) {
      setStatus('');
      setError(e.message);
    } finally { setGpsLoading(false); }
  }

  async function handleCheckOut() {
    setError(''); setStatus('Getting your GPS location...');
    setGpsLoading(true);
    try {
      const loc = await getLocation();
      setStatus('Checking out...');
      await api.post('/api/oe/checkout', loc);
      setStatus('');
      await load();
    } catch (e) {
      setStatus('');
      setError(e.message);
    } finally { setGpsLoading(false); }
  }

  const attendance = todayData.attendance;
  const roster = todayData.roster;
  const checkedIn = attendance?.check_in_time;
  const checkedOut = attendance?.check_out_time;
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
          Employee <span>Attendance</span>
        </div>
        <div className="navbar-right">
          <span className="navbar-user">{user?.name}</span>
          <span className="navbar-role">OE</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="main" style={{ maxWidth: 680 }}>

        {/* Store Info */}
        <div className="oe-store-card">
          <div className="flex-between">
            <div>
              <div className="text-muted text-sm" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned Store</div>
              {profile?.store_code
                ? <div style={{ fontSize: 22, fontWeight: 700 }}>{profile.store_code}{profile.store_name ? ` — ${profile.store_name}` : ''}</div>
                : <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>No store assigned. Contact your manager.</div>}
              {profile?.manager_name && <div className="text-muted text-sm" style={{ marginTop: 4 }}>Manager: {profile.manager_name}</div>}
            </div>
            {profile?.store_code && (
              <div style={{ textAlign: 'right' }}>
                <div className="text-muted text-sm">Check-in Radius</div>
                <div style={{ fontWeight: 700, color: 'var(--blue)', fontSize: 18 }}>{profile.radius_meters}m</div>
              </div>
            )}
          </div>

          {/* Device registration status */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="text-muted text-sm">Your Device</div>
            {profile?.device_fingerprint
              ? <span className="badge badge-green">📱 {profile.device_name || 'Registered'} — Active</span>
              : <span className="badge badge-yellow">📱 {deviceName} — Will register on first check-in</span>}
          </div>
        </div>

        {/* Today's Roster */}
        {roster && (
          <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><div className="text-muted text-sm">Today's Shift</div>
              <div style={{ fontWeight: 600 }}>{roster.shift_start || '—'} → {roster.shift_end || '—'}</div></div>
            {roster.store_code && <div><div className="text-muted text-sm">Rostered Store</div><div style={{ fontWeight: 600 }}>{roster.store_code}</div></div>}
            {roster.notes && <div><div className="text-muted text-sm">Notes</div><div>{roster.notes}</div></div>}
          </div>
        )}

        {/* Check In / Out Card */}
        <div className="oe-checkin-card">
          <div className="checkin-label" style={{ marginBottom: 12 }}>
            {todayData.today && new Date(todayData.today + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>

          {!checkedIn && <><div className="checkin-status">🔴</div><div style={{ color: 'var(--text3)', marginBottom: 24, fontWeight: 600 }}>NOT CHECKED IN</div></>}

          {checkedIn && !checkedOut && (
            <><div className="checkin-status">🟢</div>
              <div className="checkin-label">CHECKED IN AT</div>
              <div className="checkin-time">{fmtTime(checkedIn)}</div>
              <div style={{ marginBottom: 24 }} /></>
          )}

          {checkedIn && checkedOut && (
            <><div className="checkin-status">✅</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 16 }}>
                <div><div className="checkin-label">CHECKED IN</div><div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 18 }}>{fmtTime(checkedIn)}</div></div>
                <div><div className="checkin-label">CHECKED OUT</div><div style={{ color: 'var(--yellow)', fontWeight: 700, fontSize: 18 }}>{fmtTime(checkedOut)}</div></div>
              </div>
              <div style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>Day complete!</div>
            </>
          )}

          {status && <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: 12 }}>{status}</div>}

          {error && (
            <div className={`alert ${isDeviceError ? 'alert-warning' : 'alert-error'}`} style={{ textAlign: 'left', marginBottom: 12 }}>
              {isDeviceError ? '📱 ' : ''}{error}
              {isDeviceError && <div className="text-sm" style={{ marginTop: 4 }}>Your manager will see the approval request in their dashboard.</div>}
            </div>
          )}

          {!checkedIn && (
            <button className="btn btn-success btn-xl" onClick={handleCheckIn} disabled={gpsLoading || !profile?.store_code}>
              {gpsLoading ? '⏳ Please wait...' : '✓ CHECK IN'}
            </button>
          )}

          {checkedIn && !checkedOut && (
            <button className="btn btn-xl" style={{ background: 'var(--yellow)', color: '#000', fontWeight: 700 }} onClick={handleCheckOut} disabled={gpsLoading}>
              {gpsLoading ? '⏳ Please wait...' : '✗ CHECK OUT'}
            </button>
          )}

          {attendance?.check_in_distance != null && (
            <div className="text-muted text-sm" style={{ marginTop: 12 }}>
              Check-in distance from store: {Math.round(attendance.check_in_distance)}m
            </div>
          )}
        </div>

        {/* Attendance History */}
        <div className="card">
          <div className="card-title">Attendance History (Last 30 days)</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Store</th><th>Distance</th></tr></thead>
              <tbody>{history.map(r => (
                <tr key={r.id}>
                  <td className="primary">{r.date}</td>
                  <td style={{ color: 'var(--green)' }}>{fmtTime(r.check_in_time) || <span className="text-muted">—</span>}</td>
                  <td style={{ color: 'var(--yellow)' }}>{fmtTime(r.check_out_time) || <span className="text-muted">—</span>}</td>
                  <td>{r.store_code || '—'}</td>
                  <td>{r.check_in_distance != null ? Math.round(r.check_in_distance) + 'm' : '—'}</td>
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
