import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { LayoutList, Map as MapIcon, SlidersHorizontal, ChevronDown, ChevronUp, CircleCheck, TriangleAlert } from 'lucide-react'
import AppTopbar from '../components/layout/AppTopbar.jsx'
import NeighborhoodCard from '../components/results/NeighborhoodCard.jsx'
import ResultsMap from '../components/results/ResultsMap.jsx'
import FiltersPanel from '../components/results/FiltersPanel.jsx'
import AgentProgress from '../components/results/AgentProgress.jsx'
import { preferences as defaultPrefs, WEIGHTS as INDIA_DEFAULT, SUBSCORES } from '../data/neighborhoods.js'
import { streamSearch, apiNeighborhoods, prefetchLocality } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import { reweight } from '../lib/fitscore.js'
import { citySnapshot } from '../lib/citySnapshot.js'
import { useCity } from '../lib/cityStore.jsx'
import { FAMILY_HEALTH, isPreset } from '../lib/presets.js'

const PILLARS = SUBSCORES.map((s) => s.key)

const SOURCES_INDIA = [
  { name: 'Google Air Quality API (CPCB AQI)', color: '#3FB984' },
  { name: 'Google Places (amenities)', color: '#EA4335' },
  { name: 'Google Maps Distance Matrix', color: '#4F86F7' },
  { name: 'Curated rent estimates & safety proxies', color: '#F5A63B' },
  { name: 'Gemini on Vertex AI', color: '#7C5CF6' },
]
const SOURCES_NYC = [
  { name: 'Zillow Research (ZORI)', color: '#3FB984' },
  { name: 'NYPD & NYC Open Data', color: '#4F86F7' },
  { name: 'Google Maps & Places', color: '#EA4335' },
  { name: 'Reddit Community Insights', color: '#FF4500' },
]

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Rank of `val` among the set for `key` (1 = best). Lower is better for
// rent/aqi/commute; higher is better for amenities/safety.
function rankOf(set, key, val, lowerBetter) {
  const vals = set.map((x) => x[key]).filter(Number.isFinite)
  if (!vals.length || !Number.isFinite(val)) return null
  const ahead = lowerBetter ? vals.filter((v) => v < val).length : vals.filter((v) => v > val).length
  return { rank: ahead + 1, total: vals.length }
}

// Real, data-derived reasons the top match ranks first — never generic filler.
function whyBullets(top, set, budget) {
  if (!top) return []
  const n = set.length
  const out = []
  if (Number.isFinite(top.aqi)) {
    const r = rankOf(set, 'aqi', top.aqi, true)
    const band = top.airHealthBand || top.aqiCategory
    const allTied = set.every((x) => x.aqi === top.aqi)
    if (top.criticalRisk) {
      // Never frame unhealthy air as an achievement. State the health risk plainly,
      // and only claim "least-polluted" when raw values actually differ.
      out.push(
        allTied
          ? `All ${n} matches share AQI ${top.aqi} (${band}), a ${top.criticalRisk.severity} health risk`
          : `Least-polluted of ${n}, but still AQI ${top.aqi} (${band}), a ${top.criticalRisk.severity} health risk`,
      )
    } else {
      out.push(
        r?.rank === 1 && !allTied
          ? `Cleanest air of your ${n} matches, AQI ${top.aqi}${band ? ` (${band})` : ''}`
          : `AQI ${top.aqi}${band ? ` (${band})` : ''}, ${allTied ? `tied across all ${n}` : `${ordinal(r.rank)}-cleanest of ${n}`}`,
      )
    }
  }
  if (Number.isFinite(top.rent)) {
    const r = rankOf(set, 'rent', top.rent, true)
    const rent = `₹${top.rent.toLocaleString('en-IN')}/mo`
    out.push(
      budget && top.rent <= budget
        ? `${rent}, ₹${(budget - top.rent).toLocaleString('en-IN')} under your budget`
        : `${rent}, ${ordinal(r.rank)}-lowest rent of ${n}`,
    )
  }
  if (Number.isFinite(top.commuteMin)) {
    const r = rankOf(set, 'commuteMin', top.commuteMin, true)
    out.push(`${top.commuteMin} min to the city hub, ${ordinal(r.rank)}-fastest of ${n}`)
  }
  if (Number.isFinite(top.amenity_count)) {
    out.push(`${top.amenity_count} amenities within 1.5 km of the centre`)
  }
  return out.slice(0, 3)
}

const PILLAR_LABEL = Object.fromEntries(SUBSCORES.map((s) => [s.key, s.label]))

