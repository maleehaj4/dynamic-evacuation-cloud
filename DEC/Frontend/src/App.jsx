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

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function App() {
  const [route,    setRoute]    = useState(null)
  const [origin,   setOrigin]   = useState(null)
  const [dest,     setDest]     = useState(null)
  const [distance, setDistance] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [offline,  setOffline]  = useState(!navigator.onLine)

  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))
  }, [])

  async function handleMapClick(lat, lng) {
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

    } catch (err) {
      setError('Backend unreachable — wake it up at evac-cloud-api-5.onrender.com/api/health')
    } finally {
      setLoading(false)
    }
  }

  // Status bar message
  function statusMsg() {
    if (loading) return '⏳  Computing safest evacuation route...'
    if (error)   return '⚠️  ' + error
    if (dest && distance !== null)
      return `✅  Route found: ${distance} km to ${dest}`
    if (dest)
      return `✅  Routed to: ${dest}`
    return '🗺️  Click anywhere on the map to get your evacuation route'
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>

      {/* ── Status bar ── */}
      <div style={{
        padding: '10px 20px',
        background: offline ? '#922B21' : error ? '#784212' : dest ? '#1A5276' : '#1E8449',
        color: 'white',
        fontSize: '14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>{offline ? '🔴 OFFLINE MODE — Using cached routes' : '🟢 LIVE MODE'}</span>
        <span style={{ fontWeight: 'bold' }}>{statusMsg()}</span>
        <span style={{ fontSize: '12px', opacity: 0.8 }}>Dynamic Evacuation Cloud — Hyderabad</span>
      </div>

      {/* ── Info panel shown after route found ── */}
      {dest && distance !== null && (
        <div style={{
          padding: '8px 20px',
          background: '#D6EAF8',
          borderBottom: '2px solid #1A5276',
          display: 'flex',
          gap: '30px',
          fontSize: '13px',
          color: '#1C2833',
        }}>
          <span>📍 <b>Origin:</b> {origin && `${origin[0].toFixed(4)}°N, ${origin[1].toFixed(4)}°E`}</span>
          <span>🏥 <b>Destination:</b> {dest}</span>
          <span>📏 <b>Distance:</b> {distance} km</span>
          <span>🛣️ <b>Route:</b> Safety-weighted (avoids hazard zones)</span>
        </div>
      )}

      {/* ── Map ── */}
      <div style={{ flex: 1 }}>
        <MapContainer
          center={[17.4065, 78.4772]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
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
                <span style={{ color: 'red' }}>Avoid this area</span>
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
                <span style={{ color: 'green' }}>✅ Safe Zone</span>
              </Popup>
            </Marker>
          ))}

          {/* User location marker */}
          {origin && (
            <Marker position={origin}>
              <Popup>
                <b>📍 Your Location</b><br />
                {origin[0].toFixed(4)}°N, {origin[1].toFixed(4)}°E<br />
                {dest && `→ Routing to: ${dest}`}
              </Popup>
            </Marker>
          )}

          {/* Evacuation route */}
          {route && (
            <Polyline
              positions={route}
              pathOptions={{ color: '#27AE60', weight: 5, dashArray: '10 5', opacity: 0.9 }}
            />
          )}

        </MapContainer>
      </div>
    </div>
  )
}

