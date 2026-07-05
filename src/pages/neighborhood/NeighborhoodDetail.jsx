import { useState, useEffect } from 'react'
import { useParams, NavLink } from 'react-router-dom'
import { Bookmark, LayoutGrid, PiggyBank, ShieldCheck, TrainFront, Heart, Wind, Users, Dot, TriangleAlert } from 'lucide-react'
import AppTopbar from '../../components/layout/AppTopbar.jsx'
import ScoreGauge from '../../components/ui/ScoreGauge.jsx'
import { apiNeighborhood, apiNeighborhoods } from '../../lib/api.js'
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
  { slug: 'lifestyle', label: 'Lifestyle', icon: Heart },
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
  const [showWhy, setShowWhy] = useState(false)
  const saved = useSaved().some((x) => x.id === id)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // The locality itself (with AI summary + AQI series) plus its city peers,
      // so the tabs can rank it against the rest of the city.
      const [d, peers] = await Promise.all([apiNeighborhood(id, city), apiNeighborhoods(city)])
      if (!alive) return
      if (!d) {
        setN(null)
        return
      }
      const adapted = adaptNeighborhood(d)
      adapted.insights = cityInsights(peers || [], id)
      adapted.cityId = city
      setN(adapted)
    })()
    return () => {
      alive = false
    }
  }, [id, city])

  if (!n) return <div className="p-8 text-muted">Loading neighborhood…</div>

  const active = tab || 'overview'
  const ActiveTab = TAB_CONTENT[active] || OverviewTab

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

          <div className="flex flex-col gap-3 sm:flex-row lg:w-[52%]">
            <div className="card flex items-center gap-4 p-4">
              <div className="flex flex-col items-center">
                <p className="text-xs text-muted">FitScore</p>
                <p className="font-serif text-3xl text-brand-700">{n.fitScore}</p>
                <p className="text-[11px] text-muted">/100</p>
              </div>
              <ScoreGauge score={n.fitScore} size={90} />
              <span className="text-sm font-semibold text-aff">{n.match}</span>
            </div>
            <div className="card flex-1 bg-brand-50/50 p-4">
              <p className="text-sm font-semibold text-ink">Why this match?</p>
              <p
                className="mt-1 text-xs leading-relaxed text-muted"
                style={
                  showWhy
                    ? undefined
                    : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                }
              >
                {n.why}
              </p>
              <button onClick={() => setShowWhy((v) => !v)} className="mt-2 text-xs font-medium text-brand-700">
                {showWhy ? 'Show less' : 'See full explanation →'}
              </button>
            </div>
          </div>
        </div>

        {/* provenance trust line: every metric traces to a live source */}
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-[#F0F9F4] px-4 py-2.5 text-xs text-ink-soft">
          <ShieldCheck size={14} className="shrink-0 text-aff" />
          <span className="font-semibold text-ink">Every metric here traces to a live source.</span>
          <span className="text-muted">
            Air quality, amenities and commute are live from Google Maps Platform; Gemini only explains the numbers, it never invents them.
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
        <div className="mt-6"><ActiveTab n={n} /></div>
      </div>
    </div>
  )
}
