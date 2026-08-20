'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ComposedChart,
  Treemap,
  FunnelChart,
  Funnel,
  ScatterChart,
  Scatter,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

interface ChartRendererProps {
  chart: any
  colors: string[]
  height?: number
  dark?: boolean
}

// Detect if chart data has multiple value keys (grouped/stacked)
function getDataKeys(data: any[]): string[] {
  if (!data || data.length === 0) return ['value']
  const sample = data[0]
  const keys = Object.keys(sample).filter((k) => k !== 'name' && typeof sample[k] === 'number')
  return keys.length > 0 ? keys : ['value']
}

// Paul Heckbert's "Nice Numbers for Graph Labels" (Graphics Gems, 1990) —
// the standard algorithm most charting tools use under the hood (D3's
// scaleLinear().nice(), matplotlib, Excel) to round an axis's bounds and
// tick spacing to numbers a human would actually choose, instead of
// scaling exactly to the data's min/max. That's what was missing here: a
// bar chart of [4.5, 1.9, 3.6, 2.9] was getting a Recharts "auto" axis
// that scaled almost exactly to 4.5, so the tallest bar looked like it
// was hitting the ceiling of the chart. This rounds that same data to a
// major gridline of 5 (or 10, or 25, depending on magnitude) with 0 as
// the floor, leaving real headroom above the tallest bar.
function niceNumber(value: number, round: boolean): number {
  if (value === 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / Math.pow(10, exponent)
  let niceFraction: number
  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else {
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
  }
  return niceFraction * Math.pow(10, exponent)
}

// Standard bar-chart convention (see e.g. storytellingwithdata.com's "bar
// charts must have a zero baseline"): the value axis always starts at 0,
// since a bar's length is the thing being compared, and a non-zero
// baseline distorts that comparison. Max is rounded up to the nearest
// nice step for a fixed tick count, per Heckbert above.
function niceZeroDomain(maxValue: number, tickCount = 5): [number, number] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return [0, 1]
  const rawStep = maxValue / (tickCount - 1)
  const step = niceNumber(rawStep, true)
  const niceMax = Math.ceil(maxValue / step) * step
  return [0, niceMax]
}

// Indexed mode (value_mode: 'indexed') rebases every series to 100 at its
// first point, so the story is "above/below the starting point," not an
// absolute magnitude — the reason to look at it is the deviation from
// 100, not the raw height of the line. Centering 100 in the middle of the
// axis (a symmetric domain around it) makes that deviation legible at a
// glance in both directions, the same way indexed/rebased performance
// charts are conventionally drawn.
function niceIndexedDomain(values: number[], tickCount = 5): [number, number] {
  const maxDeviation = Math.max(...values.map((v) => Math.abs(v - 100)), 1)
  const rawStep = maxDeviation / Math.max(1, Math.floor((tickCount - 1) / 2))
  const step = niceNumber(rawStep, true)
  const span = Math.ceil(maxDeviation / step) * step
  return [100 - span, 100 + span]
}

function numericValues(data: any[], keys: string[]): number[] {
  if (!data) return []
  const out: number[] = []
  for (const point of data) {
    for (const k of keys) {
      if (typeof point?.[k] === 'number') out.push(point[k])
    }
  }
  return out
}

