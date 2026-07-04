import { useState, useEffect } from 'react'
import { X, Plus, Download, PiggyBank, ShieldCheck, TrainFront, Heart, Wind, Home, Trophy, Info } from 'lucide-react'
import AppTopbar from '../components/layout/AppTopbar.jsx'
import ScoreGauge from '../components/ui/ScoreGauge.jsx'
import { apiNeighborhoods } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import { useCity } from '../lib/cityStore.jsx'

const ROWS = [
  { key: 'affordability', label: 'Affordability', icon: PiggyBank },
  { key: 'safety', label: 'Safety', icon: ShieldCheck },
  { key: 'commute', label: 'Commute', icon: TrainFront },
  { key: 'lifestyle', label: 'Lifestyle', icon: Heart },
  { key: 'air_quality', label: 'Air Quality', icon: Wind },
]

const PILLAR_LABEL = Object.fromEntries(ROWS.map((r) => [r.key, r.label]))

function exportCsv(items, currency) {
  const cols = ['Metric', ...items.map((n) => n.name)]
  const lines = [cols]
  lines.push(['FitScore', ...items.map((n) => n.fitScore)])
  ROWS.forEach((r) => lines.push([r.label, ...items.map((n) => n.subscores[r.key] ?? '')]))
  lines.push(['Est. Rent', ...items.map((n) => `${currency}${n.rent}`)])
  lines.push(['Commute (min)', ...items.map((n) => n.commuteMin)])
  lines.push(['Live AQI', ...items.map((n) => n.aqi ?? '')])
  const csv = lines.map((row) => row.map((c) => `"${c}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'nestiq-compare.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function Compare() {
  const { city } = useCity()
  const isNYC = city === 'new-york'
  const currency = isNYC ? '$' : '₹'
  const [all, setAll] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiNeighborhoods(city).then((list) => {
      if (!alive) return
      const adapted = adaptList(list || [])
      setAll(adapted)
      setSelectedIds(adapted.slice(0, 4).map((n) => n.id))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [city])

  const items = selectedIds.map((id) => all.find((n) => n.id === id)).filter(Boolean)
  const available = all.filter((n) => !selectedIds.includes(n.id))
  const maxCommute = Math.max(1, ...items.map((n) => n.commuteMin || 0))
  const maxAqi = Math.max(1, ...items.map((n) => n.aqi || 0))
  const best = items.slice().sort((a, b) => b.fitScore - a.fitScore)[0]
  const bestPillar = best ? PILLAR_LABEL[Object.entries(best.subscores).sort((a, b) => b[1] - a[1])[0]?.[0]] : ''

  const addNext = () => available.length && selectedIds.length < 4 && setSelectedIds([...selectedIds, available[0].id])
  const remove = (id) => selectedIds.length > 1 && setSelectedIds(selectedIds.filter((x) => x !== id))

  return (
    <div>
      <AppTopbar back={{ to: '/results', label: 'Back to results' }} />
      <div className="px-6 py-6 lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-ink">Compare Localities</h1>
            <p className="mt-1 text-sm text-muted">Compare up to 4 localities side-by-side to find your best fit.</p>
          </div>
          <button
            onClick={addNext}
            disabled={!available.length || selectedIds.length >= 4}
            className="flex items-center gap-2 rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} /> Add Locality
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-muted">Loading live localities…</p>
        ) : (
          <>
            {/* chips */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((n) => (
                <div key={n.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: n.accent }} />
                    {n.name}
                  </span>
                  <button onClick={() => remove(n.id)} className="text-muted hover:text-ink" aria-label={`Remove ${n.name}`}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>

            {/* export */}
            <div className="mt-6 flex items-center justify-between border-b border-line pb-3">
              <span className="text-sm font-medium text-brand-700">Overview</span>
              <button
                onClick={() => exportCsv(items, currency)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:border-brand-300"
              >
                <Download size={15} /> Export CSV
              </button>
            </div>

            {/* comparison table */}
            <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
              <table className="w-full min-w-[720px] border-collapse">
                <tbody>
                  <tr className="border-b border-line">
                    <td className="w-52 p-4 align-top">
                      <p className="text-sm font-semibold text-ink">FitScore</p>
                      <p className="mt-1 text-xs text-muted">Overall match based on your preferences</p>
                    </td>
                    {items.map((n) => (
                      <td key={n.id} className="p-4 text-center">
                        <p className="text-sm font-medium text-ink">{n.name}</p>
                        <p className="font-serif text-3xl text-brand-700">{n.fitScore}</p>
                        <ScoreGauge score={n.fitScore} size={70} className="mx-auto" />
                        <p className="text-xs font-medium text-aff">{n.match}</p>
                      </td>
                    ))}
                  </tr>

                  {ROWS.map((r) => (
                    <tr key={r.key} className="border-b border-line">
                      <td className="p-4">
                        <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                          <r.icon size={16} className="text-muted" /> {r.label}
                        </span>
                      </td>
                      {items.map((n) => (
                        <td key={n.id} className="p-4 text-center text-sm">
                          <b className="text-base font-semibold text-ink">{n.subscores[r.key]}</b>
                          <span className="text-muted"> /100</span>
                        </td>
                      ))}
                    </tr>
                  ))}

                  <tr className="border-b border-line">
                    <td className="p-4">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                        <Home size={16} className="text-muted" /> Est. Rent (1 bed)
                      </span>
                    </td>
                    {items.map((n) => (
                      <td key={n.id} className="p-4 text-center text-base font-semibold text-ink">
                        {n.rentDisplay}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                        <Wind size={16} className="text-muted" /> Live AQI
                      </span>
                    </td>
                    {items.map((n) => (
                      <td key={n.id} className="p-4 text-center text-sm">
                        <b className="text-base font-semibold text-ink">{n.aqi ?? '—'}</b>
                        <span className="text-muted"> {n.aqiCategory || ''}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* bottom cards */}
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <div className="card p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Trophy size={16} className="text-trend" /> Best For You</h3>
                <p className="mt-1 text-xs text-muted">Highest overall FitScore among the localities you're comparing.</p>
                {best && (
                  <div className="mt-3 rounded-xl border-l-4 border-brand-600 bg-brand-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink">{best.name}</p>
                      <span className="font-serif text-2xl text-brand-700">{best.fitScore}</span>
                    </div>
                    <p className="text-xs text-muted">Strongest on {bestPillar}, at {best.rentDisplay}/month.</p>
                  </div>
                )}
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-ink">Commute Comparison</h3>
                <p className="text-xs text-muted">Drive time to the city work hub</p>
                <div className="mt-3 space-y-3">
                  {items.map((n) => (
                    <div key={n.id} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 truncate text-ink-soft">{n.short}</span>
                      <div className="h-2 flex-1 rounded-full bg-line">
                        <div className="h-2 rounded-full" style={{ width: `${(n.commuteMin / maxCommute) * 100}%`, backgroundColor: n.accent }} />
                      </div>
                      <span className="w-14 text-right font-semibold text-ink">{n.commuteMin} min</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-ink">Air Quality Comparison</h3>
                <p className="text-xs text-muted">Live AQI · shorter bar = cleaner air</p>
                <div className="mt-3 space-y-3">
                  {items.map((n) => (
                    <div key={n.id} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 truncate text-ink-soft">{n.short}</span>
                      <div className="h-2 flex-1 rounded-full bg-line">
                        <div className="h-2 rounded-full" style={{ width: `${((n.aqi || 0) / maxAqi) * 100}%`, backgroundColor: n.accent }} />
                      </div>
                      <span className="w-14 text-right font-semibold text-ink">{n.aqi ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs text-muted">
              <Info size={13} /> Scores are normalized across localities in {isNYC ? 'New York City' : 'this city'}, from live Google Maps + Air Quality data.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
