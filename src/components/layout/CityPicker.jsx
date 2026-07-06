import { MapPin, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { useCity } from '../../lib/cityStore.jsx'

// Compact city selector chip, used top-right on every app screen.
export default function CityPicker({ className = '' }) {
  const { city, setCity, cities } = useCity()
  return (
    <div className={cn('relative', className)}>
      <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-600" />
      <select
        value={city}
        onChange={(e) => setCity(e.target.value)}
        aria-label="City"
        className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-line bg-white pl-8 pr-8 text-sm font-medium text-ink-soft outline-none transition hover:border-brand-200 focus:border-brand-300"
      >
        {cities.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
}
