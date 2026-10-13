import type { KitTokens } from '@/lib/brandKit'
import { fmt, type StoryChart } from '@/lib/storyModel'

// Hand drawn SVG charts for Story Mode. Drawn by hand, not with a chart
// library, so every slide has the same restrained look, scales to any size,
// and copies out as a clean image. All charts share one 512 by 262 canvas.

export const CHART_W = 512
export const CHART_H = 284

const num = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const exp = Math.floor(Math.log10(raw))
  const f = raw / Math.pow(10, exp)
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  return nf * Math.pow(10, exp)
}

// A zero based axis for bars, with a few clean gridlines.
function zeroScale(max: number, ticks = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }
  const step = niceStep(max / ticks)
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Number(v.toFixed(6)))
  return { max: top, ticks: out }
}

// A free axis for lines. Starts at zero unless the data sits far above it.
function lineScale(min: number, max: number, ticks = 4) {
  if (max === min) return zeroScale(max, ticks)
  let lo = min
  if (min >= 0 && min < max * 0.35) lo = 0
  const step = niceStep((max - lo) / ticks)
  const bottom = Math.floor(lo / step) * step
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = bottom; v <= top + step / 1000; v += step) out.push(Number(v.toFixed(6)))
  return { min: bottom, max: top, ticks: out }
}

// Axis labels with a steady number of decimals, so 4, 3.8 reads as 4.0, 3.8.
function tickFmt(ticks: number[]): (v: number) => string {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1
  const big = Math.max(...ticks.map((t) => Math.abs(t)))
  if (big >= 10000) return fmt
  const d = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9))
  return (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function wrap(label: string, maxChars: number): string[] {
  const s = String(label)
  if (s.length <= maxChars) return [s]
  const words = s.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur)
      cur = w
    } else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  const out = lines.slice(0, 2)
  if (lines.length > 2 || out.some((l) => l.length > maxChars + 3)) {
    out[out.length - 1] = out[out.length - 1].slice(0, maxChars - 1) + '…'
  }
  return out
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// Which series is the one the story is about, when there are two or more.
function strongIndex(keys: string[]): number {
  const i = keys.findIndex((k) =>
    /treat|test|expos|variant|after|new|campaign|promo|current|you\b/i.test(k)
  )
  return i === -1 ? keys.length - 1 : i
}

function seriesColors(keys: string[], T: KitTokens): string[] {
  if (keys.length === 2) {
    const s = strongIndex(keys)
    return keys.map((_, i) => (i === s ? T.deep : T.pairMuted))
  }
  return keys.map((_, i) => T.series[i % T.series.length])
}

const name = (d: Record<string, any>) => String(d.name ?? d.label ?? '')

function Legend({
  keys,
  colors,
  T,
  x = 40,
  y = 12,
}: {
  keys: string[]
  colors: string[]
  T: KitTokens
  x?: number
  y?: number
}) {
  let cx = x
  return (
    <g>
      {keys.map((k, i) => {
        const label = trunc(k, 18)
        const g = (
          <g key={k} transform={`translate(${cx},${y})`}>
            <rect width="11" height="11" rx="2" fill={colors[i]} />
            <text x="16" y="10" fontSize="11" fill={T.mutedOnSurface}>
              {label}
            </text>
          </g>
        )
        cx += 16 + label.length * 6.2 + 18
        return g
      })}
    </g>
  )
}

// ── line ────────────────────────────────────────────────────────────────────

