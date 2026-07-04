import { useState, useEffect, useMemo } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { LayoutList, Map as MapIcon, SlidersHorizontal, ChevronDown, ChevronUp, CircleCheck } from 'lucide-react'
import AppTopbar from '../components/layout/AppTopbar.jsx'
import NeighborhoodCard from '../components/results/NeighborhoodCard.jsx'
import ResultsMap from '../components/results/ResultsMap.jsx'
import FiltersPanel from '../components/results/FiltersPanel.jsx'
import AgentProgress from '../components/results/AgentProgress.jsx'
import { preferences as defaultPrefs } from '../data/neighborhoods.js'
import { streamSearch, apiNeighborhoods } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import { useCity } from '../lib/cityStore.jsx'

const INDIA_DEFAULT = { affordability: 20, safety: 20, commute: 20, lifestyle: 15, air_quality: 25 }
const PILLARS = ['affordability', 'safety', 'commute', 'lifestyle', 'air_quality']

const SOURCES_INDIA = [
  { name: 'Google Air Quality API (CPCB AQI)', color: '#3FB984' },
  { name: 'Google Places (amenities)', color: '#EA4335' },
  { name: 'Google Maps Distance Matrix', color: '#4F86F7' },
  { name: 'Gemini on Vertex AI', color: '#7C5CF6' },
]
const SOURCES_NYC = [
  { name: 'Zillow Research (ZORI)', color: '#3FB984' },
  { name: 'NYPD & NYC Open Data', color: '#4F86F7' },
  { name: 'Google Maps & Places', color: '#EA4335' },
  { name: 'Reddit Community Insights', color: '#FF4500' },
]
const WHY = [
  'Strong balance of air quality, affordability, and commute',
  'Backed by live Google data on AQI, amenities, and drive times',
  'Ranked by how well it fits the priorities you set',
]

function prioritiesText(weights) {
  if (!weights) return defaultPrefs.priorities
  const label = (v) => (v >= 70 ? 'high' : v >= 40 ? 'medium' : 'low')
  return Object.entries(weights)
    .map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)} (${label(v)})`)
    .join(', ')
}

const matchLabel = (s) => (s >= 85 ? 'Excellent Match' : s >= 75 ? 'Good Match' : 'Fair Match')

function reweight(sub, w) {
  const sum = PILLARS.reduce((a, k) => a + (w[k] || 0), 0)
  if (!sum || !sub) return null
  return Math.round(PILLARS.reduce((a, k) => a + (sub[k] || 0) * (w[k] || 0), 0) / sum)
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
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

  const { state } = useLocation()
  const { city } = useCity()
  const isNYC = city === 'new-york'
  const currency = isNYC ? '$' : '₹'

  useEffect(() => {
    let alive = true
    let es = null
    setLoading(true)
    setShowAll(false)
    setAgents([])
    const query = state?.query
    setPrefs((p) => ({ ...p, statement: query || 'Top neighborhood matches for you' }))

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
        })
      } else {
        setItems([])
        setLive(false)
      }
      setLoading(false)
    }

    if (query) {
      // stream the agent fan-out, then render the final results
      es = streamSearch(query, city, {
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
      })
    } else {
      apiNeighborhoods(city).then((list) => apply({ results: list, preferences: { weights: INDIA_DEFAULT } }))
    }

    return () => {
      alive = false
      es && es.close()
    }
  }, [state, city])

  const bounds = useMemo(() => computeBounds(items), [items])
  const weightsDirty = useMemo(
    () => PILLARS.some((k) => (weights[k] || 0) !== (baseWeights[k] || 0)),
    [weights, baseWeights],
  )

  // re-ranked + filtered list the whole page renders from
  const filtered = useMemo(() => {
    if (!items.length) return []
    const lim = limits || { maxRent: bounds.maxRent, maxAqi: bounds.maxAqi, maxCommute: bounds.maxCommute, minFit: 0 }
    const scored = items.map((n) => {
      const s = weightsDirty ? reweight(n.subscores, weights) ?? n.fitScore : n.fitScore
      return { ...n, fitScore: s, match: matchLabel(s) }
    })
    return scored
      .filter(
        (n) =>
          (n.rent ?? 0) <= lim.maxRent &&
          (Number.isFinite(n.aqi) ? n.aqi <= lim.maxAqi : true) &&
          (n.commuteMin ?? 0) <= lim.maxCommute &&
          n.fitScore >= lim.minFit,
      )
      .sort((a, b) => b.fitScore - a.fitScore)
  }, [items, weights, weightsDirty, limits, bounds])

  const visible = showAll ? filtered : filtered.slice(0, 5)
  const top = filtered[0] || items[0]
  const sources = isNYC ? SOURCES_NYC : SOURCES_INDIA
  const filtersOn = weightsDirty || (limits && (limits.maxRent < bounds.maxRent || limits.maxAqi < bounds.maxAqi || limits.maxCommute < bounds.maxCommute || limits.minFit > 0))

  const snap = items.length
    ? {
        rent: Math.round(avg(items.map((n) => n.rent).filter(Number.isFinite))),
        aqi: Math.round(avg(items.map((n) => n.aqi).filter(Number.isFinite))),
        commute: Math.round(avg(items.map((n) => n.commuteMin).filter(Number.isFinite))),
      }
    : null

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
              {WHY.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-ink-soft">
                  <CircleCheck size={16} className="mt-0.5 shrink-0 text-aff" />
                  {w}
                </li>
              ))}
            </ul>
            {top && (
              <Link to={`/neighborhood/${top.id}`} className="mt-4 inline-block text-sm font-medium text-brand-700">
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
                    {currency}
                    {snap.rent.toLocaleString(isNYC ? 'en-US' : 'en-IN')}/mo
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted">Avg. live AQI</span>
                  <span className="font-semibold text-ink">{snap.aqi || '—'}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted">Avg. commute to hub</span>
                  <span className="font-semibold text-ink">{snap.commute} min</span>
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
              <Link to={`/neighborhood/${top.id}`} className="mt-4 inline-block text-sm font-medium text-brand-700">
                See sources in detail →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
