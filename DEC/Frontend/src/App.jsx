import './leafletIconFix'
import { useState, useEffect, useRef, useCallback } from 'react'
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

const QUICK_LOCATIONS = [
  { name: 'Mehdipatnam',   lat: 17.3987, lng: 78.4364 },
  { name: 'Hitech City',   lat: 17.4454, lng: 78.3772 },
  { name: 'Secunderabad',  lat: 17.4399, lng: 78.4983 },
  { name: 'Ameerpet',      lat: 17.4375, lng: 78.4487 },
  { name: 'LB Nagar',      lat: 17.3472, lng: 78.5567 },
  { name: 'Banjara Hills', lat: 17.4156, lng: 78.4347 },
]

// ── Voice System (fixed for all browsers) ───────────────────────────────────
let voiceReady = false
let selectedVoice = null

function initVoice() {
  if (!window.speechSynthesis) return
  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices()
    // Prefer English India voice, fall back to any English
    selectedVoice = voices.find(v => v.lang === 'en-IN')
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0]
    voiceReady = true
  }
  loadVoices()
  window.speechSynthesis.onvoiceschanged = loadVoices
}

function speak(text) {
  if (!window.speechSynthesis) {
    console.warn('Speech synthesis not supported')
    return
  }
  // Chrome requires user interaction before speaking
  // Cancel any ongoing speech first
  window.speechSynthesis.cancel()
  
  setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(text)
    if (selectedVoice) utt.voice = selectedVoice
    utt.lang   = 'en-IN'
    utt.rate   = 0.85
    utt.pitch  = 1.0
    utt.volume = 1.0
    utt.onerror = (e) => console.warn('Speech error:', e.error)
    window.speechSynthesis.speak(utt)
  }, 100)
}

// ── Geocoding ────────────────────────────────────────────────────────────────
async function geocode(query) {
  const res = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: query + ', Hyderabad, India', format: 'json', limit: 1, countrycodes: 'in' },
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.data || res.data.length === 0)
    throw new Error(`Location "${query}" not found. Try a different name.`)
  return {
    lat: parseFloat(res.data[0].lat),
    lng: parseFloat(res.data[0].lon),
    display: res.data[0].display_name.split(',').slice(0, 2).join(','),
  }
}

// ── Map helpers ──────────────────────────────────────────────────────────────
function MapFlyTo({ position }) {
  const map = useMap()
  useEffect(() => { if (position) map.flyTo(position, 14, { duration: 1.5 }) }, [position])
  return null
}

