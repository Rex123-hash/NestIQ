import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ArrowLeftRight, Trash2, Search, RefreshCw, MapPin } from 'lucide-react'
import ScoreGauge from '../components/ui/ScoreGauge.jsx'
import CityPicker from '../components/layout/CityPicker.jsx'
import { useSaved, removeSaved, getSaved, refreshSaved, isOutdated } from '../lib/saved.js'
import { apiNeighborhoods, prefetchLocality } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import { useMapsKey, placesPhotoUrl } from '../lib/gmaps.js'

const PILLARS = [
  ['affordability', 'Affordability'],
  ['safety', 'Safety'],
  ['commute', 'Commute'],
  ['lifestyle', 'Essentials & Lifestyle'],
  ['air_quality', 'Air Quality'],
]

function SavedPhoto({ locality, mapsKey }) {
  const [imageFailed, setImageFailed] = useState(false)
  const accent = locality.accent || '#7C5CF6'
  const photo = placesPhotoUrl(locality.photo, mapsKey, 640)

  useEffect(() => {
    setImageFailed(false)
  }, [photo])

  return (
    <div
      className="relative h-32 overflow-hidden rounded-xl"
      style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}0d)` }}
    >
      {photo && !imageFailed ? (
        <img
          src={photo}
          alt={`${locality.name} locality`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-brand-700">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/80 shadow-sm">
            <MapPin size={20} aria-hidden="true" />
          </span>
          <span className="max-w-full truncate text-xs font-semibold">{locality.name}</span>
          <span className="text-[10px] text-muted">Locality photo unavailable</span>
        </div>
      )}
      <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white shadow-card">
        <Heart size={14} style={{ color: accent }} fill={accent} />
      </span>
    </div>
  )
}

export default function Saved() {
  const saved = useSaved()
  const mapsKey = useMapsKey()

  // Migrate/refresh saved snapshots against the current backend, so records
  // saved under the old scoring model (which could show AQI 500 with an air
  // sub-score of 96) are updated to the current absolute-CPCB scoring.
  useEffect(() => {
    let alive = true
    const cities = [...new Set(getSaved().map((n) => n.city).filter(Boolean))]
    if (!cities.length) return
    Promise.all(cities.map((c) => apiNeighborhoods(c))).then((lists) => {
      if (!alive) return
      const fresh = {}
      for (const list of lists) for (const a of adaptList(list || [])) fresh[a.id] = a
      if (Object.keys(fresh).length) refreshSaved(fresh)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-line bg-white px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <h1 className="font-serif text-3xl text-ink">Saved Localities</h1>
          <p className="text-sm text-muted">Localities you've bookmarked. Tap the heart on any match to save it.</p>
        </div>
        <div className="flex items-center gap-3">
          <CityPicker className="shrink-0" />
          <Link to="/results" className="flex items-center gap-2 rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
            <Search size={16} /> Find more
          </Link>
        </div>
      </div>

      <div className="px-6 py-6 lg:px-8">
        {!saved.length ? (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-line bg-white p-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-500">
              <Heart size={22} />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">No saved localities yet</p>
            <p className="mt-1 text-sm text-muted">
              Open your matches and tap the <Heart size={13} className="inline text-life" /> on a card to save it here.
            </p>
            <Link to="/results" className="btn-primary mt-5 inline-flex">Browse matches</Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {saved.map((n) => (
                <div key={n.id} className="grid items-center gap-4 rounded-2xl border border-line bg-white p-4 lg:grid-cols-[220px_1fr_auto_auto]">
                  <SavedPhoto locality={n} mapsKey={mapsKey} />

                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-ink">{n.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      Saved {n.savedAt ? new Date(n.savedAt).toLocaleDateString() : 'recently'}
                      {n.city ? ` · ${n.city.replace('-', ' ')}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {n.rentDisplay}/mo · AQI {n.aqi ?? '—'} · {Number.isFinite(n.commuteMin) ? `${n.commuteMin} min commute` : 'commute unavailable'}
                    </p>
                    {n.blurb && (
                      <p className="mt-2 rounded-lg bg-brand-50/50 p-2 text-xs italic text-ink-soft">{n.blurb}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-6">
                    {isOutdated(n) ? (
                      <div className="flex max-w-[180px] flex-col items-center gap-1 text-center">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-700"><RefreshCw size={18} /></span>
                        <p className="text-xs font-semibold text-amber-700">Scores need refreshing</p>
                        <p className="text-[11px] text-muted">Saved under an older scoring model. Reconnect or open the locality to refresh.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col items-center">
                          <p className="text-xs text-muted">FitScore</p>
                          <p className="font-serif text-2xl text-brand-700">{n.fitScore}<span className="text-sm text-muted">/100</span></p>
                          <ScoreGauge score={n.fitScore} size={56} />
                          <span className={`text-[11px] font-medium ${n.isProvisional ? 'text-amber-700' : 'text-aff'}`}>{n.matchDisplay || n.match}</span>
                          {n.criticalRisk && (
                            <span className="mt-0.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700" title={n.criticalRisk.detail}>
                              {n.healthQualifier}
                            </span>
                          )}
                        </div>
                        <ul className="hidden space-y-1 md:block">
                          {PILLARS.map(([key, label]) => (
                            <li key={key} className="flex items-center justify-between gap-6 text-xs">
                              <span className="text-muted">{label}</span>
                              <b className="font-semibold text-ink">{n.subscores?.[key] ?? '—'}</b>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Link to={`/neighborhood/${n.id}`}
                      onMouseEnter={() => prefetchLocality(n.id, n.city || 'delhi-ncr')}
                      onFocus={() => prefetchLocality(n.id, n.city || 'delhi-ncr')}
                      onTouchStart={() => prefetchLocality(n.id, n.city || 'delhi-ncr')}
                      onClick={() => prefetchLocality(n.id, n.city || 'delhi-ncr')}
                      className="btn-primary py-2 text-xs">View Details</Link>
                    <Link to="/compare" className="btn-ghost py-2 text-xs"><ArrowLeftRight size={14} /> Compare</Link>
                    <button onClick={() => removeSaved(n.id)} className="btn-ghost py-2 text-xs text-ink-soft"><Trash2 size={14} /> Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-muted">{saved.length} saved {saved.length === 1 ? 'locality' : 'localities'}</p>
          </>
        )}
      </div>
    </div>
  )
}
