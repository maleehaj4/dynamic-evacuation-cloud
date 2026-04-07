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

// ── VOICE ENGINE ─────────────────────────────────────────────────────────────
let voiceUnlocked = false

function unlockVoice() {
  if (!window.speechSynthesis) return
  // Speak empty string to unlock audio context on user gesture
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  window.speechSynthesis.speak(u)
  voiceUnlocked = true
}

function speak(text, delay = 0) {
  if (!window.speechSynthesis) return
  setTimeout(() => {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const voice  = voices.find(v => v.lang === 'en-IN')
                || voices.find(v => v.lang.startsWith('en-') && v.name.includes('Female'))
                || voices.find(v => v.lang.startsWith('en'))
    if (voice) u.voice = voice
    u.lang   = 'en-US'
    u.rate   = 0.88
    u.pitch  = 1.05
    u.volume = 1.0
    u.onerror = () => {}
    window.speechSynthesis.speak(u)
  }, delay)
}

function speakSequence(messages) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  let delay = 200
  messages.forEach((text, i) => {
    speak(text, delay)
    delay += text.length * 58 + 1500
  })
  return delay
}

// ── Geocode ───────────────────────────────────────────────────────────────────
async function geocode(query) {
  const res = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: query + ', Hyderabad, India', format: 'json', limit: 1, countrycodes: 'in' },
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.data?.length) throw new Error(`"${query}" not found. Try a different name.`)
  return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon) }
}

