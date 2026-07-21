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
  Radio,
  MapPin,
  Clock3,
  BookOpenText,
  Hospital,
  Stethoscope,
  Pill,
  School,
  GraduationCap,
} from 'lucide-react'
import { SUBSCORES, WEIGHTS, SOURCE_CHIPS, RUBRIC, METHOD_NOTE } from '../../data/neighborhoods.js'
import { ordinal } from '../../lib/adapt.js'
import { apiReviews, apiRentVerification, apiLocalityPulse, apiCivicKnowledge, getCachedRentVerification } from '../../lib/api.js'
import LocalityMap from '../../components/LocalityMap.jsx'
import { essentialCards, essentialsSummary } from '../../lib/essentials.js'

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
  const hasScore = Number.isFinite(score)
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
            {hasScore ? score : 'Unavailable'}
            {hasScore && <span className="text-base text-muted">/100</span>}
          </p>
          {hasScore && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-line">
              <div className="h-1.5 rounded-full bg-aff" style={{ width: `${score}%` }} />
            </div>
          )}
          <p className={`mt-1 text-xs font-medium ${hasScore ? 'text-aff' : 'text-amber-700'}`}>{hasScore ? band : 'Excluded from provisional FitScore'}</p>
        </div>
        <div className="card flex-1 bg-brand-50/50 p-4">
          <p className="text-sm font-semibold text-ink">Why this score?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{why}</p>
        </div>
      </div>
    </div>
  )
}

const EVIDENCE_STATUS = {
  live: 'Live', stale: 'Cached', estimated: 'Estimated', curated: 'Curated proxy',
  partial: 'Partial data', temporarily_unavailable: 'Temporarily unavailable',
}

