import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Bookmark, ArrowLeft, LogOut, LogIn } from 'lucide-react'
import { useAuth } from '../../lib/auth.jsx'

// Shared top bar for app screens. `left` renders a title or a back link;
// the right cluster (Ask NestIQ / bookmark / avatar) is consistent everywhere.
export default function AppTopbar({ left = null, back = null }) {
  const { user, signOut } = useAuth()
  const [menu, setMenu] = useState(false)
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line bg-white px-6 py-4 lg:px-8">
      <div className="min-w-0">
        {back ? (
          <Link to={back.to} className="flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-brand-700">
            <ArrowLeft size={18} />
            {back.label}
          </Link>
        ) : (
          <p className="truncate text-sm text-muted">{left}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/ask"
          className="flex items-center gap-2 rounded-xl border border-brand-200 px-3.5 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          <Sparkles size={16} />
          Ask NestIQ
        </Link>
        <Link to="/saved" aria-label="Saved" className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-soft hover:text-brand-700">
          <Bookmark size={18} />
        </Link>
        <div className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-brand-500 text-sm font-semibold text-white"
            aria-label="Account"
          >
            {user?.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              user?.name?.[0]?.toUpperCase() || 'A'
            )}
          </button>
          {menu && (
            <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-line bg-white p-2 shadow-float">
              {user ? (
                <>
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
                    {user.provider === 'guest' && <p className="text-xs text-muted">Browsing as guest</p>}
                  </div>
                  <button
                    onClick={() => {
                      signOut()
                      setMenu(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </>
              ) : (
                <Link
                  to="/signin"
                  onClick={() => setMenu(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                >
                  <LogIn size={15} /> Sign in
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
