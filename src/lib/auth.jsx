// Lightweight auth: Google Identity Services (client-side JWT decode) + guest.
// Persists the user in localStorage. No backend session needed for the demo.
import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'nestiq_user'
const AuthCtx = createContext(null)

// Client ID for Google sign-in. Create an OAuth 2.0 Web client in the Google
// Cloud console (authorized origin http://localhost:5173) and set it here.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY))
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user))
    else localStorage.removeItem(KEY)
  }, [user])

  const signInWithGoogle = (credential) => {
    const p = decodeJwt(credential)
    if (!p) return false
    setUser({ name: p.name, email: p.email, picture: p.picture, provider: 'google' })
    return true
  }
  const signInAsGuest = () => setUser({ name: 'Guest', provider: 'guest' })
  const signOut = () => setUser(null)

  return <AuthCtx.Provider value={{ user, signInWithGoogle, signInAsGuest, signOut }}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx) || { user: null, signInWithGoogle: () => false, signInAsGuest: () => {}, signOut: () => {} }
}
