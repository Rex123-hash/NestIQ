import { Search, ArrowLeftRight, Bookmark, Bell, Sparkles } from 'lucide-react'

// Single source of truth for the app's primary navigation. The desktop sidebar
// and the mobile drawer both read this, so the two can never drift apart.
export const NAV = [
  { to: '/results', label: 'Search & Results', icon: Search },
  { to: '/compare', label: 'Compare', icon: ArrowLeftRight },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/ask', label: 'Ask NestIQ', icon: Sparkles },
]
