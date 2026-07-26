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
  PawPrint,
  HeartPulse,
  Utensils,
  Baby,
  Trophy,
  Gamepad2,
  Shirt,
  Hammer,
  Clapperboard,
  Mountain,
  Tag,
  Zap,
  Scale,
  Sparkles,
  Building2,
  Link2,
  Swords,
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
//
// Categories are no longer a fixed, hand-maintained list. Which tabs show
// up here is entirely data-driven — whatever categories currently have at
// least one active topic in trend_topics, queried on load (see the
// `availableCategories` effect below). Labels/icons below are just cosmetic
// lookups for categories we anticipated; anything discovered that isn't in
// this list still works, it just falls back to a title-cased version of its
// raw name and a generic tag icon (see categoryLabel/categoryIcon).

const CATEGORY_LABELS: Partial<Record<string, string>> = {
  auto: 'Auto',
  education: 'Education',
  finance: 'Finance',
  home: 'Home',
  travel: 'Travel',
  tech: 'Tech',
  pets: 'Pets',
  fitness_wellness: 'Fitness & Wellness',
  beauty: 'Beauty',
  food_dining: 'Food & Dining',
  parenting: 'Parenting',
  sports: 'Sports',
  gaming: 'Gaming',
  fashion: 'Fashion',
  home_improvement: 'Home Improvement',
  entertainment: 'Entertainment',
  outdoors: 'Outdoors',
  company: 'Companies',
}

const CATEGORY_ICONS: Partial<Record<string, any>> = {
  auto: Car,
  education: GraduationCap,
  finance: DollarSign,
  home: HomeIcon,
  travel: Plane,
  tech: Cpu,
  pets: PawPrint,
  fitness_wellness: HeartPulse,
  beauty: Sparkles,
  food_dining: Utensils,
  parenting: Baby,
  sports: Trophy,
  gaming: Gamepad2,
  fashion: Shirt,
  home_improvement: Hammer,
  entertainment: Clapperboard,
  outdoors: Mountain,
}

function categoryLabel(cat: string): string {
  return (
    CATEGORY_LABELS[cat] ||
    cat
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  )
}

