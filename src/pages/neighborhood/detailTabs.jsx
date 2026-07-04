import {
  PieChart,
  Pie,
  Cell,
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
  MapPin,
  TrendingUp,
  TrendingDown,
  Star,
  Clock,
  Train,
  Car,
  Bike,
  Footprints,
  ShieldCheck,
  Info,
  Lightbulb,
  CircleCheck,
  Building2,
  Users,
  Sparkles,
  DollarSign,
  Heart,
  ExternalLink,
  Wind,
} from 'lucide-react'
import { SUBSCORES, WEIGHTS, rentTrend } from '../../data/neighborhoods.js'
import { RentTrendArea } from '../../components/charts/RentTrendChart.jsx'
import LocalityMap from '../../components/LocalityMap.jsx'

const SUB_COLOR = {
  aff: '#3FB984',
  safe: '#7C5CF6',
  commute: '#4F86F7',
  life: '#EC6FA6',
  trend: '#F5A63B',
}

/* ------------------------------ shared bits ------------------------------- */
function Panel({ title, action, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
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

function SubHeader({ title, sub, score, band, why }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="font-serif text-2xl text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      <div className="flex gap-3 lg:w-[52%]">
        <div className="card flex-1 p-4">
          <p className="text-xs text-muted">{title.split(' ')[0]} Sub-score</p>
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
          <button className="mt-2 text-xs font-medium text-brand-700">See calculation →</button>
        </div>
      </div>
    </div>
  )
}

function BarRow({ label, value, max = 100, suffix = '', color = '#7C5CF6' }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-ink-soft">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-line">
        <div className="h-2 rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 shrink-0 text-right font-semibold text-ink">
        {value}
        {suffix}
      </span>
    </div>
  )
}

function MapBox({ label = 'Map', className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#DCEAF3] via-[#EAF0EC] to-[#E7EFE6]" />
      <svg className="absolute inset-0 h-full w-full text-white/70" fill="none" stroke="currentColor">
        {[...Array(8)].map((_, i) => (
          <line key={i} x1="0" y1={i * 40 + 10} x2="600" y2={i * 40 - 10} strokeWidth="1.5" />
        ))}
        {[...Array(9)].map((_, i) => (
          <line key={`v${i}`} x1={i * 60} y1="0" x2={i * 60 - 30} y2="360" strokeWidth="1.5" />
        ))}
      </svg>
      <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 text-sm font-semibold text-brand-700">
        <MapPin size={18} /> {label}
      </span>
    </div>
  )
}

/* -------------------------------- Overview -------------------------------- */
const SUB_ICON = { affordability: DollarSign, safety: ShieldCheck, commute: Train, lifestyle: Heart, air_quality: Wind }

