import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Wind, Home as HomeIcon, Car, ChevronRight, Info, Radio } from 'lucide-react'
import { useSaved } from '../lib/saved.js'
import { apiNeighborhoods, apiLocalityPulse, apiCityPulse, prefetchLocality } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import { useCity } from '../lib/cityStore.jsx'
import CityPicker from '../components/layout/CityPicker.jsx'
import PulseEvents from '../components/PulseEvents.jsx'
import { aggregateWatchlistPulse } from '../lib/watchlistPulse.js'

// Re-fetch current live data for every city the user has saved from, and merge
// the fresh air-quality/rent/commute onto the saved snapshots — so "Live" is
// actually live, not the value frozen at save time.
function useLiveSaved() {
  const savedRaw = useSaved()
  const [saved, setSaved] = useState(savedRaw)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    let alive = true
    setSaved(savedRaw)
    if (!savedRaw.length) {
      setIsLive(false)
      return
    }
    const cities = [...new Set(savedRaw.map((n) => n.city).filter(Boolean))]
    Promise.all(cities.map((c) => apiNeighborhoods(c)))
      .then((lists) => {
        if (!alive) return
        const fresh = {}
        for (const list of lists) for (const a of adaptList(list || [])) fresh[a.id] = a
        if (!Object.keys(fresh).length) {
          setIsLive(false)
          return
        }
        setSaved(
          savedRaw.map((n) => {
            const f = fresh[n.id]
            return f
              ? {
                  ...n,
                  aqi: f.aqi, aqiCategory: f.aqiCategory, rent: f.rent, rentDisplay: f.rentDisplay,
                  commuteMin: f.commuteMin, subscores: f.subscores, fitScore: f.fitScore, match: f.match,
                  // Carry the health/provenance fields so refreshed watchlist records
                  // don't silently drop critical-risk and provisional information.
                  matchDisplay: f.matchDisplay, criticalRisk: f.criticalRisk, healthQualifier: f.healthQualifier,
                  airHealthBand: f.airHealthBand, airDataStatus: f.airDataStatus, airStale: f.airStale,
                  isProvisional: f.isProvisional, missingPillars: f.missingPillars, coveragePercent: f.coveragePercent,
                  evidence: f.evidence,
                }
              : n
          }),
        )
        setIsLive(true)
      })
      .catch(() => alive && setIsLive(false))
    return () => {
      alive = false
    }
  }, [savedRaw])

  return [saved, isLive]
}

// Grounded civic search on a cold cache typically takes 20-60s. The old budget here was
// 5 x 4s = 20s, which usually expired mid-search and left an endless grey skeleton (the
// locality detail page already allowed 30 attempts). Poll for ~60s, then stop and say so.
const PULSE_POLL_ATTEMPTS = 15
const PULSE_POLL_INTERVAL = 4000

// Never end a wait on a silent skeleton: if the source is still working when the budget
// runs out, surface the honest unavailable state, which carries a Try again action and
// explicitly does not claim that nothing is happening.
const PULSE_GAVE_UP = { status: 'temporarily_unavailable', items: [] }

// Grounded pulse for the whole selected city. Polls while the background source
// check is still running, so a "pending" resolves to real evidence.
function useCityPulse(city) {
  const [pulse, setPulse] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    let timer
    let attempts = 0
    setPulse(null)
    async function run() {
      const data = await apiCityPulse(city)
      if (!alive) return
      setPulse(data)
      if (data?.status === 'pending') {
        if (attempts < PULSE_POLL_ATTEMPTS) {
          attempts += 1
          timer = setTimeout(run, PULSE_POLL_INTERVAL)
        } else {
          setPulse({ ...PULSE_GAVE_UP })
        }
      }
    }
    run()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [city, tick])
  return [pulse, () => setTick((t) => t + 1)]
}

