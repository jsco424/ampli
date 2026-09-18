'use client'

import { useEffect, useState } from 'react'
import { useUser, useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import IntelligenceSubNav from '@/components/IntelligenceSubNav'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
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
  Info,
  ChevronDown,
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

// Same slug used in src/lib/creditLimit.ts — has({ plan: ... }) needs the
// plan's SLUG, not its raw ID (cplan_...). Using the ID here was the bug
// that let a genuinely subscribed user still get blocked. Confirmed
// against Clerk's dashboard (Plans → Plan Key column): 'business'.
const BUSINESS_PLAN_SLUG = 'business'

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

// A desaturated, evenly-spaced categorical palette — the same principle
// Tableau's own default "Tableau 10" set uses — instead of pulling
// straight from Tailwind's saturated defaults (blue-500, purple-500,
// amber-400, etc.), which is what made this read as a generic AI-scaffolded
// dashboard rather than a deliberate one. This palette exists ONLY to
// distinguish industries from each other (small swatches, legend dots) —
// it is never used for the account's own interactive chrome (selection
// state, buttons, links), which uses the account's actual brand accent
// instead, applied below.
const INDUSTRY_COLORS: Record<string, string> = {
  Retail: '#5B7FA6',
  Healthcare: '#5BA695',
  Technology: '#7A6BA8',
  Finance: '#A6975B',
  Marketing: '#A65B7F',
  Education: '#6B8FA8',
  Manufacturing: '#8FA86B',
  Hospitality: '#A6795B',
  'Real Estate': '#8B5BA6',
  Media: '#6B6BA6',
  Energy: '#A69A5B',
  Nonprofit: '#5BA66B',
  Logistics: '#5B6BA6',
  Other: '#8A8F98',
}

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
  if (key === 'avg_revenue_growth') return industry.avg_revenue_growth ?? null
  if (key === 'avg_conversion_rate') return industry.avg_conversion_rate ?? null
  if (key === 'avg_customer_growth') return industry.avg_customer_growth ?? null
  return industry.metrics?.extendedMetrics?.[key]?.avg ?? null
}

function getMetricSampleSize(industry: any, key: string): number | null {
  if (key === 'avg_revenue_growth') return industry.avg_revenue_growth_n ?? null
  if (key === 'avg_conversion_rate') return industry.avg_conversion_rate_n ?? null
  if (key === 'avg_customer_growth') return industry.avg_customer_growth_n ?? null
  return industry.metrics?.extendedMetrics?.[key]?.n ?? null
}

function isGrowthMetric(key: string): boolean {
  if (key === 'avg_revenue_growth' || key === 'avg_customer_growth') return true
  if (key === 'avg_conversion_rate') return false
  return !isRateLikeKey(key)
}

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
  sampleRowCount: number
  contributionCount: number
}

// Anonymization guardrail — a category backed by only one contribution is
// both statistically meaningless and closer to identifying that single
// contributor than a real pooled benchmark. Mirrors the same ≥2
// contribution threshold already used for industry-level benchmark
// injection in analyze/route.ts.
const MIN_CATEGORY_CONTRIBUTIONS = 2

