'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import IntelligenceSubNav from '@/components/IntelligenceSubNav'
import ChartRenderer from '@/components/ChartRenderer'
import { useTheme } from '@/hooks/useTheme'
import { TrendingUp, TrendingDown, Minus, X, Info, Scale, Building2 } from 'lucide-react'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'

// The single-metric detail sparkline below uses the shared ChartRenderer
// (same component the generated decks use) for visual consistency. The
// cross-metric comparison further down stays hand-rolled with raw Recharts
// instead, same as trends/page.tsx does for its own "Compare Topics"
// feature — ChartRenderer detects series keys from data's first row only,
// and metrics can start on different dates, so a metric missing from the
// earliest shared date would silently disappear from the whole chart
// rather than just its missing points. Hand-rolling keeps the explicit
// per-metric color mapping and connectNulls behavior sparse dates need.

const COMPARE_COLORS = ['#3b82f6', '#10b981', '#f59e0b']
const MAX_COMPARE_METRICS = 3

interface MetricSummary {
  metricKey: string
  metricLabel: string
  mode: string
  latestValue: number
  latestAt: string
  deltaPct: number | null
  contributionCount: number
}

interface HistoryPoint {
  value: number
  mode: string
  contributed_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────

function TrendArrow({ delta }: { delta: number | null }) {
  if (delta === null) return <Minus size={13} className="text-zinc-400" />
  if (delta > 2) return <TrendingUp size={13} className="text-emerald-500" />
  if (delta < -2) return <TrendingDown size={13} className="text-red-400" />
  return <Minus size={13} className="text-zinc-400" />
}

function deltaColor(delta: number | null): string {
  if (delta === null) return 'text-zinc-400'
  if (delta > 2) return 'text-emerald-500'
  if (delta < -2) return 'text-red-400'
  return 'text-zinc-400'
}

// "growth" mode metrics are already percentages (e.g. period-over-period
// change); "level" mode metrics are raw counts/amounts and get the same
// K/M abbreviation trends/page.tsx uses for raw signal magnitudes.
function formatValue(value: number, mode: string): string {
  if (mode === 'growth') {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  }
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function formatDateTick(iso: string): string {
  return iso.slice(5, 10) // MM-DD
}

// ── Main page ──────────────────────────────────────────────────────────

export default function CompanyBenchmarksPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [companyKey, setCompanyKey] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MetricSummary[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const [detailHistory, setDetailHistory] = useState<HistoryPoint[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [comparisonData, setComparisonData] = useState<Record<string, any>[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonLoading, setComparisonLoading] = useState(false)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  useEffect(() => {
    setLoading(true)
    fetch('/api/company-benchmarks')
      .then((res) => res.json())
      .then((json) => {
        setCompanyKey(json.companyKey ?? null)
        setMetrics(json.metrics || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const openMetricDetail = (metricKey: string) => {
    setSelectedMetric(metricKey)
    setDetailLoading(true)
    fetch(`/api/company-benchmarks?metric=${encodeURIComponent(metricKey)}`)
      .then((res) => res.json())
      .then((json) => {
        setDetailHistory(json.history || [])
        setDetailLoading(false)
      })
      .catch(() => setDetailLoading(false))
  }

  const toggleCompareSelection = (metricKey: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCompareSelection((prev) => {
      if (prev.includes(metricKey)) return prev.filter((m) => m !== metricKey)
      if (prev.length >= MAX_COMPARE_METRICS) return prev
      return [...prev, metricKey]
    })
  }

  // Indexes each metric to its own first value = 100, since raw units
  // differ across metrics (revenue and a conversion rate can't share a
  // y-axis otherwise). Same overlay idea as Compare Topics in User
  // Behaviors, just normalized differently since composite scores there
  // are already 0-100 by construction.
  const openComparison = () => {
    if (compareSelection.length < 2) return
    setShowComparison(true)
    setComparisonLoading(true)

    Promise.all(
      compareSelection.map((metricKey) =>
        fetch(`/api/company-benchmarks?metric=${encodeURIComponent(metricKey)}`).then((res) =>
          res.json()
        )
      )
    ).then((results) => {
      const byDate = new Map<string, Record<string, any>>()
      results.forEach((res, i) => {
        const metricKey = compareSelection[i]
        const history: HistoryPoint[] = res.history || []
        if (history.length === 0) return
        const base = history[0].value || 1
        for (const point of history) {
          const dateKey = point.contributed_at.slice(0, 10)
          const indexed = (point.value / base) * 100
          const existing = byDate.get(dateKey) || { dateKey }
          existing[metricKey] = Math.round(indexed * 10) / 10
          byDate.set(dateKey, existing)
        }
      })
      setComparisonData(
        Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      )
      setComparisonLoading(false)
    })
  }

  const selectedRow = useMemo(
    () => metrics.find((m) => m.metricKey === selectedMetric) || null,
    [metrics, selectedMetric]
  )

  const metricLabelByKey = useMemo(() => {
    const map = new Map<string, string>()
    metrics.forEach((m) => map.set(m.metricKey, m.metricLabel))
    return map
  }, [metrics])

  // ── Token-based styles ────────────────────────────────────────────────
  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <IntelligenceSubNav />

      <main className="pt-8 px-6 max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="mt-8 mb-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold mb-1 tracking-tight">Company Benchmarks</h1>
            <p className={`text-sm ${muted}`}>
              Your own company's metrics over time, recorded automatically each time you run an
              analysis. Distinct from Crowd Insights, which pools anonymized data across companies.
            </p>
          </div>
          {metrics.length >= 2 && (
            <button
              onClick={() => {
                setCompareMode(!compareMode)
                setCompareSelection([])
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors shrink-0 ${
                compareMode
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                  : dark
                    ? 'border-white/[0.08] text-white/50 hover:bg-white/[0.04]'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <Scale size={13} />
              {compareMode ? 'Cancel Compare' : 'Compare Metrics'}
            </button>
          )}
        </div>

        {/* Info banner */}
        <div
          className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border mb-6 ${dark ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
        >
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p
            className={`text-xs leading-relaxed ${dark ? 'text-blue-200/70' : 'text-blue-900/70'}`}
          >
            Each analysis you run adds a new timestamped data point per metric, so this builds into
            a real trend line over time rather than a single running average. Grouped by your
            company's email domain, not shared or visible to anyone outside your organization.
          </p>
        </div>

        {/* Compare mode banner */}
        {compareMode && (
          <div
            className={`flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg border ${dark ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
          >
            <p className={`text-xs ${dark ? 'text-blue-200/70' : 'text-blue-900/70'}`}>
              Select 2-{MAX_COMPARE_METRICS} metrics to overlay, indexed to each metric's first
              value ({compareSelection.length}/{MAX_COMPARE_METRICS} selected)
            </p>
            <button
              onClick={openComparison}
              disabled={compareSelection.length < 2}
              className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-400 transition-colors disabled:opacity-40 shrink-0"
            >
              View Comparison
            </button>
          </div>
        )}

        {/* Metric grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : companyKey === null ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <Building2 size={20} className={`mx-auto mb-3 ${muted}`} />
            <p className={`text-sm ${muted}`}>
              Company Benchmarks group history by your company's email domain, so personal email
              providers (Gmail, Yahoo, and similar) aren't eligible for grouping. Sign in with a
              company email to start building a benchmark history.
            </p>
          </div>
        ) : metrics.length === 0 ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <p className={`text-sm ${muted}`}>
              No benchmark history yet, run an analysis and it'll show up here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics.map((m) => {
              const isSelected = compareSelection.includes(m.metricKey)
              return (
                <button
                  key={m.metricKey}
                  onClick={(e) =>
                    compareMode
                      ? toggleCompareSelection(m.metricKey, e)
                      : openMetricDetail(m.metricKey)
                  }
                  className={`text-left p-4 rounded-xl border transition-all hover:border-blue-500/40 hover:bg-blue-500/[0.03] ${
                    isSelected ? 'border-blue-500 bg-blue-500/8' : card
                  }`}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <p className="text-sm font-semibold">{m.metricLabel}</p>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${dark ? 'bg-white/5 text-white/35' : 'bg-zinc-100 text-zinc-500'}`}
                    >
                      {m.contributionCount} point{m.contributionCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-black leading-none">
                      {formatValue(m.latestValue, m.mode)}
                    </span>
                    <span
                      className={`flex items-center gap-1 text-xs font-medium mb-0.5 ${deltaColor(m.deltaPct)}`}
                    >
                      <TrendArrow delta={m.deltaPct} />
                      {m.deltaPct !== null ? `${m.deltaPct > 0 ? '+' : ''}${m.deltaPct}%` : 'New'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Metric detail panel */}
        {selectedMetric && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setSelectedMetric(null)}
            />
            <div className={`relative w-full max-w-lg p-6 rounded-2xl border shadow-2xl ${card}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">
                    {selectedRow?.metricLabel || selectedMetric}
                  </h3>
                  {selectedRow && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-3xl font-black">
                        {formatValue(selectedRow.latestValue, selectedRow.mode)}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-sm font-medium ${deltaColor(selectedRow.deltaPct)}`}
                      >
                        <TrendArrow delta={selectedRow.deltaPct} />
                        {selectedRow.deltaPct !== null
                          ? `${selectedRow.deltaPct > 0 ? '+' : ''}${selectedRow.deltaPct}% vs. prior submission`
                          : 'First data point'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedMetric(null)}
                  className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/[0.05] text-white/40' : 'hover:bg-zinc-100 text-zinc-500'}`}
                >
                  <X size={16} />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailHistory.length >= 2 ? (
                <ChartRenderer
                  chart={{
                    type: 'line',
                    data: detailHistory.map((h) => ({
                      name: formatDateTick(h.contributed_at),
                      value: h.value,
                    })),
                  }}
                  colors={['#3b82f6']}
                  height={160}
                  dark={dark}
                />
              ) : (
                <p className={`text-xs ${muted}`}>
                  Not enough history yet, this metric needs at least one more analysis run before a
                  trend line is meaningful.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cross-metric comparison modal */}
        {showComparison && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowComparison(false)}
            />
            <div className={`relative w-full max-w-2xl p-6 rounded-2xl border shadow-2xl ${card}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">Compare Metrics</h3>
                  <p className={`text-xs mt-0.5 ${muted}`}>
                    Indexed to each metric's first value (100 = starting point)
                  </p>
                </div>
                <button
                  onClick={() => setShowComparison(false)}
                  className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/[0.05] text-white/40' : 'hover:bg-zinc-100 text-zinc-500'}`}
                >
                  <X size={16} />
                </button>
              </div>

              {comparisonLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : comparisonData.length < 2 ? (
                <p className={`text-xs ${muted}`}>
                  Not enough shared history yet across these metrics to compare.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonData}>
                      <XAxis
                        dataKey="dateKey"
                        tick={{ fontSize: 10, fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a' }}
                        tickFormatter={(v) => v.slice(5)}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a' }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: dark ? '#111118' : '#fff',
                          border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e4e4e7',
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(value) => metricLabelByKey.get(value) || value}
                      />
                      {compareSelection.map((metricKey, i) => (
                        <Line
                          key={metricKey}
                          type="monotone"
                          dataKey={metricKey}
                          stroke={COMPARE_COLORS[i]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