// Aggregate grounded pulse across the user's saved localities, keeping only
// important (moderate/high) events and tagging each with its locality. Reuses
// the same per-locality pulse pipeline; never manufactures alerts.
function useWatchlistEvents(saved) {
  const [pulse, setPulse] = useState(null)
  const [tick, setTick] = useState(0)
  const key = saved.map((n) => `${n.city}:${n.id}`).join(',')
  useEffect(() => {
    if (!saved.length) {
      setPulse({ status: 'no_evidence', items: [] })
      return
    }
    let alive = true
    let timer
    let attempts = 0
    setPulse(null)
    async function run() {
      const results = await Promise.all(
        saved.map((n) => apiLocalityPulse(n.id, n.city).then((p) => ({ n, p }))),
      )
      if (!alive) return
      // Aggregation lives in lib so its honesty rules are unit-tested: "no alerts" is
      // only claimed when a source positively confirmed it, never as a fallback.
      const { status, items } = aggregateWatchlistPulse(results)
      setPulse({ status, items })
      if (status === 'pending' && !items.length) {
        if (attempts < PULSE_POLL_ATTEMPTS) {
          attempts += 1
          timer = setTimeout(run, PULSE_POLL_INTERVAL)
        } else {
          setPulse({ ...PULSE_GAVE_UP })
        }
      }
    }
    run()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [key, tick])
  return [pulse, () => setTick((t) => t + 1)]
}

function aqiSignal(aqi) {
  if (aqi == null) return ['Air quality data unavailable right now.', 'Info', '#4F86F7']
  if (aqi > 300) return [`Air quality is Very Poor (AQI ${aqi}). Avoid outdoor activity and use a purifier.`, 'High', '#E5484D']
  if (aqi > 200) return [`Air quality is Poor (AQI ${aqi}). Sensitive groups should limit outdoor time.`, 'High', '#E5484D']
  if (aqi > 100) return [`Air quality is Moderate (AQI ${aqi}), generally acceptable.`, 'Medium', '#F5A63B']
  return [`Air quality is clean (AQI ${aqi}), good for outdoor activity.`, 'Low', '#3FB984']
}

const sevColor = {
  High: 'bg-[#FDECEC] text-[#E5484D]',
  Medium: 'bg-[#FDF4E6] text-trend',
  Low: 'bg-[#EAF7F0] text-aff',
  Info: 'bg-[#EAF1FD] text-commute',
}

const VIEWS = [
  { id: 'watchlist', label: 'Watchlist Alerts' },
  { id: 'city', label: 'City Pulse' },
]

function WatchlistView({ saved, isLive }) {
  const [events, retryEvents] = useWatchlistEvents(saved)
  const aqis = saved.map((n) => n.aqi).filter((v) => v != null)
  const avgAqi = aqis.length ? Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length) : null
  const highCount = saved.filter((n) => (n.aqi ?? 0) > 200).length

  if (!saved.length) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-line bg-white p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-500"><Bell size={22} /></span>
        <p className="mt-4 text-base font-semibold text-ink">No watchlist yet</p>
        <p className="mt-1 text-sm text-muted">Save localities from your matches to get live air-quality signals and important civic alerts here.</p>
        <Link to="/results" className="btn-primary mt-5 inline-flex">Browse matches</Link>
      </div>
    )
  }

  return (
    <>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[
          ['Watched Localities', String(saved.length), 'On your list', Bell, 'text-brand-600 bg-brand-50'],
          ['Poor-air Alerts', String(highCount), 'AQI over 200', Wind, 'text-[#E5484D] bg-[#FDECEC]'],
          ['Avg. Live AQI', avgAqi == null ? '—' : String(avgAqi), 'Across your list', Wind, 'text-trend bg-[#FDF0DF]'],
        ].map(([label, val, note, Icon, tint]) => (
          <div key={label} className="card flex items-center gap-3 p-4">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${tint}`}><Icon size={18} /></span>
            <div>
              <p className="text-2xl font-semibold text-ink">{val}</p>
              <p className="text-xs font-medium text-ink-soft">{label}</p>
              <p className="text-[11px] text-muted">{note}</p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-ink">Air-quality signals from your saved localities</h3>
      <div className="mt-3 flex flex-col gap-3">
        {saved.map((n) => {
          const [desc, sev, color] = aqiSignal(n.aqi)
          return (
            <Link key={n.id} to={`/neighborhood/${n.id}`}
              onMouseEnter={() => prefetchLocality(n.id, n.city)}
              onFocus={() => prefetchLocality(n.id, n.city)}
              onTouchStart={() => prefetchLocality(n.id, n.city)}
              className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-brand-200">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
                <Wind size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{n.name}</p>
                <p className="text-xs text-muted">{n.airStale ? 'Cached: ' : ''}{desc}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><HomeIcon size={11} /> {n.rentDisplay}/mo</span>
                  <span className="flex items-center gap-1"><Car size={11} /> {Number.isFinite(n.commuteMin) ? `${n.commuteMin} min commute` : 'commute unavailable'}</span>
                  {n.criticalRisk && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700" title={n.criticalRisk.detail}>{n.healthQualifier}</span>
                  )}
                  {n.isProvisional && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Provisional FitScore</span>
                  )}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${sevColor[sev]}`}>{sev}</span>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          )
        })}
      </div>

      <div className="mt-8">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          <Radio size={15} className="text-trend" /> Important civic alerts for your saved localities
          <span className="text-xs font-normal text-muted">moderate or higher, grounded in sources</span>
        </h3>
        <p className="mb-3 mt-1 text-xs text-muted">Verified recent events affecting the localities you watch. Evidence only; alerts never change FitScore.</p>
        <PulseEvents
          pulse={events}
          onRetry={retryEvents}
          showLocality
          emptyLabel="No important (moderate or higher) civic alerts for your saved localities in the last 30 days. This is different from a source failure."
        />
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <Info size={13} /> {isLive
          ? 'Google-backed air-quality and commute signals are refreshed when this page loads; each field keeps its own live, cached or unavailable status. Rent remains a curated market estimate. Civic alerts are grounded in cited sources.'
          : 'Showing the values saved with each locality. Open a locality for its live 24-hour air-quality trend.'}
      </p>
    </>
  )
}

