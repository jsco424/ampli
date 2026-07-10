'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Users,
  Lock,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  RefreshCw,
  Download,
  ShoppingBag,
  HeartPulse,
  Cpu,
  DollarSign,
  Megaphone,
  GraduationCap,
  Factory,
  Hotel,
  Building2,
  Tv,
  Zap,
  HandHeart,
  Truck,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import USStateHeatmap from '@/components/USStateHeatmap'

// Single-color icon components instead of emoji — emoji render
// inconsistently across OS/browsers (different glyph styles, sometimes
// multi-color) and clash with the dark, single-accent UI. Rendered with
// the industry accent color, see render call sites below. Typed as
// React.ComponentType rather than importing LucideIcon's type separately —
// keeps this file's imports value-only, which the artifact preview's static
// checker is strict about.
const INDUSTRY_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; style?: React.CSSProperties }>
> = {
  Retail: ShoppingBag,
  Healthcare: HeartPulse,
  Technology: Cpu,
  Finance: DollarSign,
  Marketing: Megaphone,
  Education: GraduationCap,
  Manufacturing: Factory,
  Hospitality: Hotel,
  'Real Estate': Building2,
  Media: Tv,
  Energy: Zap,
  Nonprofit: HandHeart,
  Logistics: Truck,
  Other: BarChart3,
}

const INDUSTRY_COLORS: Record<string, string> = {
  Retail: '#3b82f6',
  Healthcare: '#10b981',
  Technology: '#8b5cf6',
  Finance: '#f59e0b',
  Marketing: '#ef4444',
  Education: '#06b6d4',
  Manufacturing: '#84cc16',
  Hospitality: '#f97316',
  'Real Estate': '#ec4899',
  Media: '#a855f7',
  Energy: '#eab308',
  Nonprofit: '#14b8a6',
  Logistics: '#6366f1',
  Other: '#94a3b8',
}

// Mirrors the same heuristic /api/crowd uses server-side: rate-like metrics
// (conversion, churn, ROAS, etc.) were stored as their average LEVEL; absolute
// quantities (revenue, customers, spend) were stored as GROWTH %. Canonical
// keys were deliberately chosen to preserve this signal, so re-deriving mode
// from the stored key here matches what was actually computed at write time.
// Kept in sync with the abbreviation set in dataSummary.ts / crowd/route.ts —
// CTR/CPC/CPA/CPM/CPL/ROI/ROAS/ARPU/CVR/CAC don't contain "rate"/"ratio" as a
// literal substring, so the regex alone would miss them.
const RATE_LIKE_ABBREVIATIONS = new Set([
  'ctr',
  'cpc',
  'cpa',
  'cpm',
  'cpl',
  'roi',
  'roas',
  'arpu',
  'cvr',
  'cac',
])
const RATE_LIKE_PATTERN = /rate|ratio|margin|percent|roas|churn|retention|engagement/i

function isRateLikeKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[\s_-]+/g, '')
  if (RATE_LIKE_ABBREVIATIONS.has(normalized)) return true
  return RATE_LIKE_PATTERN.test(key)
}

const FIXED_BUCKET_KEYS = ['revenue', 'conversion_rate', 'customers']

function getMetricValue(industry: any, key: string): number | null {
  if (key === 'avg_revenue_growth') return industry.metrics?.avg_revenue_growth ?? null
  if (key === 'avg_conversion_rate') return industry.metrics?.avg_conversion_rate ?? null
  if (key === 'avg_customer_growth') return industry.metrics?.avg_customer_growth ?? null
  return industry.metrics?.extendedMetrics?.[key]?.avg ?? null
}

function getMetricSampleSize(industry: any, key: string): number | null {
  if (key === 'avg_revenue_growth') return industry.metrics?.avg_revenue_growth_n ?? null
  if (key === 'avg_conversion_rate') return industry.metrics?.avg_conversion_rate_n ?? null
  if (key === 'avg_customer_growth') return industry.metrics?.avg_customer_growth_n ?? null
  return industry.metrics?.extendedMetrics?.[key]?.n ?? null
}

