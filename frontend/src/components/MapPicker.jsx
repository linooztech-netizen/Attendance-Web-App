import React, { useEffect, useRef, useState } from 'react';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export default function MapPicker({ lat, lng, radius, onChange }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (instanceRef.current) return;
    const center = (lat && lng) ? [lat, lng] : [3.1390, 101.6869];
    const map = window.L.map(mapRef.current, { center, zoom: lat && lng ? 16 : 10 });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    instanceRef.current = map;

    if (lat && lng) {
      markerRef.current = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      circleRef.current = window.L.circle([lat, lng], { radius: radius || 100, color: '#22c55e', fillOpacity: 0.15 }).addTo(map);
      markerRef.current.on('dragend', e => {
        const p = e.target.getLatLng();
        circleRef.current.setLatLng(p);
        onChange({ lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) });
      });
    }

    map.on('click', e => {
      const { lat: la, lng: ln } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln]);
        circleRef.current.setLatLng([la, ln]);
      } else {
        markerRef.current = window.L.marker([la, ln], { draggable: true }).addTo(map);
        circleRef.current = window.L.circle([la, ln], { radius: radius || 100, color: '#22c55e', fillOpacity: 0.15 }).addTo(map);
        markerRef.current.on('dragend', ev => {
          const p = ev.target.getLatLng();
          circleRef.current.setLatLng(p);
          onChange({ lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) });
        });
      }
      onChange({ lat: +la.toFixed(7), lng: +ln.toFixed(7) });
    });

    return () => { map.remove(); instanceRef.current = null; };
  }, []);

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setRadius(radius || 100);
  }, [radius]);

  async function doSearch(e) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`${NOMINATIM}?q=${encodeURIComponent(search)}&format=json&limit=1`);
      const data = await r.json();
      if (!data.length) { alert('Location not found. Try a more specific address.'); return; }
      const { lat: la, lon: ln } = data[0];
      const map = instanceRef.current;
      map.setView([+la, +ln], 16);
      if (markerRef.current) {
        markerRef.current.setLatLng([+la, +ln]);
        circleRef.current.setLatLng([+la, +ln]);
      } else {
        markerRef.current = window.L.marker([+la, +ln], { draggable: true }).addTo(map);
        circleRef.current = window.L.circle([+la, +ln], { radius: radius || 100, color: '#22c55e', fillOpacity: 0.15 }).addTo(map);
        markerRef.current.on('dragend', ev => {
          const p = ev.target.getLatLng();
          circleRef.current.setLatLng(p);
          onChange({ lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) });
        });
      }
      onChange({ lat: +parseFloat(la).toFixed(7), lng: +parseFloat(ln).toFixed(7) });
    } catch { alert('Search failed. Try again.'); }
    finally { setSearching(false); }
  }

  return (
    <div>
      <form onSubmit={doSearch} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="form-input" placeholder="Search address or place..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={searching}>
          {searching ? '...' : '🔍 Search'}
        </button>
      </form>
      <div ref={mapRef} style={{ height: 320, borderRadius: 8, border: '1px solid var(--border)' }} />
      <div className="text-muted text-sm" style={{ marginTop: 4 }}>Click on the map or drag the pin to set the store location</div>
    </div>
  );
}
