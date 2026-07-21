import { useState, useEffect } from 'react'
import { useParams, NavLink, Link } from 'react-router-dom'
import { Bookmark, LayoutGrid, PiggyBank, ShieldCheck, TrainFront, Heart, Wind, Users, Dot, TriangleAlert } from 'lucide-react'
import AppTopbar from '../../components/layout/AppTopbar.jsx'
import ScoreGauge from '../../components/ui/ScoreGauge.jsx'
import { apiNeighborhood, apiNeighborhoods, apiReviews, apiRentVerification, apiLocalityPulse, apiEssentials } from '../../lib/api.js'
import { adaptNeighborhood, cityInsights } from '../../lib/adapt.js'
import { useCity } from '../../lib/cityStore.jsx'
import { useSaved, toggleSaved } from '../../lib/saved.js'
import { cn } from '../../lib/cn.js'
import {
  OverviewTab,
  AffordabilityTab,
  SafetyTab,
  CommuteTab,
  LifestyleTab,
  AirQualityTab,
  CommunityTab,
} from './detailTabs.jsx'

const TABS = [
  { slug: 'overview', label: 'Overview', icon: LayoutGrid },
  { slug: 'affordability', label: 'Affordability', icon: PiggyBank },
  { slug: 'safety', label: 'Safety', icon: ShieldCheck },
  { slug: 'commute', label: 'Commute', icon: TrainFront },
  { slug: 'lifestyle', label: 'Essentials & Lifestyle', icon: Heart },
  { slug: 'air-quality', label: 'Air Quality', icon: Wind },
  { slug: 'community', label: 'Community Insights', icon: Users },
]

const TAB_CONTENT = {
  affordability: AffordabilityTab,
  safety: SafetyTab,
  commute: CommuteTab,
  lifestyle: LifestyleTab,
  'air-quality': AirQualityTab,
  community: CommunityTab,
}