function isGrowthMetric(key: string): boolean {
  if (key === 'avg_revenue_growth' || key === 'avg_customer_growth') return true
  if (key === 'avg_conversion_rate') return false
  return !isRateLikeKey(key)
}

// ── Pooled stat resolution ───────────────────────────────────────────────────
// Mirrors PooledCategoryMetric in /api/crowd/route.ts exactly — raw
// accumulators, never a pre-divided number. The displayed value is derived
// HERE, at read time, from true combined totals — this is what makes the
// pooled index/rate mathematically correct instead of an average-of-averages.
// See the route file's doc comment for why that distinction matters (it's
// the same reason you can't average two batting averages by games played
// and get the real combined one).
interface PooledCategoryMetric {
  mode: 'rate' | 'index'
  label: string
  sumOfMetricInCategory: number
  sumOfRowCountInCategory: number
  sumOfMetricGrandTotal: number
  sumOfTotalRowCount: number
  contributionCount: number
}

interface ResolvedStat {
  mode: 'rate' | 'index'
  label: string
  value: number
  // Actual rows behind this number — the real confidence signal (vs. just
  // "how many contributors mentioned this category"), matching the vision
  // doc's "Confidence 98% / 48,231 campaigns" pattern.
  sampleRowCount: number
  contributionCount: number
}

