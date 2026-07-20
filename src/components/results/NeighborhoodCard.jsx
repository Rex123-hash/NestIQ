import { Link } from 'react-router-dom'
import { useState } from 'react'
import { TrainFront, DollarSign, IndianRupee, Wind, Heart } from 'lucide-react'
import ScoreGauge from '../ui/ScoreGauge.jsx'
import { useMapsKey, placesPhotoUrl } from '../../lib/gmaps.js'
import { useCity } from '../../lib/cityStore.jsx'
import { useSaved, toggleSaved } from '../../lib/saved.js'
import { prefetchLocality } from '../../lib/api.js'

const scoreColor = (s) => (s >= 85 ? 'text-brand-700' : s >= 75 ? 'text-aff' : 'text-trend')

// Colour a critical air-quality qualifier by severity so a friendly overall
// match is never shown without the health caveat beside it.
const riskChip = (severity) =>
  severity === 'critical'
    ? 'bg-red-50 text-red-700'
    : severity === 'high'
      ? 'bg-orange-50 text-orange-700'
      : 'bg-amber-50 text-amber-700'

export default function NeighborhoodCard({ n, rank }) {
  const key = useMapsKey()
  const { city } = useCity()
  const saved = useSaved().some((x) => x.id === n.id)
  const [imgOk, setImgOk] = useState(true)
  const photo = placesPhotoUrl(n.photo, key)
  const isRupee = (n.rentDisplay || '').includes('₹')
  const RentIcon = isRupee ? IndianRupee : DollarSign
  return (
    <Link
      to={`/neighborhood/${n.id}`}
      // Start the slow evidence fetches on intent (hover/focus/tap), so the detail
      // page opens with data already loading rather than from cold.
      onMouseEnter={() => prefetchLocality(n.id, city)}
      onFocus={() => prefetchLocality(n.id, city)}
      onTouchStart={() => prefetchLocality(n.id, city)}
      onClick={() => prefetchLocality(n.id, city)}
      className="block rounded-2xl border border-line bg-white p-4 shadow-card transition hover:border-brand-200"
    >
      <div className="flex gap-4">
        {/* thumbnail — real Street View photo over a gradient fallback */}
        <div
          className="relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-xl"
          style={{ background: `linear-gradient(135deg, ${n.accent}33, ${n.accent}0d)` }}
        >
          {photo && imgOk && (
            <img
              src={photo}
              alt={n.name}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          )}
          <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white shadow">
            {rank}
          </span>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleSaved(n, city)
            }}
            className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white/90 shadow transition hover:bg-white"
            aria-label={saved ? 'Remove from saved' : 'Save locality'}
          >
            <Heart size={13} className={saved ? 'text-life' : 'text-muted'} fill={saved ? '#EC6FA6' : 'none'} />
          </button>
        </div>

        {/* body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">{n.name}</h3>
              <p className="text-sm text-muted">{n.descriptors}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">FitScore</p>
              <p className={`font-serif text-3xl leading-none ${scoreColor(n.fitScore)}`}>{n.fitScore}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-ink-soft">
              <TrainFront size={15} className="text-muted" />
              <b className="font-semibold">{Number.isFinite(n.commuteMin) ? `${n.commuteMin} min` : 'Unavailable'}</b>
              <span className="text-muted">{Number.isFinite(n.commuteMin) ? 'to work' : 'not estimated'}</span>
            </span>
            <span className="flex items-center gap-1.5 text-ink-soft">
              <Wind size={15} className="text-aff" />
              <b className="font-semibold">{n.aqi ?? '—'}</b>
              <span className="text-muted">AQI{n.aqiCategory ? ` · ${n.aqiCategory.replace(' air quality', '')}` : ''}</span>
            </span>
            <span className="flex items-center gap-1.5 text-ink-soft">
              <RentIcon size={15} className="text-muted" />
              <b className="font-semibold">{n.rentDisplay || `$${n.rent.toLocaleString()}`}</b>
              <span className="text-muted">Est. Rent</span>
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {n.amenityTags.map((t) => (
                <span key={t} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                  {t}
                </span>
              ))}
              {n.extraTags > 0 && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-muted">
                  +{n.extraTags} more
                </span>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-center">
              <ScoreGauge score={n.fitScore} size={64} />
              <span className={`-mt-1 text-xs font-medium ${n.isProvisional ? 'text-amber-700' : 'text-aff'}`}>
                {n.matchDisplay || n.match}
              </span>
              {n.isProvisional && (
                <span className="mt-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  {n.missingPillars?.length ? `${n.missingPillars.length} signal${n.missingPillars.length > 1 ? 's' : ''} unavailable` : 'Incomplete data'}
                </span>
              )}
              {n.criticalRisk && (
                <span
                  className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskChip(n.criticalRisk.severity)}`}
                  title={n.criticalRisk.detail}
                >
                  {n.healthQualifier}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
