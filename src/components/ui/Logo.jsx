// NestIQ brand mark: a house sheltering a map pin — "find your nest".
// Single source of truth for the logo used in navs, sign-in and the favicon.

export function LogoMark({ size = 36, radius = 12, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="NestIQ"
    >
      <defs>
        <linearGradient id="nq-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CF6" />
          <stop offset="1" stopColor="#5B45E8" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx={radius} fill="url(#nq-grad)" />
      {/* house silhouette */}
      <path d="M24 8.5 L40 22.2 H35.6 V38 H12.4 V22.2 H8 Z" fill="#FFFFFF" />
      {/* map pin nested inside the house */}
      <path
        d="M24 19.2c3.5 0 6.3 2.7 6.3 6.1 0 4.4-6.3 10.2-6.3 10.2s-6.3-5.8-6.3-10.2c0-3.4 2.8-6.1 6.3-6.1Z"
        fill="#6D5EF6"
      />
      <circle cx="24" cy="25.4" r="2.5" fill="#FFFFFF" />
    </svg>
  )
}

// Mark + wordmark lockup.
export default function Logo({ size = 36, text = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {text && <span className="font-serif text-2xl tracking-tight text-ink">NestIQ</span>}
    </span>
  )
}