function prioritiesText(weights) {
  if (!weights) return defaultPrefs.priorities
  // Rank importance relative to the strongest weight so the default profile
  // (which never sums to 100) doesn't read as "everything is low".
  const max = Math.max(...Object.values(weights), 1)
  const label = (v) => (v / max >= 0.85 ? 'high' : v / max >= 0.55 ? 'medium' : 'low')
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${PILLAR_LABEL[k] || k} (${label(v)})`)
    .join(', ')
}

const rng = (arr, lo, hi) => (arr.length ? [Math.min(...arr), Math.max(...arr)] : [lo, hi])

function computeBounds(items) {
  const rents = items.map((n) => n.rent).filter(Number.isFinite)
  const aqis = items.map((n) => n.aqi).filter(Number.isFinite)
  const coms = items.map((n) => n.commuteMin).filter(Number.isFinite)
  const [minRent, maxRent] = rng(rents, 0, 100000)
  const [minAqi, maxAqi] = rng(aqis, 0, 300)
  const [minCommute, maxCommute] = rng(coms, 0, 120)
  return { minRent, maxRent, minAqi, maxAqi, minCommute, maxCommute }
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
      <div className="flex animate-pulse gap-4">
        <div className="h-[104px] w-[104px] shrink-0 rounded-xl bg-gray-100" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-gray-100" />
              <div className="h-3 w-52 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-12 rounded bg-gray-100" />
          </div>
          <div className="mt-4 flex gap-4">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-16 rounded-full bg-gray-100" />
            <div className="h-6 w-16 rounded-full bg-gray-100" />
            <div className="h-6 w-16 rounded-full bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Results() {
  const [view, setView] = useState('list')
  const [items, setItems] = useState([])
  const [prefs, setPrefs] = useState(defaultPrefs)
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])

  // filter model
  const [showFilters, setShowFilters] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [baseWeights, setBaseWeights] = useState(INDIA_DEFAULT)
  const [weights, setWeights] = useState(INDIA_DEFAULT)
  const [limits, setLimits] = useState(null)

  const location = useLocation()
  const navigate = useNavigate()
  const { city, setCity, cities } = useCity()
  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const query = urlParams.get('q') || location.state?.query || ''
  const requestedPreset = urlParams.get('preset') || location.state?.preset || null
  const preset = isPreset(requestedPreset) ? requestedPreset : null
  const requestedCity = urlParams.get('city')
  
  const lastContextCity = useRef(city)

  useEffect(() => {
    if (requestedCity && requestedCity !== city && cities.some(c => c.id === requestedCity)) {
      lastContextCity.current = requestedCity
      setCity(requestedCity)
    }
  }, [requestedCity, city, cities, setCity])

  useEffect(() => {
    if (city !== lastContextCity.current) {
      lastContextCity.current = city
      const p = new URLSearchParams(location.search)
      p.set('city', city)
      navigate(`${location.pathname}?${p.toString()}`, { replace: true, state: location.state })
    }
  }, [city, location.search, location.pathname, location.state, navigate])

  const searchCity = city
  const isNYC = searchCity === 'new-york'
  const currency = isNYC ? '$' : '₹'

  useEffect(() => {
    let alive = true
    let es = null
    setLoading(true)
    setShowAll(false)
    setAgents([])
    setPrefs((p) => ({
      ...p,
      statement: query || 'Top neighborhood matches for you',
      presetApplied: null,
    }))

    function apply(res) {
      if (!alive) return
      const list = res?.results || []
      if (list.length) {
        const adapted = adaptList(list)
        setItems(adapted)
        setLive(true)
        const w = res?.preferences?.weights || INDIA_DEFAULT
        setBaseWeights(w)
        setWeights(w)
        const b = computeBounds(adapted)
        setLimits({ maxRent: b.maxRent, maxAqi: b.maxAqi, maxCommute: b.maxCommute, minFit: 0 })
        setPrefs({
          statement: query || 'Top neighborhood matches for you',
          budget: res?.preferences?.budget ?? defaultPrefs.budget,
          bed: '1 bed preferred',
          priorities: prioritiesText(w),
          presetApplied: res?.preferences?.presetApplied || null,
        })
      } else {
        setItems([])
        setLive(false)
      }
      setLoading(false)
    }

    if (query) {
      // stream the agent fan-out, then render the final results
      es = streamSearch(query, searchCity, {
        onAgent: (a) =>
          alive &&
          setAgents((prev) => {
            const i = prev.findIndex((x) => x.id === a.id)
            if (i >= 0) {
              const cp = prev.slice()
              cp[i] = a
              return cp
            }
            return [...prev, a]
          }),
        onFinal: (data) => apply(data),
        onError: () => alive && apply(null),
        preset,
      })
    } else {
      apiNeighborhoods(searchCity).then((list) => apply({ results: list, preferences: { weights: INDIA_DEFAULT } }))
    }

    return () => {
      alive = false
      es && es.close()
    }
  }, [query, preset, searchCity])

  const bounds = useMemo(() => computeBounds(items), [items])
  // Localities the backend flagged as statistical outliers (>=1.5σ from the
  // city average on a metric). Directly answers the PS "identify anomalies" ask.
  const anomalyItems = useMemo(
    () => items.filter((n) => (n.anomalies || []).length).map((n) => ({ id: n.id, name: n.name, flags: n.anomalies })),
    [items],
  )
  const weightsDirty = useMemo(
    () => PILLARS.some((k) => (weights[k] || 0) !== (baseWeights[k] || 0)),
    [weights, baseWeights],
  )

  // re-ranked + filtered list the whole page renders from
  const filtered = useMemo(() => {
    if (!items.length) return []
    const lim = limits || { maxRent: bounds.maxRent, maxAqi: bounds.maxAqi, maxCommute: bounds.maxCommute, minFit: 0 }
    const scored = items.map((n) => {
      if (!weightsDirty) return n // keep backend score + provisional/qualifier fields
      // Re-rank with the SAME missing-pillar policy as the backend (renormalize,
      // never treat a missing pillar as zero), so client scores stay consistent.
      const rw = reweight(n.subscores, weights, PILLARS)
      return {
        ...n,
        fitScore: rw.score,
        match: rw.match,
        matchDisplay: rw.matchDisplay,
        fitScoreDataStatus: rw.status,
        isProvisional: rw.status === 'provisional',
        missingPillars: rw.missingPillars,
        coveragePercent: rw.coveragePercent,
      }
    })
    return scored
      .filter(
        (n) =>
          (n.rent ?? 0) <= lim.maxRent &&
          (Number.isFinite(n.aqi) ? n.aqi <= lim.maxAqi : true) &&
          (Number.isFinite(n.commuteMin) ? n.commuteMin <= lim.maxCommute : lim.maxCommute === bounds.maxCommute) &&
          n.fitScore >= lim.minFit,
      )
      .sort((a, b) => b.fitScore - a.fitScore)
  }, [items, weights, weightsDirty, limits, bounds])

  const visible = showAll ? filtered : filtered.slice(0, 5)
  const top = filtered[0] || items[0]
  const why = whyBullets(top, filtered.length ? filtered : items, Number(prefs.budget))
  const sources = isNYC ? SOURCES_NYC : SOURCES_INDIA
  const filtersOn = weightsDirty || (limits && (limits.maxRent < bounds.maxRent || limits.maxAqi < bounds.maxAqi || limits.maxCommute < bounds.maxCommute || limits.minFit > 0))

  const snap = items.length ? citySnapshot(items) : null

  function resetFilters() {
    setWeights(baseWeights)
    setLimits({ maxRent: bounds.maxRent, maxAqi: bounds.maxAqi, maxCommute: bounds.maxCommute, minFit: 0 })
  }

  const resultsList = (
    <div className="flex flex-col gap-4">
      {loading ? (
        agents.length ? (
          <AgentProgress agents={agents} />
        ) : (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        )
      ) : visible.length ? (
        <>
          {visible.map((n, i) => (
            <NeighborhoodCard key={n.id} n={n} rank={i + 1} />
          ))}
          {filtered.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white py-3 text-sm font-medium text-brand-700 hover:border-brand-200"
            >
              {showAll ? (
                <>
                  Show Fewer <ChevronUp size={16} />
                </>
              ) : (
                <>
                  View More Neighborhoods ({filtered.length - 5} more) <ChevronDown size={16} />
                </>
              )}
            </button>
          )}
        </>
      ) : items.length ? (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <p className="text-sm font-medium text-ink">No localities match your filters.</p>
          <button onClick={resetFilters} className="mt-2 text-sm font-medium text-brand-700">
            Reset filters
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <p className="text-sm font-medium text-ink">Couldn't load live results just now.</p>
          <p className="mt-1 text-sm text-muted">
            The data service isn't responding. Check the backend is running on :8080, then refresh.
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <AppTopbar left="Find your perfect neighborhood" />

      <div className="px-6 py-6 lg:px-8">
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-band px-5 py-4">
          <div>
            <p className="text-base font-semibold text-ink">{prefs.statement}</p>
            <p className="mt-1 text-sm text-muted">
              Budget: {currency}
              {Number(prefs.budget).toLocaleString(isNYC ? 'en-US' : 'en-IN')}/month &nbsp;•&nbsp; {prefs.bed} &nbsp;•&nbsp;
              Priorities: {prefs.priorities}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
            <span className={`h-2 w-2 rounded-full ${loading ? 'animate-pulse bg-trend' : live ? 'bg-aff' : 'bg-red-400'}`} />
            <span className="text-muted">{loading ? 'Loading live data…' : live ? 'Live data' : 'Data unavailable'}</span>
          </span>
        </div>

        {prefs.presetApplied === FAMILY_HEALTH && (
          <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50/70 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <CircleCheck size={16} className="text-brand-600" /> Prioritized for family health
              </p>
              <span className="text-xs font-medium text-brand-700">Applied by the FitScore service</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Air quality 35% · Safety 28% · Commute 20% · Affordability 12% · Essentials &amp; Lifestyle 5%.
              Essential-service availability is shown separately and does not change FitScore.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">Top Neighborhood Matches</h2>
            <p className="text-sm text-muted">
              {filtersOn ? `${filtered.length} match your filters` : 'Based on your preferences'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-line">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-ink-soft'}`}
              >
                <LayoutList size={16} /> List
              </button>
              <button
                onClick={() => setView('map')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${view === 'map' ? 'bg-brand-50 text-brand-700' : 'text-ink-soft'}`}
              >
                <MapIcon size={16} /> Map
              </button>
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                showFilters || filtersOn ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-line text-ink-soft hover:border-brand-300'
              }`}
            >
              <SlidersHorizontal size={16} /> Filters{filtersOn ? ' •' : ''}
            </button>
          </div>
        </div>

        {showFilters && limits && (
          <FiltersPanel
            weights={weights}
            onWeights={setWeights}
            limits={limits}
            onLimits={setLimits}
            bounds={bounds}
            currency={currency}
            onReset={resetFilters}
            onClose={() => setShowFilters(false)}
          />
        )}

        {!loading && anomalyItems.length > 0 && (
          <div className="mt-4 rounded-2xl border border-line bg-white p-5">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <TriangleAlert size={16} className="text-trend" /> Anomalies detected
              <span className="text-xs font-normal text-muted">localities that break the city pattern</span>
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {anomalyItems.map(({ id, name, flags }) => (
                <Link key={id} to={`/neighborhood/${id}`}
                  onMouseEnter={() => prefetchLocality(id, searchCity)}
                  onFocus={() => prefetchLocality(id, searchCity)}
                  onTouchStart={() => prefetchLocality(id, searchCity)}
                  className="rounded-xl border border-line p-3 transition hover:border-brand-200">
                  <p className="text-sm font-semibold text-ink">{name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {flags.map((a) => (
                      <span
                        key={a.label}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.kind === 'good' ? 'bg-[#EAF7F0] text-aff' : 'bg-[#FDECEC] text-red-600'}`}
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">{flags[0].detail}</p>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Flagged automatically when a metric sits 1.5σ or more from the city average.</p>
          </div>
        )}

        {view === 'map' ? (
          <div className="mt-4">
            <ResultsMap items={visible} loading={loading} />
          </div>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1.05fr]">
            {resultsList}
            <div className="hidden lg:block">
              <ResultsMap items={visible} loading={loading} />
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-brand-700">Why {top?.name || 'your top match'}?</h3>
            <ul className="mt-3 space-y-2">
              {why.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-ink-soft">
                  <CircleCheck size={16} className="mt-0.5 shrink-0 text-aff" />
                  {w}
                </li>
              ))}
            </ul>
            {top && (
              <Link to={`/neighborhood/${top.id}`}
                onMouseEnter={() => prefetchLocality(top.id, searchCity)}
                onFocus={() => prefetchLocality(top.id, searchCity)}
                className="mt-4 inline-block text-sm font-medium text-brand-700">
                View Full Explanation →
              </Link>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink">City Snapshot</h3>
            {snap ? (
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-muted">Avg. median rent</span>
                  <span className="font-semibold text-ink">
                    {Number.isFinite(snap.rent)
                      ? `${currency}${snap.rent.toLocaleString(isNYC ? 'en-US' : 'en-IN')}/mo`
                      : 'Not available'}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted">Avg. live AQI</span>
                  <span className="font-semibold text-ink">{Number.isFinite(snap.aqi) ? snap.aqi : 'Not available'}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted">Avg. commute to hub</span>
                  <span className="font-semibold text-ink">{Number.isFinite(snap.commute) ? `${snap.commute} min` : 'Not available'}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted">Localities analyzed</span>
                  <span className="font-semibold text-ink">{items.length}</span>
                </li>
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Loading city data…</p>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink">Data Sources</h3>
            <ul className="mt-3 space-y-2.5">
              {sources.map((s) => (
                <li key={s.name} className="flex items-center gap-2.5 text-sm text-ink-soft">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </li>
              ))}
            </ul>
            {top && (
              <Link to={`/neighborhood/${top.id}`}
                onMouseEnter={() => prefetchLocality(top.id, searchCity)}
                onFocus={() => prefetchLocality(top.id, searchCity)}
                className="mt-4 inline-block text-sm font-medium text-brand-700">
                See sources in detail →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