function categoryIcon(cat: string) {
  return CATEGORY_ICONS[cat] || Tag
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
  google_trends: 'interest index',
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
  category: string
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

// Postgres numeric/decimal columns (composite_score, delta_vs_prior,
// signal_score, raw_value all fall in this category) commonly come back
// through Supabase as JSON strings rather than JS numbers, to avoid
// silent precision loss — confirmed against a real export of this app's
// own tables (composite_score/delta_vs_prior showed up quoted, e.g.
// "37", "-23.1"). Left uncoerced, `sum + t.delta_vs_prior` in
// categoryRollup below would silently string-concatenate instead of add,
// producing a NaN rollup. Every row is normalized to real numbers right
// at the point it's read from Supabase, once, rather than trusting the
// type callers annotate it with.
function toCompositeRow(row: any): CompositeRow {
  return {
    topic: row.topic,
    category: row.category,
    composite_score: Number(row.composite_score),
    delta_vs_prior: row.delta_vs_prior === null ? null : Number(row.delta_vs_prior),
    source_count: Number(row.source_count),
    as_of: row.as_of,
  }
}

function toSignalRow(row: any): SignalRow {
  return {
    topic: row.topic,
    source: row.source,
    signal_score: Number(row.signal_score),
    raw_value: Number(row.raw_value),
    delta_vs_prior: row.delta_vs_prior === null ? null : Number(row.delta_vs_prior),
    as_of: row.as_of,
  }
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

  const [category, setCategory] = useState<string | null>(null)
  const [previousCategory, setPreviousCategory] = useState<string | null>(null)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [researchedCompanyNames, setResearchedCompanyNames] = useState<Set<string> | null>(null)

  const [topics, setTopics] = useState<CompositeRow[]>([])
  const [signalsByKey, setSignalsByKey] = useState<Map<string, SignalRow>>(new Map())
  const [topicMeta, setTopicMeta] = useState<Map<string, TopicMetaRow>>(new Map())
  const [loading, setLoading] = useState(true)

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [sparkline, setSparkline] = useState<CompositeRow[]>([])
  const [sourceBreakdown, setSourceBreakdown] = useState<SignalRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [relatedQueries, setRelatedQueries] = useState<{ query: string; value: number }[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [knownCompetitors, setKnownCompetitors] = useState<{ name: string; description: string }[]>(
    []
  )
  const [competitorsLoading, setCompetitorsLoading] = useState(false)

  const [compareMode, setCompareMode] = useState(false)
  const [companySearch, setCompanySearch] = useState('')
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [comparisonData, setComparisonData] = useState<Record<string, any>[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonLoading, setComparisonLoading] = useState(false)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  // Discovers which category tabs to show, purely from what currently has
  // active topics — no hardcoded list of "supported" categories. A category
  // only appears once something real has been classified into it; the tab
  // bar grows or shrinks on its own as the tracked topic pool changes.
  //
  // 'company' is deliberately excluded from this list — tracked companies
  // aren't a trending-keyword category, they're a research roster (see
  // isCompanyView below), and get their own separate button rather than
  // sitting in this pill group where they'd read as "just another topic
  // area" alongside Auto/Finance/etc.
  useEffect(() => {
    supabase
      .from('trend_topics')
      .select('category')
      .eq('active', true)
      .then(({ data }) => {
        const distinct = Array.from(
          new Set(((data as any[]) || []).map((r) => r.category as string))
        )
          .filter((c) => c !== 'company')
          .sort()
        setAvailableCategories(distinct)
        setCategory((prev) => {
          if (prev && (distinct.includes(prev) || prev === 'company')) return prev
          return distinct.includes('auto') ? 'auto' : distinct[0] || null
        })
        setCategoriesLoading(false)
      })
  }, [])

  // Fetches once, the first time Companies view is opened — the set of
  // company names that have actually been through the research step, used
  // to filter the roster down to companies that can show real competitor
  // data instead of including every on-demand-tracked company regardless.
  useEffect(() => {
    if (category !== 'company' || researchedCompanyNames !== null) return
    fetch('/api/trends/researched-companies')
      .then((res) => res.json())
      .then((data) => setResearchedCompanyNames(new Set(data.names || [])))
      .catch(() => setResearchedCompanyNames(new Set()))
  }, [category, researchedCompanyNames])

  // Load current topics, latest per-source signals, and topic lifecycle
  // metadata (origin/discovered_at) for the selected category. Lifecycle
  // metadata drives the "New" badge — it lives in trend_topics, not
  // trend_composite/trend_signals, so it's a separate query.
  useEffect(() => {
    if (!category) {
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
      setTopics(latestPerTopic(((compositeRes.data as any[]) || []).map(toCompositeRow)))
      setSignalsByKey(latestPerTopicSource(((signalsRes.data as any[]) || []).map(toSignalRow)))
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
    setRelatedLoading(true)
    setRelatedQueries([])
    setCompetitorsLoading(true)
    setKnownCompetitors([])

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
      setSparkline(((compositeRes.data as any[]) || []).map(toCompositeRow))
      const bySource = latestPerTopicSource(((signalsRes.data as any[]) || []).map(toSignalRow))
      setSourceBreakdown(Array.from(bySource.values()))
      setDetailLoading(false)
    })

    // Independent request, not part of the Promise.all above — related
    // queries can be genuinely slow (a live Google Trends fetch on a cache
    // miss involves two sequential requests) and shouldn't hold up the
    // sparkline/source-breakdown section, which has its own faster,
    // more reliable data source.
    fetch(`/api/trends/related?topic=${encodeURIComponent(topic)}`)
      .then((res) => res.json())
      .then((data) => setRelatedQueries(data.related || []))
      .catch(() => setRelatedQueries([]))
      .finally(() => setRelatedLoading(false))

    // Real, AI-derived competitor data from the home dashboard's Company
    // Research tool — already built, already persisted in company_research
    // whenever anyone researches a company (required before a project can
    // target one). Matched by name, so this only populates for topics that
    // happen to have been researched at some point; a company added purely
    // via on-demand tracking without ever going through that research step
    // just won't have a match, which is a correct empty state, not a bug.
    fetch(`/api/trends/competitors?company=${encodeURIComponent(topic)}`)
      .then((res) => res.json())
      .then((data) => setKnownCompetitors(data.competitors || []))
      .catch(() => setKnownCompetitors([]))
      .finally(() => setCompetitorsLoading(false))
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
          existing[topic] = Number(row.composite_score)
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

  // Companies get a roster, not a quadrant — plotting Teads against Apple
  // against Stop & Shop on shared interest/momentum axes isn't a real
  // comparison just because they all happen to be tracked. The quadrant's
  // median-split logic assumes one coherent topic area; a company roster
  // spans however many unrelated industries someone's actually researched.
  const isCompanyView = category === 'company'

  // Only companies that have actually been through Company Research —
  // per James's ask, a company sitting on the roster with no possible
  // competitor data isn't adding much, and it made the list longer than
  // it needed to be. researchedCompanyNames === null means the fetch
  // hasn't resolved yet (handled as a loading state below), NOT "nothing
  // matched" — an empty Set after a successful fetch is what actually
  // means zero matches.
  const researchedCompanies = useMemo(() => {
    if (!researchedCompanyNames) return []
    return scatterData.filter((d) => researchedCompanyNames.has(d.topic.toLowerCase().trim()))
  }, [scatterData, researchedCompanyNames])

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
              What the public is actively researching right now — both topics and the categories
              themselves are discovered organically from real trending activity, not a fixed list,
              and retired once they go cold.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                if (isCompanyView) {
                  setCategory(
                    previousCategory ||
                      (availableCategories.includes('auto')
                        ? 'auto'
                        : availableCategories[0] || null)
                  )
                } else {
                  setPreviousCategory(category)
                  setCategory('company')
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                isCompanyView
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
                  : dark
                    ? 'border-white/[0.08] text-white/50 hover:bg-white/[0.04]'
                    : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <Building2 size={13} />
              Companies
            </button>
            {!categoriesLoading && availableCategories.length > 0 && !isCompanyView && (
              <button
                onClick={() => {
                  setCompareMode(!compareMode)
                  setCompareSelection([])
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
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
        </div>

        {/* Info banner */}
        <div
          className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border mb-4 ${dark ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
        >
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p
            className={`text-xs leading-relaxed ${dark ? 'text-blue-200/70' : 'text-blue-900/70'}`}
          >
            {isCompanyView ? (
              <>
                Companies you've researched through an analysis, tracked individually — sorted by
                current interest level, not plotted against each other, since companies from
                unrelated industries have nothing meaningful to be compared on. Click any company
                for its own history, or use Compare below to overlay a few you actually want side by
                side.
              </>
            ) : (
              <>
                Each dot is one topic. Horizontal position is current interest level relative to
                today's mix (dashed line marks the median); vertical position is momentum vs. last
                week. Composite scores reflect Wikipedia, YouTube, and Google Trends; Reddit is
                pending approval. Topics marked <Sparkles size={10} className="inline mx-0.5" />
                New were surfaced from real trending searches in the last {
                  NEW_TOPIC_WINDOW_DAYS
                }{' '}
                days. Category tabs themselves only appear once real activity has been classified
                into them — there's no fixed list of supported categories.
              </>
            )}
          </p>
        </div>

        {/* Category rollup */}
        {category && categoryRollup !== null && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-6 ${card}`}>
            <Zap size={16} className="text-blue-500 shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">{categoryLabel(category)} overall</span> is{' '}
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

        {/* Category tabs — built entirely from availableCategories. Hidden
            in Companies view (the Companies button itself toggles back to
            the last keyword category — see previousCategory above), so
            these don't sit alongside a company roster where they don't
            apply. */}
        {!categoriesLoading && availableCategories.length > 0 && !isCompanyView && (
          <div
            className={`flex gap-1 mb-4 p-1 rounded-xl w-fit flex-wrap ${dark ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}
          >
            {availableCategories.map((c) => {
              const Icon = categoryIcon(c)
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`${tabBase} ${category === c ? tabActive : tabInactive}`}
                >
                  <Icon size={13} />
                  {categoryLabel(c)}
                </button>
              )
            })}
          </div>
        )}

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

        {/* Quadrant matrix (keywords) or roster (companies) */}
        {categoriesLoading || loading || (isCompanyView && researchedCompanyNames === null) ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !isCompanyView && availableCategories.length === 0 ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <p className={`text-sm ${muted}`}>
              No categories have active data yet — check back after the next daily refresh runs and
              classifies today's trending terms.
            </p>
          </div>
        ) : isCompanyView && researchedCompanies.length === 0 ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <p className={`text-sm ${muted}`}>
              {scatterData.length === 0
                ? "No companies tracked yet — they're added automatically the first time you run an analysis with a target company set."
                : 'None of your tracked companies have been through Company Research yet — this roster only shows companies with real competitor data available. Research a company on the home dashboard to add it here.'}
            </p>
          </div>
        ) : !isCompanyView && scatterData.length === 0 ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <p className={`text-sm ${muted}`}>
              No data yet for this category — check back after the next daily refresh.
            </p>
          </div>
        ) : isCompanyView ? (
          <div className={`p-4 rounded-xl border ${card}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <input
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Filter companies…"
                className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${dark ? 'bg-white/[0.03] border-white/10 text-white placeholder-white/25' : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400'}`}
              />
              <span className={`text-xs shrink-0 ${muted}`}>
                {researchedCompanies.length} researched
              </span>
            </div>
            <div className="space-y-2">
              {researchedCompanies
                .filter((d) => d.topic.toLowerCase().includes(companySearch.trim().toLowerCase()))
                .slice()
                .sort((a, b) => b.composite_score - a.composite_score)
                .map((d) => (
                  <button
                    key={d.topic}
                    onClick={() => openTopicDetail(d.topic)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors hover:border-blue-500/40 hover:bg-blue-500/[0.03] ${card}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {d.isNew && <Sparkles size={12} className="text-blue-400 shrink-0" />}
                      <span className="text-sm font-medium truncate">{d.topic}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-lg font-bold">{d.composite_score}</span>
                      <span
                        className={`flex items-center gap-1 text-xs font-medium w-16 ${deltaColor(d.delta_vs_prior)}`}
                      >
                        <TrendArrow delta={d.delta_vs_prior} />
                        {d.delta_vs_prior !== null
                          ? `${d.delta_vs_prior > 0 ? '+' : ''}${d.delta_vs_prior}%`
                          : 'new'}
                      </span>
                    </div>
                  </button>
                ))}
              {researchedCompanies.filter((d) =>
                d.topic.toLowerCase().includes(companySearch.trim().toLowerCase())
              ).length === 0 && (
                <p className={`text-xs text-center py-6 ${muted}`}>
                  No researched companies match "{companySearch}"
                </p>
              )}
            </div>
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

        {category && (
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

                  <div className="mt-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Swords size={11} className="text-red-400" />
                      <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
                        Known Competitors
                      </p>
                    </div>
                    <p className={`text-[11px] mb-2.5 ${muted}`}>
                      From Company Research — AI-analyzed from {selectedTopic}'s own website, not
                      inferred from search behavior.
                    </p>
                    {competitorsLoading ? (
                      <p className={`text-xs ${muted}`}>Checking Company Research…</p>
                    ) : knownCompetitors.length === 0 ? (
                      <p className={`text-xs ${muted}`}>
                        No match in Company Research — this company may not have gone through the
                        home dashboard's research step yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {knownCompetitors.map((c) => (
                          <div
                            key={c.name}
                            className={`p-2.5 rounded-lg border ${dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50'}`}
                          >
                            <p className="text-xs font-semibold">{c.name}</p>
                            <p className={`text-[11px] mt-0.5 ${muted}`}>{c.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Link2 size={11} className={muted} />
                      <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
                        Related Searches
                      </p>
                    </div>
                    <p className={`text-[11px] mb-2.5 ${muted}`}>
                      What people actually search for alongside {selectedTopic} — a different signal
                      from Known Competitors above (real public search behavior, not AI judgment),
                      useful even when no formal research exists yet.
                    </p>
                    {relatedLoading ? (
                      <p className={`text-xs ${muted}`}>Looking up related searches…</p>
                    ) : relatedQueries.length === 0 ? (
                      <p className={`text-xs ${muted}`}>Nothing found for this one yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {relatedQueries.map((r) => (
                          <button
                            key={r.query}
                            onClick={() => openTopicDetail(r.query)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${dark ? 'border-white/10 text-white/70 hover:bg-white/[0.05]' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}
                            title="Open this term's own detail panel"
                          >
                            {r.query}
                          </button>
                        ))}
                      </div>
                    )}
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
