import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { rentTrend } from '../../data/neighborhoods.js'

const money = (v) => `$${(v / 1000).toFixed(1)}K`

// Single-series area version (Results / Affordability overview).
export function RentTrendArea({ height = 200 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rentTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="rentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C5CF6" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#7C5CF6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F6" vertical={false} />
        <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9AA0AE' }} />
        <YAxis
          tickFormatter={money}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#9AA0AE' }}
          domain={[1600, 2200]}
        />
        <Tooltip formatter={(v) => [`$${v}`, 'Astoria']} labelStyle={{ color: '#6B7280' }} />
        <Area type="monotone" dataKey="astoria" stroke="#7C5CF6" strokeWidth={2.5} fill="url(#rentFill)" dot={{ r: 3, fill: '#7C5CF6' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Two-series comparison version (Astoria vs NYC average).
export function RentTrendCompare({ height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rentTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F6" vertical={false} />
        <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9AA0AE' }} />
        <YAxis tickFormatter={money} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9AA0AE' }} domain={[1400, 2300]} />
        <Tooltip />
        <Line type="monotone" dataKey="astoria" name="Astoria" stroke="#7C5CF6" strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="nyc" name="NYC Average" stroke="#B6BAC6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