function MapClickHandler({ clickMode, onFromClick, onToClick }) {
  useMapEvents({
    click: (e) => {
      if (clickMode === 'from') onFromClick(e.latlng.lat, e.latlng.lng)
      if (clickMode === 'to')   onToClick(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

// ── Styled input ─────────────────────────────────────────────────────────────
function PlaceInput({ label, icon, accentColor, value, onChange, onGPS, suggestions, onSuggestionClick, quickList, onQuick, isActive, onActivate }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(suggestions.length > 0), [suggestions])

  return (
    <div style={{ flex: 1, minWidth: '230px', position: 'relative' }}>
      <label style={{ fontSize: '11px', color: accentColor, fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
        {icon} {label}
        {isActive && <span style={{ marginLeft: '8px', color: '#F39C12', fontSize: '10px' }}>← Click map to pin</span>}
      </label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(false) }}
          onFocus={() => { onActivate(); setOpen(suggestions.length > 0) }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={`Type area name...`}
          autoComplete="off"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: '8px',
            border: `2px solid ${isActive ? accentColor : '#566573'}`,
            background: '#2C3E50', color: 'white', fontSize: '14px', outline: 'none',
          }}
        />
        {onGPS && (
          <button type="button" onClick={onGPS} title="Use GPS location"
            style={{ padding: '9px 12px', borderRadius: '8px', border: 'none', background: '#1A5276', color: 'white', cursor: 'pointer', fontSize: '16px' }}>
            📡
          </button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#1C2833', border: `1px solid ${accentColor}`, borderRadius: '0 0 8px 8px',
          maxHeight: '180px', overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <div key={i}
              onMouseDown={() => { onSuggestionClick(s); setOpen(false) }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: '#AED6F1', borderBottom: '1px solid #2C3E50' }}
              onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              {icon} {s.display_name.split(',').slice(0, 3).join(',')}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '6px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {quickList && quickList.map((q, i) => (
          <button key={i} type="button"
            onMouseDown={() => onQuick(q)}
            style={{ padding: '3px 10px', borderRadius: '20px', border: `1px solid ${accentColor}55`, background: '#2C3E50', color: '#AED6F1', cursor: 'pointer', fontSize: '11px' }}
            onMouseOver={e => e.currentTarget.style.background = '#1A5276'}
            onMouseOut={e => e.currentTarget.style.background = '#2C3E50'}
          >
            {q.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [fromText,   setFromText]   = useState('')
  const [toText,     setToText]     = useState('')
  const [fromPos,    setFromPos]    = useState(null)
  const [toPos,      setToPos]      = useState(null)
  const [fromSug,    setFromSug]    = useState([])
  const [toSug,      setToSug]      = useState([])
  const [route,      setRoute]      = useState(null)
  const [distance,   setDistance]   = useState(null)
  const [destLabel,  setDestLabel]  = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [offline,    setOffline]    = useState(!navigator.onLine)
  const [clickMode,  setClickMode]  = useState(null)
  const [flyTo,      setFlyTo]      = useState(null)
  const [voiceOn,    setVoiceOn]    = useState(true)
  const [voiceMsg,   setVoiceMsg]   = useState('')
  const [activeInput,setActiveInput]= useState('from')
  const fromTimer = useRef(null)
  const toTimer   = useRef(null)

  useEffect(() => {
    initVoice()
    window.addEventListener('online',  () => setOffline(false))
    window.addEventListener('offline', () => setOffline(true))
  }, [])

  // ── Debounced autocomplete ──────────────────────────────────────────────
  function handleFromChange(val) {
    setFromText(val); setFromPos(null)
    clearTimeout(fromTimer.current)
    if (val.length < 2) { setFromSug([]); return }
    fromTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: val + ', Hyderabad, India', format: 'json', limit: 5, countrycodes: 'in' },
          headers: { 'Accept-Language': 'en' },
        })
        setFromSug(res.data)
      } catch { setFromSug([]) }
    }, 400)
  }

  function handleToChange(val) {
    setToText(val); setToPos(null)
    clearTimeout(toTimer.current)
    if (val.length < 2) { setToSug([]); return }
    toTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: val + ', Hyderabad, India', format: 'json', limit: 5, countrycodes: 'in' },
          headers: { 'Accept-Language': 'en' },
        })
        setToSug(res.data)
      } catch { setToSug([]) }
    }, 400)
  }

  function selectFromSug(s) {
    setFromText(s.display_name.split(',').slice(0, 2).join(','))
    setFromPos([parseFloat(s.lat), parseFloat(s.lon)])
    setFlyTo([parseFloat(s.lat), parseFloat(s.lon)])
    setFromSug([])
  }

  function selectToSug(s) {
    setToText(s.display_name.split(',').slice(0, 2).join(','))
    setToPos([parseFloat(s.lat), parseFloat(s.lon)])
    setToSug([])
  }

  function handleFromMapClick(lat, lng) {
    setFromText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`)
    setFromPos([lat, lng])
    setClickMode(null)
  }

  function handleToMapClick(lat, lng) {
    setToText(`${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`)
    setToPos([lat, lng])
    setClickMode(null)
  }

  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported on this device.'); return }
    setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude
        setFromText('My GPS Location')
        setFromPos([lat, lng])
        setFlyTo([lat, lng])
      },
      () => setError('GPS failed. Click the map or type your location.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── Check hazards near route ────────────────────────────────────────────
  function hazardsNearRoute(coords) {
    const found = []
    coords.forEach(([lat, lng]) => {
      HAZARD_ZONES.forEach(hz => {
        const d = Math.sqrt((lat-hz.center[0])**2 + (lng-hz.center[1])**2) * 111000
        if (d < hz.radius * 2 && !found.find(f => f.name === hz.name)) found.push(hz)
      })
    })
    return found
  }

  // ── Speak route instructions ────────────────────────────────────────────
  function announceRoute(dist, dest, hazards) {
    if (!voiceOn) return
    const msgs = [
      `Evacuation route found. Total distance ${dist} kilometres to ${dest}.`,
      ...hazards.map(h => `Warning! ${h.name} detected nearby. This is a ${h.type} hazard zone. The route has been adjusted to avoid this danger area. Please do not enter the red marked zone.`),
      `You are now on the safest evacuation route. Follow the green line on your screen. Stay calm and proceed to ${dest}.`,
    ]
    let delay = 300
    msgs.forEach(msg => {
      setTimeout(() => {
        setVoiceMsg(msg)
        if (voiceOn) speak(msg)
      }, delay)
      delay += msg.length * 60 + 1000
    })
  }

  // ── Get route ───────────────────────────────────────────────────────────
  async function handleGetRoute(e) {
    e && e.preventDefault()
    setError(null); setRoute(null); setDistance(null); setDestLabel(null)

    let fLat = fromPos?.[0], fLng = fromPos?.[1]
    let tLat = toPos?.[0],   tLng = toPos?.[1]

    setLoading(true)
    try {
      if (!fLat && fromText.trim()) {
        const g = await geocode(fromText); fLat = g.lat; fLng = g.lng
        setFromPos([fLat, fLng])
      }
      if (!fLat) { setError('Please enter your FROM location.'); return }

      if (!tLat && toText.trim()) {
        const g = await geocode(toText); tLat = g.lat; tLng = g.lng
        setToPos([tLat, tLng])
      }

      const res = await axios.post(`${API}/api/route`, { origin_lat: fLat, origin_lng: fLng }, { timeout: 30000 })

      if (res.data.error) { setError(res.data.error); return }

      const coords = res.data.route.coordinates.map(([lng, lat]) => [lat, lng])
      setRoute(coords)
      setDistance(res.data.distance_km)
      const label = toText || res.data.destination
      setDestLabel(label)
      setFlyTo([fLat, fLng])

      const hazards = hazardsNearRoute(coords)
      announceRoute(res.data.distance_km, label, hazards)

    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Backend is waking up — please wait 30 seconds then try again.')
      } else if (err.message?.includes('Network Error')) {
        setError('Network error — open evac-cloud-api-5.onrender.com/api/health in a new tab to wake up the backend.')
      } else {
        setError(err.message || 'Could not compute route. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setFromText(''); setToText(''); setFromPos(null); setToPos(null)
    setRoute(null); setDistance(null); setDestLabel(null); setError(null)
    setClickMode(null); setVoiceMsg('')
    window.speechSynthesis?.cancel()
  }

  function repeatVoice() {
    if (destLabel && distance !== null) {
      speak(`Route from ${fromText} to ${destLabel}. Distance ${distance} kilometres. Follow the green line on screen. Avoid all red marked danger zones.`)
    }
  }

  const statusBg = offline ? '#922B21' : error ? '#784212' : destLabel ? '#1A5276' : '#1E8449'

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', fontFamily:'Arial, sans-serif' }}>

      {/* Status bar */}
      <div style={{ padding:'7px 20px', background:statusBg, color:'white', fontSize:'13px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <b>{offline ? '🔴 OFFLINE' : '🟢 LIVE MODE'}</b>
        <span>
          {loading  ? '⏳ Computing safest route...'
          : error   ? '⚠️ ' + error
          : destLabel && distance !== null ? `✅ Route: ${distance} km → ${destLabel}`
          : clickMode === 'from' ? '👆 Click map to set FROM location'
          : clickMode === 'to'   ? '👆 Click map to set TO location'
          : '🗺️ Enter FROM and TO locations then click Get Route'}
        </span>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <button onClick={() => { setVoiceOn(v => !v); window.speechSynthesis?.cancel() }}
            style={{ background:'transparent', border:'1px solid white', color:'white', borderRadius:'4px', padding:'2px 8px', cursor:'pointer', fontSize:'12px' }}>
            {voiceOn ? '🔊 Voice ON' : '🔇 Voice OFF'}
          </button>
          <span style={{ fontSize:'11px', opacity:0.7 }}>Dynamic Evacuation Cloud</span>
        </div>
      </div>

      {/* Voice message ticker */}
      {voiceMsg && voiceOn && (
        <div style={{ background:'#784212', color:'#FAD7A0', padding:'6px 20px', fontSize:'13px', borderBottom:'1px solid #E67E22', display:'flex', gap:'10px', alignItems:'center' }}>
          <span>🔊</span>
          <span><i>{voiceMsg}</i></span>
        </div>
      )}

      {/* Input panel */}
      <div style={{ background:'#1C2833', color:'white', padding:'14px 20px', borderBottom:'3px solid #E74C3C' }}>
        <div style={{ fontSize:'13px', color:'#E74C3C', fontWeight:'bold', marginBottom:'12px', letterSpacing:'1px' }}>
          🚨 ENTER YOUR LOCATIONS TO GET EVACUATION ROUTE
        </div>

        <form onSubmit={handleGetRoute}>
          <div style={{ display:'flex', gap:'14px', flexWrap:'wrap', alignItems:'flex-start' }}>

            <PlaceInput
              label="FROM — Your Current Location"
              icon="📍" accentColor="#27AE60"
              value={fromText} onChange={handleFromChange}
              onGPS={handleGPS}
              suggestions={fromSug}
              onSuggestionClick={selectFromSug}
              quickList={QUICK_LOCATIONS}
              onQuick={q => { setFromText(q.name); setFromPos([q.lat, q.lng]); setFlyTo([q.lat, q.lng]) }}
              isActive={clickMode === 'from'}
              onActivate={() => setActiveInput('from')}
            />

            <div style={{ display:'flex', alignItems:'center', paddingTop:'20px', color:'#E74C3C', fontSize:'26px', fontWeight:'bold' }}>→</div>

            <PlaceInput
              label="TO — Destination / Safe Zone"
              icon="🏥" accentColor="#3498DB"
              value={toText} onChange={handleToChange}
              suggestions={toSug}
              onSuggestionClick={selectToSug}
              quickList={SAFE_ZONES.map(s => ({ name:s.name, lat:s.pos[0], lng:s.pos[1] }))}
              onQuick={q => { setToText(q.name); setToPos([q.lat, q.lng]) }}
              isActive={clickMode === 'to'}
              onActivate={() => setActiveInput('to')}
            />

            {/* Buttons */}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', paddingTop:'18px' }}>
              <button type="submit" disabled={loading}
                style={{ padding:'10px 22px', borderRadius:'8px', border:'none', background:loading?'#566573':'#E74C3C', color:'white', fontWeight:'bold', cursor:loading?'not-allowed':'pointer', fontSize:'14px' }}>
                {loading ? '⏳ Computing...' : '🚨 Get Route'}
              </button>
              <div style={{ display:'flex', gap:'5px' }}>
                <button type="button" onClick={() => setClickMode(c => c==='from'?null:'from')}
                  style={{ padding:'5px 9px', borderRadius:'6px', border:`1px solid ${clickMode==='from'?'#27AE60':'#566573'}`, background:clickMode==='from'?'#1E8449':'transparent', color:'#AED6F1', cursor:'pointer', fontSize:'11px' }}>
                  📍 Pin From
                </button>
                <button type="button" onClick={() => setClickMode(c => c==='to'?null:'to')}
                  style={{ padding:'5px 9px', borderRadius:'6px', border:`1px solid ${clickMode==='to'?'#3498DB':'#566573'}`, background:clickMode==='to'?'#1A5276':'transparent', color:'#AED6F1', cursor:'pointer', fontSize:'11px' }}>
                  🏥 Pin To
                </button>
                <button type="button" onClick={handleClear}
                  style={{ padding:'5px 9px', borderRadius:'6px', border:'1px solid #566573', background:'transparent', color:'#AED6F1', cursor:'pointer', fontSize:'11px' }}>
                  🗑️ Clear
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Result info */}
        {destLabel && distance !== null && (
          <div style={{ marginTop:'10px', padding:'8px 14px', background:'#1A5276', borderRadius:'6px', display:'flex', gap:'16px', fontSize:'13px', flexWrap:'wrap', alignItems:'center' }}>
            <span>📍 <b>From:</b> {fromText}</span>
            <span>🏥 <b>To:</b> {destLabel}</span>
            <span>📏 <b>Distance:</b> {distance} km</span>
            <span>🛡️ <b>Avoids all hazard zones</b></span>
            <button onClick={repeatVoice}
              style={{ padding:'3px 12px', borderRadius:'4px', border:'none', background:'#27AE60', color:'white', cursor:'pointer', fontSize:'12px' }}>
              🔊 Repeat
            </button>
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ flex:1 }}>
        <MapContainer center={[17.4065, 78.4772]} zoom={13} style={{ height:'100%', width:'100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
          <MapClickHandler clickMode={clickMode} onFromClick={handleFromMapClick} onToClick={handleToMapClick} />
          {flyTo && <MapFlyTo position={flyTo} />}

          {HAZARD_ZONES.map((hz, i) => (
            <Circle key={i} center={hz.center} radius={hz.radius}
              pathOptions={{ color:hz.color, fillColor:hz.color, fillOpacity:0.3, weight:2 }}>
              <Popup>
                <b>⚠️ {hz.name}</b><br/>
                Type: {hz.type}<br/>
                Danger radius: {hz.radius}m<br/>
                <span style={{ color:'red', fontWeight:'bold' }}>Voice alert will warn you</span>
              </Popup>
            </Circle>
          ))}

          {SAFE_ZONES.map((sz, i) => (
            <Marker key={i} position={sz.pos}>
              <Popup>
                <b>🟢 {sz.name}</b><br/>
                Type: {sz.type}<br/>
                Capacity: {sz.capacity.toLocaleString()} people<br/>
                <button
                  onClick={() => { setToText(sz.name); setToPos(sz.pos) }}
                  style={{ marginTop:'6px', padding:'4px 10px', background:'#27AE60', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }}>
                  Set as Destination
                </button>
              </Popup>
            </Marker>
          ))}

          {fromPos && <Marker position={fromPos}><Popup><b>📍 FROM:</b> {fromText}</Popup></Marker>}
          {toPos   && <Marker position={toPos}  ><Popup><b>🏥 TO:</b>   {toText}</Popup></Marker>}

          {route && (
            <Polyline positions={route}
              pathOptions={{ color:'#27AE60', weight:6, dashArray:'12 6', opacity:0.95 }} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
