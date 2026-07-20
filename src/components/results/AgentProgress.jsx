import { Check, Loader2, Sparkles, Cpu } from 'lucide-react'

// Live "agents at work" panel, fed by the SSE search stream.
export default function AgentProgress({ agents }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Sparkles size={16} className="text-brand-500" /> NestIQ agents at work
      </p>
      <p className="mt-1 text-xs text-muted">A live view of NestIQ's ADK agents: a Planner reads your priorities and routes to the Live Signals, Analytics and Civic Intelligence agents, then a Validator checks for contradictions before results are ranked.</p>
      <ul className="mt-4 space-y-3">
        {agents.map((a) => (
          <li key={a.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                a.status === 'done' ? 'bg-aff/15 text-aff' : 'bg-brand-50 text-brand-600'
              }`}
            >
              {a.status === 'done' ? <Check size={14} /> : <Loader2 size={14} className="animate-spin" />}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {a.name}
                {a.status === 'done' && a.weight != null && a.weight > 0 && (
                  <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">weight {a.weight}</span>
                )}
              </p>
              <p className="text-xs text-muted">{a.msg}</p>
            </div>
          </li>
        ))}
        {!agents.length && (
          <li className="flex items-center gap-2 text-sm text-muted">
            <Cpu size={15} className="animate-pulse" /> Spinning up agents…
          </li>
        )}
      </ul>
    </div>
  )
}
