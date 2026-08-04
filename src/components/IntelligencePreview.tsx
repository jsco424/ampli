'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser, useAuth } from '@clerk/nextjs'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Users,
  ArrowRight,
  BarChart2,
  Lock,
} from 'lucide-react'
import ChartRenderer from '@/components/ChartRenderer'
import { supabase } from '@/lib/supabase'

export type SectionKey = 'behavior' | 'benchmarks' | 'crowd'

const SECTIONS: {
  key: SectionKey
  label: string
  shortLabel: string
  description: string
  href: string | null // null = not built yet, no real destination
}[] = [
  {
    key: 'behavior',
    label: 'Trending Content',
    shortLabel: 'Trending',
    description:
      'Real-time public interest tracking — Wikipedia and YouTube signal for any topic, company, or competitor, updated daily.',
    href: '/trends',
  },
  {
    key: 'benchmarks',
    label: 'Company Benchmarks',
    shortLabel: 'Benchmarks',
    description:
      "Your own metrics, trended over time. Pick which numbers matter to you and watch your company's own history unfold.",
    href: '/intelligence/company-benchmarks',
  },
  {
    key: 'crowd',
    label: 'Crowd Insights',
    shortLabel: 'Crowd',
    description:
      'Anonymized industry benchmarks pooled from real contributions — see how your numbers stack up against your peers.',
    href: '/crowd',
  },
]

// ── Mock visuals — hand-built with divs/CSS, same pattern as the landing
// page's existing "Product preview" mockup section, not real screenshots.
// Used ONLY in 'marketing' mode (public landing page, visitor isn't signed
// in, so there's no real account data to show) — 'hub' mode uses real,
// gated data instead, see BehaviorLive/BenchmarksLive/CrowdLive below.

