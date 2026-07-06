import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Wind, Home as HomeIcon, Car, ChevronRight, Info } from 'lucide-react'
import { useSaved } from '../lib/saved.js'
import { apiNeighborhoods } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import CityPicker from '../components/layout/CityPicker.jsx'

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
              ? { ...n, aqi: f.aqi, aqiCategory: f.aqiCategory, rent: f.rent, rentDisplay: f.rentDisplay, commuteMin: f.commuteMin, subscores: f.subscores, fitScore: f.fitScore, match: f.match }
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

export default function Alerts() {
  const [saved, isLive] = useLiveSaved()
  const aqis = saved.map((n) => n.aqi).filter((v) => v != null)
  const avgAqi = aqis.length ? Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length) : null
  const highCount = saved.filter((n) => (n.aqi ?? 0) > 200).length

  return (
    <div className="px-6 py-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ink">Watchlist &amp; Alerts</h1>
          <p className="mt-1 text-sm text-muted">
            {isLive ? 'Live signals, refreshed just now, for the localities you’ve saved.' : 'Signals from the localities you’ve saved.'}
          </p>
        </div>
        <CityPicker className="shrink-0" />
      </div>

      {!saved.length ? (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-line bg-white p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-500"><Bell size={22} /></span>
          <p className="mt-4 text-base font-semibold text-ink">No watchlist yet</p>
          <p className="mt-1 text-sm text-muted">Save localities from your matches to get live air-quality, rent, and commute signals here.</p>
          <Link to="/results" className="btn-primary mt-5 inline-flex">Browse matches</Link>
        </div>
      ) : (
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

          <h3 className="mt-6 text-sm font-semibold text-ink">Signals from your saved localities</h3>
          <div className="mt-3 flex flex-col gap-3">
            {saved.map((n) => {
              const [desc, sev, color] = aqiSignal(n.aqi)
              return (
                <Link key={n.id} to={`/neighborhood/${n.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-brand-200">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
                    <Wind size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{n.name}</p>
                    <p className="text-xs text-muted">{desc}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                      <span className="flex items-center gap-1"><HomeIcon size={11} /> {n.rentDisplay}/mo</span>
                      <span className="flex items-center gap-1"><Car size={11} /> {n.commuteMin} min commute</span>
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${sevColor[sev]}`}>{sev}</span>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              )
            })}
          </div>
        </>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <Info size={13} /> {isLive
          ? 'Air-quality, rent and commute are refreshed live from Google when this page loads. Open a locality for its 24-hour air-quality trend.'
          : 'Showing the values saved with each locality. Open a locality for its live 24-hour air-quality trend.'}
      </p>
    </div>
  )
}
