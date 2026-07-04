// localStorage-backed "saved localities" store. Persists the display snapshot
// so the Saved page works offline and across cities without a refetch.
import { useEffect, useState } from 'react'

const KEY = 'nestiq_saved'
const EVT = 'nestiq-saved-change'

export function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(EVT))
}

export function isSaved(id) {
  return getSaved().some((n) => n.id === id)
}

export function toggleSaved(n, city) {
  const list = getSaved()
  const i = list.findIndex((x) => x.id === n.id)
  if (i >= 0) list.splice(i, 1)
  else list.unshift({ ...n, city, savedAt: Date.now() })
  write(list)
  return isSaved(n.id)
}

export function removeSaved(id) {
  write(getSaved().filter((n) => n.id !== id))
}

// Subscribe a component to the saved list (updates on any change, any tab).
export function useSaved() {
  const [list, setList] = useState(getSaved)
  useEffect(() => {
    const sync = () => setList(getSaved())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return list
}