export function OverviewTab({ n }) {
  const glance = [
    [Building2, 'Median Rent', n.rentDisplay || `$${n.rent.toLocaleString()}`, 'per month'],
    [Wind, 'Air Quality (AQI)', String(n.aqi ?? '—'), n.aqiCategory || ''],
    [Train, 'Avg Commute', `${n.commuteMin} min`, 'to city hub'],
    [ShieldCheck, 'Safety Score', `${n.subscores.safety}/100`, ''],
    [Sparkles, 'Lifestyle Score', `${n.subscores.lifestyle}/100`, ''],
  ]
  const highlights = [
    `Live air quality: AQI ${n.aqi} — ${n.aqiCategory || ''}`,
    `Around ${n.commuteMin} min to the main work hub by road`,
    `Median rent about ${n.rentDisplay || '$' + n.rent.toLocaleString()}/month`,
    `Air Quality sub-score ${n.subscores.air_quality}/100 vs. the rest of the city`,
    `Amenities & lifestyle score ${n.subscores.lifestyle}/100`,
  ]
  const legend = [
    ['Subway Stations', '#4F86F7'],
    ['Parks', '#3FB984'],
    ['High Amenities', '#7C5CF6'],
    ['Low Crime', '#2FB6A8'],
  ]

  return (
    <div className="space-y-5">
      {/* row 1 */}
      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr_1.35fr]">
        <Panel
          title="FitScore Breakdown"
          action={<button className="flex items-center gap-1 text-xs text-muted"><Info size={13} /> How it works</button>}
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
            <ShieldCheck size={14} /> Scores are normalized across all neighborhoods in New York City
          </p>
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
        <Panel title="Air Quality — Next 24h">
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
              <b className="font-semibold">Tip</b> Consider areas near Ditmars Blvd for a quieter vibe or closer to Broadway for more nightlife.
            </p>
          </div>
        </Panel>

        <Panel title="AI Summary (Gemini)">
          <blockquote className="rounded-xl bg-brand-50/60 p-4 text-sm leading-relaxed text-ink-soft">
            {n.why || 'Generating an AI summary for this locality…'}
          </blockquote>
          <p className="mt-3 text-xs font-medium text-ink">Sources</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {['Google Air Quality', 'Google Places', 'Google Maps', 'Gemini'].map((s) => (
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
  const metrics = [
    ['Median Rent', n.rentDisplay || `$${n.rent.toLocaleString()}`, 'per month (estimate)'],
    ['Affordability Sub-score', `${aff}/100`, 'vs. this city'],
    ['Air Quality (AQI)', String(n.aqi ?? '—'), n.aqiCategory || ''],
    ['Commute', `${n.commuteMin} min`, 'to city hub'],
  ]
  return (
    <div>
      <SubHeader
        title="Affordability Overview"
        sub={`Cost of living and value for money in ${n.name}.`}
        score={aff}
        band={aff >= 75 ? 'Excellent' : aff >= 55 ? 'Good' : 'Moderate'}
        why={`Median rent here is about ${n.rentDisplay}/month, an affordability score of ${aff}/100 relative to other localities in this city.`}
      />
      <div className="mb-5 grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([k, v, note]) => (
          <div key={k}>
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{v}</p>
            <p className="mt-0.5 text-xs text-aff">{note}</p>
          </div>
        ))}
      </div>
      <Panel title="What you're paying for">
        <p className="text-sm leading-relaxed text-ink-soft">
          {n.name} has a median rent of about <b>{n.rentDisplay}/month</b>. Weighed against its air
          quality (AQI {n.aqi}, {n.aqiCategory}) and a ~{n.commuteMin} min commute to the city hub, it
          scores <b>{aff}/100</b> on affordability versus other localities in this city.
        </p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Info size={13} /> Rent is a market estimate; air quality, amenities and commute are live from Google Maps Platform.
        </p>
      </Panel>
    </div>
  )
}

/* --------------------------------- Safety --------------------------------- */
const crimeTrend = rentTrend.map((d, i) => ({
  m: d.m,
  astoria: 44 - i * 1.6,
  nyc: 78 - i * 1.4,
}))

export function SafetyTab({ n }) {
  const s = n.subscores.safety
  const metrics = [
    ['Safety Sub-score', `${s}/100`, 'vs. this city'],
    ['Air Quality (AQI)', String(n.aqi ?? '—'), n.aqiCategory || ''],
    ['Commute', `${n.commuteMin} min`, 'to city hub'],
    ['Median Rent', n.rentDisplay || `$${n.rent}`, 'per month'],
  ]
  return (
    <div>
      <SubHeader
        title="Safety Overview"
        sub={`Safety and well-being in ${n.name}.`}
        score={s}
        band={s >= 75 ? 'Excellent' : s >= 55 ? 'Good' : 'Moderate'}
        why={`${n.name} has a safety index of ${s}/100 for this city, combining locality profile with live environmental health.`}
      />
      <div className="mb-5 grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([k, v, note]) => (
          <div key={k}>
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{v}</p>
            <p className="mt-0.5 text-xs text-aff">{note}</p>
          </div>
        ))}
      </div>
      <Panel title="How we assess safety">
        <p className="text-sm leading-relaxed text-ink-soft">
          Granular, locality-level crime data isn't openly published for Indian cities, so NestIQ's
          safety index blends the locality profile with live environmental health. Air quality here is{' '}
          <b>{n.aqi} ({n.aqiCategory})</b> — {aqiAdvice(n.aqi ?? 0)}
        </p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Info size={13} /> Air quality is live from Google Maps Platform; open locality-level crime data isn't available for Indian cities.
        </p>
      </Panel>
    </div>
  )
}

