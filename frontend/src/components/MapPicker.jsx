import { useEffect, useRef, useState } from 'react';

export default function MapPicker({ lat, lng, radius, onChange }) {
  const containerRef = useRef(null);
  const stateRef = useRef({ map: null, marker: null, circle: null });
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const L = window.L;
    if (!L || !containerRef.current || stateRef.current.map) return;

    const initLat = lat || 25.2048;
    const initLng = lng || 55.2708;
    const zoom = lat ? 15 : 10;

    const map = L.map(containerRef.current).setView([initLat, initLng], zoom);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 20
    }).addTo(map);

    let marker = null;
    let circle = null;

    function placePin(newLat, newLng) {
      if (marker) {
        marker.setLatLng([newLat, newLng]);
        circle.setLatLng([newLat, newLng]);
      } else {
        marker = L.marker([newLat, newLng], { draggable: true }).addTo(map);
        circle = L.circle([newLat, newLng], {
          radius: radius || 100,
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 0.1,
          weight: 2
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          circle.setLatLng(pos);
          onChange({ lat: parseFloat(pos.lat.toFixed(7)), lng: parseFloat(pos.lng.toFixed(7)) });
        });

        stateRef.current.marker = marker;
        stateRef.current.circle = circle;
      }
      onChange({ lat: parseFloat(newLat.toFixed(7)), lng: parseFloat(newLng.toFixed(7)) });
    }

    if (lat && lng) placePin(lat, lng);

    map.on('click', e => placePin(e.latlng.lat, e.latlng.lng));

    stateRef.current.map = map;

    return () => {
      map.remove();
      stateRef.current = { map: null, marker: null, circle: null };
    };
  }, []);

  // Update circle radius live
  useEffect(() => {
    if (stateRef.current.circle) {
      stateRef.current.circle.setRadius(radius || 100);
    }
  }, [radius]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const { lat: foundLat, lon: foundLng } = data[0];
        const L = window.L;
        stateRef.current.map.setView([foundLat, foundLng], 16);
        onChange({ lat: parseFloat(parseFloat(foundLat).toFixed(7)), lng: parseFloat(parseFloat(foundLng).toFixed(7)) });
        // Trigger a synthetic click to place pin
        if (stateRef.current.marker) {
          stateRef.current.marker.setLatLng([foundLat, foundLng]);
          stateRef.current.circle?.setLatLng([foundLat, foundLng]);
        } else {
          stateRef.current.map.fire('click', { latlng: L.latLng(foundLat, foundLng) });
        }
      } else {
        alert('Location not found. Try a more specific address.');
      }
    } catch {
      alert('Search failed. Try clicking on the map directly.');
    }
    setSearching(false);
  }

  return (
    <div>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          className="form-input"
          placeholder="Search location (e.g. Dubai Mall, Abu Dhabi)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={searching} style={{ whiteSpace: 'nowrap' }}>
          {searching ? '...' : 'Search'}
        </button>
      </form>
      <div
        ref={containerRef}
        style={{ height: 300, width: '100%', borderRadius: 8, border: '1px solid var(--border)', zIndex: 0 }}
      />
      <p className="text-muted text-sm" style={{ marginTop: 6 }}>
        Click on the map to place the store pin. Drag the pin to adjust. The green circle shows the check-in radius.
      </p>
    </div>
  );
}