function resolvePooledStat(stat: PooledCategoryMetric): ResolvedStat | null {
  if (stat.mode === 'rate') {
    // True weighted mean: sum of values / total rows — NOT an average of
    // each contribution's own average.
    if (stat.sumOfRowCountInCategory === 0) return null
    const value = round2(stat.sumOfMetricInCategory / stat.sumOfRowCountInCategory) as number
    return {
      mode: 'rate',
      label: stat.label,
      value,
      sampleRowCount: stat.sumOfRowCountInCategory,
      contributionCount: stat.contributionCount,
    }
  }
  // Index mode: (category's share of combined metric total) / (category's
  // share of combined row count) * 100, computed from TRUE pooled sums.
  if (stat.sumOfMetricGrandTotal === 0 || stat.sumOfTotalRowCount === 0) return null
  const shareOfMetric = stat.sumOfMetricInCategory / stat.sumOfMetricGrandTotal
  const shareOfRows = stat.sumOfRowCountInCategory / stat.sumOfTotalRowCount
  if (shareOfRows === 0) return null
  const value = Math.round((shareOfMetric / shareOfRows) * 100)
  return {
    mode: 'index',
    label: stat.label,
    value,
    sampleRowCount: stat.sumOfRowCountInCategory,
    contributionCount: stat.contributionCount,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Builds a simple CSV export of everything currently visible for an
// industry — headline metrics, additional metrics, dimension breakdowns,
// trends, and insights — entirely client-side, no backend call needed.
function downloadIndustryCSV(industry: any) {
  const lines: string[] = []
  lines.push(`Industry,${industry.industry}`)
  lines.push(`Contributions,${industry.contribution_count}`)
  lines.push('')
  lines.push('Metric,Average,Sample Size')
  lines.push(
    `Revenue Growth,${industry.metrics?.avg_revenue_growth ?? ''},${industry.metrics?.avg_revenue_growth_n ?? ''}`
  )
  lines.push(
    `Conversion Rate,${industry.metrics?.avg_conversion_rate ?? ''},${industry.metrics?.avg_conversion_rate_n ?? ''}`
  )
  lines.push(
    `Customer Growth,${industry.metrics?.avg_customer_growth ?? ''},${industry.metrics?.avg_customer_growth_n ?? ''}`
  )
  for (const [key, m] of Object.entries(industry.metrics?.extendedMetrics || {})) {
    if (FIXED_BUCKET_KEYS.includes(key)) continue
    lines.push(`${(m as any).label},${(m as any).avg},${(m as any).n}`)
  }
  for (const [dimName, dimData] of Object.entries(industry.metrics?.dimensionBreakdowns || {})) {
    const categories = (dimData as any) || {}
    lines.push('')
    lines.push(`${dimName} breakdown`)
    lines.push('Category,Share %,Rows,Sample Size')
    for (const [catName, catStats] of Object.entries(categories) as [string, any][]) {
      const sharePct = catStats.totalRowCount
        ? round2((catStats.totalRowCount / catStats.totalRowCount) * 100)
        : ''
      lines.push(
        `"${catName}",,${catStats.totalRowCount ?? ''},${catStats.contributionCount ?? ''}`
      )
      for (const [, mStat] of Object.entries(catStats.metrics || {}) as [
        string,
        PooledCategoryMetric,
      ][]) {
        const resolved = resolvePooledStat(mStat)
        if (!resolved) continue
        const label = resolved.mode === 'index' ? `${resolved.label} index` : resolved.label
        lines.push(
          `"${catName} — ${label}",${resolved.value},${resolved.sampleRowCount},${resolved.contributionCount}`
        )
      }
    }
  }
  if (industry.metrics?.top_trends?.length) {
    lines.push('')
    lines.push('Observed Trends')
    for (const t of industry.metrics.top_trends) lines.push(`"${String(t).replace(/"/g, '""')}"`)
  }
  if (industry.metrics?.key_insights?.length) {
    lines.push('')
    lines.push('Key Insights')
    for (const ins of industry.metrics.key_insights)
      lines.push(`"${String(ins).replace(/"/g, '""')}"`)
  }

  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${String(industry.industry).replace(/\s+/g, '_')}_benchmark.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function CrowdInsightsPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [industries, setIndustries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hasOptedIn, setHasOptedIn] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [comparisonMetric, setComparisonMetric] = useState('avg_conversion_rate')
  const [mapMetric, setMapMetric] = useState('__share__')

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  useEffect(() => {
    if (!user) return

    supabase
      .from('projects')
      .select('id')
      .eq('user_id', user.id)
      .eq('opt_in_crowd', true)
      .limit(1)
      .then(({ data }) => setHasOptedIn((data?.length ?? 0) > 0))

    supabase
      .from('crowd_insights')
      .select('*')
      .order('contribution_count', { ascending: false })
      .then(({ data }) => {
        setIndustries(data || [])
        if (data && data.length > 0) setSelected(data[0])
        setLoading(false)
      })
  }, [user])

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const subtler = dark ? 'text-zinc-500' : 'text-zinc-400'

  // Union of every metric available across ALL industries (the 3 original
  // fixed buckets plus anything in extendedMetrics), so the comparison
  // chart's dropdown works across the full captured vocabulary. This is
  // ALWAYS computed regardless of how many industries currently have data
  // for the active comparisonMetric — the dropdown must stay populated even
  // when the chart itself can't render (see chartIndustries below).
  const metricOptions: [string, string][] = (() => {
    const map = new Map<string, string>()
    map.set('avg_revenue_growth', 'Revenue Growth')
    map.set('avg_conversion_rate', 'Conversion Rate')
    map.set('avg_customer_growth', 'Customer Growth')
    for (const ind of industries) {
      for (const [key, val] of Object.entries(ind.metrics?.extendedMetrics || {})) {
        if (!map.has(key)) map.set(key, (val as any).label || key)
      }
    }
    return Array.from(map.entries())
  })()

  const comparisonLabel =
    metricOptions.find(([k]) => k === comparisonMetric)?.[1] || comparisonMetric

  const chartIndustries = industries.filter((i) => getMetricValue(i, comparisonMetric) !== null)

  // Shows the selected industry plus its closest-performing peers on the
  // chosen metric — not the full ranked list. With a handful of industries
  // today this naturally shows everyone, but it's built to scale: once
  // there are 20 industries, "Tech is #1" isn't a useful comparison if the
  // user's own industry sits in a totally different performance tier — what
  // actually matters is who's nearby.
  const PEER_COMPARISON_COUNT = 5
  const selectedValue = selected ? getMetricValue(selected, comparisonMetric) : null
  const peerIndustries =
    selectedValue === null
      ? chartIndustries
      : [...chartIndustries]
          .sort((a, b) => {
            const diffA = Math.abs((getMetricValue(a, comparisonMetric) ?? 0) - selectedValue)
            const diffB = Math.abs((getMetricValue(b, comparisonMetric) ?? 0) - selectedValue)
            return diffA - diffB
          })
          .slice(0, PEER_COMPARISON_COUNT)
          .sort(
            (a, b) =>
              (getMetricValue(a, comparisonMetric) ?? 0) -
              (getMetricValue(b, comparisonMetric) ?? 0)
          )

  // Raw pooled accumulators for the selected industry's state breakdown.
  // Resolved into displayable {value, sampleRowCount} pairs below via
  // resolvePooledStat — NEVER read a stored average/index directly, since
  // none is stored anymore (see PooledCategoryMetric).
  const stateBreakdown = selected?.metrics?.dimensionBreakdowns?.state as
    | Record<
        string,
        {
          totalRowCount: number
          contributionCount: number
          metrics: Record<string, PooledCategoryMetric>
        }
      >
    | undefined

  const stateMetricOptions: [string, string, 'share' | 'rate' | 'index'][] = (() => {
    const map = new Map<string, [string, 'share' | 'rate' | 'index']>()
    map.set('__share__', ['Share of Activity', 'share'])
    if (stateBreakdown) {
      for (const stats of Object.values(stateBreakdown)) {
        for (const [mKey, mData] of Object.entries(stats.metrics || {})) {
          if (!map.has(mKey)) map.set(mKey, [mData.label || mKey, mData.mode])
        }
      }
    }
    return Array.from(map.entries()).map(([key, [label, mode]]) => [key, label, mode])
  })()

  const activeStateOption = stateMetricOptions.find(([k]) => k === mapMetric)
  const mapLabel = activeStateOption?.[1] || mapMetric
  const mapStatMode = activeStateOption?.[2] || 'share'
  const mapSuffix = mapStatMode === 'index' ? '' : '%'
  const mapIsIndex = mapStatMode === 'index'

  // Grand total of rows across every state, for share-of-activity mode —
  // computed from the same totalRowCount accumulators, so "share" is a true
  // pooled share (rows in this state / rows in all states) rather than an
  // average of per-contributor percentages.
  const stateGrandTotalRows = stateBreakdown
    ? Object.values(stateBreakdown).reduce((sum, s) => sum + s.totalRowCount, 0)
    : 0

  const mapData: Record<string, { value: number; n: number }> = (() => {
    const result: Record<string, { value: number; n: number }> = {}
    if (!stateBreakdown) return result
    for (const [stateName, stats] of Object.entries(stateBreakdown)) {
      if (mapMetric === '__share__') {
        if (stateGrandTotalRows === 0) continue
        result[stateName] = {
          value: round2((stats.totalRowCount / stateGrandTotalRows) * 100),
          n: stats.totalRowCount,
        }
      } else if (stats.metrics?.[mapMetric]) {
        const resolved = resolvePooledStat(stats.metrics[mapMetric])
        if (resolved) result[stateName] = { value: resolved.value, n: resolved.sampleRowCount }
      }
    }
    return result
  })()

  // For index mode, "top" means furthest over-indexed (highest number) —
  // sorting by raw value still does the right thing there. Share/rate modes
  // also sort fine by raw value (higher share or higher rate is "top").
  const top5States = Object.entries(mapData)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 5)

  if (!isLoaded || !user) return null

  // Locked state — user has never opted in
  if (!hasOptedIn && !loading) {
    return (
      <div className={`min-h-screen ${base}`}>
        <Navbar />
        <main className="pt-24 px-6 max-w-lg mx-auto text-center">
          <div className={`p-10 rounded-2xl border ${card}`}>
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
              <Lock size={24} className="text-purple-500" />
            </div>
            <h1 className="text-xl font-bold mb-2">Crowd Insights Locked</h1>
            <p className={`text-sm leading-relaxed mb-6 ${subtle}`}>
              Crowd Insights is a shared intelligence pool built from anonymized contributions. To
              access it, contribute at least one dataset first — this keeps the pool fair and
              valuable for everyone.
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
            >
              <Users size={15} />
              Upload & Opt In to Unlock
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="mt-6 mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Crowd Insights</h1>
            <p className={`text-sm ${subtle}`}>
              Anonymized industry aggregates built from{' '}
              {industries.reduce((sum, i) => sum + i.contribution_count, 0)} contributions across{' '}
              {industries.length} industries
            </p>
          </div>
          <div
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${dark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}
          >
            <RefreshCw size={11} />
            Updated in real-time
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : industries.length === 0 ? (
          <div className={`p-10 rounded-2xl border text-center ${card}`}>
            <p className={`text-sm ${subtle}`}>
              No crowd data yet. Be the first to contribute by opting in on your next upload.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Industry List */}
            <div className="lg:col-span-1 space-y-2">
              {industries.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => {
                    setSelected(ind)
                    setMapMetric('__share__')
                  }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all
                    ${
                      selected?.id === ind.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : dark
                          ? `border-zinc-800 hover:border-zinc-700 ${card}`
                          : `border-zinc-200 hover:border-zinc-300 ${card}`
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {(() => {
                      const Icon = INDUSTRY_ICONS[ind.industry] || BarChart3
                      return (
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${INDUSTRY_COLORS[ind.industry] || '#94a3b8'}1a` }}
                        >
                          <Icon
                            size={17}
                            style={{ color: INDUSTRY_COLORS[ind.industry] || '#94a3b8' }}
                          />
                        </span>
                      )
                    })()}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{ind.industry}</p>
                      <p className={`text-xs ${subtle}`}>
                        {ind.contribution_count} contribution
                        {ind.contribution_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: INDUSTRY_COLORS[ind.industry] || '#94a3b8' }}
                    />
                  </div>
                </button>
              ))}
            </div>

            {/* Industry Detail */}
            {selected && (
              <div className="lg:col-span-2 space-y-4">
                {/* Header + headline metrics */}
                <div className={`p-5 rounded-2xl border ${card}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const Icon = INDUSTRY_ICONS[selected.industry] || BarChart3
                        return (
                          <span
                            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                            style={{
                              background: `${INDUSTRY_COLORS[selected.industry] || '#94a3b8'}1a`,
                            }}
                          >
                            <Icon
                              size={22}
                              style={{ color: INDUSTRY_COLORS[selected.industry] || '#94a3b8' }}
                            />
                          </span>
                        )
                      })()}
                      <div>
                        <h2 className="text-xl font-bold">{selected.industry}</h2>
                        <p className={`text-xs ${subtle}`}>
                          Aggregate from {selected.contribution_count} anonymous contribution
                          {selected.contribution_count !== 1 ? 's' : ''}
                          {' · '}Last updated {new Date(selected.last_updated).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadIndustryCSV(selected)}
                      title="Download this industry's benchmark data as CSV"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shrink-0 transition-colors ${dark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'}`}
                    >
                      <Download size={12} /> Download
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'avg_revenue_growth', label: 'Avg Revenue Growth' },
                      { key: 'avg_conversion_rate', label: 'Avg Conversion Rate' },
                      { key: 'avg_customer_growth', label: 'Avg Customer Growth' },
                    ].map(({ key, label }) => {
                      const value = getMetricValue(selected, key)
                      const n = getMetricSampleSize(selected, key)
                      return (
                        <div
                          key={key}
                          className={`p-3 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}
                        >
                          <p className={`text-xs mb-1 ${subtle}`}>{label}</p>
                          <p className="text-lg font-bold">{value !== null ? `${value}%` : '—'}</p>
                          {n !== null && <p className={`text-[10px] mt-0.5 ${subtler}`}>n={n}</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Additional Benchmarks */}
                {Object.entries(selected.metrics?.extendedMetrics || {}).filter(
                  ([k]) => !FIXED_BUCKET_KEYS.includes(k)
                ).length > 0 && (
                  <div className={`p-5 rounded-2xl border ${card}`}>
                    <h3 className="font-semibold text-sm mb-1">Additional Benchmarks</h3>
                    <p className={`text-xs mb-4 ${subtle}`}>
                      Other metrics detected across contributions to this industry
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(selected.metrics.extendedMetrics)
                        .filter(([k]) => !FIXED_BUCKET_KEYS.includes(k))
                        .map(([key, m]: [string, any]) => (
                          <div
                            key={key}
                            className={`p-3 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}
                          >
                            <p className={`text-xs mb-1 capitalize ${subtle}`}>
                              {m.label}
                              {isGrowthMetric(key) ? ' growth' : ''}
                            </p>
                            <p className="text-lg font-bold">{m.avg}%</p>
                            <p className={`text-[10px] mt-0.5 ${subtler}`}>n={m.n}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Category Breakdowns */}
                {Object.keys(selected.metrics?.dimensionBreakdowns || {}).length > 0 && (
                  <div className={`p-5 rounded-2xl border ${card}`}>
                    <h3 className="font-semibold text-sm mb-1">Category Breakdowns</h3>
                    <p className={`text-xs mb-4 ${subtle}`}>
                      Share of activity by category, pooled across contributions
                    </p>
                    <div className="space-y-5">
                      {Object.entries(selected.metrics.dimensionBreakdowns).map(
                        ([dimName, dimData]: [string, any]) => {
                          // Redundant once state-level data exists for the same
                          // industry — state is strictly higher-resolution, and
                          // the map + Top 5 list already cover this ground.
                          if (dimName === 'region') return null
                          if (dimName === 'state') {
                            return (
                              <div key={dimName}>
                                {/* Dropdown lives in its own always-rendered
                                    header, separate from the map/empty-state
                                    below it — picking a metric with no current
                                    data must never remove the only control
                                    that lets you pick a DIFFERENT metric. */}
                                <div className="flex items-center justify-between mb-2 gap-3">
                                  <p
                                    className={`text-xs font-semibold uppercase tracking-wide ${subtle}`}
                                  >
                                    State
                                  </p>
                                  <select
                                    value={mapMetric}
                                    onChange={(e) => setMapMetric(e.target.value)}
                                    className={`text-xs px-2 py-1 rounded-lg border outline-none shrink-0 ${dark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-600'}`}
                                  >
                                    {stateMetricOptions.map(([key, label, mode]) => (
                                      <option key={key} value={key}>
                                        {label}
                                        {mode === 'index' ? ' (index)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {Object.keys(mapData).length === 0 ? (
                                  <div
                                    className={`flex items-center justify-center h-32 rounded-xl text-xs ${dark ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-50 text-zinc-400'}`}
                                  >
                                    No state data yet for {mapLabel.toLowerCase()}
                                  </div>
                                ) : (
                                  <>
                                    {mapIsIndex && (
                                      <p className={`text-[11px] mb-2 ${subtler}`}>
                                        Index: 100 = proportional to share of activity. Above 100 =
                                        over-indexed, below 100 = under-indexed.
                                      </p>
                                    )}
                                    <USStateHeatmap
                                      data={mapData}
                                      color={INDUSTRY_COLORS[selected.industry] || '#3b82f6'}
                                      dark={dark}
                                      suffix={mapSuffix}
                                      centeredAt100={mapIsIndex}
                                    />
                                    {top5States.length > 0 && (
                                      <div className="mt-4">
                                        <p
                                          className={`text-xs font-semibold uppercase tracking-wide mb-2 ${subtle}`}
                                        >
                                          Top 5 States · {mapLabel}
                                          {mapIsIndex ? ' Index' : ''}
                                        </p>
                                        <div className="space-y-1.5">
                                          {top5States.map(([stateName, stat]) => (
                                            <div
                                              key={stateName}
                                              className="flex items-center gap-2"
                                            >
                                              <span className="text-xs w-28 truncate shrink-0">
                                                {stateName}
                                              </span>
                                              <div
                                                className={`flex-1 h-2 rounded-full overflow-hidden ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`}
                                              >
                                                <div
                                                  className="h-full rounded-full"
                                                  style={{
                                                    width: `${Math.min(100, (stat.value / (top5States[0][1].value || 1)) * 100)}%`,
                                                    background:
                                                      INDUSTRY_COLORS[selected.industry] ||
                                                      '#3b82f6',
                                                  }}
                                                />
                                              </div>
                                              <span
                                                className={`text-xs w-24 text-right shrink-0 ${subtle}`}
                                              >
                                                {stat.value.toLocaleString()}
                                                {mapSuffix}{' '}
                                                <span className={subtler}>(n={stat.n})</span>
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )
                          }
                          const totalRows = Object.values(dimData).reduce(
                            (sum: number, c: any) => sum + (c.totalRowCount || 0),
                            0
                          ) as number
                          const sorted = (Object.entries(dimData) as [string, any][])
                            .map(([catName, stats]) => ({
                              catName,
                              sharePct: totalRows
                                ? round2((stats.totalRowCount / totalRows) * 100)
                                : 0,
                              rows: stats.totalRowCount || 0,
                              contributionCount: stats.contributionCount || 0,
                            }))
                            .sort((a, b) => b.sharePct - a.sharePct)
                            .slice(0, 6)
                          return (
                            <div key={dimName}>
                              <p
                                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${subtle}`}
                              >
                                {dimName.replace(/_/g, ' ')}
                              </p>
                              <div className="space-y-1.5">
                                {sorted.map((s) => (
                                  <div key={s.catName} className="flex items-center gap-2">
                                    <span className="text-xs w-24 truncate shrink-0">
                                      {s.catName}
                                    </span>
                                    <div
                                      className={`flex-1 h-2 rounded-full overflow-hidden ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`}
                                    >
                                      <div
                                        className="h-full rounded-full"
                                        style={{
                                          width: `${Math.min(100, s.sharePct)}%`,
                                          background:
                                            INDUSTRY_COLORS[selected.industry] || '#3b82f6',
                                        }}
                                      />
                                    </div>
                                    <span className={`text-xs w-24 text-right shrink-0 ${subtle}`}>
                                      {s.sharePct}% <span className={subtler}>(rows={s.rows})</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        }
                      )}
                    </div>
                  </div>
                )}

                {/* Chart — cross-industry comparison, metric selectable */}
                <div className={`p-5 rounded-2xl border ${card}`}>
                  {/* Dropdown is in its own always-rendered header, outside the
                      chart-vs-empty-state branch below — the same fix as the
                      state map above, and for the same reason. */}
                  <div className="flex items-center justify-between mb-1 gap-3">
                    <h3 className="font-semibold text-sm truncate">
                      {comparisonLabel} by Industry
                    </h3>
                    <select
                      value={comparisonMetric}
                      onChange={(e) => setComparisonMetric(e.target.value)}
                      className={`text-xs px-2 py-1.5 rounded-lg border outline-none shrink-0 ${dark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-600'}`}
                    >
                      {metricOptions.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className={`text-xs mb-4 ${subtle}`}>
                    Closest-performing industries to {selected.industry}
                  </p>

                  {chartIndustries.length > 1 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={peerIndustries.map((i) => ({
                          name: i.industry.length > 10 ? i.industry.slice(0, 10) + '…' : i.industry,
                          value: getMetricValue(i, comparisonMetric),
                        }))}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={dark ? '#27272a' : '#f4f4f5'}
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: dark ? '#71717a' : '#a1a1aa' }}
                        />
                        <YAxis tick={{ fontSize: 10, fill: dark ? '#71717a' : '#a1a1aa' }} />
                        <Tooltip
                          contentStyle={{
                            background: dark ? '#18181b' : '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {peerIndustries.map((ind, idx) => (
                            <Cell
                              key={idx}
                              fill={
                                selected?.id === ind.id
                                  ? INDUSTRY_COLORS[ind.industry] || '#3b82f6'
                                  : dark
                                    ? '#3f3f46'
                                    : '#d4d4d8'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div
                      className={`flex items-center justify-center h-32 rounded-xl text-xs text-center px-6 ${dark ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-50 text-zinc-400'}`}
                    >
                      Not enough industries have {comparisonLabel.toLowerCase()} data yet to compare
                      — try a different metric above.
                    </div>
                  )}
                </div>

                {/* Trends */}
                {selected.metrics?.top_trends?.length > 0 && (
                  <div className={`p-5 rounded-2xl border ${card}`}>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <TrendingUp size={14} className="text-blue-500" /> Observed Trends
                    </h3>
                    <ul className="space-y-2">
                      {selected.metrics.top_trends.map((t: string, i: number) => (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Insights */}
                {selected.metrics?.key_insights?.length > 0 && (
                  <div className={`p-5 rounded-2xl border ${card}`}>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Lightbulb size={14} className="text-amber-400" /> Key Insights
                    </h3>
                    <ul className="space-y-2">
                      {selected.metrics.key_insights.map((insight: string, i: number) => (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