function EvidenceNote({ evidence }) {
  if (!evidence) return null
  const unavailable = evidence.status === 'temporarily_unavailable' || evidence.status === 'partial'
  const curatedSafetyBaseline = evidence.metric === 'safety' && evidence.sourceType === 'curated_proxy'
  const curatedRentBaseline = evidence.metric === 'affordability' && evidence.sourceType === 'curated_market_estimate'
  const curatedBaseline = curatedSafetyBaseline || curatedRentBaseline
  return (
    <div className={`mt-4 rounded-xl border px-3 py-2.5 text-xs ${unavailable ? 'border-amber-200 bg-amber-50/70' : 'border-line bg-[#F7F8FB]'}`}>
      <p className={`font-semibold ${unavailable ? 'text-amber-800' : 'text-ink'}`}>
        {curatedBaseline ? 'Curated baseline' : (EVIDENCE_STATUS[evidence.status] || evidence.status)} · {evidence.source}
      </p>
      <p className="mt-1 leading-relaxed text-muted">{evidence.limitation}</p>
      <p className="mt-1 text-[11px] text-muted">
        Scope: {String(evidence.geographicScope || 'locality').replaceAll('_', ' ')}
        {curatedBaseline
          ? curatedSafetyBaseline
            ? ' · Baseline only; live evidence confidence is shown above.'
            : ' · Baseline only; select Verify current rent for grounded confidence.'
          : ` · ${evidence.confidenceLabel || 'Confidence'}: ${evidence.confidence}`}
        {evidence.fetchedAt ? ` · ${new Date(evidence.fetchedAt).toLocaleString('en-IN')}` : ''}
      </p>
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
    [Train, 'Avg Commute', Number.isFinite(n.commuteMin) ? `${n.commuteMin} min` : 'Unavailable', Number.isFinite(n.commuteMin) ? 'to city hub' : 'not estimated'],
    [ShieldCheck, 'Safety Score', `${n.subscores.safety}/100`, ''],
    [Sparkles, 'Essentials & Lifestyle Score', Number.isFinite(n.subscores.lifestyle) ? `${n.subscores.lifestyle}/100` : 'Unavailable', ''],
  ]
  const highlights = [
    Number.isFinite(n.aqi)
      ? `Air quality: AQI ${n.aqi}${n.airHealthBand ? ` (${n.airHealthBand})` : n.aqiCategory ? ` (${n.aqiCategory})` : ''}`
      : 'Air quality reading is temporarily unavailable (not estimated)',
    Number.isFinite(n.commuteMin) ? `Around ${n.commuteMin} min to the main work hub by road` : 'Commute time is temporarily unavailable (not estimated)',
    `Median rent about ${n.rentDisplay || '$' + n.rent.toLocaleString()}/month`,
    Number.isFinite(n.subscores.air_quality)
      ? `Air Quality health score ${n.subscores.air_quality}/100 on the absolute CPCB band`
      : 'Air Quality health score unavailable',
    Number.isFinite(n.subscores.lifestyle) ? `Amenities & lifestyle score ${n.subscores.lifestyle}/100` : 'Amenities signal incomplete; lifestyle score excluded',
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
                    <div className="h-2 rounded-full" style={{ width: `${Number.isFinite(n.subscores[s.key]) ? n.subscores[s.key] : 0}%`, backgroundColor: SUB_COLOR[s.color] }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-sm font-semibold text-ink">
                    {Number.isFinite(n.subscores[s.key]) ? <>{n.subscores[s.key]}<span className="text-xs text-muted">/100</span></> : <span className="text-xs text-amber-700">—</span>}
                  </span>
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
            Every pillar carries its own source, freshness and limitation. Live Google signals are kept separate from curated market estimates and proxies; Gemini explains the evidence but does not create the values.
          </p>
          <div className="mt-3 space-y-2">
            {Object.values(n.evidence || {}).length
              ? Object.values(n.evidence).map((e) => (
                  <div key={e.metric} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2 text-xs">
                    <span className="font-medium capitalize text-ink">{e.metric.replace('_', ' ')}</span>
                    <span className="text-right text-muted">{EVIDENCE_STATUS[e.status] || e.status} · {e.source}</span>
                  </div>
                ))
              : <div className="flex flex-wrap gap-2">{SOURCE_CHIPS.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
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
  const [verification, setVerification] = useState(() => getCachedRentVerification(n.id, n.cityId))
  const [rentRevealed, setRentRevealed] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [backgroundPending, setBackgroundPending] = useState(false)
  const [verificationNotice, setVerificationNotice] = useState('')

  // Verified evidence spans several home sizes; the listed estimate states no
  // size at all. Showing the per-size medians is what makes the two comparable,
  // so a gap reads as a difference in unit size rather than a contradiction.
  const rentSizeBreakdown = Object.entries(verification?.bySize || {})
    .map(([beds, v]) => ({ beds: Number(beds), ...v }))
    .sort((a, b) => a.beds - b.beds)

  const rentComparisonNote = (() => {
    const listed = verification?.curatedMedianRent
    if (verification?.status !== 'available' || !listed) return ''
    if (rentSizeBreakdown.length === 0) return ''
    return `The listed ${inr(listed)} estimate is not tied to a unit size, so compare it against the matching size above rather than the overall median.`
  })()

  useEffect(() => {
    setVerification(getCachedRentVerification(n.id, n.cityId))
    setRentRevealed(false)
    setVerifying(false)
    setBackgroundPending(false)
    setVerificationNotice('')
  }, [n.id, n.cityId])

  useEffect(() => {
    if (!backgroundPending) return undefined
    let alive = true
    let attempts = 0
    const poll = async () => {
      attempts += 1
      const result = await apiRentVerification(n.id, n.cityId, false)
      if (!alive) return
      if (result?.status === 'available' && result?.refreshStatus !== 'refreshing') {
        setVerification(result)
        setBackgroundPending(false)
        setVerificationNotice('Verification updated from grounded sources.')
      } else if (result?.status !== 'pending' && result?.refreshStatus !== 'refreshing') {
        setVerification(result)
        setBackgroundPending(false)
        setVerificationNotice(result?.limitation || 'Verification could not complete. The curated estimate remains unchanged.')
      } else if (attempts >= 30) {
        setBackgroundPending(false)
        setVerificationNotice('Verification is still running. You can continue browsing and select Check status later.')
      }
    }
    const timer = setInterval(poll, 4000)
    return () => { alive = false; clearInterval(timer) }
  }, [backgroundPending, n.id, n.cityId])

  const verifyRent = async (refresh = false) => {
    setRentRevealed(true)
    setVerifying(true)
    setVerificationNotice(refresh ? 'Refreshing sources in the background. Your current verification remains visible.' : '')
    try {
      const result = await apiRentVerification(n.id, n.cityId, refresh)
      if (result?.status === 'pending' || result?.refreshStatus === 'refreshing') {
        if (result?.status === 'available' || verification?.status !== 'available') setVerification(result)
        const canPoll = result?.pollable !== false
        setBackgroundPending(canPoll)
        setVerificationNotice(canPoll
          ? 'Grounded verification is running in the background and usually takes up to a minute, since sources are searched and each observation is validated. You can continue browsing while NestIQ checks sources.'
          : (result?.limitation || 'The source check is continuing. You can keep browsing and check again shortly.'))
      } else {
        setVerification(result || {
          status: 'temporarily_unavailable',
          limitation: 'The verification service could not be reached. The curated estimate remains unchanged.',
        })
        setVerificationNotice('')
        setBackgroundPending(false)
      }
    } finally {
      setVerifying(false)
    }
  }
  const handleRentAction = () => {
    if (!rentRevealed) {
      const cached = getCachedRentVerification(n.id, n.cityId)
      setRentRevealed(true)
      if (cached?.status === 'available') {
        setVerification(cached)
        return
      }
      verifyRent(false)
      return
    }
    verifyRent(verification?.status === 'available' && !backgroundPending)
  }
  return (
    <div>
      <SubHeader
        title="Affordability Overview"
        sub={`Cost of living and value for money in ${n.name}.`}
        score={aff}
        band={aff >= 75 ? 'Excellent' : aff >= 55 ? 'Good' : 'Moderate'}
        why={Number.isFinite(aff)
          ? `At ${n.rentDisplay}/month, ${n.name} is ${rankLabel(ins.rent, 'cheapest')} in the city, an affordability score of ${aff}/100.`
          : `Rent evidence has not been sourced for ${n.name} yet, so affordability is excluded from the FitScore rather than estimated. Select Verify current rent to search for cited market evidence.`}
      />
      <Panel
        title="Rent compared with other localities"
        action={(
          <button
            type="button"
            onClick={handleRentAction}
            disabled={verifying}
            className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
          >
            {verifying
              ? 'Starting verification…'
              : !rentRevealed
                ? 'Verify current rent'
                : backgroundPending
                ? 'Check status'
                : verification?.status === 'available'
                  ? 'Refresh verification'
                  : 'Verify current rent'}
          </button>
        )}
      >
        <p className="mb-4 text-xs text-muted">Lower bars are more affordable · {n.short || n.name} is highlighted.</p>
        <PeerBars peers={ins.peers} metricKey="rent" lowerBetter currentId={n.id} color="#3FB984" format={inr} />
        {rentRevealed && verificationNotice && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{verificationNotice}</p>}
        {rentRevealed && verification?.status === 'available' && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Grounded market verification</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {inr(verification.medianRent)} median
                  <span className="ml-2 text-sm font-normal text-muted">
                    {inr(verification.rangeLow)}–{inr(verification.rangeHigh)} observed range
                  </span>
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700">
                {verification.confidence} confidence · {verification.confidenceScore}/100
              </span>
            </div>
            {rentSizeBreakdown.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {rentSizeBreakdown.map((s) => (
                  <span key={s.beds} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-ink">{s.beds} BHK</span>
                    <span className="ml-1.5 font-semibold text-emerald-700">{inr(s.median)}</span>
                    <span className="ml-1 text-muted">({s.count} {s.count === 1 ? 'listing' : 'listings'})</span>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {verification.sampleSize} validated observations across {verification.sourceCount} grounded sources. This verification is evidence only and does not silently change FitScore.
            </p>
            {/* The two figures measure different things: this one is specifically
                1-bedroom, while the listed estimate is not size-specific. Without
                saying so, a large gap reads as the page contradicting itself. */}
            {rentComparisonNote && (
              <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                {rentComparisonNote}
              </p>
            )}
            {verification.citations?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {verification.citations.slice(0, 5).map((c) => (
                  <a key={c.uri} href={c.uri} target="_blank" rel="noreferrer" className="chip text-[11px] hover:border-brand-300">
                    <ExternalLink size={11} /> {c.title}
                  </a>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted">{verification.limitation}</p>
          </div>
        )}
        {rentRevealed && verification?.status === 'pending' && !verificationNotice && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-700">
            Grounded verification is running in the background and usually takes up to a minute, since sources are searched and each observation is validated. You can continue browsing while NestIQ checks sources.
          </div>
        )}
        {rentRevealed && verification && verification.status !== 'available' && verification.status !== 'pending' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {verification.limitation || 'Not enough citation-backed observations were found. The curated estimate remains unchanged.'}
          </div>
        )}
        <EvidenceNote evidence={n.evidence?.affordability} />
      </Panel>
    </div>
  )
}

/* --------------------------------- Safety --------------------------------- */
export function SafetyTab({ n }) {
  const s = n.subscores.safety
  // A newly onboarded city has no curated safety profile at all. The copy below must
  // not describe a source that does not exist, so every claim keys off this.
  const hasCurated = Number.isFinite(s)
  const ins = n.insights || { peers: [] }
  const profile = n.safety_profile || n.evidence?.safety?.supportingEvidence
  const safetySignals = profile?.signals || {}
  const signalCards = [
    ['police', 'Police stations', ShieldCheck],
    ['hospital', 'Hospitals', Heart],
    ['fire_station', 'Fire stations', TriangleAlert],
  ]
  return (
    <div>
      <SubHeader
        title="Safety Overview"
        sub={`Safety and well-being in ${n.name}.`}
        score={s}
        band={s >= 75 ? 'Excellent' : s >= 55 ? 'Good' : 'Moderate'}
        why={hasCurated
          ? `${n.name} is ${rankLabel(ins.safety, 'safest')} in the city, based on a curated locality safety profile normalized across localities.`
          : `No curated safety profile exists for ${n.name}, so safety is excluded from the FitScore rather than estimated. The live emergency-access evidence below is context, not a crime-safety measure.`}
      />
      <Panel title="Safety compared with other localities">
        {hasCurated ? (
          <>
            <p className="mb-4 text-xs text-muted">Higher bars are safer · {n.short || n.name} is highlighted.</p>
            <PeerBars peers={ins.peers} metricKey="safety" currentId={n.id} color="#7C5CF6" unit="/100" />
          </>
        ) : (
          <p className="mb-4 text-sm text-muted">
            No locality-level safety dataset is published for this city, so there is nothing to
            compare. This is a gap in the available data, not a temporary outage.
          </p>
        )}
        {profile && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">Live emergency-access evidence</p>
                <p className="text-xs text-muted">
                  {hasCurated
                    ? 'Supporting context only; it does not replace the curated safety score.'
                    : 'Emergency-service access only. This is not a crime-safety measure and is not scored.'}
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold capitalize text-brand-700">
                {profile.confidence} evidence confidence
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {signalCards.map(([key, label, Icon]) => {
                const signal = safetySignals[key]
                return (
                  <div key={key} className="rounded-xl border border-line bg-[#F9FAFC] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-ink"><Icon size={14} className="text-brand-600" /> {label}</div>
                    {signal ? (
                      <>
                        <p className="mt-2 text-xl font-semibold text-ink">{signal.count}</p>
                        <p className="text-[11px] text-muted">
                          within {signal.radiusKm} km{Number.isFinite(signal.nearestDistanceKm) ? ` · nearest ${signal.nearestDistanceKm} km` : ''}
                        </p>
                      </>
                    ) : <p className="mt-2 text-xs text-amber-700">Temporarily unavailable</p>}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50/60 px-3 py-2.5 text-xs">
              <span className="text-ink-soft">
                Emergency Access Index: <b className="text-ink">{Number.isFinite(profile.emergencyAccessScore) ? `${profile.emergencyAccessScore}/100` : 'Unavailable'}</b>
              </span>
              <a href={profile.officialCrimeContext?.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700">
                NCRB official context <ExternalLink size={11} />
              </a>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{profile.limitation} {profile.officialCrimeContext?.limitation}</p>
          </div>
        )}
        <EvidenceNote evidence={n.evidence?.safety} />
      </Panel>
    </div>
  )
}

/* -------------------------------- Commute --------------------------------- */
export function CommuteTab({ n }) {
  const c = n.subscores.commute
  const ins = n.insights || { peers: [] }
  const available = Number.isFinite(n.commuteMin) && Number.isFinite(c)
  return (
    <div>
      <SubHeader
        title="Commute Overview"
        sub={`Getting around from ${n.name}.`}
        score={c}
        band={c >= 75 ? 'Excellent' : c >= 55 ? 'Good' : 'Moderate'}
        why={available
          ? `At about ${n.commuteMin} min to the city's main hub, ${n.name} is ${rankLabel(ins.commute, 'fastest')} in the city, a commute score of ${c}/100.`
          : 'Google Distance Matrix did not return a valid route time. NestIQ excludes this pillar instead of substituting a typical commute.'}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Commute compared with other localities">
          <p className="mb-4 text-xs text-muted">Shorter bars are quicker · {n.short || n.name} is highlighted.</p>
          {available ? (
            <PeerBars peers={ins.peers} metricKey="commute" lowerBetter currentId={n.id} color="#4F86F7" unit=" min" />
          ) : (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No route time is available right now. No 40-minute fallback has been inserted.</p>
          )}
          <EvidenceNote evidence={n.evidence?.commute} />
        </Panel>
        <LocalityMap items={[n]} zoom={13} className="min-h-[320px]" />
      </div>
    </div>
  )
}

/* -------------------------------- Lifestyle ------------------------------- */
const ESSENTIAL_ICONS = {
  hospital: Hospital,
  doctor: Stethoscope,
  pharmacy: Pill,
  school: School,
  university: GraduationCap,
}

function fetchedLabel(value) {
  if (!value) return 'Update time unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Update time unavailable' : `Updated ${date.toLocaleString()}`
}

function EssentialServicesPanel({ profile }) {
  const cards = essentialCards(profile)
  const summary = essentialsSummary(profile)
  const isLoading = summary.status === 'loading'

  return (
    <Panel title="Essential Services" className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-brand-700">Live Google signal · Google Places API</p>
          <p className="mt-1 text-xs text-muted">Within 1.5 km · {profile ? fetchedLabel(profile.fetchedAt) : 'Loading current evidence…'}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            summary.status === 'live'
              ? 'bg-[#EAF7F0] text-aff'
              : summary.status === 'loading'
                ? 'bg-brand-50 text-brand-700'
                : 'bg-amber-50 text-amber-700'
          }`}
        >
          {summary.status === 'live' ? 'Live' : summary.status === 'partial' ? 'Partial' : isLoading ? 'Loading' : 'Temporarily unavailable'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = ESSENTIAL_ICONS[card.key]
          return (
            <div key={card.key} className="rounded-xl border border-line bg-band/40 p-3">
              <div className="flex items-center gap-2 text-ink-soft">
                <Icon size={16} className="text-brand-600" />
                <span className="text-xs font-medium">{card.label}</span>
              </div>
              <p className={`mt-2 text-2xl font-semibold ${card.value == null ? 'text-muted' : 'text-brand-700'}`}>
                {isLoading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-line" /> : card.value ?? '—'}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {isLoading ? 'Checking…' : card.value == null ? 'Unavailable' : `${card.confidence} confidence`}
              </p>
            </div>
          )
        })}
      </div>

      <p className={`mt-4 rounded-xl px-3 py-2 text-xs ${summary.status === 'live' ? 'bg-[#F0F9F4] text-ink-soft' : 'bg-amber-50 text-amber-800'}`}>
        {summary.note}
      </p>
      <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Info size={13} /> Shown for context — not part of the FitScore.
      </p>
    </Panel>
  )
}

export function LifestyleTab({ n, essentials }) {
  const l = n.subscores.lifestyle
  const ins = n.insights || { peers: [] }
  const available = Number.isFinite(l) && n.evidence?.lifestyle?.status !== 'partial'
  return (
    <div>
      <SubHeader
        title="Essentials & Lifestyle Overview"
        sub={`Amenities and daily life in ${n.name}.`}
        score={l}
        band={l >= 75 ? 'Excellent' : l >= 55 ? 'Good' : 'Moderate'}
        why={available
          ? `${n.name} has about ${n.amenity_count} key amenities within 1.5 km, ${rankLabel(ins.amenity, 'busiest')} in the city, a lifestyle score of ${l}/100.`
          : 'The Places lookup was incomplete or unavailable. NestIQ preserves successful counts for context but excludes the incomplete lifestyle pillar from FitScore.'}
      />
      <EssentialServicesPanel profile={essentials} />
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
          {available ? (
            <PeerBars peers={ins.peers} metricKey="amenity" currentId={n.id} color="#EC6FA6" />
          ) : (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Amenity coverage is incomplete, so it is shown for context but not scored.</p>
          )}
          <EvidenceNote evidence={n.evidence?.lifestyle} />
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

function AqiForecastPanel({ data }) {
  return (
    <Panel title="AQI · last 24h and next 24h forecast" className="lg:col-span-2">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AA0AE' }} tickLine={false} axisLine={false} interval={3} />
          <YAxis tick={{ fontSize: 11, fill: '#9AA0AE' }} tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
          <Line type="monotone" dataKey="past" name="Past 24h" stroke="#7C5CF6" strokeWidth={2.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="future" name="Google forecast" stroke="#F5A63B" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
          <Line type="monotone" dataKey="bqml" name="BigQuery ML (ARIMA_PLUS)" stroke="#3FB984" strokeWidth={2.5} strokeDasharray="4 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Info size={13} /> History from Google Air Quality API (CPCB); green line is our own <b className="mx-1 font-semibold text-aff">BigQuery ML ARIMA_PLUS</b> forecast, trained on live India AQI history.
      </p>
    </Panel>
  )
}

export function AirQualityTab({ n }) {
  const series = n.aqiSeries || { history: [], forecast: [], bqmlForecast: [] }
  const bqml = series.bqmlForecast || []
  const hasReading = Number.isFinite(n.aqi)
  const isCpcb = n.airIndexCode !== 'uaqi' // a Universal-AQI reading has no CPCB health score
  const cpcbScored = hasReading && isCpcb && Number.isFinite(n.subscores.air_quality)
  const stale = n.airStale

  // The forecast chart is independently sourced (Google history/forecast + BQML),
  // so it can still render even when the current reading is unavailable.
  const fcByLabel = Object.fromEntries((series.forecast || []).map((f) => [f.label, f.aqi]))
  const futureRows = (bqml.length ? bqml : series.forecast || []).map((b) => ({
    label: b.label, future: fcByLabel[b.label], bqml: bqml.length ? b.aqi : undefined,
  }))
  const data = [...(series.history || []).map((h) => ({ label: h.label, past: h.aqi })), ...futureRows]
  const hasForecast = data.length > 0

  // Unavailable or Universal-AQI-only: never fabricate a reading, band or advice.
  if (!cpcbScored) {
    const uaqiOnly = hasReading && !isCpcb
    const tiles = [
      ['Current AQI', uaqiOnly ? `${n.aqi} (UAQI)` : 'Unavailable'],
      ['Air-health score (CPCB)', 'Unavailable'],
      ['Dominant pollutant', n.aqi_pollutant ? n.aqi_pollutant.toUpperCase() : 'Unavailable'],
      ['Source', uaqiOnly ? 'Universal AQI (Google)' : n.airSource || 'Google Air Quality API'],
    ]
    return (
      <div>
        <div className="mb-5 rounded-2xl border border-line bg-[#FFF8EC] p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <TriangleAlert size={16} /> CPCB air-health score unavailable
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {uaqiOnly
              ? `Only a Universal AQI reading is available for ${n.name}. Universal AQI is a different scale, so NestIQ does not convert it into a CPCB health score.`
              : `The CPCB air-quality reading for ${n.name} is temporarily unavailable. NestIQ does not estimate or guess it.`}{' '}
            The air pillar is therefore excluded and this locality's FitScore is provisional.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map(([k, v]) => (
              <div key={k} className="card p-4">
                <p className="text-xs text-muted">{k}</p>
                <p className="mt-1 text-xl font-semibold text-ink">{v}</p>
              </div>
            ))}
          </div>
          <EvidenceNote evidence={n.evidence?.air_quality} />
        </div>
        {hasForecast && (
          <div className="grid gap-5">
            <AqiForecastPanel data={data} />
          </div>
        )}
      </div>
    )
  }

  const aqi = n.aqi
  const [band, color] = aqiBand(aqi)
  const spike = aqiSpike(n)
  const forecastVals = (bqml.length ? bqml : series.forecast || []).map((f) => f.aqi)
  const peak = forecastVals.length ? Math.max(...forecastVals) : aqi
  const tiles = [
    ['Current AQI', String(aqi), `${band}${stale ? ' · cached' : ''}`],
    ['Dominant Pollutant', n.aqi_pollutant ? n.aqi_pollutant.toUpperCase() : 'Unavailable', 'Main driver'],
    ['24h Forecast Peak', String(peak), aqiBand(peak)[0]],
    ['Air-health score (CPCB)', `${n.subscores.air_quality}/100`, 'absolute health band'],
  ]
  return (
    <div>
      <SubHeader
        title="Air Quality Overview"
        sub={`${stale ? 'Cached' : 'Live'} air quality and 24-hour forecast for ${n.name}.`}
        score={n.subscores.air_quality}
        band={band}
        why={`${n.name} currently reports a CPCB AQI of ${aqi} (${band}). ${aqiAdvice(aqi)}`}
      />
      <EvidenceNote evidence={n.evidence?.air_quality} />
      {stale && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-[#FFF8EC] px-4 py-3 text-sm text-amber-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            <b className="font-semibold">Cached reading:</b> a live refresh did not succeed, so this shows the last successful reading
            {n.airFetchedAt ? ` from ${new Date(n.airFetchedAt).toLocaleString('en-IN')}` : ''}. It is not current.
          </p>
        </div>
      )}
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
        <AqiForecastPanel data={data} />

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
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setReviews(null)
    apiReviews(n.id, n.cityId, retryKey > 0).then((d) => {
      if (!alive) return
      setReviews(d)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [n.id, n.cityId, retryKey])

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
      ) : reviews?.status === 'temporarily_unavailable' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <TriangleAlert size={15} /> Community insights temporarily unavailable
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Google Search grounding could not be reached, so NestIQ is not treating this as evidence that the locality lacks public discussion.
          </p>
          <button
            type="button"
            onClick={() => setRetryKey((v) => v + 1)}
            className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            Try again
          </button>
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
        <div className="rounded-xl border border-line bg-[#F7F8FB] p-4">
          <p className="flex items-start gap-2 text-sm text-muted">
            <Lightbulb size={15} className="mt-0.5 shrink-0 text-trend" />
            Community discussion could not be confirmed right now. NestIQ will not treat an empty grounding response as evidence that residents have nothing to say.
          </p>
          <button type="button" onClick={() => setRetryKey((v) => v + 1)} className="mt-3 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            Try again
          </button>
        </div>
      )}
    </Panel>
  )
}

function LocalityPulse({ n }) {
  const [pulse, setPulse] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  useEffect(() => {
    let alive = true
    let timer
    let attempts = 0
    const load = async () => {
      const result = await apiLocalityPulse(n.id, n.cityId, retryKey > 0 && attempts === 0)
      if (!alive) return
      setPulse(result)
      if ((result?.status === 'pending' || result?.refreshStatus === 'refreshing') && attempts < 30) {
        attempts += 1
        timer = setTimeout(load, 4000)
      }
    }
    setPulse(null)
    load()
    return () => { alive = false; clearTimeout(timer) }
  }, [n.id, n.cityId, retryKey])
  const live = pulse?.status === 'available' && pulse.items?.length > 0
  const noEvidence = pulse?.status === 'no_evidence'
  const pending = pulse === null || pulse?.status === 'pending'
  const severityStyle = { low: 'bg-emerald-50 text-emerald-700', informational: 'bg-blue-50 text-blue-700', moderate: 'bg-amber-50 text-amber-700', high: 'bg-red-50 text-red-700' }
  return <Panel title={<span className="flex flex-wrap items-center gap-1.5"><Radio size={15} className="text-trend" /> Locality Pulse <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${live ? 'bg-emerald-50 text-emerald-700' : pending || noEvidence ? 'bg-gray-100 text-muted' : 'bg-amber-50 text-amber-700'}`}>{live ? 'Verified recent updates' : pending ? 'Checking sources…' : noEvidence ? 'No recent updates' : 'Evidence unavailable'}</span></span>} className="lg:col-span-3">
    <p className="mb-3 text-xs text-muted">Recent verified updates affecting {n.short || n.name}. Evidence only; this does not change FitScore.</p>
    {pulse === null || pulse.status === 'pending' ? <div className="h-20 animate-pulse rounded-xl bg-gray-100" /> : pulse.status === 'temporarily_unavailable' ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-amber-800">Recent civic evidence is temporarily unavailable. This does not mean nothing is happening.</p><button type="button" onClick={() => setRetryKey((v) => v + 1)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800">Try again</button></div> : live ? <div className="overflow-hidden rounded-xl border border-line">{pulse.items.map((item, i) => <article key={`${item.headline}-${i}`} className="grid gap-3 border-b border-line p-3 last:border-b-0 lg:grid-cols-[185px_minmax(0,1fr)_150px_105px_180px] lg:items-center"><div className="flex min-w-0 flex-wrap items-center gap-2"><span className="capitalize text-xs font-semibold text-ink-soft">{item.category}</span><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${severityStyle[item.severity] || severityStyle.informational}`}>{item.severity}</span></div><div className="min-w-0"><h4 className="text-sm font-semibold text-ink">{item.headline}</h4><p className="mt-0.5 text-xs leading-relaxed text-muted">{item.summary}</p></div><span className="flex min-w-0 items-center gap-1 text-xs text-muted"><MapPin size={12} className="shrink-0" /><span className="truncate">{item.affectedArea}</span></span><span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted"><Clock3 size={12} /> {item.freshness}</span><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"><span className="truncate">{item.source}</span><ExternalLink size={12} className="shrink-0" /></a></article>)}</div> : <p className="rounded-xl border border-line bg-[#F7F8FB] p-3 text-sm text-muted">No verified civic updates from the last 30 days were found. This is different from a source failure.</p>}
  </Panel>
}

function CivicKnowledge({ n }) {
  const suggestions = [
    'Any official air-quality or vehicle restrictions?',
    'What development projects affect this area?',
    'Are there public consultations nearby?',
  ]
  const [question, setQuestion] = useState('What official civic or development notices affect this area?')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const search = async () => {
    if (question.trim().length < 3) return
    setLoading(true)
    setResult(await apiCivicKnowledge(n.id, n.cityId, question.trim()))
    setLoading(false)
  }
  return <Panel title={<span className="flex items-center gap-1.5"><BookOpenText size={15} className="text-brand-600" /> Official Civic Knowledge <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Controlled RAG</span></span>} className="lg:col-span-3">
    <p className="text-xs text-muted">Ask the indexed official-document library. Citations open the issuing authority's official notice portal, so confirm the specific notice there. Retrieved evidence never changes FitScore.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-400" aria-label="Ask official civic knowledge" /><button type="button" onClick={search} disabled={loading || question.trim().length < 3} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Retrieving…' : 'Search documents'}</button></div>
    <div className="mt-2 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:border-brand-300 hover:bg-brand-100">{suggestion}</button>)}</div>
    {result?.status === 'available' ? <div className="mt-4"><div className="whitespace-pre-line rounded-xl bg-brand-50/50 p-4 text-sm leading-relaxed text-ink-soft">{result.answer}</div><div className="mt-3 flex flex-wrap gap-2">{result.citations.map((c) => <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="flex max-w-[260px] items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-ink-soft hover:text-brand-700"><ExternalLink size={12} /><span className="truncate">{c.authority} · {c.publishedOn}</span></a>)}</div><p className="mt-3 text-xs text-muted">{result.limitation}</p></div> : result?.status === 'no_evidence' ? <p className="mt-4 rounded-xl border border-line bg-[#F7F8FB] p-3 text-sm text-muted">No matching official document is currently indexed. This does not mean no notice exists.</p> : result ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">The civic knowledge library is temporarily unavailable.</p> : null}
  </Panel>
}

export function CommunityTab({ n }) {
  const ins = n.insights || { peers: [] }
  const compare = [
    ['Affordability', rankLabel(ins.rent, 'cheapest'), '#3FB984', ins.rent],
    ['Air Quality', rankLabel(ins.aqi, 'cleanest'), '#F5A63B', ins.aqi],
    ['Commute', rankLabel(ins.commute, 'fastest'), '#4F86F7', ins.commute],
    ['Safety', rankLabel(ins.safety, 'safest'), '#7C5CF6', ins.safety],
    ['Essentials & Lifestyle', rankLabel(ins.amenity, 'busiest'), '#EC6FA6', ins.amenity],
  ]
  return (
    <div>
      <SubHeader
        title="Community Insights"
        sub={`What residents say about ${n.name}, and where it ranks in the city.`}
        score={n.fitScore ?? 0}
        band={n.matchDisplay || n.match || ''}
        scoreLabel="FitScore"
        why="FitScore is your personalized five-pillar score (affordability, safety, commute, lifestyle and air quality). The panels below add live web sentiment and this locality's rank in the city; they do not change the FitScore."
      />
      {n.isProvisional && (
        <div className="-mt-2 mb-5 flex flex-wrap gap-2">
          {n.isProvisional && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              Provisional FitScore · {n.missingPillars?.includes('air_quality') ? 'air-quality data unavailable' : 'incomplete data'}
            </span>
          )}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <LocalityPulse n={n} />
        <CivicKnowledge n={n} />
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
