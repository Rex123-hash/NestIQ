import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Train,
  ShieldCheck,
  Info,
  Lightbulb,
  CircleCheck,
  Building2,
  Sparkles,
  DollarSign,
  Heart,
  Wind,
  MessageSquareQuote,
  ExternalLink,
  TriangleAlert,
} from 'lucide-react'
import { SUBSCORES, WEIGHTS, SOURCE_CHIPS, RUBRIC, METHOD_NOTE } from '../../data/neighborhoods.js'
import { ordinal } from '../../lib/adapt.js'
import { apiReviews } from '../../lib/api.js'
import LocalityMap from '../../components/LocalityMap.jsx'

const SUB_COLOR = {
  aff: '#3FB984',
  safe: '#7C5CF6',
  commute: '#4F86F7',
  life: '#EC6FA6',
  trend: '#F5A63B',
}

/* ------------------------------ shared bits ------------------------------- */
function Panel({ title, action, children, className = '', id }) {
  return (
    <div id={id} className={`card p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

function SubHeader({ title, sub, score, band, why, scoreLabel }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="font-serif text-2xl text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      <div className="flex gap-3 lg:w-[52%]">
        <div className="card flex-1 p-4">
          <p className="text-xs text-muted">{scoreLabel || `${title.split(' ')[0]} Sub-score`}</p>
          <p className="font-serif text-3xl text-brand-700">
            {score}
            <span className="text-base text-muted">/100</span>
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-line">
            <div className="h-1.5 rounded-full bg-aff" style={{ width: `${score}%` }} />
          </div>
          <p className="mt-1 text-xs font-medium text-aff">{band}</p>
        </div>
        <div className="card flex-1 bg-brand-50/50 p-4">
          <p className="text-sm font-semibold text-ink">Why this score?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{why}</p>
        </div>
      </div>
    </div>
  )
}

// "2nd-cheapest of 8" style label from a city-rank insight.
function rankLabel(insight, word) {
  if (!insight) return 'not yet ranked'
  return `${ordinal(insight.rank)}-${word} of ${insight.total}`
}

// Ranked comparison bars: every locality in the city on one metric, with this
// locality highlighted. Replaces the four identical metric grids that used to
// echo the same rent/AQI/commute numbers across every tab.
function PeerBars({ peers, metricKey, lowerBetter, currentId, unit = '', color = '#7C5CF6', format }) {
  const rows = (peers || []).filter((p) => Number.isFinite(p[metricKey]))
  if (!rows.length) return <p className="text-sm text-muted">Comparison data unavailable right now.</p>
  const max = Math.max(...rows.map((p) => p[metricKey])) || 1
  const sorted = [...rows].sort((a, b) => (lowerBetter ? a[metricKey] - b[metricKey] : b[metricKey] - a[metricKey]))
  return (
    <div className="space-y-2.5">
      {sorted.map((p) => {
        const val = p[metricKey]
        const isMe = p.id === currentId
        return (
          <div key={p.id} className="flex items-center gap-3 text-sm">
            <span className={`w-32 shrink-0 truncate ${isMe ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{p.short || p.name}</span>
            <div className="h-2 flex-1 rounded-full bg-line">
              <div className="h-2 rounded-full" style={{ width: `${(val / max) * 100}%`, backgroundColor: isMe ? color : `${color}55` }} />
            </div>
            <span className={`w-20 shrink-0 text-right ${isMe ? 'font-semibold text-ink' : 'text-muted'}`}>
              {format ? format(val) : val}
              {unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const inr = (v) => '₹' + Number(v).toLocaleString('en-IN')

const AMENITY_LABELS = {
  restaurant: 'Restaurants', cafe: 'Cafes', supermarket: 'Supermarkets',
  gym: 'Gyms', park: 'Parks', shopping_mall: 'Malls',
}

/* -------------------------------- Overview -------------------------------- */
const SUB_ICON = { affordability: DollarSign, safety: ShieldCheck, commute: Train, lifestyle: Heart, air_quality: Wind }

// Plain-language read of the AQI forecast so the prediction is visible, not
// buried in a chart. Prefers our BigQuery ML (ARIMA_PLUS) series, falls back to
// the Google forecast. Returns null when there is nothing to predict from.
function forecastTrend(n) {
  const series = n.aqiSeries || {}
  const fc = (series.bqmlForecast?.length ? series.bqmlForecast : series.forecast) || []
  const now = n.aqi
  if (!fc.length || !Number.isFinite(now)) return null
  const vals = fc.map((f) => f.aqi).filter(Number.isFinite)
  if (!vals.length) return null
  const peak = Math.max(...vals)
  const end = vals[vals.length - 1]
  const delta = end - now
  const source = series.bqmlForecast?.length ? 'BigQuery ML' : 'Google forecast'
  // Higher AQI is worse, so a rising value means air quality worsens.
  let dir = 'holding steady around AQI'
  if (delta >= 8) dir = 'worsening toward AQI'
  else if (delta <= -8) dir = 'improving toward AQI'
  return { peak, end, dir, source }
}

// Temporal anomaly: is the current AQI a spike (or dip) versus its own recent
// 24h history? Flags when the latest reading is >=1.5σ off its rolling mean.
// Free: reuses the live history series already on the page.
function aqiSpike(n) {
  const hist = (n.aqiSeries?.history || []).map((h) => h.aqi).filter(Number.isFinite)
  const now = n.aqi
  if (hist.length < 6 || !Number.isFinite(now)) return null
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length
  const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length)
  if (sd <= 0) return null
  const z = (now - mean) / sd
  if (z >= 1.5) return { dir: 'spiking above', mean: Math.round(mean), z: Math.abs(z) }
  if (z <= -1.5) return { dir: 'dropping below', mean: Math.round(mean), z: Math.abs(z) }
  return null
}

export function OverviewTab({ n }) {
  const ins = n.insights || { peers: [] }
  const [showMethod, setShowMethod] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const fc = forecastTrend(n)

  // "See full explanation" from the header links here: open the methodology
  // and scroll the FitScore Breakdown into view, then clean the URL.
  useEffect(() => {
    if (!searchParams.get('explain')) return
    setShowMethod(true)
    const el = document.getElementById('fitscore-breakdown')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const next = new URLSearchParams(searchParams)
    next.delete('explain')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const glance = [
    [Building2, 'Median Rent', n.rentDisplay || `$${n.rent.toLocaleString()}`, 'per month'],
    [Wind, 'Air Quality (AQI)', String(n.aqi ?? '—'), n.aqiCategory || ''],
    [Train, 'Avg Commute', `${n.commuteMin} min`, 'to city hub'],
    [ShieldCheck, 'Safety Score', `${n.subscores.safety}/100`, ''],
    [Sparkles, 'Lifestyle Score', `${n.subscores.lifestyle}/100`, ''],
  ]
  const highlights = [
    `Live air quality: AQI ${n.aqi} (${n.aqiCategory || 'live'})`,
    `Around ${n.commuteMin} min to the main work hub by road`,
    `Median rent about ${n.rentDisplay || '$' + n.rent.toLocaleString()}/month`,
    `Air Quality sub-score ${n.subscores.air_quality}/100 vs. the rest of the city`,
    `Amenities & lifestyle score ${n.subscores.lifestyle}/100`,
  ]

  return (
    <div className="space-y-5">
      {/* row 1 */}
      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr_1.35fr]">
        <Panel
          id="fitscore-breakdown"
          title="FitScore Breakdown"
          action={
            <button
              onClick={() => setShowMethod((v) => !v)}
              className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
            >
              <Info size={13} /> {showMethod ? 'Hide methodology' : 'How it works'}
            </button>
          }
        >
          <div className="space-y-3">
            {SUBSCORES.map((s) => {
              const Icon = SUB_ICON[s.key]
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${SUB_COLOR[s.color]}1f`, color: SUB_COLOR[s.color] }}>
                    <Icon size={15} />
                  </span>
                  <span className="w-24 shrink-0 text-sm text-ink-soft">{s.label}</span>
                  <div className="h-2 flex-1 rounded-full bg-line">
                    <div className="h-2 rounded-full" style={{ width: `${n.subscores[s.key]}%`, backgroundColor: SUB_COLOR[s.color] }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-sm font-semibold text-ink">{n.subscores[s.key]}<span className="text-xs text-muted">/100</span></span>
                  <span className="hidden w-16 shrink-0 text-right text-[11px] text-muted sm:block">Weight {WEIGHTS[s.key]}%</span>
                </div>
              )
            })}
          </div>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-[#F0F9F4] px-3 py-2 text-xs text-aff">
            <ShieldCheck size={14} /> Scores are normalized across all localities in this city
          </p>

          {showMethod && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-semibold text-ink">How the FitScore is built</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{METHOD_NOTE}</p>
              <ul className="mt-3 space-y-3">
                {RUBRIC.map((r) => (
                  <li key={r.key} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{r.label}</span>
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">Weight {WEIGHTS[r.key]}%</span>
                    </div>
                    <p className="mt-1 leading-relaxed text-muted">{r.why}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-soft">
                      <Info size={11} className="shrink-0" /> Source: {r.source}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="At a Glance">
          <dl className="space-y-3">
            {glance.map(([Icon, k, v, note]) => (
              <div key={k} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2.5 text-sm last:border-0">
                <dt className="flex items-center gap-2 text-muted"><Icon size={16} className="text-muted" /> {k}</dt>
                <dd className="text-right">
                  <span className="font-semibold text-ink">{v}</span>
                  {note && <span className="block text-[11px] text-muted">{note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        {/* map */}
        <LocalityMap items={[n]} zoom={13} className="min-h-[300px]" />
      </div>

      {/* row 2 */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Air Quality · Next 24h">
          {fc && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-[#FDF6E9] px-3 py-2 text-xs text-ink-soft">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-trend" />
              <p>
                <b className="font-semibold">Predicted:</b> air quality {fc.dir} {fc.end} in the next 24h (peak {fc.peak}).
                <span className="text-muted"> · {fc.source}</span>
              </p>
            </div>
          )}
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={n.aqiSeries?.forecast || []} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AA0AE' }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: '#9AA0AE' }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="aqi" stroke="#F5A63B" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted">Live AQI forecast · lower is cleaner air.</p>
        </Panel>

        <Panel title="Key Highlights">
          <ul className="space-y-2.5">
            {highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-ink-soft">
                <CircleCheck size={16} className="mt-0.5 shrink-0 text-aff" />
                {h}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#FDF6E9] p-3">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-trend" />
            <p className="text-xs text-ink-soft">
              <b className="font-semibold">Where it stands</b> {n.name} ranks {rankLabel(ins.aqi, 'cleanest')} for air quality and {rankLabel(ins.rent, 'cheapest')} for rent among localities in this city.
            </p>
          </div>
        </Panel>

        <Panel title="Sources & method">
          <p className="text-sm leading-relaxed text-ink-soft">
            Every number on this page is normalized across this city's localities from live Google data,
            then explained by Gemini. See the summary at the top of the page.
          </p>
          <p className="mt-3 text-xs font-medium text-ink">Sources</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {SOURCE_CHIPS.map((s) => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ------------------------------ Affordability ----------------------------- */
export function AffordabilityTab({ n }) {
  const aff = n.subscores.affordability
  const ins = n.insights || { peers: [] }
  return (
    <div>
      <SubHeader
        title="Affordability Overview"
        sub={`Cost of living and value for money in ${n.name}.`}
        score={aff}
        band={aff >= 75 ? 'Excellent' : aff >= 55 ? 'Good' : 'Moderate'}
        why={`At ${n.rentDisplay}/month, ${n.name} is ${rankLabel(ins.rent, 'cheapest')} in the city, an affordability score of ${aff}/100.`}
      />
      <Panel title="Rent compared with other localities">
        <p className="mb-4 text-xs text-muted">Lower bars are more affordable · {n.short || n.name} is highlighted.</p>
        <PeerBars peers={ins.peers} metricKey="rent" lowerBetter currentId={n.id} color="#3FB984" format={inr} />
        <p className="mt-4 flex items-center gap-2 text-xs text-muted">
          <Info size={13} /> Rent is a market estimate; air quality, amenities and commute are live from Google Maps Platform.
        </p>
      </Panel>
    </div>
  )
}

/* --------------------------------- Safety --------------------------------- */
export function SafetyTab({ n }) {
  const s = n.subscores.safety
  const ins = n.insights || { peers: [] }
  return (
    <div>
      <SubHeader
        title="Safety Overview"
        sub={`Safety and well-being in ${n.name}.`}
        score={s}
        band={s >= 75 ? 'Excellent' : s >= 55 ? 'Good' : 'Moderate'}
        why={`${n.name} is ${rankLabel(ins.safety, 'safest')} in the city, combining locality profile with live environmental health.`}
      />
      <Panel title="Safety compared with other localities">
        <p className="mb-4 text-xs text-muted">Higher bars are safer · {n.short || n.name} is highlighted.</p>
        <PeerBars peers={ins.peers} metricKey="safety" currentId={n.id} color="#7C5CF6" unit="/100" />
        <p className="mt-4 flex items-center gap-2 text-xs text-muted">
          <Info size={13} /> Granular crime data isn't openly published for Indian cities, so this index blends the locality profile with live air quality. Here it's <b className="mx-1">AQI {n.aqi} ({n.aqiCategory})</b>. {aqiAdvice(n.aqi ?? 0)}
        </p>
      </Panel>
    </div>
  )
}

/* -------------------------------- Commute --------------------------------- */
export function CommuteTab({ n }) {
  const c = n.subscores.commute
  const ins = n.insights || { peers: [] }
  return (
    <div>
      <SubHeader
        title="Commute Overview"
        sub={`Getting around from ${n.name}.`}
        score={c}
        band={c >= 75 ? 'Excellent' : c >= 55 ? 'Good' : 'Moderate'}
        why={`At about ${n.commuteMin} min to the city's main hub, ${n.name} is ${rankLabel(ins.commute, 'fastest')} in the city, a commute score of ${c}/100.`}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Commute compared with other localities">
          <p className="mb-4 text-xs text-muted">Shorter bars are quicker · {n.short || n.name} is highlighted.</p>
          <PeerBars peers={ins.peers} metricKey="commute" lowerBetter currentId={n.id} color="#4F86F7" unit=" min" />
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <Info size={13} /> Live driving time to the city work hub from Google Maps Distance Matrix (varies with time of day).
          </p>
        </Panel>
        <LocalityMap items={[n]} zoom={13} className="min-h-[320px]" />
      </div>
    </div>
  )
}

/* -------------------------------- Lifestyle ------------------------------- */
export function LifestyleTab({ n }) {
  const l = n.subscores.lifestyle
  const ins = n.insights || { peers: [] }
  return (
    <div>
      <SubHeader
        title="Lifestyle Overview"
        sub={`Amenities and daily life in ${n.name}.`}
        score={l}
        band={l >= 75 ? 'Excellent' : l >= 55 ? 'Good' : 'Moderate'}
        why={`${n.name} has about ${n.amenity_count} key amenities within 1.5 km, ${rankLabel(ins.amenity, 'busiest')} in the city, a lifestyle score of ${l}/100.`}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Amenities compared with other localities">
          {n.amenity_breakdown && (
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(n.amenity_breakdown)
                .filter(([, c]) => c > 0)
                .map(([k, c]) => (
                  <span key={k} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {c} {AMENITY_LABELS[k] || k}
                  </span>
                ))}
            </div>
          )}
          <p className="mb-4 text-xs text-muted">Total within 1.5 km vs. the rest of the city · {n.short || n.name} is highlighted.</p>
          <PeerBars peers={ins.peers} metricKey="amenity" currentId={n.id} color="#EC6FA6" />
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <Info size={13} /> Amenity counts are live from Google Maps Platform Places API.
          </p>
        </Panel>
        <LocalityMap items={[n]} zoom={14} className="min-h-[320px]" />
      </div>
    </div>
  )
}

/* ------------------------------ Air Quality ------------------------------- */
function aqiBand(aqi) {
  if (aqi <= 50) return ['Good', '#3FB984']
  if (aqi <= 100) return ['Satisfactory', '#8DBF3F']
  if (aqi <= 200) return ['Moderate', '#F5A63B']
  if (aqi <= 300) return ['Poor', '#EC6F3F']
  if (aqi <= 400) return ['Very Poor', '#E5484D']
  return ['Severe', '#9B2226']
}

function aqiAdvice(aqi) {
  if (aqi <= 100) return 'Air quality is acceptable and outdoor activity is fine for most people.'
  if (aqi <= 200) return 'Sensitive groups (children, elderly, asthma) should limit prolonged outdoor exertion.'
  if (aqi <= 300) return 'Everyone may feel effects; sensitive groups should avoid outdoor exertion. Consider an N95 mask.'
  return 'Health alert: avoid outdoor activity, keep windows shut, and use an air purifier and N95 mask.'
}

export function AirQualityTab({ n }) {
  const series = n.aqiSeries || { history: [], forecast: [], bqmlForecast: [] }
  const bqml = series.bqmlForecast || []
  const fcByLabel = Object.fromEntries((series.forecast || []).map((f) => [f.label, f.aqi]))
  const futureRows = (bqml.length ? bqml : series.forecast || []).map((b) => ({
    label: b.label,
    future: fcByLabel[b.label],
    bqml: bqml.length ? b.aqi : undefined,
  }))
  const data = [
    ...series.history.map((h) => ({ label: h.label, past: h.aqi })),
    ...futureRows,
  ]
  const aqi = n.aqi ?? 0
  const [band, color] = aqiBand(aqi)
  const spike = aqiSpike(n)
  const forecastVals = (bqml.length ? bqml : series.forecast || []).map((f) => f.aqi)
  const peak = forecastVals.length ? Math.max(...forecastVals) : aqi
  const tiles = [
    ['Current AQI', String(aqi), band],
    ['Dominant Pollutant', (n.aqi_pollutant || 'PM2.5').toUpperCase(), 'Main driver'],
    ['24h Forecast Peak', String(peak), aqiBand(peak)[0]],
    ['Air Quality Sub-score', `${n.subscores.air_quality}/100`, 'vs. this city'],
  ]
  return (
    <div>
      <SubHeader
        title="Air Quality Overview"
        sub={`Live air quality and 24-hour forecast for ${n.name}.`}
        score={n.subscores.air_quality}
        band={band}
        why={`${n.name} currently reports a CPCB AQI of ${aqi} (${band}). ${aqiAdvice(aqi)}`}
      />
      {spike && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-[#FDECEC] px-4 py-3 text-sm text-red-700">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            <b className="font-semibold">Anomaly detected:</b> the current reading (AQI {aqi}) is {spike.dir} its last-24h average of {spike.mean}, {spike.z.toFixed(1)}σ out of the normal range.
          </p>
        </div>
      )}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([k, v, note]) => (
          <div key={k} className="card p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{v}</p>
            <p className="mt-0.5 text-xs" style={{ color }}>{note}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="AQI · last 24h and next 24h forecast" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AA0AE' }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 11, fill: '#9AA0AE' }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
              <Line type="monotone" dataKey="past" name="Past 24h (live)" stroke="#7C5CF6" strokeWidth={2.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="future" name="Google forecast" stroke="#F5A63B" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
              <Line type="monotone" dataKey="bqml" name="BigQuery ML (ARIMA_PLUS)" stroke="#3FB984" strokeWidth={2.5} strokeDasharray="4 3" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Info size={13} /> History from Google Air Quality API (CPCB); green line is our own <b className="mx-1 font-semibold text-aff">BigQuery ML ARIMA_PLUS</b> forecast, trained on live India AQI history.
          </p>
        </Panel>

        <Panel title="Health Advisory">
          <div className="rounded-xl p-4" style={{ backgroundColor: `${color}1a` }}>
            <p className="text-sm font-semibold" style={{ color }}>{band} · AQI {aqi}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{aqiAdvice(aqi)}</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-muted">
            <li>0–50 Good · 51–100 Satisfactory · 101–200 Moderate</li>
            <li>201–300 Poor · 301–400 Very Poor · 400+ Severe</li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}

/* --------------------------- Community: reviews + ranks ------------------- */
function ReviewsPanel({ n }) {
  const [reviews, setReviews] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setReviews(null)
    apiReviews(n.id, n.cityId).then((d) => {
      if (!alive) return
      setReviews(d)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [n.id, n.cityId])

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <MessageSquareQuote size={15} className="text-brand-600" /> What residents say online
        </span>
      }
      className="lg:col-span-2"
    >
      {loading ? (
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100" />
          <p className="pt-1 text-xs text-muted">Searching the web with Gemini…</p>
        </div>
      ) : reviews?.summary ? (
        <>
          <blockquote className="rounded-xl bg-brand-50/60 p-4 text-sm leading-relaxed text-ink-soft">
            {reviews.summary}
          </blockquote>
          {reviews.citations?.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-ink">Sources found on the web</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {reviews.citations.map((c) => (
                  <a
                    key={c.uri}
                    href={c.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="flex max-w-[220px] items-center gap-1 truncate rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-brand-50 hover:text-brand-700"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                    <span className="truncate">{c.title}</span>
                  </a>
                ))}
              </div>
            </>
          )}
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Info size={13} /> AI summary of live web results (Gemini + Google Search grounding). Sentiment reflects public posts, not NestIQ.
          </p>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Lightbulb size={15} className="shrink-0 text-trend" />
          Not much public discussion found for this locality yet. The hard live signals on the other tabs tell the fuller story.
        </p>
      )}
    </Panel>
  )
}

export function CommunityTab({ n }) {
  const ins = n.insights || { peers: [] }
  const compare = [
    ['Affordability', rankLabel(ins.rent, 'cheapest'), '#3FB984', ins.rent],
    ['Air Quality', rankLabel(ins.aqi, 'cleanest'), '#F5A63B', ins.aqi],
    ['Commute', rankLabel(ins.commute, 'fastest'), '#4F86F7', ins.commute],
    ['Safety', rankLabel(ins.safety, 'safest'), '#7C5CF6', ins.safety],
    ['Lifestyle', rankLabel(ins.amenity, 'busiest'), '#EC6FA6', ins.amenity],
  ]
  return (
    <div>
      <SubHeader
        title="Community Insights"
        sub={`What residents say about ${n.name}, and where it ranks in the city.`}
        score={n.fitScore ?? 0}
        band={n.match || ''}
        scoreLabel="FitScore"
        why="Live web sentiment plus a live ranking of this locality against every other one in the city."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <ReviewsPanel n={n} />

        <Panel title={`How ${n.short || n.name} ranks`}>
          <div className="space-y-4">
            {compare.map(([label, text, color, insight]) => {
              const pct = insight ? ((insight.total - insight.rank + 1) / insight.total) * 100 : 0
              return (
                <div key={label} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">{label}</span>
                    <span className="text-xs font-medium text-ink">{text}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-line">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <Info size={13} /> Fuller bar = better rank within the city.
          </p>
        </Panel>
      </div>
    </div>
  )
}
