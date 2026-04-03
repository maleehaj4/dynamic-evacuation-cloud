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
  { center: [17.4239, 78.4738], radius: 1000, name: 'Hussain Sagar Flood', color: '#E74C3C', type: 'Flood' },
  { center: [17.3616, 78.4747], radius: 800,  name: 'Old City Industrial',  color: '#E67E22', type: 'Chemical' },
  { center: [17.4454, 78.5279], radius: 600,  name: 'Malkajgiri Fire',      color: '#C0392B', type: 'Fire' },
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
]

// ── Voice Alert System ───────────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang  = 'en-IN'
  utt.rate  = 0.9
  utt.pitch = 1.1
  utt.volume = 1
  window.speechSynthesis.speak(utt)
}

// ── Geocode a place name → {lat, lng} using OpenStreetMap Nominatim ──────────
async function geocode(query) {
  const res = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: query + ', Hyderabad, India', format: 'json', limit: 1, countrycodes: 'in' },
    headers: { 'Accept-Language': 'en' }
  })
  if (!res.data.length) throw new Error(`Location "${query}" not found. Try a different name.`)
  return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon), display: res.data[0].display_name.split(',').slice(0,2).join(',') }
}

// ── Autocomplete hook ────────────────────────────────────────────────────────
function useAutocomplete(query) {
  const [suggestions, setSuggestions] = useState([])
  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    if (!query || query.length < 2) { setSuggestions([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: query + ', Hyderabad, India', format: 'json', limit: 5, countrycodes: 'in' },
          headers: { 'Accept-Language': 'en' }
        })
        setSuggestions(res.data)
      } catch { setSuggestions([]) }
    }, 400)
  }, [query])
  return [suggestions, setSuggestions]
}

// ── Fly map to position ──────────────────────────────────────────────────────
function MapFlyTo({ position }) {
  const map = useMap()
  useEffect(() => { if (position) map.flyTo(position, 14, { duration: 1.2 }) }, [position])
  return null
}