function LineChart({ c, T }: { c: StoryChart; T: KitTokens }) {
  const { data, keys } = c
  const L = 44,
    R = keys.length > 1 ? 84 : 52,
    Tp = 30,
    B = 38
  const iw = CHART_W - L - R
  const ih = CHART_H - Tp - B
  const vals = data.flatMap((d) => keys.map((k) => num(d[k])))
  const refs = c.reference ? [c.reference.value] : []
  const sc = lineScale(Math.min(...vals, ...refs), Math.max(...vals, ...refs))
  const lo = (sc as any).min ?? 0
  const y = (v: number) => Tp + ih - ((v - lo) / (sc.max - lo || 1)) * ih
  const x = (i: number) => L + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const tf = tickFmt(sc.ticks)
  const colors = seriesColors(keys, T)
  const order = keys
    .map((_, i) => i)
    .sort((a, b) => (colors[a] === T.deep ? 1 : 0) - (colors[b] === T.deep ? 1 : 0))
  const step = Math.ceil(data.length / 7)

  const ann = (c.annotations || [])
    .map((a) => ({ ...a, i: data.findIndex((d) => name(d) === a.x) }))
    .filter((a) => a.i >= 0)
  const band = ann.length >= 2 ? [ann[0].i, ann[1].i].sort((a, b) => a - b) : null

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', display: 'block' }}>
      {band && (
        <g>
          <rect
            x={x(band[0])}
            y={Tp - 4}
            width={x(band[1]) - x(band[0])}
            height={ih + 4}
            fill={T.deep}
            fillOpacity="0.08"
          />
          <text
            x={(x(band[0]) + x(band[1])) / 2}
            y={Tp - 12}
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill={T.deep}
          >
            {trunc(ann[0].label, 28)}
          </text>
        </g>
      )}
      {sc.ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={CHART_W - R} y1={y(t)} y2={y(t)} stroke={T.gridline} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={T.mutedOnSurface}>
            {tf(t)}
          </text>
        </g>
      ))}
      <line x1={L} x2={CHART_W - R} y1={Tp + ih} y2={Tp + ih} stroke={T.axis} />
      {c.reference && (
        <g>
          <line
            x1={L}
            x2={CHART_W - R}
            y1={y(c.reference.value)}
            y2={y(c.reference.value)}
            stroke={T.axis}
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          <text
            x={CHART_W - R}
            y={y(c.reference.value) - 5}
            textAnchor="end"
            fontSize="11"
            fontWeight="700"
            fill={T.mutedOnSurface}
          >
            {trunc(c.reference.label, 24)}
          </text>
        </g>
      )}
      {!band &&
        ann.slice(0, 2).map((a) => (
          <g key={a.x}>
            <line
              x1={x(a.i)}
              x2={x(a.i)}
              y1={Tp - 4}
              y2={Tp + ih}
              stroke={T.axis}
              strokeDasharray="3 3"
            />
            <text
              x={x(a.i)}
              y={Tp - 10}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill={T.deep}
            >
              {trunc(a.label, 24)}
            </text>
          </g>
        ))}
      {order.map((ki) => {
        const k = keys[ki]
        const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(num(d[k])).toFixed(1)}`).join(' ')
        const strong = colors[ki] === T.deep || keys.length === 1
        return (
          <polyline
            key={k}
            points={pts}
            fill="none"
            stroke={colors[ki]}
            strokeWidth={strong ? 3.5 : 3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      })}
      {keys.length === 1 &&
        (() => {
          const vs = data.map((d) => num(d[keys[0]]))
          const mi = vs.indexOf(Math.max(...vs))
          const li = data.length - 1
          const marks = Array.from(new Set([mi, li]))
          return marks.map((i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(vs[i])} r="5" fill={T.deep} />
              <text
                x={x(i)}
                y={y(vs[i]) - 11}
                textAnchor={i === li && mi !== li ? 'end' : 'middle'}
                fontSize="13"
                fontWeight="800"
                fill={T.deep}
              >
                {fmt(vs[i])}
              </text>
            </g>
          ))
        })()}
      {keys.length > 1 &&
        keys.map((k, ki) => {
          const last = data[data.length - 1]
          return (
            <text
              key={k}
              x={CHART_W - R + 8}
              y={y(num(last[k])) + 4}
              fontSize="11"
              fontWeight="700"
              fill={colors[ki] === T.pairMuted ? T.mutedOnSurface : colors[ki]}
            >
              {trunc(k, 11)}
            </text>
          )
        })}
      {data.map((d, i) =>
        i % step === 0 || i === data.length - 1 ? (
          <text
            key={i}
            x={x(i)}
            y={CHART_H - 14}
            textAnchor="middle"
            fontSize="12"
            fill={T.mutedOnSurface}
          >
            {trunc(name(d), 9)}
          </text>
        ) : null
      )}
    </svg>
  )
}

// ── vertical bars: single series, grouped and stacked ───────────────────────

function Bars({
  c,
  T,
  mode,
}: {
  c: StoryChart
  T: KitTokens
  mode: 'single' | 'grouped' | 'stacked'
}) {
  const { data, keys } = c
  const multi = mode !== 'single'
  const L = 44,
    R = 12,
    Tp = multi ? 36 : 28,
    B = 46
  const iw = CHART_W - L - R
  const ih = CHART_H - Tp - B
  const totals = data.map((d) => keys.reduce((s, k) => s + num(d[k]), 0))
  const peak =
    mode === 'stacked'
      ? Math.max(...totals)
      : Math.max(...data.flatMap((d) => keys.map((k) => num(d[k]))))
  const sc = zeroScale(peak)
  const tf = tickFmt(sc.ticks)
  const y = (v: number) => Tp + ih - (v / sc.max) * ih
  const band = iw / data.length
  const colors = multi ? seriesColors(keys, T) : []
  const k0 = keys[0]
  const top = Math.max(...data.map((d) => num(d[k0])))

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', display: 'block' }}>
      {multi && <Legend keys={keys} colors={colors} T={T} />}
      {sc.ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={CHART_W - R} y1={y(t)} y2={y(t)} stroke={T.gridline} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={T.mutedOnSurface}>
            {tf(t)}
          </text>
        </g>
      ))}
      <line x1={L} x2={CHART_W - R} y1={Tp + ih} y2={Tp + ih} stroke={T.axis} />
      {c.reference && (
        <g>
          <line
            x1={L}
            x2={CHART_W - R}
            y1={y(c.reference.value)}
            y2={y(c.reference.value)}
            stroke={T.axis}
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          <text
            x={CHART_W - R}
            y={y(c.reference.value) - 5}
            textAnchor="end"
            fontSize="11"
            fontWeight="700"
            fill={T.mutedOnSurface}
          >
            {trunc(c.reference.label, 24)}
          </text>
        </g>
      )}
      {data.map((d, i) => {
        const cx = L + band * i + band / 2
        const labelLines = wrap(name(d), band > 90 ? 14 : band > 64 ? 10 : 7)
        const lab = labelLines.map((ln, li) => (
          <text
            key={li}
            x={cx}
            y={Tp + ih + 17 + li * 13}
            textAnchor="middle"
            fontSize="12"
            fill={T.mutedOnSurface}
          >
            {ln}
          </text>
        ))
        if (mode === 'single') {
          const v = num(d[k0])
          const bw = Math.min(band * 0.56, 84)
          const hot = v === top
          return (
            <g key={i}>
              <rect
                x={cx - bw / 2}
                y={y(v)}
                width={bw}
                height={Tp + ih - y(v)}
                fill={hot ? T.deep : T.pairMuted}
                rx="2"
              />
              <text
                x={cx}
                y={y(v) - 7}
                textAnchor="middle"
                fontSize="13"
                fontWeight="800"
                fill={T.deep}
              >
                {fmt(v)}
              </text>
              {lab}
            </g>
          )
        }
        if (mode === 'grouped') {
          const gw = Math.min(band * 0.78, 130)
          const bw = gw / keys.length - 4
          return (
            <g key={i}>
              {keys.map((k, ki) => {
                const v = num(d[k])
                const bx = cx - gw / 2 + ki * (gw / keys.length) + 2
                return (
                  <g key={k}>
                    <rect
                      x={bx}
                      y={y(v)}
                      width={bw}
                      height={Tp + ih - y(v)}
                      fill={colors[ki]}
                      rx="2"
                    />
                    <text
                      x={bx + bw / 2}
                      y={y(v) - 6}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="800"
                      fill={T.deep}
                    >
                      {fmt(v)}
                    </text>
                  </g>
                )
              })}
              {lab}
            </g>
          )
        }
        // stacked
        const bw = Math.min(band * 0.56, 84)
        let acc = 0
        return (
          <g key={i}>
            {keys.map((k, ki) => {
              const v = num(d[k])
              const y0 = y(acc + v)
              const h = y(acc) - y0
              acc += v
              return (
                <rect
                  key={k}
                  x={cx - bw / 2}
                  y={y0}
                  width={bw}
                  height={Math.max(h, 0)}
                  fill={colors[ki]}
                  stroke={T.surface}
                  strokeWidth="1"
                />
              )
            })}
            <text
              x={cx}
              y={y(totals[i]) - 7}
              textAnchor="middle"
              fontSize="13"
              fontWeight="800"
              fill={T.deep}
            >
              {fmt(totals[i])}
            </text>
            {lab}
          </g>
        )
      })}
    </svg>
  )
}

// ── ranked horizontal bars ──────────────────────────────────────────────────

function Ranked({ c, T }: { c: StoryChart; T: KitTokens }) {
  const k = c.keys[0]
  const data = c.data
  const L = 150,
    R = 56,
    Tp = 6
  const rowH = (CHART_H - Tp - 6) / data.length
  const max = Math.max(...data.map((d) => num(d[k])), 1)
  const bh = Math.min(rowH * 0.62, 26)
  const iw = CHART_W - L - R
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', display: 'block' }}>
      {data.map((d, i) => {
        const v = num(d[k])
        const cy = Tp + rowH * i + rowH / 2
        const w = (v / max) * iw
        return (
          <g key={i}>
            <text
              x={L - 12}
              y={cy + 4}
              textAnchor="end"
              fontSize="12"
              fontWeight={i === 0 ? 800 : 500}
              fill={i === 0 ? T.deep : T.mutedOnSurface}
            >
              {trunc(name(d), 22)}
            </text>
            <rect
              x={L}
              y={cy - bh / 2}
              width={Math.max(w, 2)}
              height={bh}
              fill={i === 0 ? T.deep : T.pairMuted}
              rx="2"
            />
            <text
              x={L + Math.max(w, 2) + 8}
              y={cy + 4}
              fontSize="13"
              fontWeight="800"
              fill={T.deep}
            >
              {fmt(v)}
            </text>
          </g>
        )
      })}
      <line x1={L} x2={L} y1={Tp} y2={CHART_H - 6} stroke={T.axis} />
    </svg>
  )
}

// ── donut ───────────────────────────────────────────────────────────────────

function Donut({ c, T }: { c: StoryChart; T: KitTokens }) {
  const k = c.keys[0]
  const data = c.data
  const total = data.reduce((s, d) => s + num(d[k]), 0) || 1
  const cx = 130,
    cy = CHART_H / 2,
    R = 104,
    r = 66
  const colors = data.map((_, i) => T.series[i % T.series.length])
  let a0 = -Math.PI / 2
  const arcs = data.map((d, i) => {
    const frac = num(d[k]) / total
    const a1 = a0 + frac * Math.PI * 2 - (data.length > 1 ? 0.012 : 0)
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (rad: number, a: number) =>
      `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`
    const dPath = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`
    a0 += frac * Math.PI * 2
    return { dPath, frac, i }
  })
  const big = arcs.reduce((m, a) => (a.frac > m.frac ? a : m), arcs[0])
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', display: 'block' }}>
      {arcs.map((a) => (
        <path key={a.i} d={a.dPath} fill={colors[a.i]} />
      ))}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="30" fontWeight="800" fill={T.deep}>
        {Math.round(big.frac * 100)}%
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontSize="11" fill={T.mutedOnSurface}>
        {trunc(name(data[big.i]), 16)}
      </text>
      {data.map((d, i) => (
        <g key={i} transform={`translate(262,${44 + i * 38})`}>
          <rect width="13" height="13" rx="2" fill={colors[i]} />
          <text x="22" y="11" fontSize="13" fontWeight="700" fill={T.deep}>
            {trunc(name(d), 22)}
          </text>
          <text x="22" y="28" fontSize="12" fill={T.mutedOnSurface}>
            {fmt(num(d[k]))}, {Math.round((num(d[k]) / total) * 100)}%
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── scatter ─────────────────────────────────────────────────────────────────

function Scatter({ c, T }: { c: StoryChart; T: KitTokens }) {
  const [kx, ky] = c.keys.length >= 2 ? c.keys : ['x', 'y']
  const pts = c.data.map((d) => ({ x: num(d[kx]), y: num(d[ky]), label: name(d) }))
  const L = 48,
    R = 20,
    Tp = 16,
    B = 44
  const iw = CHART_W - L - R,
    ih = CHART_H - Tp - B
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y)
  const sx = lineScale(Math.min(...xs), Math.max(...xs), 4)
  const sy = lineScale(Math.min(...ys), Math.max(...ys), 4)
  const x = (v: number) =>
    L + ((v - ((sx as any).min ?? 0)) / (sx.max - ((sx as any).min ?? 0) || 1)) * iw
  const y = (v: number) =>
    Tp + ih - ((v - ((sy as any).min ?? 0)) / (sy.max - ((sy as any).min ?? 0) || 1)) * ih
  const tfx = tickFmt(sx.ticks)
  const tfy = tickFmt(sy.ticks)
  const n = pts.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0)
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  const syy = pts.reduce((s, p) => s + (p.y - my) ** 2, 0)
  const slope = sxx ? sxy / sxx : 0
  const icpt = my - slope * mx
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs)
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', display: 'block' }}>
      {sy.ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={CHART_W - R} y1={y(t)} y2={y(t)} stroke={T.gridline} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={T.mutedOnSurface}>
            {tfy(t)}
          </text>
        </g>
      ))}
      {sx.ticks.map((t) => (
        <text
          key={t}
          x={x(t)}
          y={CHART_H - 24}
          textAnchor="middle"
          fontSize="11"
          fill={T.mutedOnSurface}
        >
          {tfx(t)}
        </text>
      ))}
      <line x1={L} x2={CHART_W - R} y1={Tp + ih} y2={Tp + ih} stroke={T.axis} />
      {n > 2 && (
        <line
          x1={x(x0)}
          y1={y(slope * x0 + icpt)}
          x2={x(x1)}
          y2={y(slope * x1 + icpt)}
          stroke={T.deep}
          strokeWidth="2"
          strokeDasharray="6 4"
        />
      )}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={x(p.x)}
          cy={y(p.y)}
          r="5.5"
          fill={T.deep}
          fillOpacity="0.82"
          stroke={T.surface}
          strokeWidth="1.5"
        />
      ))}
      <text
        x={L + iw / 2}
        y={CHART_H - 6}
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill={T.mutedOnSurface}
      >
        {trunc(kx, 28)}, r = {r.toFixed(2)}
      </text>
    </svg>
  )
}

// ── entry ───────────────────────────────────────────────────────────────────

export function StoryChartSvg({ chart, T }: { chart: StoryChart; T: KitTokens }) {
  switch (chart.kind) {
    case 'line':
      return <LineChart c={chart} T={T} />
    case 'bar':
      return <Bars c={chart} T={T} mode="single" />
    case 'grouped':
      return <Bars c={chart} T={T} mode="grouped" />
    case 'stacked':
      return <Bars c={chart} T={T} mode="stacked" />
    case 'ranked':
      return <Ranked c={chart} T={T} />
    case 'donut':
      return <Donut c={chart} T={T} />
    case 'scatter':
      return <Scatter c={chart} T={T} />
    default:
      return null
  }
}
