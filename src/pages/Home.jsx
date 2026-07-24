import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCity, detectCity } from '../lib/cityStore.jsx'
import { useAuth } from '../lib/auth.jsx'
import { apiNeighborhoods } from '../lib/api.js'
import { adaptList } from '../lib/adapt.js'
import { FAMILY_HEALTH, PRESETS, resultsSearch } from '../lib/presets.js'
import { LogoMark } from '../components/ui/Logo.jsx'
import {
  House,
  Sparkles,
  ArrowRight,
  CircleCheck,
  ShieldCheck,
  PiggyBank,
  TrainFront,
  Coffee,
  Heart,
  User,
  MapPin,
  Search,
  Wind,
  Database,
  Building2,
  Navigation,
  Cpu,
  ListChecks,
  LogIn,
  X,
  TriangleAlert,
} from 'lucide-react'

/* ----------------------------- Top navigation ---------------------------- */
function MarketingNav() {
  const navigate = useNavigate()
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <span className="font-serif text-2xl tracking-tight text-ink">NestIQ</span>
          <span className="hidden h-5 w-px bg-line md:block" />
          <span className="hidden text-sm text-muted md:block">
            AI-Powered Decision Intelligence Platform
          </span>
        </div>

        <nav className="hidden items-center gap-8 lg:flex">
          <a className="nav-link" href="#why">Why NestIQ</a>
          <a className="nav-link" href="#how">How it Works</a>
          <a className="nav-link" href="#proof">Proof</a>
          <a className="nav-link" href="#data">Data Sources</a>
          <a className="nav-link" href="#about">About</a>
        </nav>

        <button
          onClick={() => navigate('/signin')}
          className="flex items-center gap-2 rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          <User size={16} />
          Sign In
        </button>
      </div>
    </header>
  )
}

/* ------------------------------- Hero visual ------------------------------ */
// Illustrative fallback so the hero pins never render empty if the API is cold.
// Replaced by real top matches the moment live data loads.
const SAMPLE_PINS = [
  { name: 'Bandra West, Mumbai', fitScore: 84, match: 'Excellent Match', tags: ['Safe', 'Lively', 'Well Connected'], subscores: { air_quality: 70, affordability: 52, commute: 80 }, anomalies: [] },
  { name: 'Koramangala, Bengaluru', fitScore: 82, match: 'Excellent Match', tags: ['Trendy', 'Great Food', 'Young Crowd'], subscores: { air_quality: 78, affordability: 64, commute: 74 }, anomalies: [{ label: 'Standout safety', kind: 'good' }] },
  { name: 'Indiranagar, Bengaluru', fitScore: 80, match: 'Good Match', tags: ['Nightlife', 'Cafés', 'Metro Access'], subscores: { air_quality: 74, affordability: 60, commute: 72 }, anomalies: [] },
  { name: 'Powai, Mumbai', fitScore: 78, match: 'Good Match', tags: ['Green', 'Peaceful', 'Family Friendly'], subscores: { air_quality: 80, affordability: 58, commute: 66 }, anomalies: [] },
  { name: 'Viman Nagar, Pune', fitScore: 76, match: 'Good Match', tags: ['Airport Nearby', 'Modern', 'Calm'], subscores: { air_quality: 66, affordability: 70, commute: 70 }, anomalies: [{ label: 'Unusually affordable', kind: 'good' }] },
]

// Fixed positions spread across the skyline (upper, mid, lower on both sides),
// all kept clear of the left text column and the CTA. Order matches the pin
// array; a sixth "your perfect place" marker sits in the centre.
const PIN_POS = [
  'left-[2%] top-[28%]', // upper-left
  'left-[56%] top-[14%]', // upper-right
  'left-[66%] top-[42%]', // mid far-right
  'left-[12%] top-[75%]', // lower-left
  'left-[56%] top-[72%]', // lower-right
]