function MapClickHandler({ onFromClick, onToClick, clickMode }) {
  useMapEvents({
    click: (e) => {
      if (clickMode === 'from') onFromClick(e.latlng.lat, e.latlng.lng)
      else if (clickMode === 'to') onToClick(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

// ── Location Input Component ─────────────────────────────────────────────────
function LocationInput({ label, icon, color, value, onChange, onSelect, onGPS, placeholder, quickLocations, isActive, onActivate }) {
  const [suggestions, setSuggestions] = useAutocomplete(value)
  const [showSug, setShowSug] = useState(false)

  useEffect(() => { setShowSug(suggestions.length > 0) }, [suggestions])

  return (
    <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
      <label style={{ fontSize: '11px', color, fontWeight: 'bold', display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>
        {icon} {label}
        {isActive && <span style={{ marginLeft: '8px', fontSize: '10px', color: '#F39C12' }}>← Click map to set</span>}
      </label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); setShowSug(false) }}
          onFocus={() => { onActivate(); setShowSug(suggestions.length > 0) }}
          onBlur={() => setTimeout(() => setShowSug(false), 200)}
          autoComplete="off"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: '8px',
            border: `2px solid ${isActive ? color : '#566573'}`,
            background: '#2C3E50', color: 'white', fontSize: '14px', outline: 'none',
          }}
        />
        {onGPS && (
          <button type="button" onClick={onGPS} title="Use GPS"
            style={{ padding: '9px 12px', borderRadius: '8px', border: 'none', background: '#1A5276', color: 'white', cursor: 'pointer', fontSize: '14px' }}>
            📡
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showSug && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#2C3E50', border: `1px solid ${color}`, borderRadius: '0 0 8px 8px',
          maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {suggestions.map((s, i) => (
            <div key={i}
              onMouseDown={() => { onSelect(s.display_name.split(',').slice(0,2).join(','), parseFloat(s.lat), parseFloat(s.lon)); setSuggestions([]); setShowSug(false) }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: '#AED6F1', borderBottom: '1px solid #566573' }}
              onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              {icon} {s.display_name.split(',').slice(0,3).join(',')}
            </div>
          ))}
        </div>
      )}

      {/* Quick chips */}
      {quickLocations && (
        <div style={{ marginTop: '6px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {quickLocations.map((loc, i) => (
            <button key={i} type="button"
              onMouseDown={() => onSelect(loc.name, loc.lat, loc.lng)}
              style={{ padding: '3px 10px', borderRadius: '20px', border: `1px solid ${color}44`, background: '#2C3E50', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}
              onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
              onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [fromText,   setFromText]   = useState('')
  const [toText,     setToText]     = useState('')
  const [fromPos,    setFromPos]    = useState(null)
  const [toPos,      setToPos]      = useState(null)
  const [route,      setRoute]      = useState(null)
  const [distance,   setDistance]   = useState(null)
  const [destName,   setDestName]   = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [offline,    setOffline]    = useState(!navigator.onLine)
  const [clickMode,  setClickMode]  = useState(null)  // 'from' | 'to' | null
  const [voiceOn,    setVoiceOn]    = useState(true)
  const [flyTo,      setFlyTo]      = useState(null)
  const [activeInput,setActiveInput] = useState(null)

  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))
  }, [])

  // ── Set FROM location ──────────────────────────────────────────────────────
  function setFrom(name, lat, lng) {
    setFromText(name)
    setFromPos([lat, lng])
    setFlyTo([lat, lng])
    setClickMode(null)
  }

  // ── Set TO location ────────────────────────────────────────────────────────
  function setTo(name, lat, lng) {
    setToText(name)
    setToPos([lat, lng])
    setFlyTo([lat, lng])
    setClickMode(null)
  }

  // ── Handle map click ───────────────────────────────────────────────────────
  function handleFromClick(lat, lng) {
    setFromText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`)
    setFromPos([lat, lng])
    setClickMode(null)
  }

  function handleToClick(lat, lng) {
    setToText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`)
    setToPos([lat, lng])
    setClickMode(null)
  }

  // ── GPS for FROM ───────────────────────────────────────────────────────────
  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported.'); return }
    setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => { setFrom('My GPS Location', pos.coords.latitude, pos.coords.longitude) },
      ()  => setError('GPS failed. Click the map to set your location.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── Check if route passes near hazard zones ─────────────────────────────
  function checkHazardsOnRoute(coords) {
    const warnings = []
    coords.forEach(([lat, lng]) => {
      HAZARD_ZONES.forEach(hz => {
        const dlat = lat - hz.center[0]
        const dlng = lng - hz.center[1]
        const dist = Math.sqrt(dlat*dlat + dlng*dlng) * 111000
        if (dist < hz.radius * 1.5) {
          if (!warnings.find(w => w.name === hz.name)) warnings.push(hz)
        }
      })
    })
    return warnings
  }

  // ── Compute route ──────────────────────────────────────────────────────────
  async function handleGetRoute(e) {
    e && e.preventDefault()
    setError(null)

    // Geocode FROM if not already a position
    let fLat = fromPos ? fromPos[0] : null
    let fLng = fromPos ? fromPos[1] : null
    let tLat = toPos   ? toPos[0]   : null
    let tLng = toPos   ? toPos[1]   : null

    try {
      setLoading(true)
      if (!fLat && fromText) {
        const g = await geocode(fromText)
        fLat = g.lat; fLng = g.lng
        setFromPos([fLat, fLng])
      }
      if (!tLat && toText) {
        const g = await geocode(toText)
        tLat = g.lat; tLng = g.lng
        setToPos([tLat, tLng])
      }
      if (!fLat || !fLng) { setError('Please enter your FROM location.'); setLoading(false); return }

      // Call backend API
      const res = await axios.post(`${API}/api/route`, {
        origin_lat: fLat,
        origin_lng: fLng,
      })

      if (res.data.error) { setError(res.data.error); setLoading(false); return }

      const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
      setRoute(coords)
      setDistance(res.data.distance_km)
      setDestName(toText || res.data.destination)
      setFlyTo([fLat, fLng])

      // ── Voice alerts ─────────────────────────────────────────────────────
      if (voiceOn) {
        const hazardsNearby = checkHazardsOnRoute(coords)
        setTimeout(() => {
          speak(`Evacuation route found. Distance ${res.data.distance_km} kilometres to ${toText || res.data.destination}.`)
        }, 500)
        hazardsNearby.forEach((hz, i) => {
          setTimeout(() => {
            speak(`Warning! ${hz.name} ahead. ${hz.type} hazard detected. Please avoid this area. Route has been adjusted to bypass the danger zone.`)
          }, 2500 + i * 4000)
        })
        setTimeout(() => {
          speak(`Proceed safely. Follow the green route on your screen. Stay away from red marked areas.`)
        }, 2500 + hazardsNearby.length * 4000)
      }

    } catch (err) {
      setError(err.message || 'Could not compute route. Backend may be waking up — wait 30 seconds.')
    } finally {
      setLoading(false)
    }
  }

  // ── Clear all ──────────────────────────────────────────────────────────────
  function handleClear() {
    setFromText(''); setToText(''); setFromPos(null); setToPos(null)
    setRoute(null); setDistance(null); setDestName(null); setError(null)
    setClickMode(null); window.speechSynthesis && window.speechSynthesis.cancel()
  }

  function statusMsg() {
    if (loading)  return '⏳  Computing safest evacuation route...'
    if (error)    return '⚠️  ' + error
    if (destName && distance !== null) return `✅  Route: ${distance} km  →  ${destName}`
    if (clickMode === 'from') return '👆  Click on the map to set your FROM location'
    if (clickMode === 'to')   return '👆  Click on the map to set your TO location'
    return '🗺️  Enter FROM and TO locations, then click Get Route'
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* ── Status bar ── */}
      <div style={{
        padding: '7px 20px', color: 'white', fontSize: '13px',
        background: offline ? '#922B21' : error ? '#784212' : destName ? '#1A5276' : '#1E8449',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 'bold' }}>{offline ? '🔴 OFFLINE' : '🟢 LIVE MODE'}</span>
        <span>{statusMsg()}</span>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => setVoiceOn(v => !v)} style={{ background: 'transparent', border: '1px solid white', color: 'white', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px' }}>
            {voiceOn ? '🔊 Voice ON' : '🔇 Voice OFF'}
          </button>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>Dynamic Evacuation Cloud — Hyderabad</span>
        </div>
      </div>

      {/* ── Input panel ── */}
      <div style={{ background: '#1C2833', color: 'white', padding: '14px 20px', borderBottom: '3px solid #E74C3C' }}>

        <div style={{ fontSize: '13px', color: '#E74C3C', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '1px' }}>
          🚨 ENTER YOUR LOCATIONS TO GET EVACUATION ROUTE
        </div>

        <form onSubmit={handleGetRoute}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* FROM input */}
            <LocationInput
              label="FROM — Your Current Location"
              icon="📍"
              color="#27AE60"
              value={fromText}
              onChange={setFromText}
              onSelect={(name, lat, lng) => setFrom(name, lat, lng)}
              onGPS={handleGPS}
              placeholder="e.g. Mehdipatnam, Ameerpet..."
              quickLocations={QUICK_LOCATIONS.slice(0, 5)}
              isActive={clickMode === 'from'}
              onActivate={() => setActiveInput('from')}
            />

            {/* Arrow */}
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '22px', color: '#E74C3C', fontSize: '24px', fontWeight: 'bold' }}>→</div>

            {/* TO input */}
            <LocationInput
              label="TO — Destination / Safe Zone"
              icon="🏥"
              color="#3498DB"
              value={toText}
              onChange={setToText}
              onSelect={(name, lat, lng) => setTo(name, lat, lng)}
              placeholder="e.g. Parade Grounds, Hospital, Shelter..."
              quickLocations={SAFE_ZONES.map(sz => ({ name: sz.name, lat: sz.pos[0], lng: sz.pos[1] }))}
              isActive={clickMode === 'to'}
              onActivate={() => setActiveInput('to')}
            />

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '18px' }}>
              <button type="submit" disabled={loading}
                style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: loading ? '#566573' : '#E74C3C', color: 'white', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>
                {loading ? '⏳ Computing...' : '🚨 Get Route'}
              </button>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button"
                  onClick={() => setClickMode(clickMode === 'from' ? null : 'from')}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${clickMode === 'from' ? '#27AE60' : '#566573'}`, background: clickMode === 'from' ? '#1E8449' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '12px' }}>
                  📍 Click From
                </button>
                <button type="button"
                  onClick={() => setClickMode(clickMode === 'to' ? null : 'to')}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${clickMode === 'to' ? '#3498DB' : '#566573'}`, background: clickMode === 'to' ? '#1A5276' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '12px' }}>
                  🏥 Click To
                </button>
                <button type="button" onClick={handleClear}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #566573', background: 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '12px' }}>
                  🗑️ Clear
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Route result bar */}
        {destName && distance !== null && (
          <div style={{ marginTop: '10px', padding: '8px 14px', background: '#1A5276', borderRadius: '6px', display: 'flex', gap: '20px', fontSize: '13px', flexWrap: 'wrap' }}>
            <span>📍 <b>From:</b> {fromText}</span>
            <span>🏥 <b>To:</b> {destName}</span>
            <span>📏 <b>Distance:</b> {distance} km</span>
            <span>🛡️ <b>Route avoids all hazard zones</b></span>
            <button onClick={() => voiceOn && speak(`Route from ${fromText} to ${destName}. Distance ${distance} kilometres. Follow the green line. Avoid all red marked danger zones.`)}
              style={{ padding: '2px 10px', borderRadius: '4px', border: 'none', background: '#27AE60', color: 'white', cursor: 'pointer', fontSize: '12px' }}>
              🔊 Repeat Voice
            </button>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1 }}>
        <MapContainer center={[17.4065, 78.4772]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
          <MapClickHandler onFromClick={handleFromClick} onToClick={handleToClick} clickMode={clickMode} />
          {flyTo && <MapFlyTo position={flyTo} />}

          {/* Hazard zones */}
          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius}
              pathOptions={{ color: hz.color, fillColor: hz.color, fillOpacity: 0.3, weight: 2 }}>
              <Popup>
                <b>⚠️ {hz.name}</b><br />
                Type: {hz.type}<br />
                Danger radius: {hz.radius}m<br />
                <span style={{ color: 'red', fontWeight: 'bold' }}>🔊 Voice alert will warn you</span>
              </Popup>
            </Circle>
          ))}

          {/* Safe zones */}
          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup>
                <b>🟢 {sz.name}</b><br />
                Type: {sz.type}<br />
                Capacity: {sz.capacity.toLocaleString()} people<br />
                <button onClick={() => setTo(sz.name, sz.pos[0], sz.pos[1])}
                  style={{ marginTop: '6px', padding: '4px 10px', background: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  Set as Destination
                </button>
              </Popup>
            </Marker>
          ))}

          {/* From marker */}
          {fromPos && (
            <Marker position={fromPos}>
              <Popup><b>📍 FROM:</b> {fromText}</Popup>
            </Marker>
          )}

          {/* To marker */}
          {toPos && (
            <Marker position={toPos}>
              <Popup><b>🏥 TO:</b> {toText}</Popup>
            </Marker>
          )}

          {/* Route line */}
          {route && (
            <Polyline positions={route}
              pathOptions={{ color: '#27AE60', weight: 6, dashArray: '12 6', opacity: 0.95 }} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