function CityPulseView({ city, cityName }) {
  const [pulse, retry] = useCityPulse(city)
  return (
    <div className="mt-5">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        <Radio size={15} className="text-trend" /> Current civic pulse for {cityName}
        <span className="text-xs font-normal text-muted">grounded, last 30 days</span>
      </h3>
      <p className="mb-3 mt-1 text-xs text-muted">
        Recent developments across {cityName}: environment, mobility, civic, safety and development. Evidence only; this never changes any FitScore.
      </p>
      <PulseEvents
        pulse={pulse}
        onRetry={retry}
        categories
        emptyLabel={`No verified civic updates for ${cityName} in the last 30 days. This is different from a source failure.`}
      />
    </div>
  )
}

export default function Alerts() {
  const [view, setView] = useState('watchlist')
  const [saved, isLive] = useLiveSaved()
  const { city, cities } = useCity()
  const cityName = cities?.find((c) => c.id === city)?.name || 'this city'

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ink">Watchlist &amp; Alerts</h1>
          <p className="mt-1 text-sm text-muted">
            {view === 'watchlist'
              ? isLive ? 'Live signals and grounded civic alerts for the localities you’ve saved.' : 'Signals from the localities you’ve saved.'
              : `Grounded current events across ${cityName}.`}
          </p>
        </div>
        <CityPicker className="shrink-0" />
      </div>

      {/* segmented view switch */}
      <div className="mt-5 inline-flex rounded-xl border border-line bg-white p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              view === v.id ? 'bg-brand-600 text-white' : 'text-ink-soft hover:text-brand-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'watchlist'
        ? <WatchlistView saved={saved} isLive={isLive} />
        : <CityPulseView city={city} cityName={cityName} />}
    </div>
  )
}
