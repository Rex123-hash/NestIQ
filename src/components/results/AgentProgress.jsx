import { Check, Loader2, Sparkles } from 'lucide-react'

const STARTUP_AGENTS = [
  { id: 'planner', name: 'NestIQ Planner', status: 'running', msg: 'Understanding your request and selecting tools...' },
  { id: 'live_signals_agent', name: 'Live Signals Agent', status: 'queued', msg: 'Preparing AQI, commute and Places evidence' },
  { id: 'analytics_agent', name: 'Analytics Agent', status: 'queued', msg: 'Waiting for validated locality signals' },
  { id: 'civic_intelligence_agent', name: 'Civic Intelligence Agent', status: 'queued', msg: 'Waiting to check scoped civic evidence' },
  { id: 'validator', name: 'Validator Agent', status: 'queued', msg: 'Waiting to check coverage and contradictions' },
  { id: 'explainer', name: 'Explainer', status: 'queued', msg: 'Waiting to summarize the ranked result' },
]

// Live "agents at work" panel, fed by the SSE search stream.
export default function AgentProgress({ agents }) {
  const startupIds = new Set(STARTUP_AGENTS.map((agent) => agent.id))
  const isAdkFlow = agents.length === 0 || agents.every((agent) => startupIds.has(agent.id))
  const shownAgents = isAdkFlow
    ? STARTUP_AGENTS.map((agent) => agents.find((current) => current.id === agent.id) || agent)
    : agents

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Sparkles size={16} className="text-brand-500" /> NestIQ agents at work
      </p>
      <p className="mt-1 text-xs text-muted">A live view of NestIQ's ADK agents: a Planner reads your priorities and routes to the Live Signals, Analytics and Civic Intelligence agents, then a Validator checks for contradictions before results are ranked.</p>
      <ul className="mt-4 space-y-3">
        {shownAgents.map((a) => (
          <li key={a.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                a.status === 'done' ? 'bg-aff/15 text-aff' : a.status === 'running' ? 'bg-brand-50 text-brand-600' : 'bg-band text-brand-300'
              }`}
            >
              {a.status === 'done'
                ? <Check size={14} />
                : a.status === 'running'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <span className="h-2 w-2 rounded-full bg-current" />}
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
      </ul>
    </div>
  )
}