export default function NeighborhoodDetail() {
  const { id, tab } = useParams()
  const { city } = useCity()
  const [n, setN] = useState(null)
  const [detailStatus, setDetailStatus] = useState('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [essentials, setEssentials] = useState(null)
  const [showFullExplanation, setShowFullExplanation] = useState(false)
  const saved = useSaved().some((x) => x.id === id)

  useEffect(() => {
    // Warm the expensive evidence paths in a deliberate order instead of
    // starting several grounded Gemini requests at once. Their panels keep
    // controlling when prepared results become visible.
    apiRentVerification(id, city, false, false)
    const reviewsTimer = setTimeout(() => apiReviews(id, city), 5000)
    const pulseTimer = setTimeout(() => apiLocalityPulse(id, city), 10000)
    return () => {
      clearTimeout(reviewsTimer)
      clearTimeout(pulseTimer)
    }
  }, [id, city])

  useEffect(() => {
    let alive = true
    setEssentials(null)
    apiEssentials(id, city).then((profile) => {
      if (alive) setEssentials(profile)
    })
    return () => {
      alive = false
    }
  }, [id, city])

  useEffect(() => {
    let alive = true
    setN(null)
    setDetailStatus('loading')
    ;(async () => {
      // The locality itself (with AI summary + AQI series) plus its city peers,
      // so the tabs can rank it against the rest of the city.
      const [d, peers] = await Promise.all([apiNeighborhood(id, city), apiNeighborhoods(city)])
      if (!alive) return
      if (d?.__error) {
        setDetailStatus(d.__error)
        return
      }
      if (!d) {
        setDetailStatus('temporarily_unavailable')
        return
      }
      const adapted = adaptNeighborhood(d)
      adapted.insights = cityInsights(peers || [], id)
      adapted.cityId = city
      setN(adapted)
      setDetailStatus('ready')
    })()
    return () => {
      alive = false
    }
  }, [id, city, retryKey])

  useEffect(() => {
    setShowFullExplanation(false)
  }, [id, city])

  if (detailStatus === 'loading') {
    return <div className="grid min-h-[55vh] place-items-center p-8 text-sm text-muted" role="status">Loading neighborhood…</div>
  }
  if (detailStatus === 'not_found') {
    return (
      <div className="grid min-h-[65vh] place-items-center p-8 text-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Locality not found</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">We couldn’t find this neighborhood</h1>
          <p className="mt-2 text-sm text-muted">It may not be available for the currently selected city.</p>
          <Link to="/results" className="btn-primary mt-5 inline-flex">Back to results</Link>
        </div>
      </div>
    )
  }
  if (detailStatus === 'temporarily_unavailable' || !n) {
    return (
      <div className="grid min-h-[65vh] place-items-center p-8 text-center">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="font-serif text-2xl text-ink">Neighborhood details are temporarily unavailable</h1>
          <p className="mt-2 text-sm text-muted">NestIQ could not reach the evidence service. This does not mean the locality has no data.</p>
          <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-5 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800">Try again</button>
        </div>
      </div>
    )
  }

  const active = tab || 'overview'
  const ActiveTab = TAB_CONTENT[active] || OverviewTab
  const evidence = Object.values(n.evidence || {})
  const googleSignals = evidence
    .filter((e) => e.sourceType === 'live_google' || e.sourceType === 'cached_google')
    .map((e) => `${e.metric.replace('_', ' ')}: ${e.status === 'temporarily_unavailable' ? 'unavailable' : e.status}`)
    .join(' · ')

  return (
    <div>
      <AppTopbar back={{ to: '/results', label: 'Back to results' }} />

      <div className="px-6 py-6 lg:px-8">
        {/* header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-3xl text-ink">{n.name}</h1>
              <button
                onClick={() => toggleSaved(n, city)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                  saved
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-line text-ink-soft hover:border-brand-300',
                )}
              >
                <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {n.tags.map((t) => (
                <span key={t} className="chip text-xs">
                  <Dot size={16} className="-mx-1 text-brand-500" />
                  {t}
                </span>
              ))}
            </div>
            {n.anomalies?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {n.anomalies.map((a) => (
                  <span
                    key={a.label}
                    title={a.detail}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${a.kind === 'good' ? 'bg-[#EAF7F0] text-aff' : 'bg-[#FDECEC] text-red-600'}`}
                  >
                    <TriangleAlert size={12} /> {a.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start lg:w-[52%]">
            <div className="card flex items-center gap-4 p-4">
              <div className="flex flex-col items-center">
                <p className="text-xs text-muted">FitScore</p>
                <p className="font-serif text-3xl text-brand-700">{n.fitScore}</p>
                <p className="text-[11px] text-muted">/100</p>
              </div>
              <ScoreGauge score={n.fitScore} size={90} />
              <div className="flex flex-col items-start gap-1">
                <span className={`text-sm font-semibold ${n.isProvisional ? 'text-amber-700' : 'text-aff'}`}>
                  {n.matchDisplay || n.match}
                </span>
                {n.isProvisional && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    Provisional FitScore · {n.missingPillars?.includes('air_quality') ? 'Air-quality data unavailable' : 'Incomplete data'} ({n.coveragePercent}% coverage)
                  </span>
                )}
                {n.criticalRisk && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      n.criticalRisk.severity === 'critical'
                        ? 'bg-red-50 text-red-700'
                        : n.criticalRisk.severity === 'high'
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-amber-50 text-amber-700',
                    )}
                    title={n.criticalRisk.detail}
                  >
                    {n.healthQualifier}
                  </span>
                )}
              </div>
            </div>
            <div className="card flex-1 bg-brand-50/50 p-4">
              <p className="text-sm font-semibold text-ink">Why this match?</p>
              {n.criticalRisk && (
                <p className="mt-1 text-xs font-medium text-red-700">
                  Trade-off: strong overall fit, but {n.criticalRisk.detail}. FitScore weighs your full set of priorities, not air alone.
                </p>
              )}
              <p
                className={cn(
                  'mt-1 text-xs leading-relaxed text-muted',
                  !showFullExplanation && 'line-clamp-2',
                )}
              >
                {n.why}
              </p>
              <button
                type="button"
                aria-expanded={showFullExplanation}
                onClick={() => setShowFullExplanation((shown) => !shown)}
                className="mt-2 text-xs font-medium text-brand-700 hover:underline"
              >
                {showFullExplanation ? 'Show less' : 'Show more'}
              </button>
            </div>
          </div>
        </div>

        {/* provenance trust line: each metric is sourced and honestly labelled */}
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-[#F0F9F4] px-4 py-2.5 text-xs text-ink-soft">
          <ShieldCheck size={14} className="shrink-0 text-aff" />
          <span className="font-semibold text-ink">Every metric here is sourced and labelled.</span>
          <span className="text-muted">
            {evidence.length
              ? `${googleSignals || 'Google signal status is shown inside each pillar'} · rent is an estimated market value · safety is a curated proxy. Missing signals are excluded, never replaced with typical values; Gemini only explains the evidence.`
              : 'Source status and methodology are shown inside each pillar; Gemini explains the supplied evidence rather than inventing measurements.'}
          </span>
        </div>

        {/* tab bar */}
        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <NavLink
              key={t.slug}
              to={t.slug === 'overview' ? `/neighborhood/${id}` : `/neighborhood/${id}/${t.slug}`}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition',
                active === t.slug
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-soft hover:text-brand-700',
              )}
            >
              <t.icon size={16} />
              {t.label}
            </NavLink>
          ))}
        </div>

        {/* content */}
        <div className="mt-6"><ActiveTab n={n} essentials={essentials} /></div>
      </div>
    </div>
  )
}
