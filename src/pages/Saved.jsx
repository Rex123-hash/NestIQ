import { Link } from 'react-router-dom'
import { Heart, ArrowLeftRight, Trash2, Search } from 'lucide-react'
import ScoreGauge from '../components/ui/ScoreGauge.jsx'
import { useSaved, removeSaved } from '../lib/saved.js'

const PILLARS = [
  ['affordability', 'Affordability'],
  ['safety', 'Safety'],
  ['commute', 'Commute'],
  ['lifestyle', 'Lifestyle'],
  ['air_quality', 'Air Quality'],
]

export default function Saved() {
  const saved = useSaved()

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-line bg-white px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <h1 className="font-serif text-3xl text-ink">Saved Localities</h1>
          <p className="text-sm text-muted">Localities you've bookmarked — tap the heart on any match to save it.</p>
        </div>
        <Link to="/results" className="flex items-center gap-2 rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
          <Search size={16} /> Find more
        </Link>
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
                  <div className="relative h-32 overflow-hidden rounded-xl" style={{ background: `linear-gradient(135deg, ${n.accent}33, ${n.accent}0d)` }}>
                    <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white shadow-card">
                      <Heart size={14} style={{ color: n.accent }} fill={n.accent} />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-ink">{n.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      Saved {n.savedAt ? new Date(n.savedAt).toLocaleDateString() : 'recently'}
                      {n.city ? ` · ${n.city.replace('-', ' ')}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {n.rentDisplay}/mo · AQI {n.aqi ?? '—'} · {n.commuteMin} min commute
                    </p>
                    {n.blurb && (
                      <p className="mt-2 rounded-lg bg-brand-50/50 p-2 text-xs italic text-ink-soft">{n.blurb}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                      <p className="text-xs text-muted">FitScore</p>
                      <p className="font-serif text-2xl text-brand-700">{n.fitScore}<span className="text-sm text-muted">/100</span></p>
                      <ScoreGauge score={n.fitScore} size={56} />
                      <span className="text-[11px] font-medium text-aff">{n.match}</span>
                    </div>
                    <ul className="hidden space-y-1 md:block">
                      {PILLARS.map(([key, label]) => (
                        <li key={key} className="flex items-center justify-between gap-6 text-xs">
                          <span className="text-muted">{label}</span>
                          <b className="font-semibold text-ink">{n.subscores?.[key] ?? '—'}</b>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Link to={`/neighborhood/${n.id}`} className="btn-primary py-2 text-xs">View Details</Link>
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
