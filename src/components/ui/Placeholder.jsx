// Temporary placeholder for screens not yet built in this pass.
// Each will be replaced by its full implementation, matching the mockups.
export default function Placeholder({ title }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="font-serif text-2xl text-ink">{title}</p>
      <p className="text-sm text-muted">This screen is being built next.</p>
    </div>
  )
}
