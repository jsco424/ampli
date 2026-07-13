'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
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
} from 'lucide-react'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts'

// ── Category config ─────────────────────────────────────────────────────
// All six from the original spec are shown so the page communicates the
// full planned scope, but only the ones with seeded topics are selectable —
// the rest show "Coming soon" rather than a dead/empty click target.

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
}

interface CompositeRow {
  topic: string
  category: TrendCategory
  composite_score: number
  delta_vs_prior: number | null
  source_count: number
  as_of: string
}

interface SignalRow {
  source: string
  signal_score: number
  as_of: string
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

// Keeps only the most recent row per topic from a set of composite rows
// spanning multiple days — the dashboard only ever shows "right now."
function latestPerTopic(rows: CompositeRow[]): CompositeRow[] {
  const byTopic = new Map<string, CompositeRow>()
  for (const row of rows) {
    const existing = byTopic.get(row.topic)
    if (!existing || row.as_of > existing.as_of) byTopic.set(row.topic, row)
  }
  return Array.from(byTopic.values())
}

// ── Main page ──────────────────────────────────────────────────────────

export default function TrendsPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [category, setCategory] = useState<TrendCategory>('auto')
  const [topics, setTopics] = useState<CompositeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [sparkline, setSparkline] = useState<CompositeRow[]>([])
  const [sourceBreakdown, setSourceBreakdown] = useState<SignalRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  // Load current topics for the selected category — pulls the last 3 days
  // of trend_composite rows (in case today's cron run hasn't landed yet)
  // and keeps only the latest row per topic.
  useEffect(() => {
    if (!CATEGORY_META[category].active) {
      setTopics([])
      setLoading(false)
      return
    }
    setLoading(true)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 3)

    supabase
      .from('trend_composite')
      .select('*')
      .eq('category', category)
      .gte('as_of', cutoff.toISOString().slice(0, 10))
      .order('as_of', { ascending: false })
      .then(({ data }) => {
        setTopics(latestPerTopic((data as CompositeRow[]) || []))
        setLoading(false)
      })
  }, [category])

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
        .select('source, signal_score, as_of')
        .eq('topic', topic)
        .order('as_of', { ascending: false })
        .limit(10),
    ]).then(([compositeRes, signalsRes]) => {
      setSparkline((compositeRes.data as CompositeRow[]) || [])
      // Keep only the most recent row per source for the breakdown
      const bySource = new Map<string, SignalRow>()
      for (const row of (signalsRes.data as SignalRow[]) || []) {
        const existing = bySource.get(row.source)
        if (!existing || row.as_of > existing.as_of) bySource.set(row.source, row)
      }
      setSourceBreakdown(Array.from(bySource.values()))
      setDetailLoading(false)
    })
  }

  const selectedRow = useMemo(
    () => topics.find((t) => t.topic === selectedTopic) || null,
    [topics, selectedTopic]
  )

  // ── Token-based styles — matches the rest of ampli ──────────────────
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

      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="mt-8 mb-4">
          <h1 className="text-2xl font-bold mb-1 tracking-tight">User Behaviors</h1>
          <p className={`text-sm ${muted}`}>
            What the public is actively researching right now — aggregated from public behavioral
            signals (Wikipedia, YouTube), not survey or panel data.
          </p>
        </div>

        {/* Info banner */}
        <div
          className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border mb-6 ${dark ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
        >
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p
            className={`text-xs leading-relaxed ${dark ? 'text-blue-200/70' : 'text-blue-900/70'}`}
          >
            Interest scores are 0-100, relative to each topic's own recent activity — a score of 100
            means today matches that topic's highest point in the last two weeks, not an absolute
            comparison between topics. Composite scores currently reflect Wikipedia and YouTube;
            Reddit is pending approval and will join automatically once available.
          </p>
        </div>

        {/* Category tabs */}
        <div
          className={`flex gap-1 mb-6 p-1 rounded-xl w-fit flex-wrap ${dark ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}
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

        {/* Topic grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <div className={`p-10 rounded-xl border text-center ${card}`}>
            <p className={`text-sm ${muted}`}>
              {CATEGORY_META[category].active
                ? 'No data yet for this category — check back after the next daily refresh.'
                : 'This category is planned but not built yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topics
              .sort((a, b) => b.composite_score - a.composite_score)
              .map((t) => (
                <button
                  key={t.topic}
                  onClick={() => openTopicDetail(t.topic)}
                  className={`text-left p-4 rounded-xl border transition-all hover:border-blue-500/40 hover:bg-blue-500/[0.03] ${card}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold pr-2">{t.topic}</p>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${dark ? 'bg-white/5 text-white/35' : 'bg-zinc-100 text-zinc-500'}`}
                    >
                      {t.source_count} source{t.source_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-black leading-none">{t.composite_score}</span>
                    <span
                      className={`flex items-center gap-1 text-xs font-medium mb-0.5 ${deltaColor(t.delta_vs_prior)}`}
                    >
                      <TrendArrow delta={t.delta_vs_prior} />
                      {t.delta_vs_prior !== null
                        ? `${t.delta_vs_prior > 0 ? '+' : ''}${t.delta_vs_prior}%`
                        : 'New'}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        )}

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
                  <h3 className="font-bold text-lg">{selectedTopic}</h3>
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
                  {/* Early-data notice — a 100 score on day one just means
                      "nothing to compare against yet," not "at its peak."
                      Fades away naturally as history accumulates. */}
                  {sparkline.length > 0 && sparkline.length < 4 && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs ${dark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}
                    >
                      <Info size={12} className="shrink-0" />
                      Early data — scores stabilize after about a week of history. A 100 right now
                      means "first reading," not "at its peak."
                    </div>
                  )}

                  {/* Sparkline */}
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

                  {/* Source breakdown */}
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>
                      Source Breakdown
                    </p>
                    <div className="space-y-2">
                      {sourceBreakdown.length === 0 ? (
                        <p className={`text-xs ${muted}`}>No source data available yet.</p>
                      ) : (
                        sourceBreakdown.map((s) => (
                          <div key={s.source} className="flex items-center gap-3">
                            <span className={`text-xs w-16 shrink-0 ${muted}`}>
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
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
