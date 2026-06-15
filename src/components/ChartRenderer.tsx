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
  Cell,
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

export default function ChartRenderer({
  chart,
  colors,
  height = 200,
  dark = true,
}: ChartRendererProps) {
  const dataKeys = getDataKeys(chart.data || [])
  const isMulti = dataKeys.length > 1
  const props = { data: chart.data, margin: { top: 5, right: 20, left: 10, bottom: 5 } }
  if (chart.type === 'bar')
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
              fill={colors[i % colors.length]}
              radius={[4, 4, 0, 0]}
              name={key.replace(/_/g, ' ')}
            />
          ))}
          {!isMulti && chart.data?.map((_: any, i: number) => null)}
        </BarChart>
      </ResponsiveContainer>
    )

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

  return null
}
