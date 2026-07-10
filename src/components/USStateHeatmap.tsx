'use client'

import { useEffect, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'

interface StateStat {
  // Generic — represents share-of-activity %, a rate-like metric's average,
  // or an absolute metric's index, depending on what the parent passes in.
  // Formatting (suffix, "index" label) is controlled by the parent since
  // it's the one that knows which mode is active.
  value: number
  n: number
}

interface USStateHeatmapProps {
  // Keyed by full state name (matching what dataSummary.ts's state
  // normalization already produces — "California", not "CA").
  data: Record<string, StateStat>
  color: string
  dark?: boolean
  // e.g. "%" for share-of-activity or rate-like metrics, "" for an index or
  // raw count.
  suffix?: string
  // When true, 100 is the "neutral" reference point (used for indexed
  // absolute metrics) rather than 0 — shifts the color scale so over- and
  // under-indexed states are visually distinguishable from each other, not
  // just from zero.
  centeredAt100?: boolean
}

const projection = geoAlbersUsa().scale(1100).translate([480, 300])
const pathGenerator = geoPath().projection(projection as any)

export default function USStateHeatmap({
  data,
  color,
  dark = true,
  suffix = '%',
  centeredAt100 = false,
}: USStateHeatmapProps) {
  const [geographies, setGeographies] = useState<any[]>([])
  const [hovered, setHovered] = useState<{ name: string; stat: StateStat | null } | null>(null)

  useEffect(() => {
    // us-atlas ships pre-built, Census-derived TopoJSON — no hand-drawn
    // geometry. Loaded dynamically so the ~150kb of map data doesn't bloat
    // the main bundle for users who never visit this page.
    import('us-atlas/states-10m.json').then((mod: any) => {
      const us = mod.default || mod
      const statesFeature: any = feature(us, us.objects.states)
      setGeographies(statesFeature.features)
    })
  }, [])

  const values = Object.values(data).map((d) => d.value)
  const maxValue = Math.max(...values, 0.0001)
  // For centered-at-100 (index) mode, intensity scales off distance from 100
  // in either direction, so a deeply under-indexed state (e.g. 40) shows up
  // just as visually distinct as a deeply over-indexed one (e.g. 160) —
  // otherwise a plain 0-to-max scale would make every state near 100 look
  // almost identical to one near 0.
  const maxDeviation = centeredAt100
    ? Math.max(...values.map((v) => Math.abs(v - 100)), 0.0001)
    : maxValue

  const colorForState = (stateName: string): string => {
    const stat = data[stateName]
    if (!stat) return dark ? '#27272a' : '#e4e4e7' // no data for this state
    const intensity = centeredAt100
      ? Math.min(1, Math.abs(stat.value - 100) / maxDeviation)
      : Math.min(1, stat.value / maxValue)
    const alpha = Math.round(40 + intensity * 215)
    return `${color}${alpha.toString(16).padStart(2, '0')}`
  }

  if (geographies.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative">
      <svg viewBox="0 0 960 600" className="w-full h-auto">
        {geographies.map((geo, i) => {
          const stateName = geo.properties?.name
          return (
            <path
              key={i}
              d={pathGenerator(geo) || ''}
              fill={colorForState(stateName)}
              stroke={dark ? '#000000' : '#ffffff'}
              strokeWidth={0.5}
              onMouseEnter={() => setHovered({ name: stateName, stat: data[stateName] || null })}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default', transition: 'fill 0.15s' }}
            />
          )
        })}
      </svg>

      <div
        className={`absolute top-2 right-2 px-3 py-2 rounded-lg text-xs pointer-events-none transition-opacity ${
          hovered ? 'opacity-100' : 'opacity-0'
        } ${dark ? 'bg-zinc-900/95 text-white border border-white/10' : 'bg-white/95 text-zinc-900 border border-black/10 shadow-lg'}`}
      >
        {hovered && (
          <>
            <p className="font-semibold">{hovered.name}</p>
            {hovered.stat ? (
              <p className={dark ? 'text-zinc-400' : 'text-zinc-500'}>
                {hovered.stat.value.toLocaleString()}
                {suffix} <span className="opacity-60">(n={hovered.stat.n})</span>
              </p>
            ) : (
              <p className={dark ? 'text-zinc-500' : 'text-zinc-400'}>No data</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
