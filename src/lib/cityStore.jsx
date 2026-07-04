import { createContext, useContext, useEffect, useState } from 'react'
import { apiCities } from './api.js'

const FALLBACK_CITIES = [
  { id: 'delhi-ncr', name: 'Delhi NCR' },
  { id: 'mumbai', name: 'Mumbai' },
  { id: 'bangalore', name: 'Bengaluru' },
  { id: 'kolkata', name: 'Kolkata' },
  { id: 'hyderabad', name: 'Hyderabad' },
  { id: 'chennai', name: 'Chennai' },
  { id: 'pune', name: 'Pune' },
  { id: 'patna', name: 'Patna (Bihar)' },
  { id: 'ranchi', name: 'Ranchi (Jharkhand)' },
]

// If a query names a city (e.g. "patna", "bengaluru"), return that city.
export function detectCity(query, cities) {
  const ql = ` ${(query || '').toLowerCase()} `
  for (const c of cities) {
    const tokens = [c.id.split('-')[0], ...c.name.toLowerCase().replace(/[()]/g, '').split(/\s+/)]
    for (const t of tokens) {
      if (t.length >= 4 && ql.includes(t)) return c
    }
  }
  return null
}

const CityCtx = createContext(null)

export function CityProvider({ children }) {
  const [city, setCity] = useState(() => localStorage.getItem('nestiq_city') || 'delhi-ncr')
  const [cities, setCities] = useState(FALLBACK_CITIES)

  useEffect(() => {
    apiCities().then((res) => {
      if (res?.cities?.length) setCities(res.cities)
    })
  }, [])

  useEffect(() => {
    localStorage.setItem('nestiq_city', city)
  }, [city])

  return <CityCtx.Provider value={{ city, setCity, cities }}>{children}</CityCtx.Provider>
}

export function useCity() {
  return useContext(CityCtx) || { city: 'delhi-ncr', setCity: () => {}, cities: FALLBACK_CITIES }
}