// A FitScore card that opens on hover: name + score + a short tag line always
// visible (like the reference), with the pillar breakdown, anomaly flag and
// live caption revealed on hover. Driven by the same live API the app runs on.
function HoverPin({ d, live, className }) {
  const flag = d.anomalies?.[0]
  const tagLine = (d.tags || []).slice(0, 3).join(' · ') || d.match
  const bars = [
    ['Air Quality', d.subscores.air_quality, '#F5A63B'],
    ['Affordability', d.subscores.affordability, '#3FB984'],
    ['Commute', d.subscores.commute, '#4F86F7'],
  ]
  return (
    <div className={`group absolute z-10 hover:z-30 ${className}`}>
      <div className="w-[232px] cursor-default rounded-xl border border-line bg-white/95 px-3.5 py-2.5 shadow-float backdrop-blur-sm">
        {/* header row: name + score, then a full-width tag line below */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{d.name || d.short}</p>
          <div className="shrink-0 text-right">
            <p className="font-serif text-lg leading-none text-brand-700">{d.fitScore}</p>
            <p className="text-[8px] font-medium uppercase tracking-wide text-muted">FitScore</p>
          </div>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">
          <ShieldCheck size={11} className="shrink-0 text-aff" />
          <span className="truncate">{tagLine}</span>
        </p>
        {/* pillar detail, revealed on hover */}
        <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-200 group-hover:mt-2.5 group-hover:grid-rows-[1fr] group-hover:opacity-100">
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-1.5 border-t border-line pt-2.5">
              {bars.map(([label, val, color]) => (
                <div key={label} className="flex items-center gap-2 text-[10px]">
                  <span className="w-[68px] shrink-0 text-ink-soft">{label}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-line">
                    <div className="h-1.5 rounded-full" style={{ width: `${val}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
            {flag && (
              <span
                className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  flag.kind === 'good' ? 'bg-[#EAF7F0] text-aff' : 'bg-[#FDECEC] text-red-600'
                }`}
              >
                <TriangleAlert size={10} /> {flag.label}
              </span>
            )}
            <p className="mt-2.5 text-[9px] text-muted">{live ? 'Live from Google + BigQuery ML' : 'Sample match preview'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroVisual() {
  const { city } = useCity()
  const [list, setList] = useState(null)

  useEffect(() => {
    let alive = true
    apiNeighborhoods(city).then((res) => {
      if (alive && res?.length) setList(adaptList([...res].sort((a, b) => b.fitScore - a.fitScore)).slice(0, 5))
    })
    return () => {
      alive = false
    }
  }, [city])

  const live = !!list
  const pins = (list || SAMPLE_PINS).slice(0, 5)
  return (
    <div className="relative w-full">
      {/* Optimized skyline hero: responsive WebP with a PNG fallback. The source
          PNG was 3 MB — the landing page's largest asset — so served WebP is
          ~10-29x smaller. fetchPriority + fixed dimensions keep LCP fast and CLS at 0. */}
      <picture>
        <source
          type="image/webp"
          srcSet="/hero-skyline-mobile.webp 768w, /hero-skyline.webp 1536w"
          sizes="(max-width: 768px) 100vw, 700px"
        />
        <img
          src="/hero-skyline.png"
          alt="Indian city neighborhoods"
          className="w-full select-none"
          width={1536}
          height={1024}
          fetchPriority="high"
          decoding="async"
          draggable={false}
        />
      </picture>

      {/* live FitScore cards spread across the skyline: hover any to open it */}
      {pins.map((d, i) => (
        <HoverPin key={d.id || d.name} d={d} live={live} className={PIN_POS[i]} />
      ))}

      {/* central "your perfect place" marker (decorative) */}
      <div className="absolute left-[34%] top-[54%] flex items-center gap-2 rounded-xl bg-white/95 px-4 py-3 shadow-float backdrop-blur-sm">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-50 text-brand-600">
          <MapPin size={12} />
        </span>
        <div>
          <p className="text-[11px] font-semibold text-ink">Your perfect place</p>
          <p className="text-[9px] text-muted">is out there</p>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- Hero ---------------------------------- */
// One-tap example queries. Clicking a chip prefills the search box so a new
// visitor can try the app without thinking of a query.
const EXAMPLES = [
  { label: 'Clean air, under ₹25k', q: 'Clean air, safe area under ₹25,000, short commute' },
  { label: 'Quick commute + nightlife', q: 'Quick commute to the city hub with good nightlife and cafes' },
  { label: 'Family-friendly & green', q: 'Family-friendly, green, safe area under ₹30,000' },
]

function Hero() {
  const navigate = useNavigate()
  const { city, setCity, cities } = useCity()
  const { user, signInAsGuest } = useAuth()
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const [err, setErr] = useState('')
  const [gateOpen, setGateOpen] = useState(false)
  const [pendingSearch, setPendingSearch] = useState(null)
  const [activePreset, setActivePreset] = useState(null)

  const beginSearch = (rawQuery, preset = null) => {
    const query = rawQuery.trim()
    if (!query) {
      setErr('Please describe what you are looking for first.')
      return
    }
    setErr('')
    const match = detectCity(query, cities)
    const targetCity = match?.id || city
    if (match) setCity(targetCity)
    const target = `/results${resultsSearch(query, preset, targetCity)}`
    // Already signed in (or guest): go straight to results. Otherwise ask.
    if (user) navigate(target)
    else {
      setPendingSearch({ query, preset, city: targetCity, target })
      setGateOpen(true)
    }
  }

  const go = () => beginSearch(q, activePreset)

  const launchFamilyHealth = () => {
    const query = PRESETS[FAMILY_HEALTH].query
    setQ(query)
    setActivePreset(FAMILY_HEALTH)
    setErr('')
    inputRef.current?.focus()
  }

  const proceedAsGuest = () => {
    signInAsGuest()
    setGateOpen(false)
    navigate(pendingSearch?.target || `/results${resultsSearch(q.trim(), null, city)}`)
  }
  const proceedToSignIn = () =>
    navigate('/signin', {
      state: {
        resumeTo: pendingSearch?.target,
        resumeQuery: pendingSearch?.query || q.trim(),
      },
    })

  const checks = ['Adapts to your priorities', 'Cited & explainable', 'Trusted public data']
  return (
    <section id="home-search" className="relative scroll-mt-24">
      <div className="mx-auto max-w-[1400px] px-6 py-12 md:px-10 lg:py-20">
      <div className="relative z-10 ml-[0.5cm] lg:max-w-[480px] 2xl:max-w-[620px]">
        <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-ink md:text-5xl lg:max-w-[440px]">
          Find a neighborhood that fits your life—
          <br />
          <span className="text-brand-500">not just your budget.</span>
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
          NestIQ brings affordability, air quality, commute, safety, essential services, and
          community evidence into one personalized and explainable neighborhood decision.
        </p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {checks.map((c) => (
            <span key={c} className="flex items-center gap-2 text-sm font-medium text-ink-soft">
              <CircleCheck size={18} className="text-brand-500" />
              {c}
            </span>
          ))}
        </div>

        <div
          onClick={() => inputRef.current?.focus()}
          className="mt-8 cursor-text rounded-2xl border-2 border-brand-300 bg-white p-3 shadow-card transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Sparkles size={18} />
            </span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                if (err) setErr('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              className="min-w-0 flex-1 text-sm text-ink outline-none placeholder:text-muted"
              placeholder="Describe your ideal neighborhood..."
            />
            <button onClick={go} className="btn-primary shrink-0">
              Get Started
              <ArrowRight size={16} />
            </button>
          </div>
          {err && <p className="mt-2 px-1 text-xs font-medium text-[#E5484D]">{err}</p>}
          {q && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs">
              {activePreset === FAMILY_HEALTH ? (
                <span className="flex items-center gap-1.5 font-semibold text-brand-700">
                  <CircleCheck size={14} /> Family Health Mode selected
                  <span className="font-normal text-muted">· Prioritizes air quality and safety</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-ink-soft">
                  <Sparkles size={14} className="text-brand-600" /> Search query ready
                </span>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setQ('')
                  setActivePreset(null)
                  setErr('')
                  inputRef.current?.focus()
                }}
                className="-m-2 p-2 font-semibold text-brand-700 transition hover:text-brand-600 hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* one-tap example chips: prefill the search box */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => {
                setQ(ex.q)
                setActivePreset(null)
                setErr('')
                inputRef.current?.focus()
              }}
              className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition hover:border-brand-400 hover:bg-brand-100"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={launchFamilyHealth}
          aria-pressed={activePreset === FAMILY_HEALTH}
          className={`mt-5 w-full rounded-2xl border bg-gradient-to-r p-4 text-left shadow-card transition hover:border-brand-400 hover:shadow-float ${
            activePreset === FAMILY_HEALTH
              ? 'border-brand-500 from-brand-100 to-brand-50 ring-2 ring-brand-100'
              : 'border-brand-200 from-brand-50 to-white'
          }`}
        >
          <span className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
              <Heart size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">Try {PRESETS[FAMILY_HEALTH].label} Mode</span>
                {activePreset === FAMILY_HEALTH ? (
                  <CircleCheck size={17} className="shrink-0 text-brand-600" />
                ) : (
                  <Sparkles size={17} className="shrink-0 text-brand-600" />
                )}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                Prefill a health-sensitive family search, then review or edit it before continuing.
              </span>
            </span>
          </span>
        </button>

        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <ShieldCheck size={16} className="text-brand-500" />
          No server-side account required · Saved profile and shortlist stay in this browser
        </p>
      </div>

      {/* full-bleed skyline pinned to the right edge (below text on mobile) */}
      <div className="mt-8 lg:absolute lg:right-[-2.6cm] lg:top-1/2 lg:mt-0 lg:w-[66%] lg:-translate-y-1/2 lg:scale-[0.9]">
        <HeroVisual />
      </div>
      </div>

      {gateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4 backdrop-blur-sm" onClick={() => setGateOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-center shadow-float" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setGateOpen(false)} className="ml-auto flex text-muted hover:text-ink" aria-label="Close">
              <X size={18} />
            </button>
            <span className="mx-auto block w-fit"><LogoMark size={40} radius={12} /></span>
            <h3 className="mt-3 font-serif text-xl text-ink">Almost there</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              Sign in to save your searches and get personalized matches, or keep going as a guest.
            </p>
            <p className="mt-3 line-clamp-2 rounded-lg bg-band px-3 py-2 text-xs text-ink-soft" title={pendingSearch?.query || q}>
              "{pendingSearch?.query || q.trim()}"
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button onClick={proceedToSignIn} className="btn-primary w-full justify-center">
                <LogIn size={16} /> Sign in
              </button>
              <button
                onClick={proceedAsGuest}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium text-ink-soft transition hover:border-brand-300 hover:text-brand-700"
              >
                <User size={16} /> Continue as guest
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* --------------------------- Human problem story -------------------------- */
const FAMILY_NEEDS = [
  [Wind, 'Cleaner air evidence'],
  [Building2, 'Hospitals & pharmacies'],
  [Coffee, 'Schools & essentials'],
  [ShieldCheck, 'Safety context'],
  [TrainFront, 'Manageable commute'],
  [PiggyBank, 'Sustainable budget'],
]

function ProblemStory() {
  return (
    <section id="why" className="scroll-mt-24 border-y border-line bg-gradient-to-br from-brand-50/80 via-white to-[#EEF9F4] py-16 lg:py-20">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700">
            <Heart size={14} /> A real housing decision is more than a listing
          </span>
          <h2 className="mt-5 max-w-xl font-serif text-3xl leading-tight text-ink md:text-4xl">
            A family with an asthmatic child should not have to choose a home using rent and photos alone.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">
            The answers normally live across disconnected maps, pollution dashboards, property portals,
            civic notices, and local conversations. NestIQ brings the available evidence together so the
            family can compare trade-offs without mistaking an estimate for a guarantee.
          </p>
          <p className="mt-4 text-sm font-medium text-ink-soft">
            Every household has different non-negotiables. NestIQ adapts the evidence and ranking to yours.
          </p>
          <a href="#home-search" className="btn-primary mt-6 w-fit">
            Try Family Health &amp; Resilience Mode <ArrowRight size={16} />
          </a>
          <p className="mt-3 max-w-lg text-xs leading-5 text-muted">
            NestIQ supports housing research. It does not diagnose conditions or guarantee health outcomes.
          </p>
        </div>

        <div className="rounded-[28px] border border-white bg-white/90 p-5 shadow-float backdrop-blur md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Family priorities</p>
              <p className="mt-1 text-sm text-muted">Six questions that should be considered together</p>
            </div>
            <span className="rounded-full bg-[#EAF7F0] px-3 py-1 text-xs font-semibold text-aff">Health-sensitive preset</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {FAMILY_NEEDS.map(([Icon, label]) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-line bg-band/40 p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm"><Icon size={17} /></span>
                <span className="text-sm font-medium text-ink-soft">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles size={16} className="text-brand-600" /> One explainable decision</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">Priorities are weighted transparently, missing evidence stays missing, and important risks remain visible.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ Product proof ----------------------------- */
function ProductProof() {
  const signals = [
    ['Affordability', '₹24,000 indicative rent', 'Estimated', 'text-aff bg-[#EAF7F0]'],
    ['Air quality', 'AQI 72 · Moderate', 'Live signal', 'text-trend bg-[#FDF0DF]'],
    ['Commute', '28 min to work hub', 'Live signal', 'text-commute bg-[#EAF1FD]'],
    ['Essentials', 'Hospital, pharmacy & school nearby', 'Additive', 'text-brand-700 bg-brand-50'],
  ]
  return (
    <section id="proof" className="scroll-mt-24 py-16 lg:py-20">
      <div className="mx-auto max-w-[1240px] px-6 md:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">See the decision, not another listing</span>
          <h2 className="mt-3 font-serif text-3xl text-ink md:text-4xl">A recommendation with the trade-offs left visible.</h2>
          <p className="mt-3 text-base leading-7 text-muted">This illustrative preview mirrors the real NestIQ result structure. It is labelled demonstration data—not a live claim.</p>
        </div>

        <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-[30px] border border-line bg-white shadow-float">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-gradient-to-r from-brand-50 via-white to-[#EEF9F4] px-6 py-5 md:px-8">
            <div>
              <span className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700">Illustrative NestIQ result</span>
              <h3 className="mt-3 font-serif text-2xl text-ink">Indiranagar, Bengaluru</h3>
              <p className="mt-1 text-sm text-muted">Strong everyday access with an air-quality trade-off to review.</p>
            </div>
            <div className="rounded-2xl border border-brand-100 bg-white px-5 py-3 text-center shadow-card">
              <p className="text-xs font-medium text-muted">FitScore</p>
              <p className="font-serif text-4xl text-brand-700">82<span className="text-base text-muted">/100</span></p>
              <p className="text-xs font-semibold text-aff">Excellent Match</p>
            </div>
          </div>
          <div className="grid gap-6 p-6 md:grid-cols-[1.15fr_0.85fr] md:p-8">
            <div className="space-y-3">
              {signals.map(([label, value, status, tint]) => (
                <div key={label} className="grid gap-2 rounded-2xl border border-line p-4 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
                  <span className="text-sm font-semibold text-ink">{value}</span>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${tint}`}>{status}</span>
                </div>
              ))}
            </div>
            <aside className="rounded-2xl bg-[#17172A] p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-200">Why this match?</p>
              <p className="mt-4 text-lg font-semibold leading-7">Strong commute and essential-service access fit the family’s priorities.</p>
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#FFC76B]"><TriangleAlert size={16} /> Trade-off to verify</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Moderate AQI needs current review for a health-sensitive household. The FitScore does not hide that risk.</p>
              </div>
              <a href="#home-search" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-200 hover:text-white">Find my match <ArrowRight size={15} /></a>
            </aside>
          </div>
        </div>
      </div>
    </section>
  )
}

const COMPARISON_ROWS = [
  ['Rent and listing price', 'Affordability relative to your budget'],
  ['Bedrooms and photos', 'Air quality and clearly labelled health-relevant evidence'],
  ['Generic amenity list', 'Hospitals, pharmacies, schools and lifestyle essentials'],
  ['Distance in kilometres', 'Commute time weighed against your other priorities'],
  ['Popularity signals', 'Personalized priorities and explainable ranking'],
  ['Missing information is easy to overlook', 'Missing evidence is labelled and never silently guessed'],
]

function Comparison() {
  return (
    <section className="bg-band py-16">
      <div className="mx-auto max-w-[1100px] px-6 md:px-10">
        <h2 className="text-center font-serif text-3xl text-ink md:text-4xl">Property search finds homes. NestIQ helps evaluate the life around them.</h2>
        <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-white shadow-card">
          <div className="grid grid-cols-2 border-b border-line bg-white text-sm font-semibold">
            <div className="p-4 text-muted md:px-6">Ordinary property search</div>
            <div className="border-l border-line bg-brand-50/70 p-4 text-brand-700 md:px-6">NestIQ</div>
          </div>
          {COMPARISON_ROWS.map(([ordinary, nestiq]) => (
            <div key={ordinary} className="grid grid-cols-2 border-b border-line/70 text-sm last:border-0">
              <div className="p-4 leading-6 text-muted md:px-6">{ordinary}</div>
              <div className="flex gap-2 border-l border-line bg-brand-50/25 p-4 leading-6 text-ink-soft md:px-6"><CircleCheck size={16} className="mt-1 shrink-0 text-aff" /> {nestiq}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ Feature band ------------------------------ */
const FEATURES = [
  { icon: PiggyBank, tint: 'bg-[#E8F6EF] text-aff', glow: 'from-[#E8F6EF] to-white', title: 'Affordability', sub: 'Rent weighed against your budget', status: 'Budget-aware', detail: 'Indicative rent · city rank' },
  { icon: ShieldCheck, tint: 'bg-brand-50 text-brand-600', glow: 'from-brand-50 to-white', title: 'Safety', sub: 'Clearly labelled locality context', status: 'Evidence labelled', detail: 'Baseline or proxy · never guessed' },
  { icon: TrainFront, tint: 'bg-[#E7F6EE] text-aff', glow: 'from-[#EDF8F3] to-white', title: 'Commute', sub: 'Travel time to your work hub', status: 'Live route', detail: 'Drive time · traffic-aware' },
  { icon: Coffee, tint: 'bg-[#FCEBF2] text-life', glow: 'from-[#FDF0F5] to-white', title: 'Essentials', sub: 'Daily life and essential services nearby', status: 'Additive signal', detail: 'Health · education · lifestyle' },
  { icon: Wind, tint: 'bg-[#FDF0DF] text-trend', glow: 'from-[#FFF4E5] to-white', title: 'Air Quality', sub: 'Current air evidence and health band', status: 'Live health signal', detail: 'CPCB AQI · forecast context' },
]

function FeatureBand() {
  return (
    <section id="features" className="scroll-mt-24 overflow-hidden bg-band py-16 lg:py-20">
      <div className="mx-auto max-w-[1240px] px-6 md:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Five signals. One decision.</span>
        <h2 className="mt-3 font-serif text-3xl text-ink md:text-4xl">
          All the insights you need. In one intelligent place.
        </h2>
          <p className="mt-3 text-base leading-7 text-muted">Every pillar keeps its own evidence label, so a convenient overall score never erases an important limitation.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <article key={f.title} className={`group flex min-h-[250px] flex-col rounded-3xl border border-line bg-gradient-to-b ${f.glow} p-5 shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-float`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl shadow-sm ${f.tint}`}><f.icon size={22} /></span>
                <span className="rounded-full border border-white bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-muted shadow-sm">{f.status}</span>
              </div>
              <p className="mt-5 text-base font-semibold text-ink">{f.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{f.sub}</p>
              <div className="mt-auto border-t border-line/70 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">What you see</p>
                <p className="mt-1.5 text-xs font-medium leading-5 text-ink-soft">{f.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ How it works ----------------------------- */
const STEPS = [
  { icon: Search, stage: 'Your intent', accent: 'bg-brand-600', title: 'Tell NestIQ what matters', desc: 'Describe your priorities in plain language or begin with a transparent preset.', proof: 'Editable priorities' },
  { icon: Database, stage: 'Evidence', accent: 'bg-[#2FA875]', title: 'Collect and label evidence', desc: 'Available locality signals retain their provenance: live, estimated, proxied, verified, or unavailable.', proof: 'Sources stay visible' },
  { icon: Cpu, stage: 'Decision', accent: 'bg-[#4F86F7]', title: 'Rank the trade-offs', desc: 'ADK agents coordinate evidence while deterministic FitScore logic compares localities using your priorities.', proof: 'FitScore stays deterministic' },
  { icon: ListChecks, stage: 'Explanation', accent: 'bg-[#EC6FA6]', title: 'Explain the recommendation', desc: 'See why a locality fits, what the risks are, which sources were used, and what evidence is missing.', proof: 'Risks remain visible' },
]

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 overflow-hidden py-16 lg:py-20">
      <div className="mx-auto max-w-[1240px] px-6 md:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">From intent to evidence</span>
          <h2 className="mt-3 font-serif text-3xl text-ink md:text-4xl">How NestIQ reaches a recommendation</h2>
          <p className="mt-3 text-base leading-7 text-muted">A visible journey from what you care about to a decision you can inspect.</p>
        </div>
        <div className="relative mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="absolute left-[12%] right-[12%] top-8 hidden h-px bg-gradient-to-r from-brand-200 via-[#A9C5FA] to-[#F2B8D2] lg:block" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <article key={s.title} className="group relative flex min-h-[290px] flex-col rounded-3xl border border-line bg-white p-5 shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-float">
              <div className="relative z-10 flex items-center justify-between gap-3">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl text-white shadow-md ${s.accent}`}><s.icon size={23} /></span>
                <span className="font-serif text-4xl text-brand-100">0{i + 1}</span>
              </div>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-600">{s.stage}</p>
              <h3 className="mt-2 text-base font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{s.desc}</p>
              <div className="mt-auto flex items-center gap-2 border-t border-line/70 pt-4 text-xs font-semibold text-ink-soft"><CircleCheck size={14} className="text-aff" /> {s.proof}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------ Responsible AI trust proof ----------------------- */
const EVAL_METRICS = [
  ['18/18', 'evaluation cases passed'],
  ['521', 'automated tests passed'],
  ['100%', 'groundedness in the offline suite'],
  ['0%', 'unsupported claims in the offline suite'],
]

const TRUST_CARDS = [
  [Database, 'Grounded evidence', 'Sources and evidence states stay visible. Estimates and proxies are never presented as verified live facts.'],
  [ShieldCheck, 'Safer decisions', 'The suite checks health-sensitive scoring, contradictions, missing data, tool behavior, citations, and SQL guards.'],
  [TriangleAlert, 'Honest failures', 'When evidence cannot be established, NestIQ reports the limitation instead of manufacturing a confident answer.'],
]

function TrustProof() {
  return (
    <section className="relative overflow-hidden bg-[#17172A] py-16 text-white lg:py-20">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1240px] px-6 md:px-10">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-brand-200"><CircleCheck size={14} /> Evaluation suite passed · 22 July 2026</span>
            <h2 className="mt-5 font-serif text-3xl md:text-4xl">Tested for trust—not just designed for it.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/65">NestIQ is evaluated for grounded evidence, citation quality, decision safety, tool behaviour, and honest handling of missing data.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-brand-100">
            {['Grounded', 'Tested', 'Explainable', 'Sources visible', 'Missing data never guessed'].map((label) => <span key={label} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5">{label}</span>)}
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EVAL_METRICS.map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
              <p className="font-serif text-4xl text-brand-200">{value}</p>
              <p className="mt-2 text-sm leading-5 text-white/65">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {TRUST_CARDS.map(([Icon, title, desc]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/20 text-brand-200"><Icon size={19} /></span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs leading-5 text-white/45">Offline deterministic evaluation: 18 cases, 0 billable calls. Automated-test total reflects the verified build published on 22 July 2026.</p>
        <a
          href="https://github.com/Rex123-hash/NestIQ/tree/main/artifacts/responsible-ai-evaluation"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-200 transition hover:text-white"
        >
          View evaluation methodology <ArrowRight size={15} />
        </a>
      </div>
    </section>
  )
}

/* ------------------------------ Data sources ------------------------------ */
const SOURCES = [
  { icon: Wind, tint: 'bg-[#E8F6EF] text-aff', title: 'Google Air Quality API', desc: 'Live CPCB AQI, dominant pollutants, and 24-hour history per locality.' },
  { icon: Building2, tint: 'bg-[#FCEBF2] text-life', title: 'Google Places', desc: 'Amenity density: restaurants, gyms, parks, schools and shops nearby.' },
  { icon: Navigation, tint: 'bg-[#EAF1FD] text-commute', title: 'Google Maps Distance Matrix', desc: "Real drive time with traffic to each city's main work hub." },
  { icon: Database, tint: 'bg-brand-50 text-brand-600', title: 'BigQuery + BQML', desc: 'A self-building dataset with ARIMA_PLUS air-quality forecasts.' },
  { icon: Sparkles, tint: 'bg-[#FDF0DF] text-trend', title: 'Gemini on Vertex AI', desc: 'Understands your request, writes the SQL, and explains every match.' },
]

function DataSources() {
  return (
    <section id="data" className="scroll-mt-24 py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <h2 className="text-center font-serif text-2xl text-ink md:text-3xl">Trusted data, cited sources</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm leading-6 text-muted">Every signal is sourced, dated, or clearly labelled as live, estimated, proxied, verified, or unavailable.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map((s) => (
            <div key={s.title} className="flex items-start gap-4 rounded-2xl border border-line bg-white p-5">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${s.tint}`}><s.icon size={20} /></span>
              <div>
                <p className="text-sm font-semibold text-ink">{s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------- About --------------------------------- */
const STATS = [
  ['13', 'Indian cities covered'],
  ['73', 'validated localities'],
  ['18/18', 'Responsible AI evaluation cases'],
]

function About() {
  return (
    <section id="about" className="scroll-mt-24 bg-band py-16">
      <div className="mx-auto max-w-[1000px] px-6 text-center md:px-10">
        <h2 className="font-serif text-2xl text-ink md:text-3xl">About NestIQ</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Choosing where to live is one of life's biggest decisions, yet most people make it on gut feel and a
          few listings. NestIQ turns rent, air quality, safety, commute, and amenities into one clear, explainable
          FitScore, so you can decide with data. Built air-quality-first, with validated catalog coverage across
          13 Indian cities and 73 localities.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STATS.map(([n, l]) => (
            <div key={l}>
              <p className="font-serif text-4xl text-brand-700">{n}</p>
              <p className="mt-1 text-sm text-muted">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="px-6 py-16 md:px-10 lg:py-20">
      <div className="mx-auto max-w-[1100px] overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-[#242044] px-6 py-12 text-center text-white shadow-float md:px-12">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-brand-100"><House size={23} /></span>
        <h2 className="mx-auto mt-5 max-w-3xl font-serif text-3xl leading-tight md:text-4xl">Your best neighborhood is not the most popular one. It is the one that fits the life you are building.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/70">Start with your real priorities. NestIQ will show the match, the trade-offs, the sources, and what it still cannot know.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <a href="#home-search" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50">Find my neighborhood <ArrowRight size={16} /></a>
          <a href="#how" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">See how NestIQ works</a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="overflow-hidden border-t border-white/10 bg-[#111122] text-white">
      <div className="mx-auto max-w-[1400px] px-6 py-12 md:px-10">
        <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="max-w-md">
            <div className="flex items-center gap-3">
              <LogoMark size={38} />
              <span className="font-serif text-2xl">NestIQ</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/55">Evidence-backed neighborhood decisions for the life you are actually building—not just another list of properties.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Grounded', 'Explainable', 'Privacy-conscious'].map((label) => <span key={label} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/65">{label}</span>)}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-200">Explore</p>
            <nav className="mt-4 grid gap-3 text-sm text-white/60">
              <a className="transition hover:text-white" href="#why">Why NestIQ</a>
              <a className="transition hover:text-white" href="#how">How it works</a>
              <a className="transition hover:text-white" href="#proof">Evaluation proof</a>
              <a className="transition hover:text-white" href="#data">Data sources</a>
            </nav>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-200">Start a decision</p>
            <p className="mt-4 text-sm leading-6 text-white/55">Tell NestIQ what matters and inspect the evidence behind every recommendation.</p>
            <a href="#home-search" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50">Find my neighborhood <ArrowRight size={15} /></a>
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 NestIQ. Built for better living and smarter communities.</span>
          <span className="flex items-center gap-2"><Heart size={13} className="text-life" /> Powered by Google Cloud &amp; Gemini</span>
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen scroll-smooth overflow-x-hidden bg-white">
      <MarketingNav />
      <Hero />
      <ProblemStory />
      <ProductProof />
      <Comparison />
      <HowItWorks />
      <FeatureBand />
      <TrustProof />
      <DataSources />
      <About />
      <FinalCTA />
      <Footer />
    </div>
  )
}
