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

// ── Voice ─────────────────────────────────────────────────────────────────────
function unlockVoice() {
  if (!window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

function speak(text, delay = 100) {
  if (!window.speechSynthesis) return
  setTimeout(() => {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const v = voices.find(x => x.lang === 'en-IN')
           || voices.find(x => x.lang.startsWith('en'))
    if (v) u.voice = v
    u.lang = 'en-US'; u.rate = 0.88; u.volume = 1.0
    u.onerror = () => {}
    window.speechSynthesis.speak(u)
  }, delay)
}

function speakAll(msgs) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  let d = 200
  msgs.forEach(t => {
    speak(t, d)
    d += t.length * 60 + 1500
  })
}

// ── Geocode ───────────────────────────────────────────────────────────────────
async function geocode(q) {
  const r = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: q + ', Hyderabad, India', format: 'json', limit: 1, countrycodes: 'in' },
    headers: { 'Accept-Language': 'en' },
  })
  if (!r.data?.length) throw new Error(`"${q}" not found. Try a different name.`)
  return { lat: parseFloat(r.data[0].lat), lng: parseFloat(r.data[0].lon) }
}

// ── Map helpers ───────────────────────────────────────────────────────────────
function FlyTo({ pos }) {
  const map = useMap()
  useEffect(() => { if (pos) map.flyTo(pos, 14, { duration: 1.4 }) }, [pos])
  return null
}

function FitRoute({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords && coords.length > 1) {
      const L = window.L || require('leaflet')
      map.fitBounds(coords, { padding: [60, 60], maxZoom: 15 })
    }
  }, [coords])
  return null
}

