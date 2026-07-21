import { NavLink, useNavigate } from 'react-router-dom'
import { House } from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { LogoMark } from '../ui/Logo.jsx'
import { NAV } from './navItems.js'

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2 px-2">
      <LogoMark size={36} />
      <span className="font-serif text-2xl font-600 tracking-tight text-ink">NestIQ</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 self-start flex-col overflow-y-auto border-r border-line bg-white px-4 py-6 lg:flex">
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
    </aside>
  )
}
