import './leafletIconFix'
import { useState, useEffect, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMapEvents,
  useMap
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import L from 'leaflet'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SAFE_ZONES = [
  { name: 'Golconda Grounds', pos: [17.3833, 78.4011] },
  { name: 'Parade Grounds', pos: [17.4360, 78.5012] },
  { name: 'HICC Grounds', pos: [17.4278, 78.3860] },
  { name: 'Nizam Institute', pos: [17.4239, 78.4484] },
  { name: 'Gandhi Hospital', pos: [17.4440, 78.4932] },
]

const HAZARD_ZONES = [
  { center: [17.4239, 78.4738], radius: 1000, name: 'Hussain Sagar Flood', color: '#E74C3C', type: 'Flood' },
  { center: [17.3616, 78.4747], radius: 800, name: 'Old City Industrial', color: '#E67E22', type: 'Chemical' },
  { center: [17.4454, 78.5279], radius: 600, name: 'Malkajgiri Fire', color: '#C0392B', type: 'Fire' },
]

// ── MAP HELPERS ─────────────────────────────────────────

function FlyTo({ pos }) {
  const map = useMap()
  useEffect(() => {
    if (pos) map.flyTo(pos, 14)
  }, [pos, map])
  return null
}

function FitRoute({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords && coords.length > 1) {
      map.fitBounds(coords, { padding: [50, 50] })
    }
  }, [coords, map])
  return null
}

function MapClicker({ mode, onFrom, onTo }) {
  useMapEvents({
    click(e) {
      if (mode === 'from') onFrom([e.latlng.lat, e.latlng.lng])
      if (mode === 'to') onTo([e.latlng.lat, e.latlng.lng])
    }
  })
  return null
}

// ── MAIN ─────────────────────────────────────────

export default function App() {
  const [fromPos, setFromPos] = useState(null)
  const [toPos, setToPos] = useState(null)
  const [route, setRoute] = useState(null)
  const [fitRoute, setFitRoute] = useState(null)
  const [flyTo, setFlyTo] = useState(null)

  // ── GET ROUTE ─────────────────────────
  async function handleGetRoute() {
    if (!fromPos) return alert('Select FROM location')

    try {
      const res = await axios.post(`${API}/api/route`, {
        origin_lat: fromPos[0],
        origin_lng: fromPos[1],
      })

      const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])

      setRoute(coords)
      setFitRoute(coords)
    } catch (e) {
      alert('Error getting route')
    }
  }

  function handleClear() {
    setFromPos(null)
    setToPos(null)
    setRoute(null)
    setFitRoute(null)
  }

  // ── UI ─────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Controls */}
      <div style={{ padding: 10, background: '#1C2833', color: 'white' }}>
        <button onClick={() => setFromPos([17.4375, 78.4487])}>Set FROM (Ameerpet)</button>
        <button onClick={() => setToPos([17.4440, 78.4932])}>Set TO (Hospital)</button>
        <button onClick={handleGetRoute}>Get Route</button>
        <button onClick={handleClear}>Clear</button>
      </div>

      {/* Map */}
      <MapContainer center={[17.385, 78.4867]} zoom={12} style={{ flex: 1 }}>

        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* 🔴 ROUTE */}
        {route && (
          <Polyline
            positions={route}
            pathOptions={{ color: '#E74C3C', weight: 5 }}
          />
        )}

        {/* ⚠️ HAZARD ZONES */}
        {HAZARD_ZONES.map((hz, i) => (
          <Circle
            key={i}
            center={hz.center}
            radius={hz.radius}
            pathOptions={{
              color: hz.color,
              fillColor: hz.color,
              fillOpacity: 0.3
            }}
          >
            <Popup>
              ⚠️ {hz.name} <br />
              Type: {hz.type}
            </Popup>
          </Circle>
        ))}

        {/* 📍 MARKERS */}
        {fromPos && (
          <Marker position={fromPos}>
            <Popup>📍 Start</Popup>
          </Marker>
        )}

        {toPos && (
          <Marker position={toPos}>
            <Popup>🏥 Destination</Popup>
          </Marker>
        )}

        {/* Helpers */}
        <FlyTo pos={flyTo} />
        <FitRoute coords={fitRoute} />
        <MapClicker
          mode={null}
          onFrom={setFromPos}
          onTo={setToPos}
        />

      </MapContainer>
    </div>
  )
        }