/* -------------------------------- Commute --------------------------------- */
export function CommuteTab({ n }) {
  const c = n.subscores.commute
  const metrics = [
    ['Avg Commute', `${n.commuteMin} min`, 'to city hub (driving)', Clock],
    ['Commute Sub-score', `${c}/100`, 'vs. this city', Train],
    ['Amenities ≤1.5km', String(n.amenity_count ?? '—'), 'shops, food, gyms', Bike],
    ['Median Rent', n.rentDisplay || `$${n.rent}`, 'per month', Car],
  ]
  return (
    <div>
      <SubHeader
        title="Commute Overview"
        sub={`Getting around from ${n.name}.`}
        score={c}
        band={c >= 75 ? 'Excellent' : c >= 55 ? 'Good' : 'Moderate'}
        why={`Driving time to the city's main hub is about ${n.commuteMin} minutes, a commute score of ${c}/100.`}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([k, v, note, Icon]) => (
          <div key={k} className="card p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon size={16} /></span>
            <p className="mt-3 text-xs text-muted">{k}</p>
            <p className="text-xl font-semibold text-ink">{v}</p>
            <p className="text-xs text-aff">{note}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <LocalityMap items={[n]} zoom={13} className="min-h-[300px]" />
        <Panel title="Commute details">
          <p className="text-sm leading-relaxed text-ink-soft">
            Estimated <b>{n.commuteMin} min</b> by road to the city's main work hub, based on live Google
            Maps traffic. Actual times vary with time of day and transport mode.
          </p>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Info size={13} /> Live commute from Google Maps Platform Distance Matrix API.
          </p>
        </Panel>
      </div>
    </div>
  )
}

/* -------------------------------- Lifestyle ------------------------------- */
export function LifestyleTab({ n }) {
  const l = n.subscores.lifestyle
  const metrics = [
    ['Amenities ≤1.5km', String(n.amenity_count ?? '—'), 'restaurants, cafes, gyms, parks'],
    ['Lifestyle Sub-score', `${l}/100`, 'vs. this city'],
    ['Air Quality (AQI)', String(n.aqi ?? '—'), n.aqiCategory || ''],
    ['Median Rent', n.rentDisplay || `$${n.rent}`, 'per month'],
  ]
  return (
    <div>
      <SubHeader
        title="Lifestyle Overview"
        sub={`Amenities and daily life in ${n.name}.`}
        score={l}
        band={l >= 75 ? 'Excellent' : l >= 55 ? 'Good' : 'Moderate'}
        why={`${n.name} has around ${n.amenity_count} key amenities within 1.5 km, a lifestyle score of ${l}/100.`}
      />
      <div className="mb-5 grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([k, v, note]) => (
          <div key={k}>
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{v}</p>
            <p className="mt-0.5 text-xs text-aff">{note}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <LocalityMap items={[n]} zoom={14} className="min-h-[280px]" />
        <Panel title="Amenities nearby">
          <p className="text-sm leading-relaxed text-ink-soft">
            NestIQ counts restaurants, cafes, supermarkets, gyms, parks and malls within ~1.5 km using
            live Google Places data — {n.name} has about <b>{n.amenity_count}</b>.
          </p>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Info size={13} /> Amenities are live from Google Maps Platform Places API.
          </p>
        </Panel>
      </div>
    </div>
  )
}

/* --------------------------------- Trend ---------------------------------- */
export function TrendTab({ n }) {
  const kpis = [
    ['Median Rent (1 bed)', `$${n.rent.toLocaleString()}`, '-2.3% vs last year', false],
    ['Median Home Value', '$870,000', '+6.8% vs last year', true],
    ['Crime Index', '23% Lower', '-4% vs last year', false],
    ['Avg Commute Time', `${n.commuteMin} min`, '-2 min vs last year', false],
    ['Lifestyle Score', '82/100', '+3 pts vs last year', true],
  ]
  const trendingUp = [
    ['Waterfront Activities', '+28%'],
    ['Local Businesses', '+22%'],
    ['Cycling Commutes', '+18%'],
    ['Park Visits', '+16%'],
    ['Public Transit Usage', '+12%'],
  ]
  return (
    <div>
      <SubHeader
        title="Trend Overview"
        sub={`See how key factors in ${n.name} have changed over time.`}
        score={n.subscores.trend}
        band="Improving"
        why="Rents are stabilizing while home values, lifestyle and safety scores are all trending upward."
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map(([k, v, note, up]) => (
          <div key={k} className="card p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{v}</p>
            <p className={`mt-0.5 flex items-center gap-1 text-xs ${up ? 'text-aff' : 'text-[#E5484D]'}`}>
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {note}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Median Rent Trend (1 Bed)" className="lg:col-span-2">
          <RentTrendArea height={220} />
          <p className="mt-2 text-xs text-muted">Source: StreetEasy, Zillow</p>
        </Panel>
        <Panel title="What's Trending Up">
          <ol className="space-y-2.5">
            {trendingUp.map(([label, pct], i) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
                <span className="flex-1 text-ink-soft">{label}</span>
                <span className="font-semibold text-aff">{pct}</span>
              </li>
            ))}
          </ol>
        </Panel>
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
  if (aqi <= 100) return 'Air quality is acceptable. Outdoor activity is fine for most people.'
  if (aqi <= 200) return 'Sensitive groups (children, elderly, asthma) should limit prolonged outdoor exertion.'
  if (aqi <= 300) return 'Everyone may feel effects; sensitive groups should avoid outdoor exertion. Consider an N95 mask.'
  return 'Health alert — avoid outdoor activity, keep windows shut, and use an air purifier and N95 mask.'
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
        <Panel title="AQI — last 24h and next 24h forecast" className="lg:col-span-2">
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

/* --------------------------- Community / AI Insights ---------------------- */
export function CommunityTab({ n }) {
  const glance = [
    ['Air Quality', `AQI ${n.aqi} · ${n.aqiCategory || ''}`],
    ['Median Rent', `${n.rentDisplay}/mo`],
    ['Commute', `${n.commuteMin} min to hub`],
    ['Amenities ≤1.5km', String(n.amenity_count ?? '—')],
    ['FitScore', `${n.fitScore}/100`],
  ]
  return (
    <div>
      <SubHeader
        title="AI Insights"
        sub={`What the live data says about ${n.name}.`}
        score={n.fitScore ?? 0}
        band={n.match || ''}
        why="An AI-generated summary grounded in live air-quality, rent, commute and amenity data."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="NestIQ AI Summary (Gemini)" className="lg:col-span-2">
          <blockquote className="rounded-xl bg-brand-50/60 p-4 text-sm leading-relaxed text-ink-soft">
            {n.why || 'Generating an AI summary for this locality…'}
          </blockquote>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {['Google Air Quality', 'Google Places', 'Google Maps', 'Gemini'].map((s) => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
        </Panel>
        <Panel title="At a Glance">
          <dl className="space-y-3 text-sm">
            {glance.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line/70 pb-2 last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted">
        <Lightbulb size={13} /> Locality-level resident reviews aren't openly available for Indian cities, so NestIQ focuses on hard live signals summarised by AI.
      </p>
    </div>
  )
}
