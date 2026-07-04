import { useState } from 'react'
import { Sparkles, Send, Utensils, ShieldCheck, Home, Train, TreePine, ShoppingCart, DollarSign, Building2, CalendarDays, TrendingUp, MessageSquare, Trash2, Database } from 'lucide-react'
import { apiAsk } from '../lib/api.js'
import { useCity } from '../lib/cityStore.jsx'

const CHIPS = ['Which locality has the cleanest air?', 'Cheapest safe area', 'Shortest commute to the hub', 'Best overall FitScore', 'Where is rent lowest?', 'Most amenities nearby']

const POPULAR = [
  ['Which locality has the best air quality?', 'Find the lowest-AQI areas with cleaner air to breathe.', TreePine, '#3FB984'],
  ['Where is rent most affordable?', 'See localities with the lowest median rent for your budget.', DollarSign, '#7C5CF6'],
  ['Which area has the shortest commute?', 'Compare driving time to the city work hub across localities.', Train, '#4F86F7'],
  ['What is the safest locality here?', 'See the safety index across localities in this city.', ShieldCheck, '#F5A63B'],
  ['Which locality has the most amenities?', 'Restaurants, gyms, parks and shops within 1.5 km.', ShoppingCart, '#EC6FA6'],
  ['Give me the best overall pick', 'The top FitScore balancing air, rent, commute and amenities.', TrendingUp, '#2FB6A8'],
]

const SUGGESTIONS = [
  ['Is the air safe to go out today?', 'Get an AQI-based health read for this area.', TreePine],
  ['Which localities are similar on air + rent?', 'Compare AQI, rent and commute side by side.', Building2],
  ['Best area for a family on a budget?', 'Balance air quality, safety, rent and amenities.', Home],
  ['Rank localities by air quality', 'Cleanest-air areas first.', TrendingUp],
]

const RECENT = [
  ['Which locality has the cleanest air right now?', 'Air Quality', '2 hours ago'],
  ['Cheapest locality under my budget', 'Affordability', 'Yesterday'],
  ['Shortest commute to the city hub', 'Commute', '2 days ago'],
  ['Compare air quality across localities', 'Air Quality', '3 days ago'],
]

const STEPS = [
  ['You ask a question', 'Type anything you want to know about your neighborhood.'],
  ['NestIQ analyzes data', 'Our AI scans trusted sources, real-time data, and local insights.'],
  ['You get smart answers', 'Clear, accurate, and personalized answers in seconds.'],
]

export default function AskNestIQ() {
  const { city, cities } = useCity()
  const cityName = cities.find((c) => c.id === city)?.name || 'your city'
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(text) {
    const question = (text ?? q).trim()
    if (!question) return
    setQ(question)
    setLoading(true)
    setAnswer(null)
    const res = await apiAsk(question, null, city)
    setLoading(false)
    setAnswer(res || { answer: "I couldn't reach the assistant just now. Please try again.", sources: [] })
  }

  return (
    <div className="px-6 py-6 lg:px-8">
      <h1 className="font-serif text-3xl text-ink">Ask NestIQ</h1>
      <p className="mt-1 text-sm text-muted">Your AI neighborhood assistant. Ask anything about {cityName}.</p>

      {/* ask box */}
      <div className="mt-5 rounded-2xl border-2 border-brand-200 bg-white p-3 shadow-card">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="ml-1 shrink-0 text-brand-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="min-w-0 flex-1 text-sm outline-none placeholder:text-muted"
            placeholder="Ask anything about your neighborhood..."
          />
          <button onClick={() => submit()} className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white hover:bg-brand-700"><Send size={16} /></button>
        </div>
      </div>

      {(loading || answer) && (
        <div className="mt-4 rounded-2xl border border-line bg-white p-5 shadow-card">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Sparkles size={16} className="animate-pulse text-brand-500" /> NestIQ is thinking…
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">{answer.answer}</p>
              {answer.sql && (
                <div className="mt-3 rounded-xl border border-line bg-band/40 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                    <Database size={13} /> Answered by a live BigQuery query
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-[#1B1B2F] p-3 text-[11px] leading-relaxed text-[#D6CCFB]">
                    <code>{answer.sql}</code>
                  </pre>
                  {answer.rows?.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr>
                            {Object.keys(answer.rows[0]).map((k) => (
                              <th key={k} className="border-b border-line px-2 py-1 font-medium text-muted">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {answer.rows.map((r, i) => (
                            <tr key={i}>
                              {Object.values(r).map((v, j) => (
                                <td key={j} className="border-b border-line/60 px-2 py-1 text-ink-soft">{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {answer.sources?.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  Sources:
                  {answer.sources.map((s) => <span key={s} className="chip">{s}</span>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Try asking about:</span>
        {CHIPS.map((c) => (
          <button key={c} onClick={() => submit(c)} className="chip hover:border-brand-300 hover:text-brand-700">{c}</button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* popular questions */}
        <div>
          <h3 className="text-sm font-semibold text-ink">Popular Questions</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {POPULAR.map(([q, d, Icon, color]) => (
              <button key={q} onClick={() => submit(q)} className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-left transition hover:border-brand-200">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
                  <Icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{q}</p>
                  <p className="mt-0.5 text-xs text-muted">{d}</p>
                </div>
              </button>
            ))}
          </div>

          <h3 className="mt-6 flex items-center justify-between text-sm font-semibold text-ink">
            Recent Conversations <button className="text-xs font-medium text-brand-700">View all →</button>
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            {RECENT.map(([q, cat, time]) => (
              <div key={q} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><MessageSquare size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{q}</p>
                  <p className="text-[11px] text-muted">{cat}</p>
                </div>
                <span className="hidden shrink-0 text-xs text-muted sm:block">{time}</span>
                <button className="shrink-0 text-muted hover:text-[#E5484D]"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* right column */}
        <div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">NestIQ Suggestions</h3>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">Personalized for you</span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {SUGGESTIONS.map(([q, d, Icon]) => (
                <button key={q} onClick={() => submit(q)} className="flex items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand-200">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon size={15} /></span>
                  <div>
                    <p className="text-sm font-medium text-ink">{q}</p>
                    <p className="text-xs text-muted">{d}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card mt-5 p-5">
            <h3 className="text-sm font-semibold text-ink">How NestIQ works</h3>
            <ol className="mt-3 space-y-4">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{t}</p>
                    <p className="text-xs text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
