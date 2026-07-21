import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { LogoMark } from '../ui/Logo.jsx'
import { NAV } from './navItems.js'

// Below `lg` the sidebar is hidden, which previously left Compare, Saved,
// Alerts and Ask NestIQ unreachable on a phone. This supplies the same
// destinations as a slide-in drawer. Rendered once in AppLayout so every app
// route gets it without touching each page's own header.
export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const panelRef = useRef(null)
  const triggerRef = useRef(null)

  // Navigating away must close the drawer, otherwise it covers the page it
  // just moved to.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      // Trap Tab inside the drawer: focus escaping to the page behind an open
      // overlay is disorienting for keyboard and screen-reader users.
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    // Stop the page behind the overlay from scrolling with the drawer.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('a, button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-soft transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Menu size={20} />
        </button>
        <NavLink
          to="/"
          className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <LogoMark size={28} />
          <span className="font-serif text-xl font-600 tracking-tight text-ink">NestIQ</span>
        </NavLink>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-nav-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-white px-4 py-5 shadow-float"
          >
            <div className="flex items-center justify-between">
              <NavLink to="/" className="flex items-center gap-2 rounded-lg px-1">
                <LogoMark size={30} />
                <span className="font-serif text-xl font-600 tracking-tight text-ink">NestIQ</span>
              </NavLink>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-soft transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mt-6 flex flex-col gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
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
          </div>
        </div>
      )}
    </>
  )
}
