import './leafletIconFix'
import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents, useMap } from 'react-leaflet'
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

const QUICK_LOCATIONS = [
  { name: 'Mehdipatnam',   lat: 17.3987, lng: 78.4364 },
  { name: 'Hitech City',   lat: 17.4454, lng: 78.3772 },
  { name: 'Secunderabad',  lat: 17.4399, lng: 78.4983 },
  { name: 'Ameerpet',      lat: 17.4375, lng: 78.4487 },
  { name: 'LB Nagar',      lat: 17.3472, lng: 78.5567 },
  { name: 'Dilsukhnagar',  lat: 17.3689, lng: 78.5270 },
  { name: 'Banjara Hills', lat: 17.4156, lng: 78.4347 },
  { name: 'Kondapur',      lat: 17.4600, lng: 78.3600 },
  { name: 'Uppal',         lat: 17.4050, lng: 78.5591 },
  { name: 'Begumpet',      lat: 17.4432, lng: 78.4681 },
]

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) })
  return null
}

// Fly to location on map
function MapFlyTo({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.5 })
  }, [position])
  return null
}

export default function App() {
  const [route,       setRoute]       = useState(null)
  const [origin,      setOrigin]      = useState(null)
  const [dest,        setDest]        = useState(null)
  const [distance,    setDistance]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [searching,   setSearching]   = useState(false)
  const [locating,    setLocating]    = useState(false)
  const [error,       setError]       = useState(null)
  const [offline,     setOffline]     = useState(!navigator.onLine)
  const [cityInput,   setCityInput]   = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSug,     setShowSug]     = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))
  }, [])

  // Search city name using Nominatim (OpenStreetMap geocoding — free, no API key)
  async function searchCity(query) {
    if (!query || query.length < 2) { setSuggestions([]); return }
    try {
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/search`,
        {
          params: {
            q: query + ', Hyderabad, India',
            format: 'json',
            limit: 5,
            countrycodes: 'in',
          },
          headers: { 'Accept-Language': 'en' }
        }
      )
      setSuggestions(res.data)
      setShowSug(true)
    } catch {
      setSuggestions([])
    }
  }

  // Debounce city search as user types
  function handleCityInput(e) {
    const val = e.target.value
    setCityInput(val)
    setShowSug(false)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchCity(val), 400)
  }

  // User selects a suggestion
  function handleSuggestionClick(sug) {
    setCityInput(sug.display_name.split(',')[0])
    setShowSug(false)
    setSuggestions([])
    const lat = parseFloat(sug.lat)
    const lng = parseFloat(sug.lon)
    getRoute(lat, lng)
  }

  // Get route from backend
  async function getRoute(lat, lng) {
    setOrigin([lat, lng])
    setLoading(true)
    setRoute(null)
    setDest(null)
    setDistance(null)
    setError(null)
    try {
      const res = await axios.post(`${API}/api/route`, { origin_lat: lat, origin_lng: lng })
      if (res.data.error) { setError(res.data.error); return }
      if (res.data.route && res.data.route.coordinates) {
        const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
        setRoute(coords)
        setDest(res.data.destination)
        setDistance(res.data.distance_km)
      }
    } catch {
      setError('Backend is waking up. Please wait 30 seconds and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle form submit (Enter key or Search button)
  async function handleSearchSubmit(e) {
    e.preventDefault()
    if (!cityInput.trim()) { setError('Please enter a location name.'); return }
    setSearching(true)
    setError(null)
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: cityInput + ', Hyderabad, India',
          format: 'json',
          limit: 1,
          countrycodes: 'in',
        },
        headers: { 'Accept-Language': 'en' }
      })
      if (res.data.length === 0) {
        setError(`Location "${cityInput}" not found. Try a different name or click the map.`)
        setSearching(false)
        return
      }
      const lat = parseFloat(res.data[0].lat)
      const lng = parseFloat(res.data[0].lon)
      setSearching(false)
      getRoute(lat, lng)
    } catch {
      setError('Could not search location. Check internet connection.')
      setSearching(false)
    }
  }

  // GPS button
  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported.'); return }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setCityInput('My GPS Location')
        getRoute(pos.coords.latitude, pos.coords.longitude)
      },
      () => { setError('GPS failed. Try clicking the map instead.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Map click
  function handleMapClick(lat, lng) {
    setCityInput(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`)
    getRoute(lat, lng)
  }

  // Clear everything
  function handleClear() {
    setRoute(null); setOrigin(null); setDest(null)
    setDistance(null); setError(null); setCityInput('')
    setSuggestions([]); setShowSug(false)
  }

  function statusMsg() {
    if (locating)  return '📡  Getting your GPS location...'
    if (searching) return '🔍  Searching for location...'
    if (loading)   return '⏳  Computing safest evacuation route...'
    if (error)     return '⚠️  ' + error
    if (dest && distance !== null) return `✅  Route found: ${distance} km → ${dest}`
    return '🗺️  Enter your area name or click the map to get evacuation route'
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Status bar */}
      <div style={{
        padding: '8px 20px', color: 'white', fontSize: '13px',
        background: offline ? '#922B21' : error ? '#784212' : dest ? '#1A5276' : '#1E8449',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 'bold' }}>{offline ? '🔴 OFFLINE MODE' : '🟢 LIVE MODE'}</span>
        <span>{statusMsg()}</span>
        <span style={{ fontSize: '11px', opacity: 0.8 }}>Dynamic Evacuation Cloud — Hyderabad</span>
      </div>

      {/* Search panel */}
      <div style={{ background: '#1C2833', color: 'white', padding: '14px 20px', borderBottom: '3px solid #E74C3C' }}>

        <div style={{ fontSize: '13px', color: '#E74C3C', fontWeight: 'bold', marginBottom: '10px', letterSpacing: '1px' }}>
          🚨 ENTER YOUR LOCATION TO GET EVACUATION ROUTE
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          {/* Search input with autocomplete */}
          <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
            <label style={{ fontSize: '11px', color: '#AED6F1', display: 'block', marginBottom: '4px' }}>
              📍 Your Location (area name, landmark, or address)
            </label>
            <input
              type="text"
              placeholder="e.g. Mehdipatnam, Ameerpet, Hitech City, Banjara Hills..."
              value={cityInput}
              onChange={handleCityInput}
              onFocus={() => suggestions.length > 0 && setShowSug(true)}
              autoComplete="off"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px',
                border: '2px solid #566573', background: '#2C3E50',
                color: 'white', fontSize: '14px', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {/* Autocomplete dropdown */}
            {showSug && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                background: '#2C3E50', border: '1px solid #566573', borderRadius: '0 0 8px 8px',
                maxHeight: '200px', overflowY: 'auto',
              }}>
                {suggestions.map((s, i) => (
                  <div key={i}
                    onClick={() => handleSuggestionClick(s)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                      color: '#AED6F1', borderBottom: '1px solid #566573',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    📍 {s.display_name.split(',').slice(0, 3).join(',')}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buttons */}
          <button type="submit" disabled={loading || searching}
            style={{
              padding: '10px 22px', borderRadius: '8px', border: 'none',
              background: loading || searching ? '#566573' : '#E74C3C',
              color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
            }}>
            {searching ? '🔍 Searching...' : loading ? '⏳ Routing...' : '🚨 Get Route'}
          </button>

          <button type="button" onClick={handleGPS} disabled={locating}
            style={{
              padding: '10px 16px', borderRadius: '8px', border: 'none',
              background: locating ? '#566573' : '#1A5276',
              color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
            }}>
            {locating ? '📡 Locating...' : '📍 Use GPS'}
          </button>

          <button type="button" onClick={handleClear}
            style={{
              padding: '10px 14px', borderRadius: '8px',
              border: '1px solid #566573', background: 'transparent',
              color: '#AED6F1', cursor: 'pointer', fontSize: '14px',
            }}>
            🗑️ Clear
          </button>
        </form>

        {/* Quick location chips */}
        <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#AED6F1' }}>Quick:</span>
          {QUICK_LOCATIONS.map((loc, i) => (
            <button key={i}
              onClick={() => { setCityInput(loc.name); getRoute(loc.lat, loc.lng) }}
              style={{
                padding: '4px 12px', borderRadius: '20px',
                border: '1px solid #566573', background: '#2C3E50',
                color: '#AED6F1', cursor: 'pointer', fontSize: '12px',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
              onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}
            >
              {loc.name}
            </button>
          ))}
        </div>

        {/* Result info bar */}
        {dest && distance !== null && (
          <div style={{
            marginTop: '10px', padding: '8px 14px', background: '#1A5276',
            borderRadius: '6px', display: 'flex', gap: '24px',
            fontSize: '13px', flexWrap: 'wrap',
          }}>
            <span>📍 <b>From:</b> {cityInput}</span>
            <span>🏥 <b>To:</b> {dest}</span>
            <span>📏 <b>Distance:</b> {distance} km</span>
            <span>🛡️ <b>Avoids:</b> all hazard zones</span>
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ flex: 1 }}>
        <MapContainer center={[17.4065, 78.4772]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          {origin && <MapFlyTo position={origin} />}

          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius}
              pathOptions={{ color: hz.color, fillColor: hz.color, fillOpacity: 0.3, weight: 2 }}>
              <Popup><b>⚠️ {hz.name}</b><br />Danger radius: {hz.radius}m<br /><span style={{ color: 'red', fontWeight: 'bold' }}>Avoid this area</span></Popup>
            </Circle>
          ))}

          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup><b>🟢 {sz.name}</b><br />Type: {sz.type}<br />Capacity: {sz.capacity.toLocaleString()} people<br /><span style={{ color: 'green', fontWeight: 'bold' }}>✅ Safe Zone</span></Popup>
            </Marker>
          ))}

          {origin && (
            <Marker position={origin}>
              <Popup><b>📍 Your Location</b><br />{cityInput}<br />{dest && <span style={{ color: 'blue' }}>→ {dest}</span>}</Popup>
            </Marker>
          )}

          {route && (
            <Polyline positions={route}
              pathOptions={{ color: '#27AE60', weight: 6, dashArray: '12 6', opacity: 0.9 }} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
