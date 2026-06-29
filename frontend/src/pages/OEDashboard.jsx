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
        <div className="navbar-brand">📍 Staff <span>Attendance</span></div>
        <div className="navbar-right">
          <span className="navbar-user">{user?.name}</span>
          <span className="navbar-role">OE</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="main" style={{ maxWidth: 680 }}>
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
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="text-muted text-sm">Your Device</div>
            {profile?.device_fingerprint
              ? <span className="badge badge-green">📱 {profile.device_name || 'Registered'} — Active</span>
              : <span className="badge badge-yellow">📱 {deviceName} — Will register on first check-in</span>}
          </div>
        </div>

        {roster && (
          <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><div className="text-muted text-sm">Today's Shift</div>
              <div style={{ fontWeight: 600 }}>{roster.shift_start || '—'} → {roster.shift_end || '—'}</div></div>
            {roster.store_code && <div><div className="text-muted text-sm">Rostered Store</div><div style={{ fontWeight: 600 }}>{roster.store_code}</div></div>}
            {roster.notes && <div><div className="text-muted text-sm">Notes</div><div>{roster.notes}</div></div>}
          </div>
        )}
