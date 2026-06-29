import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/api/auth/login', { email, password });
      login(data.user, data.token);
      const routes = { admin: '/admin', manager: '/manager', oe: '/oe' };
      navigate(routes[data.user.role] || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="100" height="120" viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="4" width="92" height="112" rx="12" fill="#1a1a1a" stroke="#f97316" strokeWidth="2"/>
              <rect x="14" y="14" width="72" height="46" rx="6" fill="#0d0d0d" stroke="#f97316" strokeWidth="1.5"/>
              <circle cx="50" cy="37" r="15" fill="#f97316" fillOpacity="0.12"/>
              <circle cx="50" cy="37" r="11" fill="#f97316"/>
              <polyline points="43,37 48,43 57,30" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="14" y1="68" x2="86" y2="68" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.4"/>
              <circle cx="32" cy="65" r="3" fill="#f97316"/>
              <circle cx="50" cy="65" r="3" fill="#f97316" fillOpacity="0.4"/>
              <circle cx="68" cy="65" r="3" fill="#f97316" fillOpacity="0.2"/>
              <rect x="18" y="74" width="64" height="36" rx="8" fill="#0d0d0d" stroke="#f97316" strokeWidth="1.5"/>
              <path d="M50 106 C41 106 34 99 34 90 C34 81 41 74 50 74" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M50 102 C43 102 38 97 38 90 C38 83 43 78 50 78" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M50 98 C45 98 42 95 42 90 C42 85 45 82 50 82" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M50 94 C47 94 46 92 46 90 C46 88 47 86 50 86" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M50 90 C49 90 50 90 50 90" stroke="#f97316" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <h1 style={{ color: '#f97316', fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>Employee Attendance</h1>
          <p style={{ color: '#666', marginTop: 6 }}>GPS Geofencing System · UAE</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
