import { NavLink, useNavigate } from 'react-router-dom'
import {
  Search,
  Star,
  ArrowLeftRight,
  Bookmark,
  Bell,
  Sparkles,
  MapPin,
  Sun,
  ChevronDown,
  House,
} from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { useCity } from '../../lib/cityStore.jsx'

const NAV = [
  { to: '/results', label: 'Search', icon: Search, end: false, match: '/results' },
  { to: '/results', label: 'Results', icon: Star },
  { to: '/compare', label: 'Compare', icon: ArrowLeftRight },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/ask', label: 'Ask NestIQ', icon: Sparkles },
]

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2 px-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
        <House size={20} strokeWidth={2.4} />
      </span>
      <span className="font-serif text-2xl font-600 tracking-tight text-ink">NestIQ</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { city, setCity, cities } = useCity()
  const navigate = useNavigate()
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-white px-4 py-6 lg:flex">
      <Logo />

      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((item, i) => (
          <NavLink
            key={i}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-soft hover:bg-brand-50/60 hover:text-brand-700',
              )
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Renew or Move promo */}
      <div className="mt-8 rounded-2xl bg-brand-50 p-4">
        <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-white">
          <House size={18} className="text-brand-600" />
        </div>
        <p className="text-sm font-semibold text-ink">Renew or Move?</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          See how your current area compares to alternatives.
        </p>
        <button
          onClick={() => navigate('/compare')}
          className="mt-3 w-full rounded-lg border border-brand-200 bg-white py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          Check Now
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <div className="relative">
          <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-600" />
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-xl border border-line bg-white py-2.5 pl-9 pr-8 text-sm text-ink-soft outline-none focus:border-brand-300"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>
        <button className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm text-ink-soft">
          <span className="flex items-center gap-2">
            <Sun size={16} className="text-trend" />
            Light
          </span>
          <ChevronDown size={16} className="text-muted" />
        </button>
      </div>
    </aside>
  )
}
