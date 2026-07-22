import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Wind, Home as HomeIcon, Car, ChevronRight, Info, Radio } from 'lucide-react'
import { useSaved } from '../lib/saved.js'
import { apiNeighborhoods, apiLocalityPulse, apiCityPulse } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import { useCity } from '../lib/cityStore.jsx'
import CityPicker from '../components/layout/CityPicker.jsx'
import PulseEvents from '../components/PulseEvents.jsx'
import { aggregateWatchlistPulse, pollPulse, runPulseQueue } from '../lib/watchlistPulse.js'

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

// Grounded pulse for the whole selected city. Polls while the background source
// check is still running, so a "pending" resolves to real evidence.
function useCityPulse(city) {
  const [pulse, setPulse] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setPulse(null)
    async function run() {
      const data = await pollPulse(
        (refresh) => apiCityPulse(city, refresh, controller.signal),
        { signal: controller.signal, refresh: tick > 0, onUpdate: setPulse },
      )
      if (!controller.signal.aborted) setPulse(data)
    }
    run()
    return () => controller.abort()
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
    const controller = new AbortController()
    const current = new Map(saved.map((n) => [`${n.city}:${n.id}`, { n, p: { status: 'pending', items: [] } }]))
    setPulse({ status: 'pending', items: [] })
    const publish = () => {
      if (controller.signal.aborted) return
      setPulse(aggregateWatchlistPulse([...current.values()]))
    }
    const fetchUntilTerminal = async (n) => {
      return pollPulse(
        (refresh) => apiLocalityPulse(n.id, n.city, refresh, controller.signal),
        { signal: controller.signal, refresh: tick > 0, onUpdate: (data) => {
          if (controller.signal.aborted) return
        current.set(`${n.city}:${n.id}`, { n, p: data })
        publish()
        } },
      )
    }
    // Four bounded workers let several saved-locality checks make progress at
    // once. Backend/Firestore single-flight still prevents duplicate Gemini
    // calls for a locality that was already prefetched elsewhere.
    runPulseQueue(saved, fetchUntilTerminal, 4).then((results) => {
      if (!controller.signal.aborted) setPulse(aggregateWatchlistPulse(results))
    })
    return () => controller.abort()
  }, [key, tick])
  return [pulse, () => setTick((t) => t + 1)]
}

// Show prepared terminal evidence immediately. Only an actually pending job
// gets a longer "still checking" message after five seconds.
function usePreparedPulse(pulse, active, identity) {
  const [softWaitElapsed, setSoftWaitElapsed] = useState(false)
  useEffect(() => {
    if (!active) return undefined
    setSoftWaitElapsed(false)
    const softWait = setTimeout(() => setSoftWaitElapsed(true), 5000)
    return () => clearTimeout(softWait)
  }, [active, identity])
  if (!active || !pulse || pulse.status === 'pending') {
    return [
      { status: 'pending', items: [] },
      softWaitElapsed
        ? 'Still checking verified civic sources—you can continue browsing.'
        : 'Preparing verified civic evidence…',
    ]
  }
  return [pulse, null]
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

function WatchlistView({ saved, isLive, events, retryEvents, pendingLabel }) {
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
          pendingLabel={pendingLabel}
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

function CityPulseView({ cityName, pulse, retry, pendingLabel }) {
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
        pendingLabel={pendingLabel}
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
  // Both evidence paths start as soon as Alerts opens. Switching views only
  // controls presentation; it never starts a cold Gemini request.
  const [cityPulse, retryCityPulse] = useCityPulse(city)
  const [watchlistPulse, retryWatchlistPulse] = useWatchlistEvents(saved)
  const watchlistKey = saved.map((n) => `${n.city}:${n.id}`).join(',')
  const [shownCityPulse, cityPendingLabel] = usePreparedPulse(cityPulse, view === 'city', city)
  const [shownWatchlistPulse, watchlistPendingLabel] = usePreparedPulse(watchlistPulse, view === 'watchlist', watchlistKey)

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
        ? <WatchlistView saved={saved} isLive={isLive} events={shownWatchlistPulse} retryEvents={retryWatchlistPulse} pendingLabel={watchlistPendingLabel} />
        : <CityPulseView cityName={cityName} pulse={shownCityPulse} retry={retryCityPulse} pendingLabel={cityPendingLabel} />}
    </div>
  )
}
