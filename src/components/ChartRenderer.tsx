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

  if (chart.type === 'bar') {
    // "stacked" is set by the AI only when there are exactly 2 numeric
    // series that are genuine parts of a whole (e.g. new vs returning
    // customers) — Recharts stacks any Bars sharing the same stackId.
    const stacked = !!chart.stacked
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis tick={tickStyle(dark)} />
          <Tooltip contentStyle={tooltipStyle(dark)} />
          {isMulti && <Legend wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />}
          {dataKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId={stacked ? 'stack' : undefined}
              fill={colors[i % colors.length]}
              radius={stacked && i < dataKeys.length - 1 ? undefined : [4, 4, 0, 0]}
              name={key.replace(/_/g, ' ')}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (chart.type === 'line')
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis tick={tickStyle(dark)} />
          <Tooltip contentStyle={tooltipStyle(dark)} />
          {isMulti && <Legend wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />}
          {dataKeys.map((key, i) => (
            <Line
              key={key}
              dataKey={key}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={false}
              name={key.replace(/_/g, ' ')}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )

  if (chart.type === 'area')
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis tick={tickStyle(dark)} />
          <Tooltip contentStyle={tooltipStyle(dark)} />
          {isMulti && <Legend wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />}
          {dataKeys.map((key, i) => (
            <Area
              key={key}
              dataKey={key}
              stroke={colors[i % colors.length]}
              fill={`${colors[i % colors.length]}33`}
              strokeWidth={2}
              name={key.replace(/_/g, ' ')}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )

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
            {chart.data?.map((_: any, i: number) => (
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
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart {...props}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
          <XAxis dataKey="name" tick={tickStyle(dark)} />
          <YAxis yAxisId="left" tick={tickStyle(dark)} />
          {lineKey && <YAxis yAxisId="right" orientation="right" tick={tickStyle(dark)} />}
          <Tooltip contentStyle={tooltipStyle(dark)} />
          <Legend wrapperStyle={{ fontSize: 11, opacity: 0.6 }} />
          {barKey && (
            <Bar
              yAxisId="left"
              dataKey={barKey}
              fill={colors[0]}
              radius={[4, 4, 0, 0]}
              name={barKey.replace(/_/g, ' ')}
            />
          )}
          {lineKey && (
            <Line
              yAxisId="right"
              dataKey={lineKey}
              stroke={colors[1 % colors.length]}
              strokeWidth={2}
              dot={false}
              name={lineKey.replace(/_/g, ' ')}
            />
          )}
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
            {chart.data?.map((_: any, i: number) => (
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
