'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import IntelligenceSubNav from '@/components/IntelligenceSubNav'
import TrendSeasonalityStrip from '@/components/TrendSeasonalityStrip'
import TopicHistorySearch from '@/components/TopicHistorySearch'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Info,
  Car,
  GraduationCap,
  Home as HomeIcon,
  DollarSign,
  Plane,
  Cpu,
  Zap,
  Scale,
  Sparkles,
} from 'lucide-react'
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
} from 'recharts'

// ── Category config ─────────────────────────────────────────────────────

type TrendCategory = 'auto' | 'education' | 'home' | 'finance' | 'travel' | 'tech'

const CATEGORY_META: Record<TrendCategory, { label: string; icon: any; active: boolean }> = {
  auto: { label: 'Auto', icon: Car, active: true },
  education: { label: 'Education', icon: GraduationCap, active: true },
  finance: { label: 'Finance', icon: DollarSign, active: true },
  home: { label: 'Home', icon: HomeIcon, active: false },
  travel: { label: 'Travel', icon: Plane, active: false },
  tech: { label: 'Tech', icon: Cpu, active: false },
}

const SOURCE_LABELS: Record<string, string> = {
  wikipedia: 'Wikipedia',
  reddit: 'Reddit',
  youtube: 'YouTube',
  google_trends: 'Google Trends',
}

const RAW_UNIT_LABELS: Record<string, string> = {
  wikipedia: 'pageviews',
  reddit: 'posts',
  youtube: 'views',
  google_trends: 'est. searches',
}

const SPIKE_THRESHOLD_PCT = 15
const COMPARE_COLORS = ['#3b82f6', '#10b981', '#f59e0b']
const MAX_COMPARE_TOPICS = 3
const NEW_TOPIC_WINDOW_DAYS = 3

const QUADRANT_COLORS = {
  emerging: '#3b82f6',
  trending: '#10b981',
  saturated: '#f59e0b',
  laggard: '#71717a',
  neutral: '#a1a1aa',
} as const

interface CompositeRow {
  topic: string
  category: TrendCategory
  composite_score: number
  delta_vs_prior: number | null
  source_count: number
  as_of: string
}

interface SignalRow {
  topic: string
  source: string
  signal_score: number
  raw_value: number
  delta_vs_prior: number | null
  as_of: string
}

