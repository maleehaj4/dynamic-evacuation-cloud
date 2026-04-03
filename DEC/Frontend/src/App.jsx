import './leafletIconFix'
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SAFE_ZONES = [
  { name: 'Golconda Grounds',  pos: [17.3833, 78.4011], capacity: 3000,  type: 'Open Ground' },
  { name: 'Parade Grounds',    pos: [17.4360, 78.5012], capacity: 10000, type: 'Open Ground' },
  { name: 'HICC Grounds',      pos: [17.4278, 78.3860], capacity: 5000,  type: 'Shelter'     },
  { name: 'Nizam Institute',   pos: [17.4239, 78.4484], capacity: 500,   type: 'Hospital'    },
  { name: 'Gandhi Hospital',   pos: [17.4440, 78.4932], capacity: 800,   type: 'Hospital'    },
]

const HAZARD_ZONES = [
  { center: [17.4239, 78.4738], radius: 1000, name: 'Hussain Sagar Flood', color: '#E74C3C' },
  { center: [17.3616, 78.4747], radius: 800,  name: 'Old City Industrial',  color: '#E67E22' },
  { center: [17.4454, 78.5279], radius: 600,  name: 'Malkajgiri Fire',      color: '#E74C3C' },
]

// Popular Hyderabad locations for quick selection
const QUICK_LOCATIONS = [
  { name: 'Mehdipatnam',   lat: 17.3987, lng: 78.4364 },
  { name: 'Hitech City',   lat: 17.4454, lng: 78.3772 },
  { name: 'Secunderabad',  lat: 17.4399, lng: 78.4983 },
  { name: 'Ameerpet',      lat: 17.4375, lng: 78.4487 },
  { name: 'LB Nagar',      lat: 17.3472, lng: 78.5567 },
  { name: 'Dilsukhnagar',  lat: 17.3689, lng: 78.5270 },
  { name: 'Banjara Hills', lat: 17.4156, lng: 78.4347 },
  { name: 'Kondapur',      lat: 17.4600, lng: 78.3600 },
]

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function App() {
  const [route,     setRoute]     = useState(null)
  const [origin,    setOrigin]    = useState(null)
  const [dest,      setDest]      = useState(null)
  const [distance,  setDistance]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [offline,   setOffline]   = useState(!navigator.onLine)
  const [inputLat,  setInputLat]  = useState('')
  const [inputLng,  setInputLng]  = useState('')
  const [locating,  setLocating]  = useState(false)
  const [mapRef,    setMapRef]    = useState(null)

  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))
  }, [])

  async function getRoute(lat, lng) {
    setOrigin([lat, lng])
    setLoading(true)
    setRoute(null)
    setDest(null)
    setDistance(null)
    setError(null)

    try {
      const res = await axios.post(`${API}/api/route`, {
        origin_lat: lat,
        origin_lng: lng,
      })

      if (res.data.error) {
        setError(res.data.error)
        return
      }

      if (res.data.route && res.data.route.coordinates) {
        const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
        setRoute(coords)
        setDest(res.data.destination)
        setDistance(res.data.distance_km)
      }
    } catch {
      setError('Backend unreachable. Open evac-cloud-api-5.onrender.com/api/health to wake it up.')
    } finally {
      setLoading(false)
    }
  }

  // Handle map click
  function handleMapClick(lat, lng) {
    setInputLat(lat.toFixed(6))
    setInputLng(lng.toFixed(6))
    getRoute(lat, lng)
  }

  // Handle manual coordinate input
  function handleManualSubmit(e) {
    e.preventDefault()
    const lat = parseFloat(inputLat)
    const lng = parseFloat(inputLng)
    if (isNaN(lat) || isNaN(lng)) {
      setError('Please enter valid latitude and longitude numbers.')
      return
    }
    if (lat < 17.2 || lat > 17.7 || lng < 78.2 || lng > 78.8) {
      setError('Coordinates are outside Hyderabad area. Lat: 17.2-17.7, Lng: 78.2-78.8')
      return
    }
    getRoute(lat, lng)
  }

  // Handle GPS button
  function handleGetGPS() {
    if (!navigator.geolocation) {
      setError('GPS not supported on this device.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setInputLat(lat.toFixed(6))
        setInputLng(lng.toFixed(6))
        setLocating(false)
        getRoute(lat, lng)
      },
      () => {
        setError('Could not get GPS location. Enter coordinates manually.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Handle quick location buttons
  function handleQuickLocation(loc) {
    setInputLat(loc.lat.toFixed(6))
    setInputLng(loc.lng.toFixed(6))
    getRoute(loc.lat, loc.lng)
  }

  function statusMsg() {
    if (locating) return '📡  Getting your GPS location...'
    if (loading)  return '⏳  Computing safest evacuation route...'
    if (error)    return '⚠️  ' + error
    if (dest && distance !== null) return `✅  Route found: ${distance} km → ${dest}`
    return '🗺️  Enter your location or click the map to get evacuation route'
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* ── Top status bar ── */}
      <div style={{
        padding: '8px 20px',
        background: offline ? '#922B21' : error ? '#784212' : dest ? '#1A5276' : '#1E8449',
        color: 'white', fontSize: '13px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 'bold' }}>
          {offline ? '🔴 OFFLINE MODE' : '🟢 LIVE MODE'}
        </span>
        <span>{statusMsg()}</span>
        <span style={{ fontSize: '11px', opacity: 0.8 }}>Dynamic Evacuation Cloud — Hyderabad</span>
      </div>

      {/* ── Input panel ── */}
      <div style={{
        background: '#1C2833', color: 'white',
        padding: '12px 20px', borderBottom: '3px solid #E74C3C',
      }}>

        {/* Title */}
        <div style={{ fontSize: '13px', color: '#AED6F1', marginBottom: '10px', fontWeight: 'bold' }}>
          🚨 ENTER YOUR LOCATION TO GET EVACUATION ROUTE
        </div>

        {/* Input form */}
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '11px', color: '#AED6F1' }}>Latitude (e.g. 17.3987)</label>
            <input
              type="number"
              step="any"
              placeholder="17.3987"
              value={inputLat}
              onChange={e => setInputLat(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: '6px', border: '1px solid #566573',
                background: '#2C3E50', color: 'white', fontSize: '14px', width: '160px',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '11px', color: '#AED6F1' }}>Longitude (e.g. 78.4364)</label>
            <input
              type="number"
              step="any"
              placeholder="78.4364"
              value={inputLng}
              onChange={e => setInputLng(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: '6px', border: '1px solid #566573',
                background: '#2C3E50', color: 'white', fontSize: '14px', width: '160px',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '11px', color: 'transparent' }}>.</label>
            <button type="submit" disabled={loading}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: 'none',
                background: loading ? '#566573' : '#E74C3C',
                color: 'white', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
              }}>
              {loading ? '⏳ Computing...' : '🚨 Get Route'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '11px', color: 'transparent' }}>.</label>
            <button type="button" onClick={handleGetGPS} disabled={locating}
              style={{
                padding: '8px 16px', borderRadius: '6px', border: 'none',
                background: locating ? '#566573' : '#1A5276',
                color: 'white', fontWeight: 'bold', cursor: locating ? 'not-allowed' : 'pointer',
                fontSize: '14px',
              }}>
              {locating ? '📡 Locating...' : '📍 Use My GPS'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '11px', color: 'transparent' }}>.</label>
            <button type="button"
              onClick={() => { setRoute(null); setOrigin(null); setDest(null); setDistance(null); setError(null); setInputLat(''); setInputLng('') }}
              style={{
                padding: '8px 16px', borderRadius: '6px', border: '1px solid #566573',
                background: 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '14px',
              }}>
              🗑️ Clear
            </button>
          </div>

        </form>

        {/* Quick location buttons */}
        <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#AED6F1', marginRight: '4px' }}>Quick select:</span>
          {QUICK_LOCATIONS.map((loc, i) => (
            <button key={i} onClick={() => handleQuickLocation(loc)}
              style={{
                padding: '4px 10px', borderRadius: '12px', border: '1px solid #566573',
                background: '#2C3E50', color: '#AED6F1', cursor: 'pointer',
                fontSize: '12px', transition: 'all 0.2s',
              }}
              onMouseOver={e => e.target.style.background = '#1A5276'}
              onMouseOut={e => e.target.style.background = '#2C3E50'}
            >
              {loc.name}
            </button>
          ))}
        </div>

        {/* Info panel after route found */}
        {dest && distance !== null && (
          <div style={{
            marginTop: '10px', padding: '8px 14px', background: '#1A5276',
            borderRadius: '6px', display: 'flex', gap: '24px',
            fontSize: '13px', flexWrap: 'wrap',
          }}>
            <span>📍 <b>From:</b> {origin && `${origin[0].toFixed(4)}°N, ${origin[1].toFixed(4)}°E`}</span>
            <span>🏥 <b>To:</b> {dest}</span>
            <span>📏 <b>Distance:</b> {distance} km</span>
            <span>🛡️ <b>Route avoids:</b> all hazard zones</span>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1 }}>
        <MapContainer
          center={[17.4065, 78.4772]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          ref={setMapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          <MapClickHandler onMapClick={handleMapClick} />

          {/* Hazard zones */}
          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius}
              pathOptions={{ color: hz.color, fillColor: hz.color, fillOpacity: 0.3, weight: 2 }}>
              <Popup>
                <b>⚠️ {hz.name}</b><br />
                Danger radius: {hz.radius}m<br />
                <span style={{ color: 'red', fontWeight: 'bold' }}>Avoid this area</span>
              </Popup>
            </Circle>
          ))}

          {/* Safe zone markers */}
          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup>
                <b>🟢 {sz.name}</b><br />
                Type: {sz.type}<br />
                Capacity: {sz.capacity.toLocaleString()} people<br />
                <span style={{ color: 'green', fontWeight: 'bold' }}>✅ Evacuation Safe Zone</span>
              </Popup>
            </Marker>
          ))}

          {/* User location marker */}
          {origin && (
            <Marker position={origin}>
              <Popup>
                <b>📍 Your Location</b><br />
                {origin[0].toFixed(4)}°N, {origin[1].toFixed(4)}°E<br />
                {dest && <span style={{ color: 'blue' }}>→ Routed to: {dest}</span>}
              </Popup>
            </Marker>
          )}

          {/* Evacuation route line */}
          {route && (
            <Polyline
              positions={route}
              pathOptions={{ color: '#27AE60', weight: 6, dashArray: '12 6', opacity: 0.9 }}
            />
          )}

        </MapContainer>
      </div>

    </div>
  )
}

