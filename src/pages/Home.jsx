import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCity, detectCity } from '../lib/cityStore.jsx'
import { useAuth } from '../lib/auth.jsx'
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
          <a className="nav-link" href="#how">How it Works</a>
          <a className="nav-link" href="#features">Features</a>
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
function FitPin({ name, score, className }) {
  return (
    <div className={`absolute rounded-xl bg-white/90 backdrop-blur-sm px-4 py-2.5 shadow-float ${className}`}>
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold text-ink">{name}</p>
        <div className="text-right">
          <p className="font-serif text-sm leading-none text-brand-700">{score}</p>
          <p className="text-[8px] font-medium uppercase tracking-wide text-muted">FitScore</p>
        </div>
      </div>
    </div>
  )
}

function HeroVisual() {
  return (
    <div className="relative w-full">
      {/* Real skyline asset saved to /public/hero-skyline.png */}
      <img
        src="/hero-skyline.png"
        alt="Indian city neighborhoods"
        className="w-full select-none"
        draggable={false}
      />

      {/* live floating FitScore cards overlaid on the skyline */}
      <FitPin name="Cyber City" score={82} className="left-[calc(3%+1.6cm)] top-[42%]" />
      <FitPin name="Koramangala" score={86} className="right-[calc(4%+0.5cm)] top-[36%]" />
      <FitPin name="HITEC City" score={80} className="right-[calc(7%+0.5cm)] top-[60%]" />
      <FitPin name="Indirapuram" score={74} className="left-[calc(2%+1.6cm)] top-[64%]" />

      <div className="absolute left-[calc(34%+1.2cm)] top-[48%] rounded-xl bg-white/90 backdrop-blur-sm px-4 py-3 shadow-float">
        <div className="flex items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-50 text-brand-600">
            <MapPin size={12} />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-ink">Your perfect place</p>
            <p className="text-[9px] text-muted">is out there</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- Hero ---------------------------------- */
function Hero() {
  const navigate = useNavigate()
  const { setCity, cities } = useCity()
  const { user, signInAsGuest } = useAuth()
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [gateOpen, setGateOpen] = useState(false)

  const go = () => {
    const query = q.trim()
    if (!query) {
      setErr('Please describe what you are looking for first.')
      return
    }
    setErr('')
    const match = detectCity(query, cities)
    if (match) setCity(match.id)
    // Already signed in (or guest): go straight to results. Otherwise ask.
    if (user) navigate('/results', { state: { query } })
    else setGateOpen(true)
  }

  const proceedAsGuest = () => {
    signInAsGuest()
    setGateOpen(false)
    navigate('/results', { state: { query: q.trim() } })
  }
  const proceedToSignIn = () => navigate('/signin', { state: { resumeQuery: q.trim() } })

  const checks = ['Personalized for you', 'Cited & explainable', 'Trusted public data']
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-6 py-12 md:px-10 lg:py-20">
      <div className="ml-[0.5cm] lg:max-w-[480px] 2xl:max-w-[620px]">
        <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-ink md:text-5xl lg:max-w-[440px]">
          Find the right neighborhood.
          <br />
          <span className="text-brand-500">For your life.</span>
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
          NestIQ analyzes rent, safety, commute, amenities, and real community insights to help you
          choose the perfect place to live, backed by data and powered by AI.
        </p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {checks.map((c) => (
            <span key={c} className="flex items-center gap-2 text-sm font-medium text-ink-soft">
              <CircleCheck size={18} className="text-brand-500" />
              {c}
            </span>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-white p-3 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  if (err) setErr('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && go()}
                className="w-full text-sm text-ink outline-none placeholder:text-muted"
                placeholder="Describe your ideal neighborhood..."
              />
              <p className="mt-0.5 text-xs text-muted">
                Example: "Clean air, under ₹25,000 rent, short commute to Cyber City"
              </p>
            </div>
            <button onClick={go} className="btn-primary shrink-0">
              Get Started
              <ArrowRight size={16} />
            </button>
          </div>
          {err && <p className="mt-2 px-1 text-xs font-medium text-[#E5484D]">{err}</p>}
        </div>

        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <ShieldCheck size={16} className="text-brand-500" />
          No sign up required to try · Your data stays private
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
            <p className="mt-3 truncate rounded-lg bg-band px-3 py-2 text-xs text-ink-soft" title={q}>
              "{q.trim()}"
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

/* ------------------------------ Feature band ------------------------------ */
const FEATURES = [
  { icon: PiggyBank, tint: 'bg-[#E8F6EF] text-aff', title: 'Affordability', sub: 'Rent vs. your budget' },
  { icon: ShieldCheck, tint: 'bg-brand-50 text-brand-600', title: 'Safety', sub: 'Locality safety profile' },
  { icon: TrainFront, tint: 'bg-[#E7F6EE] text-aff', title: 'Commute', sub: 'Live drive time to the hub' },
  { icon: Coffee, tint: 'bg-[#FCEBF2] text-life', title: 'Lifestyle', sub: 'Amenities within 1.5 km' },
  { icon: Wind, tint: 'bg-[#FDF0DF] text-trend', title: 'Air Quality', sub: 'Live AQI & forecast' },
]

function FeatureBand() {
  return (
    <section id="features" className="scroll-mt-24 bg-band py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <h2 className="text-center font-serif text-2xl text-ink md:text-3xl">
          All the insights you need. In one intelligent place.
        </h2>
        <div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col items-center text-center">
              <span className={`grid h-16 w-16 place-items-center rounded-full ${f.tint}`}>
                <f.icon size={26} />
              </span>
              <p className="mt-4 text-base font-semibold text-ink">{f.title}</p>
              <p className="mt-1 text-sm text-muted">{f.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ How it works ----------------------------- */
const STEPS = [
  { icon: Search, title: 'Tell us what matters', desc: 'Describe your ideal home in plain words: clean air, budget, short commute, safety.' },
  { icon: Cpu, title: 'AI agents analyze live data', desc: 'Specialist agents score every locality on air quality, affordability, commute, lifestyle and safety from live Google + BigQuery data.' },
  { icon: ListChecks, title: 'Get ranked, explainable matches', desc: 'A weighted FitScore ranks localities for you, with every number cited and every match explained.' },
]

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <h2 className="text-center font-serif text-2xl text-ink md:text-3xl">How it works</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">From a plain-English wish to a data-backed decision in seconds.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border border-line bg-white p-6 shadow-card">
              <span className="absolute right-5 top-4 font-serif text-3xl text-brand-100">{i + 1}</span>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600"><s.icon size={22} /></span>
              <p className="mt-4 text-base font-semibold text-ink">{s.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
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
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">Every score is grounded in live, verifiable data, with no black boxes.</p>
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
  ['9', 'Indian cities covered'],
  ['5', 'live signals per locality'],
  ['100%', 'cited & explainable scores'],
]

function About() {
  return (
    <section id="about" className="scroll-mt-24 bg-band py-16">
      <div className="mx-auto max-w-[1000px] px-6 text-center md:px-10">
        <h2 className="font-serif text-2xl text-ink md:text-3xl">About NestIQ</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Choosing where to live is one of life's biggest decisions, yet most people make it on gut feel and a
          few listings. NestIQ turns rent, air quality, safety, commute, and amenities into one clear, explainable
          FitScore, so you can decide with data. Built air-quality-first, covering metros down to Tier-2 cities like
          Patna and Ranchi.
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

function Footer() {
  return (
    <footer className="border-t border-line bg-band">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-center gap-2 px-6 py-6 text-sm text-muted md:flex-row md:gap-6">
        <span className="flex items-center gap-2">
          <Heart size={15} className="text-life" />
          Built for better living and smarter communities
        </span>
        <span className="hidden h-4 w-px bg-line md:block" />
        <span>Powered by Google Cloud &amp; Gemini</span>
      </div>
    </footer>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen scroll-smooth overflow-x-hidden bg-white">
      <MarketingNav />
      <Hero />
      <HowItWorks />
      <FeatureBand />
      <DataSources />
      <About />
      <Footer />
    </div>
  )
}