function resolvePooledStat(stat: PooledCategoryMetric): ResolvedStat | null {
  if (stat.contributionCount < MIN_CATEGORY_CONTRIBUTIONS) return null
  if (stat.mode === 'rate') {
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

// Display-only rounding for raw row counts shown alongside pooled stats
// (state map, category breakdowns) — an exact count is one more small
// signal that could help fingerprint a specific contributor's dataset size
// when the pool is thin. This never touches the underlying sums used for
// percentage/index math, only the human-readable count shown next to it.
function roundForDisplay(n: number, nearest = 5): number {
  return Math.round(n / nearest) * nearest
}

function downloadIndustryCSV(industry: any) {
  const lines: string[] = []
  lines.push(`Industry,${industry.industry}`)
  lines.push(`Contributions,${industry.contribution_count}`)
  lines.push('')
  lines.push('Metric,Average,Sample Size')
  lines.push(
    `Revenue Growth,${industry.avg_revenue_growth ?? ''},${industry.avg_revenue_growth_n ?? ''}`
  )
  lines.push(
    `Conversion Rate,${industry.avg_conversion_rate ?? ''},${industry.avg_conversion_rate_n ?? ''}`
  )
  lines.push(
    `Customer Growth,${industry.avg_customer_growth ?? ''},${industry.avg_customer_growth_n ?? ''}`
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
  const { has } = useAuth()
  const { dark } = useTheme()
  const router = useRouter()
  // ampli's own site-chrome accent (Navbar, About, Pricing all use this
  // same hex) — this page is internal product UI, not a customer-facing
  // generated deck, so it uses the site's own identity, not the
  // per-account useBrand() color meant for exported presentations.
  const accent = '#5DCAA5'

  const [industries, setIndustries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hasOptedIn, setHasOptedIn] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [comparisonMetric, setComparisonMetric] = useState('avg_conversion_rate')
  const [mapMetric, setMapMetric] = useState('__share__')

  // ── Metrics Over Time ────────────────────────────────────────────────
  // Sourced from crowd_insights_history (see the migration + snapshot
  // route) — a table that starts genuinely empty and only accumulates one
  // row per industry per month once something actually calls
  // /api/crowd/snapshot on a schedule. Until then this section has real
  // wiring but nothing to show, which is the honest state of the feature
  // right now rather than something to fake with placeholder numbers.
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [timeMetrics, setTimeMetrics] = useState<string[]>(['avg_conversion_rate'])
  const [timeMode, setTimeMode] = useState<'absolute' | 'indexed'>('absolute')
  const [periodMode, setPeriodMode] = useState<'trailing12' | 'ytd' | 'custom'>('trailing12')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const TIME_LINE_COLORS = ['#5DCAA5', '#A6975B', '#7A6BA8', '#5B7FA6']

  useEffect(() => {
    if (!selected) return
    setHistoryLoading(true)
    supabase
      .from('crowd_insights_history')
      .select('*')
      .eq('industry', selected.industry)
      .order('snapshot_date', { ascending: true })
      .then(({ data }) => {
        setHistory(data || [])
        setHistoryLoading(false)
      })
  }, [selected?.industry])

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  // TEMP FOR TESTING — normally 5, set to 0 to bypass the "contribute N
  // datasets to unlock" gate while testing. Revert to 5 before real users
  // see this again.
  const CROWD_UNLOCK_THRESHOLD = 0

  const [optedInCount, setOptedInCount] = useState(0)

  useEffect(() => {
    if (!user) return

    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('opt_in_crowd', true)
      .then(({ count }) => {
        setOptedInCount(count ?? 0)
        setHasOptedIn((count ?? 0) >= CROWD_UNLOCK_THRESHOLD)
      })

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
  // Shared styling for every dropdown filter on this page — one consistent
  // control, not a native <select> styled differently in each card. Native
  // select arrows are hidden (appearance-none) in favor of one drawn
  // ChevronDown icon, so the control reads as a deliberate filter, not a
  // default browser form element.
  const filterSelectCls = `appearance-none text-xs pl-2.5 pr-7 py-1.5 rounded-md border outline-none cursor-pointer ${
    dark
      ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-600'
      : 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400'
  }`
  const filterChevronCls = `pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${subtler}`

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

  // ── Metrics Over Time derived data ──────────────────────────────────────
  function historyMetricValue(row: any, key: string): number | null {
    if (
      key === 'avg_revenue_growth' ||
      key === 'avg_conversion_rate' ||
      key === 'avg_customer_growth'
    ) {
      return row[key] ?? null
    }
    return row.extended_metrics?.[key]?.avg ?? null
  }

  const activeHistory = (() => {
    if (history.length === 0) return []
    if (periodMode === 'custom') {
      return history.filter((r) => {
        if (customStart && r.snapshot_date < customStart) return false
        if (customEnd && r.snapshot_date > customEnd) return false
        return true
      })
    }
    if (periodMode === 'ytd') {
      const currentYear = new Date(history[history.length - 1].snapshot_date).getFullYear()
      return history.filter((r) => new Date(r.snapshot_date).getFullYear() === currentYear)
    }
    return history.slice(-12) // trailing 12 snapshots
  })()

  const timeSeries = timeMetrics.map((key, i) => {
    const raw = activeHistory.map((r) => ({
      date: r.snapshot_date,
      value: historyMetricValue(r, key),
    }))
    const baseVal = raw.find((p) => p.value !== null)?.value ?? 1
    const points =
      timeMode === 'indexed'
        ? raw.map((p) => ({
            date: p.date,
            [key]: p.value === null ? null : round2((p.value / baseVal) * 100),
          }))
        : raw.map((p) => ({ date: p.date, [key]: p.value }))
    return { key, color: TIME_LINE_COLORS[i % TIME_LINE_COLORS.length], points }
  })

  // Recharts wants one array of objects with every series' key present on
  // each point, not one array per series — merge by date.
  const chartData = activeHistory.map((r) => {
    const point: Record<string, any> = { date: r.snapshot_date }
    for (const s of timeSeries) {
      const match = s.points.find((p) => p.date === r.snapshot_date)
      point[s.key] = match ? match[s.key] : null
    }
    return point
  })

  const timeMetricChoices = metricOptions.filter(([k]) => !timeMetrics.includes(k))

  const chartIndustries = industries.filter((i) => getMetricValue(i, comparisonMetric) !== null)

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

  // How many states HAD this metric reported at all, but got excluded by
  // the ≥2-contributor floor — distinct from a state simply never
  // reporting this metric. Surfaced as an explicit note rather than the
  // states just silently not appearing, so "why isn't Vermont on the map"
  // has a real answer instead of looking like a bug or missing data.
  const omittedStateCount =
    mapMetric === '__share__'
      ? 0
      : Object.values(stateBreakdown || {}).filter(
          (stats) => stats.metrics?.[mapMetric] && !resolvePooledStat(stats.metrics[mapMetric])
        ).length

  const top5States = Object.entries(mapData)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 5)

  if (!isLoaded || !user) return null

  // Plan gate — checked first, regardless of opt-in status. Crowd Insights
  // is Business-and-above only; a Free user who's opted in on a project
  // still shouldn't see this data, since the two gates answer different
  // questions ("have you contributed" vs. "are you on a paid plan").
  const hasBusinessPlan = has?.({ plan: BUSINESS_PLAN_SLUG }) ?? false
  if (!hasBusinessPlan) {
    return (
      <div className={`min-h-screen ${base}`}>
        <Navbar />
        <IntelligenceSubNav />
        <main className="pt-4 px-6 max-w-lg mx-auto text-center">
          <div className={`p-10 rounded-lg border ${card}`}>
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-4"
              style={{ background: `${accent}1a` }}
            >
              <Lock size={24} style={{ color: accent }} />
            </div>
            <h1 className="text-xl font-bold mb-2">Crowd Insights is a Business feature</h1>
            <p className={`text-sm leading-relaxed mb-6 ${subtle}`}>
              Industry benchmarking is available on Business and Enterprise plans — and requires
              contributing 5 datasets to the pool, same as on any plan. Upgrade first, then opt in
              on your next upload to unlock it.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-medium transition-colors"
              style={{ background: accent }}
            >
              View Plans
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // Locked state — user has never opted in (still applies on top of the
  // plan gate above; being on Business doesn't waive the "contribute to
  // unlock" requirement, since the pool's value depends on real
  // contributions)
  if (!hasOptedIn && !loading) {
    return (
      <div className={`min-h-screen ${base}`}>
        <Navbar />
        <IntelligenceSubNav />
        <main className="pt-4 px-6 max-w-lg mx-auto text-center">
          <div className={`p-10 rounded-lg border ${card}`}>
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-4"
              style={{ background: `${accent}1a` }}
            >
              <Lock size={24} style={{ color: accent }} />
            </div>
            <h1 className="text-xl font-bold mb-2">Crowd Insights Locked</h1>
            <p className={`text-sm leading-relaxed mb-4 ${subtle}`}>
              Crowd Insights is a shared intelligence pool built from anonymized contributions. To
              access it, contribute {CROWD_UNLOCK_THRESHOLD} datasets to the pool first — this keeps
              the pool fair and valuable for everyone.
            </p>
            <div
              className={`h-2 rounded-full overflow-hidden mb-2 ${dark ? 'bg-white/5' : 'bg-zinc-100'}`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (optedInCount / CROWD_UNLOCK_THRESHOLD) * 100)}%`,
                  background: accent,
                }}
              />
            </div>
            <p className={`text-xs mb-6 ${subtle}`}>
              {optedInCount} of {CROWD_UNLOCK_THRESHOLD} contributed
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-medium transition-colors"
              style={{ background: accent }}
            >
              <Users size={15} />
              Upload & Opt In to Contribute
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <IntelligenceSubNav />
      <main className="pt-2 px-6 max-w-6xl mx-auto pb-20">
        <div
          className={`mt-6 mb-6 pb-4 flex items-start justify-between border-b ${dark ? 'border-zinc-800' : 'border-zinc-200'}`}
        >
          <div>
            <h1 className="text-xl font-bold mb-1 tracking-tight">Crowd Insights</h1>
            <p className={`text-sm ${subtle}`}>
              Anonymized industry aggregates built from{' '}
              <span className="tabular-nums">
                {industries.reduce((sum, i) => sum + i.contribution_count, 0)}
              </span>{' '}
              contributions across <span className="tabular-nums">{industries.length}</span>{' '}
              industries
            </p>
            <Link
              href="/crowd/methodology"
              className="inline-flex items-center gap-1.5 text-xs font-medium mt-2 hover:underline"
              style={{ color: accent }}
            >
              <Info size={12} />
              How this is calculated
            </Link>
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${subtler}`}>
            <RefreshCw size={11} />
            Updated in real time
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: accent, borderTopColor: 'transparent' }}
            />
          </div>
        ) : industries.length === 0 ? (
          <div className={`p-10 rounded-lg border text-center ${card}`}>
            <p className={`text-sm ${subtle}`}>
              No crowd data yet. Be the first to contribute by opting in on your next upload.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <div className={`lg:col-span-1 rounded-lg border overflow-hidden ${card}`}>
              <div
                className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide border-b ${dark ? 'border-zinc-800 text-zinc-500' : 'border-zinc-200 text-zinc-400'}`}
              >
                Industries
              </div>
              {industries.map((ind) => {
                const isSelected = selected?.id === ind.id
                const swatch = INDUSTRY_COLORS[ind.industry] || INDUSTRY_COLORS.Other
                return (
                  <button
                    key={ind.id}
                    onClick={() => {
                      setSelected(ind)
                      setMapMetric('__share__')
                    }}
                    className={`w-full text-left px-3 py-2.5 border-l-2 border-b transition-colors last:border-b-0 ${
                      dark ? 'border-b-zinc-800' : 'border-b-zinc-100'
                    } ${
                      isSelected
                        ? ''
                        : dark
                          ? 'border-l-transparent hover:bg-white/[0.03]'
                          : 'border-l-transparent hover:bg-zinc-50'
                    }`}
                    style={
                      isSelected
                        ? { borderLeftColor: accent, background: `${accent}0d` }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: swatch }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ind.industry}</p>
                      </div>
                      <span className={`text-xs tabular-nums shrink-0 ${subtler}`}>
                        {ind.contribution_count}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {selected && (
              <div className="lg:col-span-3 space-y-4">
                <div className={`p-5 rounded-lg border ${card}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const Icon = INDUSTRY_ICONS[selected.industry] || BarChart3
                        return (
                          <span
                            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              background: `${INDUSTRY_COLORS[selected.industry] || INDUSTRY_COLORS.Other}1a`,
                            }}
                          >
                            <Icon
                              size={18}
                              style={{
                                color: INDUSTRY_COLORS[selected.industry] || INDUSTRY_COLORS.Other,
                              }}
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
                          className={`p-3 rounded-md ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}
                        >
                          <p className={`text-xs mb-1 ${subtle}`}>{label}</p>
                          <p className="text-lg font-bold">{value !== null ? `${value}%` : '—'}</p>
                          {n !== null && <p className={`text-[10px] mt-0.5 ${subtler}`}>n={n}</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {Object.entries(selected.metrics?.extendedMetrics || {}).filter(
                  ([k]) => !FIXED_BUCKET_KEYS.includes(k)
                ).length > 0 && (
                  <div className={`p-5 rounded-lg border ${card}`}>
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
                            className={`p-3 rounded-md ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* ── Metrics Over Time ── */}
                  <div className={`p-5 rounded-lg border ${card}`}>
                    <div className="flex items-center justify-between mb-1 gap-3">
                      <h3 className="font-semibold text-sm">Metrics Over Time</h3>
                      <div
                        className="flex rounded-md border overflow-hidden shrink-0"
                        style={{ borderColor: dark ? '#3f3f46' : '#d4d4d8' }}
                      >
                        {(['absolute', 'indexed'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setTimeMode(m)}
                            className="px-2.5 py-1 text-[11px] font-medium capitalize transition-colors"
                            style={
                              timeMode === m
                                ? { background: accent, color: '#0a0a0a' }
                                : { color: dark ? '#a1a1aa' : '#71717a' }
                            }
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className={`text-xs mb-3 ${subtle}`}>
                      Monthly pool snapshots for {selected.industry}
                    </p>

                    {/* Global time-period control — Trailing 12 / YTD / Custom.
                        Scoped to this chart only: the heatmap and category
                        breakdowns below have no per-period data to slice by
                        yet (dimension breakdowns carry no date field
                        anywhere in the ingestion pipeline — see
                        applyCalendarYearCutoff in api/crowd/route.ts), so
                        this control would be misleading applied there. */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <div
                        className="flex rounded-md border overflow-hidden"
                        style={{ borderColor: dark ? '#3f3f46' : '#d4d4d8' }}
                      >
                        {(
                          [
                            ['trailing12', 'Trailing 12mo'],
                            ['ytd', 'YTD'],
                            ['custom', 'Custom'],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setPeriodMode(key)}
                            className="px-2.5 py-1 text-[11px] font-medium transition-colors"
                            style={
                              periodMode === key
                                ? { background: accent, color: '#0a0a0a' }
                                : { color: dark ? '#a1a1aa' : '#71717a' }
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {periodMode === 'custom' && (
                        <>
                          <input
                            type="month"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value + '-01')}
                            className={`text-[11px] px-2 py-1 rounded-md border outline-none ${dark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-700'}`}
                          />
                          <span className={`text-[11px] ${subtler}`}>to</span>
                          <input
                            type="month"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value + '-01')}
                            className={`text-[11px] px-2 py-1 rounded-md border outline-none ${dark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-700'}`}
                          />
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {timeMetrics.map((k, i) => (
                        <span
                          key={k}
                          className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium"
                          style={{
                            background: TIME_LINE_COLORS[i % TIME_LINE_COLORS.length],
                            color: '#0a0a0a',
                          }}
                        >
                          {metricOptions.find(([mk]) => mk === k)?.[1] || k}
                          {timeMetrics.length > 1 && (
                            <button
                              onClick={() => setTimeMetrics((prev) => prev.filter((x) => x !== k))}
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                              style={{ background: 'rgba(0,0,0,0.15)' }}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {timeMetricChoices.length > 0 && (
                        <div className="relative">
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                setTimeMetrics((prev) => [...prev, e.target.value].slice(-4))
                            }}
                            className={filterSelectCls}
                          >
                            <option value="">+ Add metric</option>
                            {timeMetricChoices.map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={12} className={filterChevronCls} />
                        </div>
                      )}
                    </div>

                    {historyLoading ? (
                      <div className="flex items-center justify-center h-40">
                        <div
                          className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                          style={{ borderColor: accent, borderTopColor: 'transparent' }}
                        />
                      </div>
                    ) : chartData.length === 0 ? (
                      <div
                        className={`flex items-center justify-center h-40 rounded-md text-xs text-center px-6 ${dark ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-50 text-zinc-400'}`}
                      >
                        Historical trend data starts accumulating once monthly pool snapshots begin
                        — check back after a few months.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={dark ? '#27272a' : '#f4f4f5'}
                          />
                          <XAxis
                            dataKey="date"
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
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {timeSeries.map((s) => (
                            <Line
                              key={s.key}
                              dataKey={s.key}
                              name={metricOptions.find(([mk]) => mk === s.key)?.[1] || s.key}
                              stroke={s.color}
                              strokeWidth={2}
                              dot={false}
                              connectNulls={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    <p className={`text-[10.5px] mt-2 ${subtler}`}>
                      {timeMode === 'indexed'
                        ? 'Each line indexed to its own first available month = 100, so differently-scaled metrics can share one axis.'
                        : 'Absolute mode plots raw values on one shared axis — most useful when comparing metrics in the same unit.'}
                    </p>
                  </div>

                  {/* ── Geographic Performance ── */}
                  <div className={`p-5 rounded-lg border ${card}`}>
                    <div className="flex items-center justify-between mb-1 gap-3">
                      <h3 className="font-semibold text-sm">Geographic Performance</h3>
                      <div className="relative shrink-0">
                        <select
                          value={mapMetric}
                          onChange={(e) => setMapMetric(e.target.value)}
                          className={filterSelectCls}
                        >
                          {stateMetricOptions.map(([key, label, mode]) => (
                            <option key={key} value={key}>
                              {label}
                              {mode === 'index' ? ' (index)' : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} className={filterChevronCls} />
                      </div>
                    </div>
                    <p className={`text-xs mb-3 ${subtle}`}>
                      {mapLabel} by state, pooled across contributions
                    </p>

                    {Object.keys(mapData).length === 0 ? (
                      <div
                        className={`flex items-center justify-center h-40 rounded-md text-xs ${dark ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-50 text-zinc-400'}`}
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
                        {omittedStateCount > 0 && (
                          <div
                            className="flex items-start gap-2 mb-3 px-3 py-2 rounded-md text-[11px] leading-relaxed"
                            style={{
                              background: dark ? 'rgba(217,119,6,0.08)' : 'rgba(217,119,6,0.06)',
                              border: `1px solid ${dark ? 'rgba(217,119,6,0.25)' : 'rgba(217,119,6,0.2)'}`,
                              color: dark ? '#d9a441' : '#92640a',
                            }}
                          >
                            <span>⚠</span>
                            <span>
                              Not enough pool data to safely show {omittedStateCount} state
                              {omittedStateCount !== 1 ? 's' : ''} for {mapLabel.toLowerCase()} —
                              each needs at least {MIN_CATEGORY_CONTRIBUTIONS} contributors before
                              it displays.
                            </span>
                          </div>
                        )}
                        <USStateHeatmap
                          data={mapData}
                          color={accent}
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
                                <div key={stateName} className="flex items-center gap-2">
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
                                        background: accent,
                                      }}
                                    />
                                  </div>
                                  <span className={`text-xs w-24 text-right shrink-0 ${subtle}`}>
                                    {stat.value.toLocaleString()}
                                    {mapSuffix}{' '}
                                    <span className={subtler}>(n={roundForDisplay(stat.n)})</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {Object.keys(selected.metrics?.dimensionBreakdowns || {}).length > 0 && (
                  <div className={`p-5 rounded-lg border ${card}`}>
                    <h3 className="font-semibold text-sm mb-1">Category Breakdowns</h3>
                    <p className={`text-xs mb-4 ${subtle}`}>
                      Share of activity by category, pooled across contributions
                    </p>
                    <div className="space-y-5">
                      {Object.entries(selected.metrics.dimensionBreakdowns).map(
                        ([dimName, dimData]: [string, any]) => {
                          if (dimName === 'region') return null
                          if (dimName === 'state') return null // promoted to its own Geographic Performance card above
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
                                          background: accent,
                                        }}
                                      />
                                    </div>
                                    <span className={`text-xs w-24 text-right shrink-0 ${subtle}`}>
                                      {s.sharePct}%{' '}
                                      <span className={subtler}>
                                        (rows={roundForDisplay(s.rows)})
                                      </span>
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

                <div className={`p-5 rounded-lg border ${card}`}>
                  <div className="flex items-center justify-between mb-1 gap-3">
                    <h3 className="font-semibold text-sm truncate">
                      {comparisonLabel} by Industry
                    </h3>
                    <div className="relative shrink-0">
                      <select
                        value={comparisonMetric}
                        onChange={(e) => setComparisonMetric(e.target.value)}
                        className={filterSelectCls}
                      >
                        {metricOptions.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className={filterChevronCls} />
                    </div>
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
                              fill={selected?.id === ind.id ? accent : dark ? '#3f3f46' : '#d4d4d8'}
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

                {selected.metrics?.top_trends?.length > 0 && (
                  <div className={`p-5 rounded-lg border ${card}`}>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <TrendingUp size={14} style={{ color: accent }} /> Observed Trends
                    </h3>
                    <ul className="space-y-2">
                      {selected.metrics.top_trends.map((t: string, i: number) => (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                            style={{ background: accent }}
                          />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.metrics?.key_insights?.length > 0 && (
                  <div className={`p-5 rounded-lg border ${card}`}>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Lightbulb size={14} style={{ color: INDUSTRY_COLORS.Finance }} /> Key
                      Insights
                    </h3>
                    <ul className="space-y-2">
                      {selected.metrics.key_insights.map((insight: string, i: number) => (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                            style={{ background: INDUSTRY_COLORS.Finance }}
                          />
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
