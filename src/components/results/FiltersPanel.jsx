import { X, RotateCcw } from 'lucide-react'

const PILLARS = [
  ['affordability', 'Affordability'],
  ['safety', 'Safety'],
  ['commute', 'Commute'],
  ['lifestyle', 'Essentials & Lifestyle'],
  ['air_quality', 'Air Quality'],
]

function Slider({ label, value, min, max, step, onChange, suffix }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className="font-semibold text-ink">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-brand-600"
      />
    </div>
  )
}

// value + onChange for the whole filter model, so the parent owns state.
export default function FiltersPanel({ weights, onWeights, limits, onLimits, bounds, currency, onReset, onClose }) {
  return (
    <div className="card mt-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Filters &amp; Priorities</h3>
        <div className="flex items-center gap-3">
          <button onClick={onReset} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close filters">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {/* priority weights → re-rank */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Priorities (re-ranks matches)</p>
          <div className="space-y-3">
            {PILLARS.map(([key, label]) => (
              <Slider
                key={key}
                label={label}
                value={weights[key]}
                min={0}
                max={100}
                step={5}
                onChange={(v) => onWeights({ ...weights, [key]: v })}
              />
            ))}
          </div>
        </div>

        {/* hard limits → narrow the list */}
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Limits (hides non-matches)</p>
          <div className="space-y-3">
            <Slider
              label="Max rent"
              value={limits.maxRent}
              min={bounds.minRent}
              max={bounds.maxRent}
              step={1000}
              suffix={` ${currency}`}
              onChange={(v) => onLimits({ ...limits, maxRent: v })}
            />
            <Slider
              label="Max AQI"
              value={limits.maxAqi}
              min={bounds.minAqi}
              max={bounds.maxAqi}
              step={5}
              onChange={(v) => onLimits({ ...limits, maxAqi: v })}
            />
            <Slider
              label="Max commute"
              value={limits.maxCommute}
              min={bounds.minCommute}
              max={bounds.maxCommute}
              step={5}
              suffix=" min"
              onChange={(v) => onLimits({ ...limits, maxCommute: v })}
            />
            <Slider
              label="Min FitScore"
              value={limits.minFit}
              min={0}
              max={100}
              step={5}
              onChange={(v) => onLimits({ ...limits, minFit: v })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
