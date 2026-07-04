import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCity, detectCity } from '../lib/cityStore.jsx'
import {
  House,
  Sparkles,
  ArrowRight,
  CircleCheck,
  ShieldCheck,
  PiggyBank,
  TrainFront,
  Coffee,
  TrendingUp,
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
} from 'lucide-react'

/* ----------------------------- Top navigation ---------------------------- */
function MarketingNav() {
  const navigate = useNavigate()
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <House size={20} strokeWidth={2.4} />
          </span>
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
    <div className={`absolute rounded-2xl bg-white px-4 py-2.5 shadow-float ${className}`}>
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold text-ink">{name}</p>
        <div className="text-right">
          <p className="font-serif text-xl leading-none text-brand-700">{score}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">FitScore</p>
        </div>
      </div>
    </div>
  )
}

function HeroVisual() {
  return (
    <div className="relative w-full">
      {/* Real skyline asset — save the reference image to /public/hero-skyline.png */}
      <img
        src="/hero-skyline.png"
        alt="New York City neighborhoods"
        className="w-full select-none"
        draggable={false}
      />

      {/* live floating FitScore cards overlaid on the skyline */}
      <FitPin name="Hudson Yards" score={78} className="left-[3%] top-[42%]" />
      <FitPin name="Astoria, Queens" score={86} className="right-[4%] top-[36%]" />
      <FitPin name="Park Slope" score={82} className="right-[7%] top-[60%]" />
      <FitPin name="Jersey City" score={74} className="left-[2%] top-[64%]" />

      <div className="absolute left-[34%] top-[48%] rounded-2xl bg-white px-4 py-3 shadow-float">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <MapPin size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Your perfect place</p>
            <p className="text-xs text-muted">is out there</p>
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
  const [q, setQ] = useState('')
  const go = () => {
    const match = detectCity(q, cities)
    if (match) setCity(match.id)
    navigate('/results', { state: { query: q } })
  }
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
          choose the perfect place to live—backed by data, powered by AI.
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
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && go()}
                className="w-full text-sm text-ink outline-none placeholder:text-muted"
                placeholder="Describe what you're looking for in a neighborhood..."
              />
              <p className="mt-0.5 text-xs text-muted">
                Example: "Safe area, under $2000 rent, short commute to Midtown"
              </p>
            </div>
            <button onClick={go} className="btn-primary shrink-0">
              Get Started
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <ShieldCheck size={16} className="text-brand-500" />
          No sign up required to try · Your data stays private
        </p>
      </div>

      {/* full-bleed skyline pinned to the right edge (below text on mobile) */}
      <div className="mt-8 lg:absolute lg:right-0 lg:top-1/2 lg:mt-0 lg:w-[50%] lg:-translate-y-1/2">
        <HeroVisual />
      </div>
      </div>
    </section>
  )
}

/* ------------------------------ Feature band ------------------------------ */
const FEATURES = [
  { icon: PiggyBank, tint: 'bg-[#E8F6EF] text-aff', title: 'Affordability', sub: 'Rent trends & forecasts' },
  { icon: ShieldCheck, tint: 'bg-brand-50 text-brand-600', title: 'Safety', sub: 'Crime & collision analysis' },
  { icon: TrainFront, tint: 'bg-[#E7F6EE] text-aff', title: 'Commute', sub: 'Travel time to anywhere' },
  { icon: Coffee, tint: 'bg-[#FCEBF2] text-life', title: 'Lifestyle', sub: 'Amenities & vibe match' },
  { icon: TrendingUp, tint: 'bg-[#FDF0DF] text-trend', title: 'Trend', sub: 'Up-and-coming areas' },
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
  { icon: Search, title: 'Tell us what matters', desc: 'Describe your ideal home in plain words — clean air, budget, short commute, safety.' },
  { icon: Cpu, title: 'AI agents analyze live data', desc: 'Specialist agents score every locality on air quality, affordability, commute, lifestyle and safety from live Google + BigQuery data.' },
  { icon: ListChecks, title: 'Get ranked, explainable matches', desc: 'A weighted FitScore ranks localities for you — every number cited, every match explained.' },
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
  { icon: Building2, tint: 'bg-[#FCEBF2] text-life', title: 'Google Places', desc: 'Amenity density — restaurants, gyms, parks, schools and shops nearby.' },
  { icon: Navigation, tint: 'bg-[#EAF1FD] text-commute', title: 'Google Maps Distance Matrix', desc: "Real drive time with traffic to each city's main work hub." },
  { icon: Database, tint: 'bg-brand-50 text-brand-600', title: 'BigQuery + BQML', desc: 'A self-building dataset with ARIMA_PLUS air-quality forecasts.' },
  { icon: Sparkles, tint: 'bg-[#FDF0DF] text-trend', title: 'Gemini on Vertex AI', desc: 'Understands your request, writes the SQL, and explains every match.' },
]

function DataSources() {
  return (
    <section id="data" className="scroll-mt-24 py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <h2 className="text-center font-serif text-2xl text-ink md:text-3xl">Trusted data, cited sources</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">Every score is grounded in live, verifiable data — no black boxes.</p>
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
          Choosing where to live is one of life's biggest decisions — yet most people make it on gut feel and a
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