function BehaviorMock({ dark }: { dark: boolean }) {
  const topics = [
    { name: 'Tesla Model 3', score: 87, delta: 12 },
    { name: 'Electric Vehicle Tax Credit', score: 64, delta: -4 },
    { name: 'Used Car Prices', score: 52, delta: 2 },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {topics.map((t) => (
        <div
          key={t.name}
          className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
        >
          <p
            className={`text-[11px] font-medium mb-1.5 truncate ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
          >
            {t.name}
          </p>
          <div className="flex items-end gap-1.5">
            <span className="text-xl font-black">{t.score}</span>
            <span
              className={`flex items-center gap-0.5 text-[11px] font-medium mb-0.5 ${t.delta > 0 ? 'text-emerald-500' : 'text-red-400'}`}
            >
              {t.delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {t.delta > 0 ? '+' : ''}
              {t.delta}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function BenchmarksMock({ dark }: { dark: boolean }) {
  const chips = ['Conversion Rate', 'Revenue Growth', 'Customer Growth']
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((c, i) => (
          <span
            key={c}
            className={`text-[11px] px-2.5 py-1 rounded-full border ${
              i === 0
                ? 'bg-[#5DCAA5]/15 border-[#5DCAA5]/30 text-[#5DCAA5]'
                : dark
                  ? 'border-white/10 text-zinc-400'
                  : 'border-zinc-200 text-zinc-500'
            }`}
          >
            {c}
          </span>
        ))}
      </div>
      <div
        className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
      >
        <p className={`text-[11px] mb-3 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Conversion Rate — last 6 uploads
        </p>
        <div className="flex items-end gap-2 h-16">
          {[40, 45, 42, 58, 61, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-[#5DCAA5]/60"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CrowdMock({ dark }: { dark: boolean }) {
  const rows = [
    { label: 'Avg Conversion Rate', value: '3.2%' },
    { label: 'Avg Revenue Growth', value: '+14%' },
    { label: 'Avg Customer Growth', value: '+9%' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {rows.map((r) => (
        <div
          key={r.label}
          className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
        >
          <p className={`text-[11px] mb-1.5 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {r.label}
          </p>
          <p className="text-xl font-black">{r.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Live User Behavior (hub mode only) ──────────────────────────────────
// Real data straight from Supabase (trend_composite), same client-side
// query pattern /trends/page.tsx itself uses. Simplified for a compact
// preview: the real page scopes topics to whichever category tab is
// selected, but there's no room here for a category picker, so this pulls
// the top 3 topics by score across ALL categories combined, a "what's hot
// right now" summary rather than a scoped replica of the full page.

interface CompositeRow {
  topic: string
  category: string
  composite_score: number
  delta_vs_prior: number | null
  as_of: string
}

// Postgres numeric columns commonly come back through Supabase as JSON
// strings, same reasoning as trends/page.tsx's own toCompositeRow — every
// row is coerced to real numbers right at read time.
function toCompositeRow(row: any): CompositeRow {
  return {
    topic: row.topic,
    category: row.category,
    composite_score: Number(row.composite_score),
    delta_vs_prior: row.delta_vs_prior === null ? null : Number(row.delta_vs_prior),
    as_of: row.as_of,
  }
}

function latestPerTopic(rows: CompositeRow[]): CompositeRow[] {
  const byTopic = new Map<string, CompositeRow>()
  for (const row of rows) {
    const existing = byTopic.get(row.topic)
    if (!existing || row.as_of > existing.as_of) byTopic.set(row.topic, row)
  }
  return Array.from(byTopic.values())
}

function BehaviorLive({ dark }: { dark: boolean }) {
  const [loading, setLoading] = useState(true)
  const [topTopics, setTopTopics] = useState<CompositeRow[]>([])

  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  useEffect(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 3)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    supabase
      .from('trend_composite')
      .select('*')
      .gte('as_of', cutoffStr)
      .order('as_of', { ascending: false })
      .then(({ data }) => {
        const latest = latestPerTopic(((data as any[]) || []).map(toCompositeRow))
        const top = [...latest].sort((a, b) => b.composite_score - a.composite_score).slice(0, 3)
        setTopTopics(top)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-4 h-4 border-2 border-[#5DCAA5] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (topTopics.length === 0) {
    return (
      <p className={`text-xs ${muted}`}>
        No trending topics yet, check back after the next daily refresh runs.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {topTopics.map((t) => (
        <div
          key={t.topic}
          className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
        >
          <p className={`text-[11px] font-medium mb-1.5 truncate ${muted}`}>{t.topic}</p>
          <div className="flex items-end gap-1.5">
            <span className="text-xl font-black">{t.composite_score}</span>
            {t.delta_vs_prior !== null && (
              <span
                className={`flex items-center gap-0.5 text-[11px] font-medium mb-0.5 ${t.delta_vs_prior > 0 ? 'text-emerald-500' : 'text-red-400'}`}
              >
                {t.delta_vs_prior > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {t.delta_vs_prior > 0 ? '+' : ''}
                {t.delta_vs_prior}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Live Benchmarks (hub mode only) ─────────────────────────────────────
// Real data from /api/company-benchmarks — the same endpoint and shape the
// dedicated /intelligence/company-benchmarks page uses.

interface BenchmarkMetric {
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

function formatBenchmarkValue(value: number, mode: string): string {
  if (mode === 'growth') return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function formatDateTick(iso: string): string {
  return iso.slice(5, 10) // MM-DD
}

function BenchmarksLive({ dark }: { dark: boolean }) {
  const [loading, setLoading] = useState(true)
  const [companyKey, setCompanyKey] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<BenchmarkMetric[]>([])
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  useEffect(() => {
    fetch('/api/company-benchmarks')
      .then((res) => res.json())
      .then((json) => {
        setCompanyKey(json.companyKey ?? null)
        const list: BenchmarkMetric[] = json.metrics || []
        setMetrics(list)
        if (list.length > 0) setSelectedMetric(list[0].metricKey)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedMetric) return
    setHistoryLoading(true)
    fetch(`/api/company-benchmarks?metric=${encodeURIComponent(selectedMetric)}`)
      .then((res) => res.json())
      .then((json) => {
        setHistory(json.history || [])
        setHistoryLoading(false)
      })
      .catch(() => setHistoryLoading(false))
  }, [selectedMetric])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-4 h-4 border-2 border-[#5DCAA5] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (companyKey === null) {
    return (
      <p className={`text-xs ${muted}`}>
        Company Benchmarks group history by your company's email domain, so personal email providers
        aren't eligible. Sign in with a company email to start building a benchmark history.
      </p>
    )
  }

  if (metrics.length === 0) {
    return (
      <p className={`text-xs ${muted}`}>
        No benchmark history yet. Build Visuals on a project and it'll show up here automatically.
      </p>
    )
  }

  const selected = metrics.find((m) => m.metricKey === selectedMetric)

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {metrics.map((m) => {
          const isActive = m.metricKey === selectedMetric
          return (
            <button
              key={m.metricKey}
              onClick={() => setSelectedMetric(m.metricKey)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                isActive
                  ? 'bg-[#5DCAA5]/15 border-[#5DCAA5]/30 text-[#5DCAA5]'
                  : dark
                    ? 'border-white/10 text-zinc-400 hover:text-zinc-200'
                    : 'border-zinc-200 text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {m.metricLabel}
            </button>
          )
        })}
      </div>
      <div
        className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
      >
        <div className="flex items-center justify-between mb-3">
          <p className={`text-[11px] ${muted}`}>{selected?.metricLabel}</p>
          {selected && (
            <p className="text-sm font-black">
              {formatBenchmarkValue(selected.latestValue, selected.mode)}
            </p>
          )}
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-3.5 h-3.5 border-2 border-[#5DCAA5] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length >= 2 ? (
          <ChartRenderer
            chart={{
              type: 'line',
              data: history.map((h) => ({
                name: formatDateTick(h.contributed_at),
                value: h.value,
              })),
            }}
            colors={['#5DCAA5']}
            height={120}
            dark={dark}
          />
        ) : (
          <p className={`text-[11px] ${muted}`}>
            Not enough history yet for this metric, one more analysis run will start a trend line.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Live Crowd Insights (hub mode only) ─────────────────────────────────
// Real data straight from Supabase, same client-side query pattern
// /crowd/page.tsx itself uses. Faithfully replicates that page's two real
// gates: a Business-plan gate, then a "contribute 5 datasets to unlock the
// pool" gate. Only past both does real industry data show — the top
// industry by contribution count, condensed to the same three-stat shape
// the old mock used.

const BUSINESS_PLAN_SLUG = 'business'
// TEMP FOR TESTING — normally 5, set to 0 to bypass the "contribute N
// datasets to unlock" gate while testing. Revert to 5 before real users
// see this again.
const CROWD_UNLOCK_THRESHOLD = 0

function CrowdLive({ dark }: { dark: boolean }) {
  const { user, isLoaded } = useUser()
  const { has } = useAuth()
  const [loading, setLoading] = useState(true)
  const [industries, setIndustries] = useState<any[]>([])
  const [optedInCount, setOptedInCount] = useState(0)

  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  useEffect(() => {
    if (!user) return
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('opt_in_crowd', true)
      .then(({ count }) => setOptedInCount(count ?? 0))

    supabase
      .from('crowd_insights')
      .select('*')
      .order('contribution_count', { ascending: false })
      .then(({ data }) => {
        setIndustries(data || [])
        setLoading(false)
      })
  }, [user])

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-4 h-4 border-2 border-[#5DCAA5] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const hasBusinessPlan = has?.({ plan: BUSINESS_PLAN_SLUG }) ?? false
  if (!hasBusinessPlan) {
    return (
      <div className="flex items-start gap-2.5">
        <Lock size={14} className={`shrink-0 mt-0.5 ${muted}`} />
        <p className={`text-xs leading-relaxed ${muted}`}>
          Crowd Insights is a Business plan feature.{' '}
          <Link href="/pricing" className="text-[#5DCAA5] hover:underline">
            View plans
          </Link>
          .
        </p>
      </div>
    )
  }

  const hasOptedIn = optedInCount >= CROWD_UNLOCK_THRESHOLD
  if (!hasOptedIn) {
    return (
      <div>
        <p className={`text-xs mb-2 ${muted}`}>
          Contribute {CROWD_UNLOCK_THRESHOLD} datasets to unlock the pool. {optedInCount} of{' '}
          {CROWD_UNLOCK_THRESHOLD} so far.
        </p>
        <div
          className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-white/10' : 'bg-zinc-200'}`}
        >
          <div
            className="h-full bg-[#5DCAA5] rounded-full transition-all"
            style={{ width: `${Math.min(100, (optedInCount / CROWD_UNLOCK_THRESHOLD) * 100)}%` }}
          />
        </div>
      </div>
    )
  }

  if (industries.length === 0) {
    return <p className={`text-xs ${muted}`}>No crowd data yet across any industry.</p>
  }

  const top = industries[0]
  const rows = [
    { label: 'Avg Conversion Rate', value: top.avg_conversion_rate },
    { label: 'Avg Revenue Growth', value: top.avg_revenue_growth },
    { label: 'Avg Customer Growth', value: top.avg_customer_growth },
  ]

  return (
    <div>
      <p className={`text-[11px] mb-3 ${muted}`}>
        {top.industry} · {top.contribution_count} contribution
        {top.contribution_count !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
          >
            <p className={`text-[11px] mb-1.5 ${muted}`}>{r.label}</p>
            <p className="text-xl font-black">
              {r.value !== null && r.value !== undefined ? `${r.value}%` : '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  dark?: boolean
  // 'marketing' = public landing page, no real navigation (visitor isn't
  // signed in yet). 'hub' = signed-in /intelligence overview, shows a real
  // "Open" link into the actual page for sections that exist.
  variant: 'marketing' | 'hub'
  // Controlled active tab — optional. When a parent passes `active` +
  // `onActiveChange`, this component defers to them entirely instead of
  // tracking its own state, so something outside (like the quick-nav cards
  // on the Intelligence hub page) can drive which tab is showing without
  // this component ever navigating away on its own. When omitted (as on
  // the public landing page, which has nothing external driving it), this
  // falls back to its own internal state exactly as before.
  active?: SectionKey
  onActiveChange?: (key: SectionKey) => void
}

export default function IntelligencePreview({
  dark = false,
  variant,
  active: activeProp,
  onActiveChange,
}: Props) {
  const [internalActive, setInternalActive] = useState<SectionKey>('behavior')
  const active = activeProp ?? internalActive
  const setActive = (key: SectionKey) => {
    if (onActiveChange) onActiveChange(key)
    else setInternalActive(key)
  }
  const activeSection = SECTIONS.find((s) => s.key === active)!

  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-[#EAEFF1] border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  return (
    <div className={`rounded-2xl border overflow-hidden ${card}`}>
      {/* Fake browser chrome — same pattern as the landing page's existing
          product preview mockup, for visual consistency */}
      <div
        className={`flex items-center gap-1.5 px-4 py-3 border-b ${dark ? 'border-white/10 bg-white/[0.02]' : 'border-zinc-200 bg-white'}`}
      >
        <div className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
        <div className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
        <div className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
        <div
          className={`flex-1 mx-4 h-6 rounded-md flex items-center px-3 ${dark ? 'bg-white/5' : 'bg-zinc-100'}`}
        >
          <span className={`text-xs ${muted}`}>
            am-pli.com/{activeSection.href ? activeSection.href.replace('/', '') : 'intelligence'}
          </span>
        </div>
      </div>

      {/* Tab switcher */}
      <div
        className={`flex gap-1 p-3 border-b ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
      >
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              active === s.key
                ? dark
                  ? 'bg-white/10 text-white'
                  : 'bg-[#080C14] text-white'
                : dark
                  ? 'text-white/40 hover:text-white/70'
                  : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {s.shortLabel}
          </button>
        ))}
      </div>

      {/* Active section content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="font-semibold text-sm mb-1">{activeSection.label}</p>
            <p className={`text-xs leading-relaxed ${muted}`}>{activeSection.description}</p>
          </div>
          {variant === 'hub' && activeSection.href && (
            <Link
              href={activeSection.href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#080C14] text-white text-xs font-medium hover:bg-[#0F1420] transition-colors shrink-0"
            >
              Open <ArrowRight size={12} />
            </Link>
          )}
        </div>

        {active === 'behavior' &&
          (variant === 'hub' ? <BehaviorLive dark={dark} /> : <BehaviorMock dark={dark} />)}
        {active === 'benchmarks' &&
          (variant === 'hub' ? <BenchmarksLive dark={dark} /> : <BenchmarksMock dark={dark} />)}
        {active === 'crowd' &&
          (variant === 'hub' ? <CrowdLive dark={dark} /> : <CrowdMock dark={dark} />)}
      </div>
    </div>
  )
}