interface TopicMetaRow {
  topic: string
  topic_origin: string | null
  discovered_at: string | null
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

function formatRaw(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function latestPerTopic(rows: CompositeRow[]): CompositeRow[] {
  const byTopic = new Map<string, CompositeRow>()
  for (const row of rows) {
    const existing = byTopic.get(row.topic)
    if (!existing || row.as_of > existing.as_of) byTopic.set(row.topic, row)
  }
  return Array.from(byTopic.values())
}

function latestPerTopicSource(rows: SignalRow[]): Map<string, SignalRow> {
  const byKey = new Map<string, SignalRow>()
  for (const row of rows) {
    const key = `${row.topic}::${row.source}`
    const existing = byKey.get(key)
    if (!existing || row.as_of > existing.as_of) byKey.set(key, row)
  }
  return byKey
}

function hasAgreement(signalsForTopic: SignalRow[]): boolean {
  const spiking = signalsForTopic.filter(
    (s) => s.delta_vs_prior !== null && s.delta_vs_prior > SPIKE_THRESHOLD_PCT
  )
  return spiking.length >= 2
}

function median(values: number[]): number {
  if (values.length === 0) return 50
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

type Quadrant = 'emerging' | 'trending' | 'saturated' | 'laggard' | 'neutral'

// Horizontal split is the median composite score of whatever topics are
// currently active in this category — deliberately relative rather than a
// fixed cutoff, since a fixed number would drift out of sync with whatever
// "high" actually means as topics come and go through discovery and
// retirement. Vertical split is a fixed 0% (growing vs. shrinking is a
// meaningful absolute line, unlike raw score level).
function quadrantFor(score: number, delta: number | null, medianScore: number): Quadrant {
  if (delta === null) return 'neutral'
  const high = score >= medianScore
  const rising = delta > 0
  if (high && rising) return 'trending'
  if (!high && rising) return 'emerging'
  if (high && !rising) return 'saturated'
  return 'laggard'
}

const QUADRANT_LABELS: Record<Exclude<Quadrant, 'neutral'>, string> = {
  emerging: 'Emerging',
  trending: 'Trending / Peaking',
  saturated: 'Saturated / Mature',
  laggard: 'Laggard',
}

// ── Main page ──────────────────────────────────────────────────────────

export default function TrendsPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [category, setCategory] = useState<TrendCategory>('auto')
  const [topics, setTopics] = useState<CompositeRow[]>([])
  const [signalsByKey, setSignalsByKey] = useState<Map<string, SignalRow>>(new Map())
  const [topicMeta, setTopicMeta] = useState<Map<string, TopicMetaRow>>(new Map())
  const [loading, setLoading] = useState(true)

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [sparkline, setSparkline] = useState<CompositeRow[]>([])
  const [sourceBreakdown, setSourceBreakdown] = useState<SignalRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [comparisonData, setComparisonData] = useState<Record<string, any>[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonLoading, setComparisonLoading] = useState(false)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  // Load current topics, latest per-source signals, and topic lifecycle
  // metadata (origin/discovered_at) for the selected category. Lifecycle
  // metadata drives the "New" badge — it lives in trend_topics, not
  // trend_composite/trend_signals, so it's a separate query.
  useEffect(() => {
    if (!CATEGORY_META[category].active) {
      setTopics([])
      setSignalsByKey(new Map())
      setTopicMeta(new Map())
      setLoading(false)
      return
    }
    setLoading(true)
    setCompareMode(false)
    setCompareSelection([])

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 3)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    Promise.all([
      supabase
        .from('trend_composite')
        .select('*')
        .eq('category', category)
        .gte('as_of', cutoffStr)
        .order('as_of', { ascending: false }),
      supabase
        .from('trend_signals')
        .select('topic, source, signal_score, raw_value, delta_vs_prior, as_of')
        .eq('category', category)
        .gte('as_of', cutoffStr)
        .order('as_of', { ascending: false }),
      supabase
        .from('trend_topics')
        .select('topic, topic_origin, discovered_at')
        .eq('category', category)
        .eq('active', true),
    ]).then(([compositeRes, signalsRes, metaRes]) => {
      setTopics(latestPerTopic((compositeRes.data as CompositeRow[]) || []))
      setSignalsByKey(latestPerTopicSource((signalsRes.data as SignalRow[]) || []))
      const metaMap = new Map<string, TopicMetaRow>()
      for (const row of (metaRes.data as TopicMetaRow[]) || []) metaMap.set(row.topic, row)
      setTopicMeta(metaMap)
      setLoading(false)
    })
  }, [category])

  const categoryRollup = useMemo(() => {
    const withDelta = topics.filter((t) => t.delta_vs_prior !== null)
    if (withDelta.length === 0) return null
    const avg =
      withDelta.reduce((sum, t) => sum + (t.delta_vs_prior as number), 0) / withDelta.length
    return Math.round(avg * 10) / 10
  }, [topics])

  const medianScore = useMemo(() => median(topics.map((t) => t.composite_score)), [topics])

  const isNewTopic = (topic: string): boolean => {
    const meta = topicMeta.get(topic)
    if (!meta || meta.topic_origin !== 'discovered' || !meta.discovered_at) return false
    const ageMs = Date.now() - new Date(meta.discovered_at).getTime()
    return ageMs < NEW_TOPIC_WINDOW_DAYS * 24 * 60 * 60 * 1000
  }

  const openTopicDetail = (topic: string) => {
    setSelectedTopic(topic)
    setDetailLoading(true)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    Promise.all([
      supabase
        .from('trend_composite')
        .select('*')
        .eq('topic', topic)
        .gte('as_of', cutoffStr)
        .order('as_of', { ascending: true }),
      supabase
        .from('trend_signals')
        .select('topic, source, signal_score, raw_value, delta_vs_prior, as_of')
        .eq('topic', topic)
        .order('as_of', { ascending: false })
        .limit(10),
    ]).then(([compositeRes, signalsRes]) => {
      setSparkline((compositeRes.data as CompositeRow[]) || [])
      const bySource = latestPerTopicSource((signalsRes.data as SignalRow[]) || [])
      setSourceBreakdown(Array.from(bySource.values()))
      setDetailLoading(false)
    })
  }

  const toggleCompareSelection = (topic: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(topic)) return prev.filter((t) => t !== topic)
      if (prev.length >= MAX_COMPARE_TOPICS) return prev
      return [...prev, topic]
    })
  }

  const handlePointClick = (topic: string) => {
    if (compareMode) toggleCompareSelection(topic)
    else openTopicDetail(topic)
  }

  const openComparison = () => {
    if (compareSelection.length < 2) return
    setShowComparison(true)
    setComparisonLoading(true)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    Promise.all(
      compareSelection.map((topic) =>
        supabase
          .from('trend_composite')
          .select('topic, composite_score, as_of')
          .eq('topic', topic)
          .gte('as_of', cutoffStr)
          .order('as_of', { ascending: true })
      )
    ).then((results) => {
      const byDate = new Map<string, Record<string, any>>()
      results.forEach((res, i) => {
        const topic = compareSelection[i]
        for (const row of (res.data as any[]) || []) {
          const existing = byDate.get(row.as_of) || { as_of: row.as_of }
          existing[topic] = row.composite_score
          byDate.set(row.as_of, existing)
        }
      })
      setComparisonData(Array.from(byDate.values()).sort((a, b) => a.as_of.localeCompare(b.as_of)))
      setComparisonLoading(false)
    })
  }

  const selectedRow = useMemo(
    () => topics.find((t) => t.topic === selectedTopic) || null,
    [topics, selectedTopic]
  )

  const scatterData = useMemo(
    () =>
      topics.map((t) => ({
        ...t,
        quadrant: quadrantFor(t.composite_score, t.delta_vs_prior, medianScore),
        isNew: isNewTopic(t.topic),
      })),
    [topics, medianScore, topicMeta]
  )

  // ── Token-based styles ────────────────────────────────────────────────
  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const tabBase =
    'px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2'
  const tabActive = dark ? 'bg-white/10 text-white' : 'bg-zinc-900 text-white'
  const tabInactive = dark
    ? 'text-white/35 hover:text-white/70'
    : 'text-zinc-500 hover:text-zinc-900'
  const tabDisabled = dark ? 'text-white/15 cursor-not-allowed' : 'text-zinc-300 cursor-not-allowed'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <IntelligenceSubNav />

      <main className="pt-8 px-6 max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="mt-8 mb-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold mb-1 tracking-tight">User Behaviors</h1>
            <p className={`text-sm ${muted}`}>
              What the public is actively researching right now — new topics are discovered
              automatically as they trend and retired once they go cold, so this stays a living
              picture, not a fixed list.
            </p>
          </div>
          {CATEGORY_META[category].active && (
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
              {compareMode ? 'Cancel Compare' : 'Compare Topics'}
            </button>
          )}
        </div>

        {/* Info banner */}
        <div
          className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border mb-4 ${dark ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
        >
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p
            className={`text-xs leading-relaxed ${dark ? 'text-blue-200/70' : 'text-blue-900/70'}`}
          >
            Each dot is one topic. Horizontal position is current interest level relative to today's
            mix (dashed line marks the median); vertical position is momentum vs. last week.
            Composite scores reflect Wikipedia, YouTube, and Google Trends; Reddit is pending
            approval. Topics marked <Sparkles size={10} className="inline mx-0.5" />
            New were surfaced from real trending searches in the last {NEW_TOPIC_WINDOW_DAYS} days —
            not part of the original curated list.
          </p>
        </div>

        {/* Category rollup */}
        {CATEGORY_META[category].active && categoryRollup !== null && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-6 ${card}`}>
            <Zap size={16} className="text-blue-500 shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">{CATEGORY_META[category].label} overall</span> is{' '}
              <span className={`font-bold ${deltaColor(categoryRollup)}`}>
                {categoryRollup > 0 ? '+' : ''}
                {categoryRollup}%
              </span>{' '}
              vs. last week, averaged across{' '}
              {topics.filter((t) => t.delta_vs_prior !== null).length} topic
              {topics.filter((t) => t.delta_vs_prior !== null).length !== 1 ? 's' : ''} with enough
              history to compare.
            </p>
          </div>
        )}

        {/* Category tabs */}
        <div
          className={`flex gap-1 mb-4 p-1 rounded-xl w-fit flex-wrap ${dark ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}
        >
          {(Object.keys(CATEGORY_META) as TrendCategory[]).map((c) => {
            const meta = CATEGORY_META[c]
            const Icon = meta.icon
            return (
              <button
                key={c}
                onClick={() => meta.active && setCategory(c)}
                disabled={!meta.active}
                title={meta.active ? undefined : 'Coming soon'}
                className={`${tabBase} ${
                  !meta.active ? tabDisabled : category === c ? tabActive : tabInactive
                }`}
              >
                <Icon size={13} />
                {meta.label}
                {!meta.active && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`}
                  >
                    Soon
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Compare mode banner */}
        {compareMode && (
          <div
            className={`flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg border ${dark ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
          >
            <p className={`text-xs ${dark ? 'text-blue-200/70' : 'text-blue-900/70'}`}>
              Select 2-{MAX_COMPARE_TOPICS} topics to overlay ({compareSelection.length}/
              {MAX_COMPARE_TOPICS} selected)
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

        {/* Quadrant matrix */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !CATEGORY_META[category].active ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <p className={`text-sm ${muted}`}>This category is planned but not built yet.</p>
          </div>
        ) : scatterData.length === 0 ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <p className={`text-sm ${muted}`}>
              No data yet for this category — check back after the next daily refresh.
            </p>
          </div>
        ) : (
          <div className={`relative p-4 rounded-xl border ${card}`}>
            <div className="absolute top-4 left-4 text-[10px] font-semibold uppercase tracking-wide text-blue-500 z-10">
              Emerging
            </div>
            <div className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wide text-emerald-500 z-10">
              Trending / Peaking
            </div>
            <div className="absolute bottom-4 right-4 text-[10px] font-semibold uppercase tracking-wide text-amber-500 z-10">
              Saturated / Mature
            </div>
            <div
              className={`absolute bottom-4 left-4 text-[10px] font-semibold uppercase tracking-wide z-10 ${dark ? 'text-white/30' : 'text-zinc-400'}`}
            >
              Laggard
            </div>

            <div className="h-96 pt-8">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <XAxis
                    type="number"
                    dataKey="composite_score"
                    domain={[0, 100]}
                    name="Interest level"
                    tick={{ fontSize: 10, fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a' }}
                    label={{
                      value: 'Interest level (current, relative to own history)',
                      position: 'insideBottom',
                      offset: -5,
                      fontSize: 10,
                      fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a',
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="delta_vs_prior"
                    name="Momentum"
                    tick={{ fontSize: 10, fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a' }}
                    label={{
                      value: 'Momentum (% vs. last week)',
                      angle: -90,
                      position: 'insideLeft',
                      fontSize: 10,
                      fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a',
                    }}
                  />
                  <ZAxis range={[80, 80]} />
                  <ReferenceLine
                    x={medianScore}
                    stroke={dark ? 'rgba(255,255,255,0.15)' : '#d4d4d8'}
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={0}
                    stroke={dark ? 'rgba(255,255,255,0.15)' : '#d4d4d8'}
                    strokeDasharray="4 4"
                  />
                  <RechartsTooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload[0]) return null
                      const d: any = payload[0].payload
                      return (
                        <div
                          className={`px-3 py-2 rounded-lg border text-xs ${dark ? 'bg-[#111118] border-white/10' : 'bg-white border-zinc-200'}`}
                        >
                          <p className="font-semibold flex items-center gap-1">
                            {d.topic}
                            {d.isNew && <Sparkles size={10} className="text-blue-400" />}
                          </p>
                          <p className={muted}>
                            Score {d.composite_score} ·{' '}
                            {d.delta_vs_prior !== null
                              ? `${d.delta_vs_prior > 0 ? '+' : ''}${d.delta_vs_prior}%`
                              : 'new'}
                          </p>
                          {d.quadrant !== 'neutral' && (
                            <p className={muted}>
                              {QUADRANT_LABELS[d.quadrant as Exclude<Quadrant, 'neutral'>]}
                            </p>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Scatter
                    data={scatterData}
                    onClick={(point: any) => handlePointClick(point.topic)}
                    cursor="pointer"
                  >
                    {scatterData.map((d) => (
                      <Cell
                        key={d.topic}
                        fill={
                          compareSelection.includes(d.topic)
                            ? '#3b82f6'
                            : QUADRANT_COLORS[d.quadrant]
                        }
                        stroke={compareSelection.includes(d.topic) ? '#1d4ed8' : 'none'}
                        strokeWidth={compareSelection.includes(d.topic) ? 2 : 0}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Topic names grouped by quadrant — dots alone aren't readable
                labels at this density. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/5">
              {(['emerging', 'trending', 'saturated', 'laggard'] as const).map((q) => (
                <div key={q}>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: QUADRANT_COLORS[q] }}
                  >
                    {QUADRANT_LABELS[q]}
                  </p>
                  <div className="space-y-1">
                    {scatterData
                      .filter((d) => d.quadrant === q)
                      .map((d) => (
                        <button
                          key={d.topic}
                          onClick={() => handlePointClick(d.topic)}
                          className={`flex items-center gap-1 text-xs text-left hover:underline ${
                            compareSelection.includes(d.topic) ? 'text-blue-500 font-medium' : muted
                          }`}
                        >
                          {d.isNew && <Sparkles size={9} className="text-blue-400 shrink-0" />}
                          {d.topic}
                        </button>
                      ))}
                    {scatterData.filter((d) => d.quadrant === q).length === 0 && (
                      <p className={`text-[11px] ${muted}`}>None right now</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {CATEGORY_META[category].active && (
          <TrendSeasonalityStrip category={category} dark={dark} onSelectTopic={openTopicDetail} />
        )}

        <TopicHistorySearch dark={dark} />

        {/* Topic detail panel */}
        {selectedTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setSelectedTopic(null)}
            />
            <div className={`relative w-full max-w-lg p-6 rounded-2xl border shadow-2xl ${card}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-1.5">
                    {selectedTopic}
                    {isNewTopic(selectedTopic) && (
                      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold">
                        <Sparkles size={9} /> New
                      </span>
                    )}
                  </h3>
                  {selectedRow && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-3xl font-black">{selectedRow.composite_score}</span>
                      <span
                        className={`flex items-center gap-1 text-sm font-medium ${deltaColor(selectedRow.delta_vs_prior)}`}
                      >
                        <TrendArrow delta={selectedRow.delta_vs_prior} />
                        {selectedRow.delta_vs_prior !== null
                          ? `${selectedRow.delta_vs_prior > 0 ? '+' : ''}${selectedRow.delta_vs_prior}% vs. last week`
                          : 'Not enough history yet'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedTopic(null)}
                  className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/[0.05] text-white/40' : 'hover:bg-zinc-100 text-zinc-500'}`}
                >
                  <X size={16} />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {sparkline.length > 0 && sparkline.length < 4 && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs ${dark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}
                    >
                      <Info size={12} className="shrink-0" />
                      Early data — scores stabilize after about a week of history. A 100 right now
                      means "first reading," not "at its peak."
                    </div>
                  )}

                  {hasAgreement(sourceBreakdown) && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs font-medium ${dark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}
                    >
                      <Zap size={12} className="shrink-0" />
                      Confirmed across multiple sources — at least two sources are spiking on this
                      topic at the same time, a stronger signal than either alone.
                    </div>
                  )}

                  <div className="mb-5">
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>
                      Last 14 Days
                    </p>
                    {sparkline.length >= 2 ? (
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sparkline}>
                            <XAxis dataKey="as_of" hide />
                            <YAxis hide domain={[0, 100]} />
                            <RechartsTooltip
                              contentStyle={{
                                background: dark ? '#111118' : '#fff',
                                border: dark
                                  ? '1px solid rgba(255,255,255,0.1)'
                                  : '1px solid #e4e4e7',
                                borderRadius: 8,
                                fontSize: 11,
                              }}
                              labelFormatter={(v) => v}
                              formatter={(v: any) => [v, 'Score']}
                            />
                            <Line
                              type="monotone"
                              dataKey="composite_score"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className={`text-xs ${muted}`}>
                        Not enough history yet — check back after a few more daily refreshes.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>
                      Source Breakdown
                    </p>
                    <div className="space-y-3">
                      {sourceBreakdown.length === 0 ? (
                        <p className={`text-xs ${muted}`}>No source data available yet.</p>
                      ) : (
                        sourceBreakdown.map((s) => (
                          <div key={s.source}>
                            <div className="flex items-center gap-3">
                              <span className={`text-xs w-20 shrink-0 ${muted}`}>
                                {SOURCE_LABELS[s.source] || s.source}
                              </span>
                              <div
                                className={`flex-1 h-2 rounded-full overflow-hidden ${dark ? 'bg-white/5' : 'bg-zinc-100'}`}
                              >
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${s.signal_score}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right">
                                {s.signal_score}
                              </span>
                            </div>
                            <p className={`text-[11px] mt-1 ml-[84px] ${muted}`}>
                              {formatRaw(s.raw_value)} {RAW_UNIT_LABELS[s.source] || 'units'}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Cross-topic comparison modal */}
        {showComparison && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowComparison(false)}
            />
            <div className={`relative w-full max-w-2xl p-6 rounded-2xl border shadow-2xl ${card}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">Compare Topics</h3>
                  <p className={`text-xs mt-0.5 ${muted}`}>Last 14 days, interest score</p>
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
                  Not enough shared history yet across these topics to compare.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonData}>
                      <XAxis
                        dataKey="as_of"
                        tick={{ fontSize: 10, fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a' }}
                        tickFormatter={(v) => v.slice(5)}
                      />
                      <YAxis
                        domain={[0, 100]}
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
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {compareSelection.map((topic, i) => (
                        <Line
                          key={topic}
                          type="monotone"
                          dataKey={topic}
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
