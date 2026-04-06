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
  { center: [17.4239, 78.4738], radius: 1000, name: 'Hussain Sagar Flood', color: '#E74C3C', type: 'Flood'    },
  { center: [17.3616, 78.4747], radius: 800,  name: 'Old City Industrial',  color: '#E67E22', type: 'Chemical' },
  { center: [17.4454, 78.5279], radius: 600,  name: 'Malkajgiri Fire',      color: '#C0392B', type: 'Fire'     },
]

const QUICK_FROM = [
  { name: 'Mehdipatnam',   lat: 17.3987, lng: 78.4364 },
  { name: 'Hitech City',   lat: 17.4454, lng: 78.3772 },
  { name: 'Secunderabad',  lat: 17.4399, lng: 78.4983 },
  { name: 'Ameerpet',      lat: 17.4375, lng: 78.4487 },
  { name: 'LB Nagar',      lat: 17.3472, lng: 78.5567 },
  { name: 'Banjara Hills', lat: 17.4156, lng: 78.4347 },
]

// ── Voice: queue messages with delay ────────────────────────────────────────
function speakQueue(messages) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()

  let delay = 0
  messages.forEach((text) => {
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang   = 'en-US'
      utter.rate   = 0.88
      utter.pitch  = 1.0
      utter.volume = 1.0
      // pick a voice
      const voices = window.speechSynthesis.getVoices()
      const v = voices.find(v => v.lang === 'en-IN')
             || voices.find(v => v.lang.startsWith('en') && !v.name.includes('Google'))
             || voices.find(v => v.lang.startsWith('en'))
      if (v) utter.voice = v
      window.speechSynthesis.speak(utter)
    }, delay)
    delay += text.length * 55 + 1200
  })
}

// ── Geocode place name ───────────────────────────────────────────────────────
async function geocode(query) {
  const res = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: query + ', Hyderabad, India', format: 'json', limit: 1, countrycodes: 'in' },
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.data?.length) throw new Error(`"${query}" not found. Try a different area name.`)
  return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon) }
}

// ── Map helpers ──────────────────────────────────────────────────────────────
function FlyTo({ pos }) {
  const map = useMap()
  useEffect(() => { if (pos) map.flyTo(pos, 14, { duration: 1.4 }) }, [pos])
  return null
}

