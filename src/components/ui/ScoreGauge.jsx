// Semicircular FitScore gauge used on cards, results, compare and detail pages.
const R = 40
const CX = 50
const CY = 50
const ARC = Math.PI * R // length of a 180° arc

function matchColor(score) {
  if (score >= 85) return '#7C5CF6'
  if (score >= 75) return '#3FB984'
  return '#F5A63B'
}

export default function ScoreGauge({ score = 0, size = 96, showScore = false, className = '' }) {
  const pct = Math.max(0, Math.min(100, score)) / 100
  const color = matchColor(score)
  return (
    <svg
      viewBox="0 0 100 58"
      width={size}
      height={(size * 58) / 100}
      className={className}
      role="img"
      aria-label={`FitScore ${score}`}
    >
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none"
        stroke="#ECECF3"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={ARC}
        strokeDashoffset={ARC * (1 - pct)}
      />
      {showScore && (
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="22" fontWeight="600" fill="#1B1B2F">
          {score}
        </text>
      )}
    </svg>
  )
}