// ── Map components ────────────────────────────────────────────────────────────
function FlyTo({ pos }) {
  const map = useMap()
  useEffect(() => { if (pos) map.flyTo(pos, 14, { duration: 1.4 }) }, [pos])
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
  const [fromText,   setFromText]   = useState('')
  const [toText,     setToText]     = useState('')
  const [fromPos,    setFromPos]    = useState(null)
  const [toPos,      setToPos]      = useState(null)
  const [fromSug,    setFromSug]    = useState([])
  const [toSug,      setToSug]      = useState([])
  const [showFromSug,setShowFromSug]= useState(false)
  const [showToSug,  setShowToSug]  = useState(false)
  const [route,      setRoute]      = useState(null)
  const [distance,   setDistance]   = useState(null)
  const [destLabel,  setDestLabel]  = useState('')
  const [hazardWarn, setHazardWarn] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [offline,    setOffline]    = useState(!navigator.onLine)
  const [clickMode,  setClickMode]  = useState(null)
  const [flyTo,      setFlyTo]      = useState(null)
  const [voiceOn,    setVoiceOn]    = useState(true)
  const [voiceLine,  setVoiceLine]  = useState('')
  const [backendOk,  setBackendOk]  = useState(false)
  const fromTimer = useRef(null)
  const toTimer   = useRef(null)

  // ── On mount: load voices + ping backend ──────────────────────────────
  useEffect(() => {
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))

    // Load voices
    if (window.speechSynthesis) {
      const load = () => window.speechSynthesis.getVoices()
      load()
      window.speechSynthesis.onvoiceschanged = load
    }

    // Ping backend to wake it up silently
    axios.get(`${API}/api/health`, { timeout: 60000 })
      .then(r => { if (r.data.graph_loaded) setBackendOk(true) })
      .catch(() => {})
  }, [])

  // ── Autocomplete ──────────────────────────────────────────────────────
  function fetchSug(q, set, setShow) {
    if (q.length < 2) { set([]); setShow(false); return }
    axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: q + ', Hyderabad, India', format: 'json', limit: 5, countrycodes: 'in' },
      headers: { 'Accept-Language': 'en' },
    }).then(r => { set(r.data); setShow(true) }).catch(() => {})
  }

  function handleFromInput(v) {
    setFromText(v); setFromPos(null)
    clearTimeout(fromTimer.current)
    fromTimer.current = setTimeout(() => fetchSug(v, setFromSug, setShowFromSug), 400)
  }

  function handleToInput(v) {
    setToText(v); setToPos(null)
    clearTimeout(toTimer.current)
    toTimer.current = setTimeout(() => fetchSug(v, setToSug, setShowToSug), 400)
  }

  function pickFromSug(s) {
    const lat = parseFloat(s.lat), lng = parseFloat(s.lon)
    setFromText(s.display_name.split(',').slice(0,2).join(','))
    setFromPos([lat, lng]); setFlyTo([lat, lng])
    setFromSug([]); setShowFromSug(false)
  }

  function pickToSug(s) {
    setToText(s.display_name.split(',').slice(0,2).join(','))
    setToPos([parseFloat(s.lat), parseFloat(s.lon)])
    setToSug([]); setShowToSug(false)
  }

  // ── GPS ───────────────────────────────────────────────────────────────
  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported.'); return }
    unlockVoice()
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

  // ── Voice announcement ────────────────────────────────────────────────
  function announceRoute(dist, dest, hazards) {
    if (!voiceOn) return
    const messages = [
      `Evacuation route found. Distance ${dist} kilometres to ${dest}.`,
      ...hazards.map(h =>
        `Warning! ${h.name} is a ${h.type} hazard zone. Please avoid this area. Route has been adjusted to keep you safe.`
      ),
      `Proceed safely on the green route shown on screen. ${hazards.length > 0 ? 'All hazard zones have been avoided.' : 'You are on the safest path.'}`,
    ]

    // Show each line in the voice ticker as it plays
    let delay = 200
    messages.forEach((msg, i) => {
      setTimeout(() => setVoiceLine(msg), delay)
      delay += msg.length * 58 + 1500
    })
    setTimeout(() => setVoiceLine(''), delay + 2000)

    speakSequence(messages)
  }

  // ── Get Route ─────────────────────────────────────────────────────────
  async function handleGetRoute(e) {
    e && e.preventDefault()
    unlockVoice() // unlock on user gesture
    setError(''); setRoute(null); setDistance(null)
    setDestLabel(''); setHazardWarn([]); setVoiceLine('')

    let fLat = fromPos?.[0], fLng = fromPos?.[1]
    setLoading(true)

    try {
      // Geocode FROM if needed
      if (!fLat && fromText.trim()) {
        const g = await geocode(fromText)
        fLat = g.lat; fLng = g.lng
        setFromPos([fLat, fLng])
      }
      if (!fLat) { setError('Please enter your FROM location.'); return }

      // Geocode TO if needed
      if (!toPos && toText.trim()) {
        const g = await geocode(toText)
        setToPos([g.lat, g.lng])
      }

      // Call backend
      const res = await axios.post(`${API}/api/route`, {
        origin_lat: fLat,
        origin_lng: fLng,
      }, { timeout: 35000 })

      if (res.data.error) {
        setError(res.data.error)
        return
      }

      const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
      setRoute(coords)
      setDistance(res.data.distance_km)

      const label = toText.trim() || res.data.destination
      setDestLabel(label)
      setFlyTo([fLat, fLng])
      setBackendOk(true)

      const warnings = res.data.hazard_warnings || []
      setHazardWarn(warnings)

      // Announce route via voice
      announceRoute(res.data.distance_km, label, warnings)

    } catch (err) {
      if (err.message?.includes('Network Error') || err.code === 'ERR_NETWORK') {
        setError('Backend sleeping — click "Wake Backend" button below, wait 30s, try again.')
      } else if (err.code === 'ECONNABORTED') {
        setError('Timeout — backend is starting. Wait 30 seconds and try again.')
      } else {
        setError(err.message || 'Could not get route. Try again.')
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
    setHazardWarn([])
    window.speechSynthesis?.cancel()
  }

  function repeatVoice() {
    if (!destLabel) return
    unlockVoice()
    const msg = `Route from ${fromText} to ${destLabel}. Distance ${distance} kilometres. Follow the green line on screen.`
    setVoiceLine(msg)
    speak(msg, 100)
  }

  const statusBg = offline ? '#922B21' : error ? '#784212' : destLabel ? '#1A5276' : '#1E8449'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Status bar */}
      <div style={{ padding: '7px 20px', background: statusBg, color: 'white', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <b>{offline ? '🔴 OFFLINE' : backendOk ? '🟢 BACKEND READY' : '🟡 BACKEND WAKING...'}</b>
        <span>
          {loading    ? '⏳ Computing safest evacuation route...'
          : error     ? '⚠️ ' + error
          : destLabel ? `✅ Route: ${distance} km → ${destLabel}`
          : clickMode === 'from' ? '👆 Click map to pin FROM'
          : clickMode === 'to'   ? '👆 Click map to pin TO'
          : '🗺️ Enter FROM and TO then click Get Route'}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {!backendOk && (
            <button
              onClick={() => { window.open(`${API}/api/health`, '_blank') }}
              style={{ background: '#E67E22', border: 'none', color: 'white', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              ⚡ Wake Backend
            </button>
          )}
          <button
            onClick={() => { unlockVoice(); speak('Voice assistant active. Ready to guide you.', 100); setVoiceLine('Voice assistant active. Ready to guide you.') }}
            style={{ background: '#27AE60', border: 'none', color: 'white', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
            🔊 Enable Voice
          </button>
          <button onClick={() => { setVoiceOn(v => !v); window.speechSynthesis?.cancel(); setVoiceLine('') }}
            style={{ background: 'transparent', border: '1px solid white', color: 'white', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px' }}>
            {voiceOn ? '🔊 ON' : '🔇 OFF'}
          </button>
        </div>
      </div>

      {/* Voice ticker */}
      {voiceLine && voiceOn && (
        <div style={{ background: '#1A3C1A', color: '#58D68D', padding: '7px 20px', fontSize: '13px', borderBottom: '2px solid #27AE60', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '20px' }}>🔊</span>
          <span><i>{voiceLine}</i></span>
        </div>
      )}

      {/* Hazard warnings bar */}
      {hazardWarn.length > 0 && (
        <div style={{ background: '#7B241C', color: '#FADBD8', padding: '6px 20px', fontSize: '13px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <b>⚠️ HAZARD WARNINGS:</b>
          {hazardWarn.map((h, i) => (
            <span key={i}>🔴 {h.name} ({h.type}) — {h.distance}m from route</span>
          ))}
        </div>
      )}

      {/* Input panel */}
      <div style={{ background: '#1C2833', color: 'white', padding: '12px 20px', borderBottom: '3px solid #E74C3C' }}>
        <div style={{ fontSize: '12px', color: '#E74C3C', fontWeight: 'bold', marginBottom: '10px', letterSpacing: '1px' }}>
          🚨 ENTER YOUR LOCATIONS TO GET EVACUATION ROUTE
        </div>

        <form onSubmit={handleGetRoute}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* FROM */}
            <div style={{ flex: 1, minWidth: '210px', position: 'relative' }}>
              <label style={{ fontSize: '11px', color: '#27AE60', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                📍 FROM — Your Current Location
              </label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input type="text" value={fromText} placeholder="Type area e.g. Ameerpet..."
                  onChange={e => handleFromInput(e.target.value)}
                  onFocus={() => setShowFromSug(fromSug.length > 0)}
                  onBlur={() => setTimeout(() => setShowFromSug(false), 200)}
                  autoComplete="off"
                  style={{ flex: 1, padding: '8px 11px', borderRadius: '7px', border: `2px solid ${clickMode === 'from' ? '#27AE60' : '#566573'}`, background: '#2C3E50', color: 'white', fontSize: '14px', outline: 'none' }} />
                <button type="button" onClick={handleGPS} title="Use GPS"
                  style={{ padding: '8px 11px', borderRadius: '7px', border: 'none', background: '#1A5276', color: 'white', cursor: 'pointer', fontSize: '15px' }}>📡</button>
              </div>
              {showFromSug && fromSug.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: '#1C2833', border: '1px solid #27AE60', borderRadius: '0 0 7px 7px', maxHeight: '170px', overflowY: 'auto' }}>
                  {fromSug.map((s, i) => (
                    <div key={i} onMouseDown={() => pickFromSug(s)}
                      style={{ padding: '8px 13px', cursor: 'pointer', fontSize: '13px', color: '#AED6F1', borderBottom: '1px solid #2C3E50' }}
                      onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      📍 {s.display_name.split(',').slice(0,3).join(',')}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '5px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {QUICK_FROM.map((q, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => { setFromText(q.name); setFromPos([q.lat, q.lng]); setFlyTo([q.lat, q.lng]) }}
                    style={{ padding: '2px 9px', borderRadius: '20px', border: '1px solid #566573', background: '#2C3E50', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}
                    onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                    onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}>
                    {q.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ paddingTop: '20px', color: '#E74C3C', fontSize: '24px', fontWeight: 'bold' }}>→</div>

            {/* TO */}
            <div style={{ flex: 1, minWidth: '210px', position: 'relative' }}>
              <label style={{ fontSize: '11px', color: '#3498DB', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                🏥 TO — Safe Zone or Destination
              </label>
              <input type="text" value={toText} placeholder="Leave blank for nearest safe zone..."
                onChange={e => handleToInput(e.target.value)}
                onFocus={() => setShowToSug(toSug.length > 0)}
                onBlur={() => setTimeout(() => setShowToSug(false), 200)}
                autoComplete="off"
                style={{ width: '100%', padding: '8px 11px', borderRadius: '7px', border: `2px solid ${clickMode === 'to' ? '#3498DB' : '#566573'}`, background: '#2C3E50', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              {showToSug && toSug.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: '#1C2833', border: '1px solid #3498DB', borderRadius: '0 0 7px 7px', maxHeight: '170px', overflowY: 'auto' }}>
                  {toSug.map((s, i) => (
                    <div key={i} onMouseDown={() => pickToSug(s)}
                      style={{ padding: '8px 13px', cursor: 'pointer', fontSize: '13px', color: '#AED6F1', borderBottom: '1px solid #2C3E50' }}
                      onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      🏥 {s.display_name.split(',').slice(0,3).join(',')}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '5px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {SAFE_ZONES.map((sz, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => { setToText(sz.name); setToPos(sz.pos) }}
                    style={{ padding: '2px 9px', borderRadius: '20px', border: '1px solid #3498DB55', background: '#2C3E50', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}
                    onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
                    onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}>
                    {sz.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: '17px' }}>
              <button type="submit" disabled={loading}
                style={{ padding: '9px 20px', borderRadius: '7px', border: 'none', background: loading ? '#566573' : '#E74C3C', color: 'white', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                {loading ? '⏳...' : '🚨 Get Route'}
              </button>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button type="button" onClick={() => setClickMode(c => c === 'from' ? null : 'from')}
                  style={{ padding: '4px 7px', borderRadius: '5px', border: `1px solid ${clickMode === 'from' ? '#27AE60' : '#566573'}`, background: clickMode === 'from' ? '#1E8449' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  📍 Pin From
                </button>
                <button type="button" onClick={() => setClickMode(c => c === 'to' ? null : 'to')}
                  style={{ padding: '4px 7px', borderRadius: '5px', border: `1px solid ${clickMode === 'to' ? '#3498DB' : '#566573'}`, background: clickMode === 'to' ? '#1A5276' : 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  🏥 Pin To
                </button>
                <button type="button" onClick={handleClear}
                  style={{ padding: '4px 7px', borderRadius: '5px', border: '1px solid #566573', background: 'transparent', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}>
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Result info bar */}
        {destLabel && distance !== null && (
          <div style={{ marginTop: '8px', padding: '7px 13px', background: '#1A5276', borderRadius: '6px', display: 'flex', gap: '14px', fontSize: '13px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>📍 <b>{fromText}</b></span>
            <span>→</span>
            <span>🏥 <b>{destLabel}</b></span>
            <span>📏 <b>{distance} km</b></span>
            <span>🛡️ Hazard-safe route</span>
            <button onClick={repeatVoice}
              style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: '#27AE60', color: 'white', cursor: 'pointer', fontSize: '12px' }}>
              🔊 Repeat
            </button>
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ flex: 1 }}>
        <MapContainer center={[17.4065, 78.4772]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
          <MapClicker mode={clickMode}
            onFrom={(lat, lng) => { setFromText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`); setFromPos([lat, lng]); setClickMode(null) }}
            onTo={(lat, lng)   => { setToText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`);   setToPos([lat, lng]);   setClickMode(null) }} />
          {flyTo && <FlyTo pos={flyTo} />}

          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius}
              pathOptions={{ color: hz.color, fillColor: hz.color, fillOpacity: 0.3, weight: 2 }}>
              <Popup>
                <b>⚠️ {hz.name}</b><br />Type: {hz.type}<br />
                Radius: {hz.radius}m<br />
                <span style={{ color: 'red', fontWeight: 'bold' }}>🔊 Voice alert active</span>
              </Popup>
            </Circle>
          ))}

          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup>
                <b>🟢 {sz.name}</b><br />
                {sz.type} · {sz.capacity.toLocaleString()} people<br />
                <button onClick={() => { setToText(sz.name); setToPos(sz.pos) }}
                  style={{ marginTop: '5px', padding: '3px 9px', background: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  Set as Destination
                </button>
              </Popup>
            </Marker>
          ))}

          {fromPos && <Marker position={fromPos}><Popup>📍 FROM: {fromText}</Popup></Marker>}
          {toPos   && <Marker position={toPos}  ><Popup>🏥 TO: {toText}</Popup></Marker>}

          {route && (
            <Polyline positions={route}
              pathOptions={{ color: '#27AE60', weight: 6, dashArray: '12 6', opacity: 0.95 }} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