function ClickHandler({ mode, onFrom, onTo }) {
  useMapEvents({
    click: (e) => {
      if (mode === 'from') onFrom(e.latlng.lat, e.latlng.lng)
      if (mode === 'to')   onTo(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [fromText, setFromText] = useState('')
  const [toText,   setToText]   = useState('')
  const [fromPos,  setFromPos]  = useState(null)
  const [toPos,    setToPos]    = useState(null)
  const [fromSug,  setFromSug]  = useState([])
  const [toSug,    setToSug]    = useState([])
  const [showFromSug, setShowFromSug] = useState(false)
  const [showToSug,   setShowToSug]   = useState(false)
  const [route,    setRoute]    = useState(null)
  const [distance, setDistance] = useState(null)
  const [destLabel,setDestLabel]= useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [offline,  setOffline]  = useState(!navigator.onLine)
  const [clickMode,setClickMode]= useState(null)
  const [flyTo,    setFlyTo]    = useState(null)
  const [voiceOn,  setVoiceOn]  = useState(true)
  const [voiceTicker, setVoiceTicker] = useState('')
  const [voiceReady,  setVoiceReady]  = useState(false)
  const fromTimer = useRef(null)
  const toTimer   = useRef(null)

  // ── Load voices on mount ──────────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))

    // Voices load asynchronously in Chrome
    if (window.speechSynthesis) {
      const load = () => {
        const v = window.speechSynthesis.getVoices()
        if (v.length > 0) setVoiceReady(true)
      }
      load()
      window.speechSynthesis.onvoiceschanged = load
    }
  }, [])

  // ── Test voice button — plays immediately on click ────────────────────
  function testVoice() {
    if (!window.speechSynthesis) {
      alert('Your browser does not support voice. Try Chrome or Edge.')
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(
      'Voice assistant is active. Dynamic Evacuation Cloud is ready to guide you.'
    )
    utter.lang = 'en-US'
    utter.rate = 0.9
    utter.volume = 1.0
    const voices = window.speechSynthesis.getVoices()
    const v = voices.find(v => v.lang === 'en-IN')
           || voices.find(v => v.lang.startsWith('en'))
    if (v) utter.voice = v
    window.speechSynthesis.speak(utter)
    setVoiceTicker('Voice assistant is active. Dynamic Evacuation Cloud is ready to guide you.')
  }

  // ── Autocomplete fetch ────────────────────────────────────────────────
  function fetchSug(query, setter, setShow) {
    if (query.length < 2) { setter([]); setShow(false); return }
    axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: query + ', Hyderabad, India', format: 'json', limit: 5, countrycodes: 'in' },
      headers: { 'Accept-Language': 'en' },
    }).then(res => { setter(res.data); setShow(true) }).catch(() => {})
  }

  function handleFromInput(val) {
    setFromText(val); setFromPos(null)
    clearTimeout(fromTimer.current)
    fromTimer.current = setTimeout(() => fetchSug(val, setFromSug, setShowFromSug), 400)
  }

  function handleToInput(val) {
    setToText(val); setToPos(null)
    clearTimeout(toTimer.current)
    toTimer.current = setTimeout(() => fetchSug(val, setToSug, setShowToSug), 400)
  }

  function pickFrom(s) {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon)
    setFromText(s.display_name.split(',').slice(0,2).join(','))
    setFromPos([lat, lng]); setFlyTo([lat, lng])
    setFromSug([]); setShowFromSug(false)
  }

  function pickTo(s) {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon)
    setToText(s.display_name.split(',').slice(0,2).join(','))
    setToPos([lat, lng])
    setToSug([]); setShowToSug(false)
  }

  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported.'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setFromText('My GPS Location')
        setFromPos([pos.coords.latitude, pos.coords.longitude])
        setFlyTo([pos.coords.latitude, pos.coords.longitude])
      },
      () => setError('GPS failed. Type your location or click the map.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── Check hazards on route ────────────────────────────────────────────
  function findHazards(coords) {
    const found = []
    coords.forEach(([lat, lng]) => {
      HAZARD_ZONES.forEach(hz => {
        const d = Math.sqrt((lat-hz.center[0])**2 + (lng-hz.center[1])**2) * 111000
        if (d < hz.radius * 2 && !found.find(f => f.name === hz.name)) found.push(hz)
      })
    })
    return found
  }

  // ── Get route ─────────────────────────────────────────────────────────
  async function handleGetRoute(e) {
    e && e.preventDefault()
    setError(null); setRoute(null); setDistance(null); setDestLabel(null)
    setVoiceTicker('')

    let fLat = fromPos?.[0], fLng = fromPos?.[1]
    setLoading(true)
    try {
      if (!fLat && fromText.trim()) {
        const g = await geocode(fromText)
        fLat = g.lat; fLng = g.lng
        setFromPos([fLat, fLng])
      }
      if (!fLat) { setError('Enter your FROM location first.'); return }

      if (!toPos && toText.trim()) {
        const g = await geocode(toText)
        setToPos([g.lat, g.lng])
      }

      const res = await axios.post(`${API}/api/route`, { origin_lat: fLat, origin_lng: fLng }, { timeout: 30000 })

      if (res.data.error) { setError(res.data.error); return }

      const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
      setRoute(coords)
      setDistance(res.data.distance_km)
      const label = toText || res.data.destination
      setDestLabel(label)
      setFlyTo([fLat, fLng])

      // ── Voice announcements ─────────────────────────────────────────
      if (voiceOn) {
        const hazards = findHazards(coords)
        const msgs = [
          `Evacuation route found. Distance ${res.data.distance_km} kilometres to ${label}.`,
          ...hazards.map(h =>
            `Warning. ${h.name} is a ${h.type} hazard zone. Danger radius ${h.radius} metres. Please avoid this area. Route adjusted to bypass danger.`
          ),
          `Proceed safely. Follow the green route on screen. Do not enter the red zones.`,
        ]
        setVoiceTicker(msgs[0])
        speakQueue(msgs)
        // Update ticker as messages play
        let t = 0
        msgs.forEach((m, i) => {
          t += i === 0 ? 100 : msgs[i-1].length * 55 + 1200
          setTimeout(() => setVoiceTicker(m), t)
        })
      }

    } catch (err) {
      if (err.message?.includes('Network Error') || err.code === 'ERR_NETWORK') {
        setError('Network Error — Go to evac-cloud-api-5.onrender.com/api/health to wake the backend, wait 30s, then try again.')
      } else if (err.code === 'ECONNABORTED') {
        setError('Timeout — Backend is starting up. Wait 30 seconds and try again.')
      } else {
        setError(err.message || 'Error getting route. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setFromText(''); setToText('')
    setFromPos(null); setToPos(null)
    setRoute(null); setDistance(null); setDestLabel(null)
    setError(null); setClickMode(null); setVoiceTicker('')
    window.speechSynthesis?.cancel()
  }

  const statusBg = offline ? '#922B21' : error ? '#784212' : destLabel ? '#1A5276' : '#1E8449'

  // ── Input box style ───────────────────────────────────────────────────
  const inputStyle = (active) => ({
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: `2px solid ${active ? '#27AE60' : '#566573'}`,
    background: '#2C3E50', color: 'white', fontSize: '14px', outline: 'none',
    boxSizing: 'border-box',
  })

  const sugBoxStyle = {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
    background: '#1C2833', border: '1px solid #566573', borderRadius: '0 0 8px 8px',
    maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
  }

  const sugItemStyle = { padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: '#AED6F1', borderBottom: '1px solid #2C3E50' }

  const chipStyle = { padding: '3px 10px', borderRadius: '20px', border: '1px solid #566573', background: '#2C3E50', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* ── Status bar ── */}
      <div style={{ padding: '7px 20px', background: statusBg, color: 'white', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>{offline ? '🔴 OFFLINE' : '🟢 LIVE MODE'}</b>
        <span>
          {loading    ? '⏳ Computing safest evacuation route...'
          : error     ? '⚠️ ' + error
          : destLabel ? `✅ Route found: ${distance} km → ${destLabel}`
          : clickMode === 'from' ? '👆 Click map to pin FROM location'
          : clickMode === 'to'   ? '👆 Click map to pin TO location'
          : '🗺️ Enter FROM and TO locations, then click Get Route'}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Test voice button — important for browser unlock */}
          <button onClick={testVoice}
            style={{ background: '#27AE60', border: 'none', color: 'white', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
            🔊 Test Voice
          </button>
          <button onClick={() => { setVoiceOn(v => !v); window.speechSynthesis?.cancel() }}
            style={{ background: 'transparent', border: '1px solid white', color: 'white', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px' }}>
            {voiceOn ? '🔊 ON' : '🔇 OFF'}
          </button>
        </div>
      </div>

      {/* ── Voice ticker ── */}
      {voiceTicker && voiceOn && (
        <div style={{ background: '#1A3C1A', color: '#58D68D', padding: '6px 20px', fontSize: '13px', borderBottom: '2px solid #27AE60', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '18px', animation: 'pulse 1s infinite' }}>🔊</span>
          <i>{voiceTicker}</i>
        </div>
      )}

      {/* ── Input panel ── */}
      <div style={{ background: '#1C2833', color: 'white', padding: '14px 20px', borderBottom: '3px solid #E74C3C' }}>

        <div style={{ fontSize: '13px', color: '#E74C3C', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '1px' }}>
          🚨 ENTER YOUR LOCATIONS TO GET EVACUATION ROUTE
        </div>

        <form onSubmit={handleGetRoute}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* FROM */}
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <label style={{ fontSize: '11px', color: '#27AE60', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                📍 FROM — Your Current Location
                {clickMode === 'from' && <span style={{ marginLeft: '8px', color: '#F39C12', fontSize: '10px' }}>← Click map</span>}
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="text" value={fromText} onChange={e => handleFromInput(e.target.value)}
                  onFocus={() => setShowFromSug(fromSug.length > 0)}
                  onBlur={() => setTimeout(() => setShowFromSug(false), 200)}
                  placeholder="Type area name e.g. Mehdipatnam..."
                  autoComplete="off"
                  style={inputStyle(clickMode === 'from')} />
                <button type="button" onClick={handleGPS} title="Use GPS"
                  style={{ padding: '9px 12px', borderRadius: '8px', border: 'none', background: '#1A5276', color: 'white', cursor: 'pointer', fontSize: '16px' }}>📡</button>
              </div>
              {showFromSug && fromSug.length > 0 && (
                <div style={sugBoxStyle}>
                  {fromSug.map((s, i) => (
                    <div key={i} onMouseDown={() => pickFrom(s)} style={sugItemStyle}
                      onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      📍 {s.display_name.split(',').slice(0,3).join(',')}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '6px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {QUICK_FROM.map((q, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => { setFromText(q.name); setFromPos([q.lat, q.lng]); setFlyTo([q.lat, q.lng]) }}
                    style={chipStyle}
                    onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                    onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}>
                    {q.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div style={{ paddingTop: '22px', color: '#E74C3C', fontSize: '26px', fontWeight: 'bold' }}>→</div>

            {/* TO */}
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <label style={{ fontSize: '11px', color: '#3498DB', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                🏥 TO — Destination / Safe Zone
                {clickMode === 'to' && <span style={{ marginLeft: '8px', color: '#F39C12', fontSize: '10px' }}>← Click map</span>}
              </label>
              <input type="text" value={toText} onChange={e => handleToInput(e.target.value)}
                onFocus={() => setShowToSug(toSug.length > 0)}
                onBlur={() => setTimeout(() => setShowToSug(false), 200)}
                placeholder="Type safe zone or leave blank for nearest..."
                autoComplete="off"
                style={inputStyle(clickMode === 'to')} />
              {showToSug && toSug.length > 0 && (
                <div style={sugBoxStyle}>
                  {toSug.map((s, i) => (
                    <div key={i} onMouseDown={() => pickTo(s)} style={sugItemStyle}
                      onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      🏥 {s.display_name.split(',').slice(0,3).join(',')}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '6px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {SAFE_ZONES.map((sz, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => { setToText(sz.name); setToPos(sz.pos) }}
                    style={{ ...chipStyle, borderColor: '#3498DB55' }}
                    onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                    onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}>
                    {sz.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '18px' }}>
              <button type="submit" disabled={loading}
                style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: loading ? '#566573' : '#E74C3C', color: 'white', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                {loading ? '⏳ Computing...' : '🚨 Get Route'}
              </button>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button type="button" onClick={() => setClickMode(c => c === 'from' ? null : 'from')}
                  style={{ padding: '5px 8px', borderRadius: '6px', border: `1px solid ${clickMode === 'from' ? '#27AE60' : '#566573'}`, background: clickMode === 'from' ? '#1E8449' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  📍 Pin From
                </button>
                <button type="button" onClick={() => setClickMode(c => c === 'to' ? null : 'to')}
                  style={{ padding: '5px 8px', borderRadius: '6px', border: `1px solid ${clickMode === 'to' ? '#3498DB' : '#566573'}`, background: clickMode === 'to' ? '#1A5276' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  🏥 Pin To
                </button>
                <button type="button" onClick={handleClear}
                  style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #566573', background: 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  🗑️ Clear
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Result bar */}
        {destLabel && distance !== null && (
          <div style={{ marginTop: '10px', padding: '8px 14px', background: '#1A5276', borderRadius: '6px', display: 'flex', gap: '16px', fontSize: '13px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>📍 <b>From:</b> {fromText}</span>
            <span>🏥 <b>To:</b> {destLabel}</span>
            <span>📏 <b>Distance:</b> {distance} km</span>
            <span>🛡️ <b>Avoids all hazard zones</b></span>
            <button onClick={() => {
                const msg = `Route from ${fromText} to ${destLabel}. Distance ${distance} kilometres. Follow the green line. Avoid all red danger zones.`
                setVoiceTicker(msg)
                speakQueue([msg])
              }}
              style={{ padding: '3px 12px', borderRadius: '4px', border: 'none', background: '#27AE60', color: 'white', cursor: 'pointer', fontSize: '12px' }}>
              🔊 Repeat Voice
            </button>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1 }}>
        <MapContainer center={[17.4065, 78.4772]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
          <ClickHandler mode={clickMode} onFrom={(lat, lng) => { setFromText(`${lat.toFixed(4)}°N`); setFromPos([lat, lng]); setClickMode(null) }} onTo={(lat, lng) => { setToText(`${lat.toFixed(4)}°N`); setToPos([lat, lng]); setClickMode(null) }} />
          {flyTo && <FlyTo pos={flyTo} />}

          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius}
              pathOptions={{ color: hz.color, fillColor: hz.color, fillOpacity: 0.3, weight: 2 }}>
              <Popup>
                <b>⚠️ {hz.name}</b><br />
                Type: {hz.type}<br />
                Danger radius: {hz.radius}m<br />
                <span style={{ color: 'red', fontWeight: 'bold' }}>Voice alert will warn you</span>
              </Popup>
            </Circle>
          ))}

          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup>
                <b>🟢 {sz.name}</b><br />
                Type: {sz.type}<br />
                Capacity: {sz.capacity.toLocaleString()} people<br />
                <button onClick={() => { setToText(sz.name); setToPos(sz.pos) }}
                  style={{ marginTop: '6px', padding: '4px 10px', background: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  Set as Destination
                </button>
              </Popup>
            </Marker>
          ))}

          {fromPos && <Marker position={fromPos}><Popup><b>📍 FROM:</b> {fromText}</Popup></Marker>}
          {toPos   && <Marker position={toPos}  ><Popup><b>🏥 TO:</b>   {toText}</Popup></Marker>}

          {route && (
            <Polyline positions={route}
              pathOptions={{ color: '#27AE60', weight: 6, dashArray: '12 6', opacity: 0.95 }} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