function MapClicker({ mode, onFrom, onTo }) {
  useMapEvents({
    click: (e) => {
      if (mode === 'from') onFrom(e.latlng.lat, e.latlng.lng)
      if (mode === 'to')   onTo(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [fromText,    setFromText]    = useState('')
  const [toText,      setToText]      = useState('')
  const [fromPos,     setFromPos]     = useState(null)
  const [toPos,       setToPos]       = useState(null)
  const [fromSug,     setFromSug]     = useState([])
  const [toSug,       setToSug]       = useState([])
  const [showFS,      setShowFS]      = useState(false)
  const [showTS,      setShowTS]      = useState(false)
  const [route,       setRoute]       = useState(null)
  const [distance,    setDistance]    = useState(null)
  const [destLabel,   setDestLabel]   = useState('')
  const [hazardWarn,  setHazardWarn]  = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [offline,     setOffline]     = useState(!navigator.onLine)
  const [clickMode,   setClickMode]   = useState(null)
  const [flyTo,       setFlyTo]       = useState(null)
  const [fitRoute,    setFitRoute]    = useState(null)
  const [voiceOn,     setVoiceOn]     = useState(true)
  const [voiceLine,   setVoiceLine]   = useState('')
  const [backendOk,   setBackendOk]   = useState(false)
  const [waking,      setWaking]      = useState(false)
  const fromT = useRef(null)
  const toT   = useRef(null)

  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
    // Silently ping backend on load
    pingBackend()
  }, [])

  function pingBackend() {
    axios.get(`${API}/api/health`, { timeout: 60000 })
      .then(r => { if (r.data.graph_loaded) setBackendOk(true) })
      .catch(() => {})
  }

  async function wakeBackend() {
    setWaking(true)
    setError('Waking up backend... please wait 30-60 seconds...')
    try {
      const r = await axios.get(`${API}/api/health`, { timeout: 90000 })
      if (r.data.graph_loaded) {
        setBackendOk(true)
        setError('')
        setWaking(false)
      } else {
        setError('Backend started but graph loading. Wait 30 more seconds then try Get Route.')
        setWaking(false)
      }
    } catch {
      setError('Backend still waking. Click Wake Backend again or wait 60 seconds.')
      setWaking(false)
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────
  function fetchSug(q, set, setShow) {
    if (q.length < 2) { set([]); setShow(false); return }
    axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: q + ', Hyderabad, India', format: 'json', limit: 5, countrycodes: 'in' },
      headers: { 'Accept-Language': 'en' },
    }).then(r => { set(r.data); setShow(r.data.length > 0) }).catch(() => {})
  }

  function handleFromInput(v) {
    setFromText(v); setFromPos(null)
    clearTimeout(fromT.current)
    fromT.current = setTimeout(() => fetchSug(v, setFromSug, setShowFS), 400)
  }

  function handleToInput(v) {
    setToText(v); setToPos(null)
    clearTimeout(toT.current)
    toT.current = setTimeout(() => fetchSug(v, setToSug, setShowTS), 400)
  }

  function pickFrom(s) {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon)
    setFromText(s.display_name.split(',').slice(0, 2).join(','))
    setFromPos([lat, lng]); setFlyTo([lat, lng])
    setFromSug([]); setShowFS(false)
  }

  function pickTo(s) {
    setToText(s.display_name.split(',').slice(0, 2).join(','))
    setToPos([parseFloat(s.lat), parseFloat(s.lon)])
    setToSug([]); setShowTS(false)
  }

  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported.'); return }
    unlockVoice()
    navigator.geolocation.getCurrentPosition(
      p => { setFromText('My GPS Location'); setFromPos([p.coords.latitude, p.coords.longitude]); setFlyTo([p.coords.latitude, p.coords.longitude]) },
      () => setError('GPS failed. Type your location.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── GET ROUTE ─────────────────────────────────────────────────────────
  async function handleGetRoute(e) {
    e && e.preventDefault()
    unlockVoice()
    setError(''); setRoute(null); setDistance(null)
    setDestLabel(''); setHazardWarn([]); setVoiceLine('')

    let fLat = fromPos?.[0], fLng = fromPos?.[1]
    setLoading(true)

    try {
      if (!fLat && fromText.trim()) {
        const g = await geocode(fromText)
        fLat = g.lat; fLng = g.lng
        setFromPos([fLat, fLng])
      }
      if (!fLat) { setError('Please enter your FROM location first.'); return }

      if (!toPos && toText.trim()) {
        const g = await geocode(toText)
        setToPos([g.lat, g.lng])
      }

      const res = await axios.post(`${API}/api/route`, {
        origin_lat: fLat,
        origin_lng: fLng,
      }, { timeout: 40000 })

      if (res.data.error) { setError(res.data.error); return }

      // Build route coordinates [lat, lng]
      const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
      setRoute(coords)
      setFitRoute(coords)   // auto-zoom to show full route
      setDistance(res.data.distance_km)
      setBackendOk(true)

      const label = toText.trim() || res.data.destination
      setDestLabel(label)

      const warnings = res.data.hazard_warnings || []
      setHazardWarn(warnings)

      // Voice
      if (voiceOn) {
        const msgs = [
          `Evacuation route found. Distance ${res.data.distance_km} kilometres to ${label}.`,
          ...warnings.map(h => `Warning! ${h.name} is a ${h.type} hazard zone. Danger radius ${h.distance} metres. Route has been adjusted to avoid this area.`),
          warnings.length > 0
            ? `All hazard zones avoided. Proceed safely on the red route shown on your screen.`
            : `You are on the safest evacuation route. Follow the red line to ${label}.`,
        ]
        let d = 200
        msgs.forEach(m => {
          setTimeout(() => setVoiceLine(m), d)
          d += m.length * 60 + 1500
        })
        setTimeout(() => setVoiceLine(''), d + 1000)
        speakAll(msgs)
      }

    } catch (err) {
      if (err.message?.includes('Network Error') || err.code === 'ERR_NETWORK') {
        setError('Backend is sleeping. Click "⚡ Wake Backend" and wait 30 seconds.')
        setBackendOk(false)
      } else if (err.code === 'ECONNABORTED') {
        setError('Timeout — backend is starting up. Wait 30 seconds and try again.')
      } else {
        setError(err.message || 'Error. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setFromText(''); setToText('')
    setFromPos(null); setToPos(null)
    setRoute(null); setDistance(null); setDestLabel('')
    setError(''); setClickMode(null); setVoiceLine('')
    setHazardWarn([]); setFitRoute(null)
    window.speechSynthesis?.cancel()
  }

  function repeatVoice() {
    if (!destLabel) return
    unlockVoice()
    const m = `Evacuation route from ${fromText} to ${destLabel}. Distance ${distance} kilometres. Follow the red line on screen.`
    setVoiceLine(m)
    speak(m, 100)
  }

  // styles
  const inputStyle = active => ({
    flex: 1, padding: '9px 12px', borderRadius: '8px',
    border: `2px solid ${active ? '#E74C3C' : '#566573'}`,
    background: '#2C3E50', color: 'white', fontSize: '14px', outline: 'none',
  })
  const chipStyle = {
    padding: '3px 10px', borderRadius: '20px',
    border: '1px solid #566573', background: '#2C3E50',
    color: '#AED6F1', cursor: 'pointer', fontSize: '11px',
  }
  const sugBoxStyle = {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
    background: '#1C2833', border: '1px solid #E74C3C',
    borderRadius: '0 0 8px 8px', maxHeight: '180px', overflowY: 'auto',
  }

  const statusBg = offline ? '#922B21'
    : error    ? '#784212'
    : destLabel ? '#1A5276'
    : '#1E8449'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* ── Status bar ── */}
      <div style={{ padding: '7px 18px', background: statusBg, color: 'white', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <b style={{ whiteSpace: 'nowrap' }}>
          {offline ? '🔴 OFFLINE' : backendOk ? '🟢 BACKEND READY' : '🟡 BACKEND SLEEPING'}
        </b>
        <span style={{ textAlign: 'center' }}>
          {loading     ? '⏳ Computing safest evacuation route...'
          : error      ? '⚠️ ' + error
          : destLabel  ? `✅ Evacuation route: ${distance} km → ${destLabel}`
          : clickMode === 'from' ? '👆 Click map to set FROM'
          : clickMode === 'to'   ? '👆 Click map to set TO'
          : '🗺️ Enter FROM and TO then click Get Route'}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {!backendOk && (
            <button onClick={wakeBackend} disabled={waking}
              style={{ background: '#E67E22', border: 'none', color: 'white', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              {waking ? '⏳ Waking...' : '⚡ Wake Backend'}
            </button>
          )}
          <button onClick={() => { unlockVoice(); speak('Voice assistant active and ready.', 100); setVoiceLine('Voice assistant active and ready.') }}
            style={{ background: '#27AE60', border: 'none', color: 'white', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px' }}>
            🔊 Enable Voice
          </button>
          <button onClick={() => { setVoiceOn(v => !v); window.speechSynthesis?.cancel(); setVoiceLine('') }}
            style={{ background: 'transparent', border: '1px solid white', color: 'white', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px' }}>
            {voiceOn ? '🔊 ON' : '🔇 OFF'}
          </button>
        </div>
      </div>

      {/* ── Voice ticker ── */}
      {voiceLine && voiceOn && (
        <div style={{ background: '#1A3C1A', color: '#58D68D', padding: '6px 18px', fontSize: '13px', borderBottom: '2px solid #27AE60', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '18px' }}>🔊</span><i>{voiceLine}</i>
        </div>
      )}

      {/* ── Hazard warnings ── */}
      {hazardWarn.length > 0 && (
        <div style={{ background: '#7B241C', color: '#FADBD8', padding: '5px 18px', fontSize: '13px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <b>⚠️ HAZARDS NEAR ROUTE:</b>
          {hazardWarn.map((h, i) => <span key={i}>🔴 {h.name} — {h.distance}m away</span>)}
        </div>
      )}

      {/* ── Input panel ── */}
      <div style={{ background: '#1C2833', color: 'white', padding: '12px 18px', borderBottom: '3px solid #E74C3C' }}>
        <div style={{ fontSize: '12px', color: '#E74C3C', fontWeight: 'bold', marginBottom: '10px', letterSpacing: '1px' }}>
          🚨 ENTER YOUR LOCATIONS TO GET EVACUATION ROUTE
        </div>

        <form onSubmit={handleGetRoute}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* FROM input */}
            <div style={{ flex: 1, minWidth: '210px', position: 'relative' }}>
              <label style={{ fontSize: '11px', color: '#E74C3C', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                📍 FROM — Your Current Location
              </label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input type="text" value={fromText} placeholder="Type area e.g. LB Nagar, Ameerpet..."
                  onChange={e => handleFromInput(e.target.value)}
                  onFocus={() => setShowFS(fromSug.length > 0)}
                  onBlur={() => setTimeout(() => setShowFS(false), 200)}
                  autoComplete="off" style={inputStyle(clickMode === 'from')} />
                <button type="button" onClick={handleGPS} title="Use GPS"
                  style={{ padding: '9px 11px', borderRadius: '8px', border: 'none', background: '#1A5276', color: 'white', cursor: 'pointer', fontSize: '15px' }}>📡</button>
              </div>
              {showFS && fromSug.length > 0 && (
                <div style={sugBoxStyle}>
                  {fromSug.map((s, i) => (
                    <div key={i} onMouseDown={() => pickFrom(s)}
                      style={{ padding: '8px 13px', cursor: 'pointer', fontSize: '13px', color: '#AED6F1', borderBottom: '1px solid #2C3E50' }}
                      onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      📍 {s.display_name.split(',').slice(0, 3).join(',')}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '5px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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

            <div style={{ paddingTop: '18px', color: '#E74C3C', fontSize: '26px', fontWeight: 'bold' }}>→</div>

            {/* TO input */}
            <div style={{ flex: 1, minWidth: '210px', position: 'relative' }}>
              <label style={{ fontSize: '11px', color: '#E74C3C', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                🏥 TO — Safe Zone / Destination
              </label>
              <input type="text" value={toText} placeholder="Leave blank = nearest safe zone..."
                onChange={e => handleToInput(e.target.value)}
                onFocus={() => setShowTS(toSug.length > 0)}
                onBlur={() => setTimeout(() => setShowTS(false), 200)}
                autoComplete="off"
                style={{ ...inputStyle(clickMode === 'to'), width: '100%', boxSizing: 'border-box' }} />
              {showTS && toSug.length > 0 && (
                <div style={sugBoxStyle}>
                  {toSug.map((s, i) => (
                    <div key={i} onMouseDown={() => pickTo(s)}
                      style={{ padding: '8px 13px', cursor: 'pointer', fontSize: '13px', color: '#AED6F1', borderBottom: '1px solid #2C3E50' }}
                      onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      🏥 {s.display_name.split(',').slice(0, 3).join(',')}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '5px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {SAFE_ZONES.map((sz, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => { setToText(sz.name); setToPos(sz.pos) }}
                    style={chipStyle}
                    onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                    onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}>
                    {sz.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: '17px' }}>
              <button type="submit" disabled={loading}
                style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: loading ? '#566573' : '#C0392B', color: 'white', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', whiteSpace: 'nowrap' }}>
                {loading ? '⏳ Computing...' : '🚨 Get Route'}
              </button>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button type="button" onClick={() => setClickMode(c => c === 'from' ? null : 'from')}
                  style={{ padding: '4px 8px', borderRadius: '5px', border: `1px solid ${clickMode === 'from' ? '#E74C3C' : '#566573'}`, background: clickMode === 'from' ? '#922B21' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  📍 Pin From
                </button>
                <button type="button" onClick={() => setClickMode(c => c === 'to' ? null : 'to')}
                  style={{ padding: '4px 8px', borderRadius: '5px', border: `1px solid ${clickMode === 'to' ? '#E74C3C' : '#566573'}`, background: clickMode === 'to' ? '#922B21' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  🏥 Pin To
                </button>
                <button type="button" onClick={handleClear}
                  style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #566573', background: 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  🗑️ Clear
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Result bar */}
        {destLabel && distance !== null && (
          <div style={{ marginTop: '8px', padding: '7px 13px', background: '#1A5276', borderRadius: '6px', display: 'flex', gap: '14px', fontSize: '13px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>📍 <b>{fromText}</b></span>
            <span style={{ color: '#E74C3C', fontWeight: 'bold' }}>→</span>
            <span>🏥 <b>{destLabel}</b></span>
            <span>📏 <b>{distance} km</b></span>
            <span>🛡️ Hazard-safe route</span>
            <span style={{ color: '#E74C3C', fontWeight: 'bold' }}>● Red line = evacuation path</span>
            <button onClick={repeatVoice}
              style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: '#27AE60', color: 'white', cursor: 'pointer', fontSize: '12px' }}>
              🔊 Repeat
            </button>
          </div>
        )}
      </div>

      {/* ── MAP ── */}
      <div style={{ flex: 1 }}>
        <MapContainer center={[17.4065, 78.4772]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
          <MapClicker mode={clickMode}
            onFrom={(lat, lng) => { setFromText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`); setFromPos([lat, lng]); setClickMode(null) }}
            onTo={(lat, lng)   => { setToText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`);   setToPos([lat, lng]);   setClickMode(null) }} />
          {flyTo    && <FlyTo pos={flyTo} />}
          {fitRoute && <FitRoute coords={fitRoute} />}

          {/* Hazard zones */}
          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius}
              pathOptions={{ color: hz.color, fillColor: hz.color, fillOpacity: 0.35, weight: 3 }}>
              <Popup>
                <b>⚠️ {hz.name}</b><br />Type: {hz.type}<br />
                Danger radius: {hz.radius}m<br />
                <span style={{ color: 'red', fontWeight: 'bold' }}>🔊 Voice warning active</span>
              </Popup>
            </Circle>
          ))}

          {/* Safe zone markers */}
          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup>
                <b>🟢 {sz.name}</b><br />
                {sz.type} · Capacity: {sz.capacity.toLocaleString()}<br />
                <button onClick={() => { setToText(sz.name); setToPos(sz.pos) }}
                  style={{ marginTop: '5px', padding: '4px 10px', background: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  Set as Destination
                </button>
              </Popup>
            </Marker>
          ))}

          {/* FROM marker */}
          {fromPos && (
            <Marker position={fromPos}>
              <Popup><b>📍 FROM:</b> {fromText}</Popup>
            </Marker>
          )}

          {/* TO marker */}
          {toPos && (
            <Marker position={toPos}>
              <Popup><b>🏥 TO:</b> {toText}</Popup>
            </Marker>
          )}

          {/* ── EVACUATION ROUTE — RED LINE ── */}
          {route && (
            <>
              {/* White outline for contrast */}
              <Polyline positions={route}
                pathOptions={{ color: '#FFFFFF', weight: 10, opacity: 0.6 }} />
              {/* Red evacuation route */}
              <Polyline positions={route}
                pathOptions={{ color: '#E74C3C', weight: 6, opacity: 1.0 }} />
              {/* Animated dashes on top */}
              <Polyline positions={route}
                pathOptions={{ color: '#FF0000', weight: 3, dashArray: '10 8', opacity: 0.9 }} />
            </>
          )}

        </MapContainer>
      </div>
    </div>
  )
}