const tickStyle = (dark: boolean) => ({ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' })
const gridColor = (dark: boolean) => (dark ? '#27272a' : '#f4f4f5')
const tooltipStyle = (dark: boolean) => ({
  background: dark ? '#18181b' : '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
})

// Custom cell renderer for Treemap — Recharts' default treemap content has
// no fill or labels out of the box, so this gives it the same colored,
// labeled look as the rest of the chart set.
function TreemapCell(props: any) {
  const { x, y, width, height, name, value, index, colors } = props
  if (width <= 0 || height <= 0) return null
  const fill = colors[index % colors.length]
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#fff"
        strokeWidth={1.5}
        rx={4}
      />
      {width > 55 && height > 28 && (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={600}>
          {name}
        </text>
      )}
      {width > 55 && height > 44 && (
        <text x={x + 8} y={y + 34} fill="#fff" fontSize={10} opacity={0.85}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </text>
      )}
    </g>
  )
}

export default function ChartRenderer({
  chart,
  colors,
  height = 200,
  dark = true,
}: ChartRendererProps) {
  const dataKeys = getDataKeys(chart.data || [])
  const isMulti = dataKeys.length > 1
  const props = { data: chart.data, margin: { top: 5, right: 20, left: 10, bottom: 5 } }
  const isIndexed = chart.value_mode === 'indexed'
  // Shared by bar/line/area: a "nice" domain instead of Recharts' default
  // auto-scale, which fits the axis almost exactly to the data and leaves
  // no headroom above the tallest bar or point. See niceZeroDomain /
  // niceIndexedDomain above for the reasoning.
  const values = numericValues(chart.data, dataKeys)
  const yDomain: [number, number] | undefined =
    values.length === 0
      ? undefined
      : isIndexed
        ? niceIndexedDomain(values)
        : niceZeroDomain(Math.max(...values, 0))
  const indexedReferenceLine = isIndexed && (
    <ReferenceLine y={100} stroke={dark ? '#71717a' : '#a1a1aa'} strokeDasharray="4 3" />
  )

  if (chart.type === 'bar') {
    // "stacked" is set by the AI only when there are exactly 2 numeric
    // series that are genuine parts of a whole (e.g. new vs returning
    // customers) — Recharts stacks any Bars sharing the same stackId.
    const stacked = !!chart.stacked
    // Built as a real array and filtered to actual elements before
    // rendering — several Recharts versions internally re-walk their own
    // children and assume every entry has a real .type, which a bare
    // `{isMulti && <Legend/>}` violates the instant isMulti is false (that
    // evaluates to the literal value false, not "nothing"). Filtering here
    // guarantees Recharts never sees anything but real elements, regardless
    // of which conditional below is the one actually responsible.
    const barChildren = [
      isMulti ? <Legend key="legend" wrapperStyle={{ fontSize: 11, opacity: 0.6 }} /> : null,
      ...dataKeys.map((key, i) => (
        <Bar
          key={key}
          dataKey={key}
          stackId={stacked ? 'stack' : undefined}
          fill={colors[i % colors.length]}
          radius={stacked && i < dataKeys.length - 1 ? undefined : [4, 4, 0, 0]}
          name={key.replace(/_/g, ' ')}
        />
      )),
    ].filter(Boolean)
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis tick={tickStyle(dark)} domain={yDomain} allowDecimals={!isIndexed} />
          <Tooltip contentStyle={tooltipStyle(dark)} />
          {indexedReferenceLine}
          {barChildren}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'line') {
    const lineChildren = [
      isMulti ? <Legend key="legend" wrapperStyle={{ fontSize: 11, opacity: 0.6 }} /> : null,
      ...dataKeys.map((key, i) => (
        <Line
          key={key}
          dataKey={key}
          stroke={colors[i % colors.length]}
          strokeWidth={2}
          dot={false}
          name={key.replace(/_/g, ' ')}
        />
      )),
    ].filter(Boolean)
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis tick={tickStyle(dark)} domain={yDomain} allowDecimals={!isIndexed} />
          <Tooltip contentStyle={tooltipStyle(dark)} />
          {indexedReferenceLine}
          {lineChildren}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'area') {
    const areaChildren = [
      isMulti ? <Legend key="legend" wrapperStyle={{ fontSize: 11, opacity: 0.6 }} /> : null,
      ...dataKeys.map((key, i) => (
        <Area
          key={key}
          dataKey={key}
          stroke={colors[i % colors.length]}
          fill={`${colors[i % colors.length]}33`}
          strokeWidth={2}
          name={key.replace(/_/g, ' ')}
        />
      )),
    ].filter(Boolean)
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis tick={tickStyle(dark)} domain={yDomain} allowDecimals={!isIndexed} />
          <Tooltip contentStyle={tooltipStyle(dark)} />
          {indexedReferenceLine}
          {areaChildren}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'pie')
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chart.data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={height * 0.36}
          >
            {(chart.data || []).map((_: any, i: number) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle(dark)} />
          <Legend wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />
        </PieChart>
      </ResponsiveContainer>
    )

  // Two metrics on very different scales shown together — e.g. revenue bars
  // (tens of thousands) with a conversion-rate line (single digits). First
  // numeric key renders as the bar, second as the line on its own right-hand
  // axis so it stays visible regardless of scale difference.
  if (chart.type === 'composed') {
    const [barKey, lineKey] = dataKeys
    // Same filter-to-real-elements treatment as above — barKey/lineKey are
    // strings or undefined, so `{barKey && <Bar/>}` can also hand Recharts
    // a bare `undefined` as a child when a chart only has one series.
    const composedChildren = [
      <Legend key="legend" wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />,
      barKey ? (
        <Bar
          key="bar"
          yAxisId="left"
          dataKey={barKey}
          fill={colors[0]}
          radius={[4, 4, 0, 0]}
          name={barKey.replace(/_/g, ' ')}
        />
      ) : null,
      lineKey ? (
        <Line
          key="line"
          yAxisId="right"
          dataKey={lineKey}
          stroke={colors[1 % colors.length]}
          strokeWidth={2}
          dot={false}
          name={lineKey.replace(/_/g, ' ')}
        />
      ) : null,
    ].filter(Boolean)
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis yAxisId="left" tick={tickStyle(dark)} />
          {lineKey && <YAxis yAxisId="right" orientation="right" tick={tickStyle(dark)} />}
          <Tooltip contentStyle={tooltipStyle(dark)} />
          {composedChildren}
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  // Proportional breakdown — a cleaner alternative to pie once there are
  // enough categories that pie slices would get too thin to read.
  if (chart.type === 'treemap')
    return (
      <ResponsiveContainer width="100%" height={height}>
        <Treemap
          data={chart.data}
          dataKey="value"
          nameKey="name"
          stroke={dark ? '#18181b' : '#ffffff'}
          content={<TreemapCell colors={colors} />}
        />
      </ResponsiveContainer>
    )

  // Sequential drop-off across ordered stages — data should already be
  // sorted largest to smallest for the funnel shape to render correctly.
  if (chart.type === 'funnel')
    return (
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart>
          <Tooltip contentStyle={tooltipStyle(dark)} />
          <Funnel data={chart.data} dataKey="value" nameKey="name" isAnimationActive>
            {(chart.data || []).map((_: any, i: number) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
            <LabelList
              dataKey="name"
              position="right"
              fill={dark ? '#e4e4e7' : '#3f3f46'}
              stroke="none"
              fontSize={11}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    )

  // Relationship between two metrics. Data shape is [{x, y}] rather than
  // [{name, value}] — points should come directly from the data summary's
  // scatterPairs, never invented by the model.
  if (chart.type === 'scatter')
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="x" type="number" name={chart.x_label || 'x'} tick={tickStyle(dark)} />
          <YAxis dataKey="y" type="number" name={chart.y_label || 'y'} tick={tickStyle(dark)} />
          <Tooltip contentStyle={tooltipStyle(dark)} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={chart.data} fill={colors[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    )

  return null
}
