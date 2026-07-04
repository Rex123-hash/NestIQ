import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { UserRound, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useAuth, GOOGLE_CLIENT_ID } from '../lib/auth.jsx'
import { LogoMark } from '../components/ui/Logo.jsx'

export default function SignIn() {
  const navigate = useNavigate()
  const { signInWithGoogle, signInAsGuest } = useAuth()
  const btnRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    const init = () => {
      if (cancelled || !window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => {
          if (signInWithGoogle(resp.credential)) navigate('/')
          else setError('Could not read your Google profile. Try again.')
        },
      })
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 300,
          text: 'continue_with',
          shape: 'pill',
        })
      }
    }
    if (window.google?.accounts?.id) {
      init()
    } else {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.defer = true
      s.onload = init
      document.head.appendChild(s)
    }
    return () => {
      cancelled = true
    }
  }, [navigate, signInWithGoogle])

  const guest = () => {
    signInAsGuest()
    navigate('/')
  }

  return (
    <div className="relative grid min-h-screen place-items-center bg-band px-6">
      <Link to="/" className="absolute left-6 top-6 flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand-700">
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
        <span className="mx-auto block w-fit">
          <LogoMark size={48} radius={14} />
        </span>
        <h1 className="mt-4 font-serif text-2xl text-ink">Welcome to NestIQ</h1>
        <p className="mt-1 text-sm text-muted">Sign in to save localities and personalize your matches.</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          {GOOGLE_CLIENT_ID ? (
            <div ref={btnRef} className="flex min-h-[44px] justify-center" />
          ) : (
            <div className="w-full rounded-xl border border-dashed border-line bg-band/60 p-3 text-xs leading-relaxed text-muted">
              To enable <b className="font-semibold text-ink-soft">Continue with Google</b>, create an OAuth 2.0 Web
              client in Google Cloud (authorized origin <code>http://localhost:5173</code>) and set{' '}
              <code>VITE_GOOGLE_CLIENT_ID</code> in a frontend <code>.env</code>.
            </div>
          )}
          {error && <p className="text-xs text-[#E5484D]">{error}</p>}

          <div className="flex w-full items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <button
            onClick={guest}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-3 text-sm font-medium text-ink-soft transition hover:border-brand-300 hover:text-brand-700"
          >
            <UserRound size={16} /> Continue as guest
          </button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted">
          <ShieldCheck size={14} className="text-brand-500" /> No sign up required · Your data stays private
        </p>
      </div>
    </div>
  )
}
