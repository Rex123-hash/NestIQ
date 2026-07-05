// localStorage-backed history of real Ask NestIQ questions. Replaces the old
// hardcoded "Recent Conversations" list — this persists per browser, updates
// live, and its delete/clear actions actually work.
import { useEffect, useState } from 'react'

const KEY = 'nestiq_recent_q'
const EVT = 'nestiq-recent-change'
const MAX = 12

const CATEGORY = [
  [/air|aqi|pollut|breath|smog/i, 'Air Quality'],
  [/rent|budget|afford|cheap|price|cost/i, 'Affordability'],
  [/commut|drive|travel|hub|distance|traffic/i, 'Commute'],
  [/safe|crime|secur/i, 'Safety'],
  [/amenit|restaurant|gym|park|mall|caf|shop/i, 'Lifestyle'],
]

function categorize(q) {
  for (const [re, label] of CATEGORY) if (re.test(q)) return label
  return 'General'
}

export function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  window.dispatchEvent(new Event(EVT))
}

export function pushRecent(q) {
  const question = (q || '').trim()
  if (!question) return
  const list = getRecent().filter((x) => x.q.toLowerCase() !== question.toLowerCase())
  list.unshift({ id: Date.now(), q: question, category: categorize(question), at: Date.now() })
  write(list)
}

export function removeRecent(id) {
  write(getRecent().filter((x) => x.id !== id))
}

export function clearRecent() {
  write([])
}

export function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export function useRecent() {
  const [list, setList] = useState(getRecent)
  useEffect(() => {
    const sync = () => setList(getRecent())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return list
}
