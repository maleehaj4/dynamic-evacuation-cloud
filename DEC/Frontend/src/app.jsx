import './leafletIconFix'
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SAFE_ZONES = [
  { name: 'Golconda Grounds', pos: [17.3833, 78.4011] },
  { name: 'Parade Grounds',   pos: [17.4360, 78.5012] },
  { name: 'HICC Grounds',     pos: [17.4278, 78.3860] },
  { name: 'Nizam Institute',  pos: [17.4239, 78.4484] },
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
  const [route,   setRoute]   = useState(null)
  const [origin,  setOrigin]  = useState(null)
  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))
  }, [])

  async function handleMapClick(lat, lng) {
    setOrigin([lat, lng])
    setLoading(true)
    setRoute(null)
    try {
      const res = await axios.post(`${API}/api/route`, { origin_lat: lat, origin_lng: lng })
      if (res.data.route) {
        const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
        setRoute(coords)
        setInfo({ km: res.data.distance_km, dest: res.data.destination })
      }
    } catch {
      setInfo({ error: 'Could not get route' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 20px', background: offline ? '#E74C3C' : '#1E8449', color: 'white', fontSize: '14px', fontFamily: 'sans-serif' }}>
        {offline ? '🔴 OFFLINE MODE' : '🟢 LIVE MODE — Click map to get evacuation route'}
        {loading && ' · Computing route...'}
        {info && !info.error && ` · ${info.km} km to ${info.dest}`}
        {info?.error && ` · ${info.error}`}
      </div>
      <div style={{ flex: 1 }}>
        <MapContainer center={[17.4065, 78.4772]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <MapClickHandler onMapClick={handleMapClick} />
          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius} pathOptions={{ color: hz.color, fillOpacity: 0.3 }}>
              <Popup>⚠️ {hz.name}</Popup>
            </Circle>
          ))}
          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup>🟢 {sz.name}</Popup>
            </Marker>
          ))}
          {origin && <Marker position={origin}><Popup>📍 You are here</Popup></Marker>}
          {route && <Polyline positions={route} pathOptions={{ color: '#27AE60', weight: 5, dashArray: '10 5' }} />}
        </MapContainer>
      </div>
    </div>
  )
}
