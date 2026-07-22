'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'

const MAX_SELECTED = 4
const SEARCH_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
const SEARCH_DEBOUNCE_MS = 300

interface TopicMatch {
  topic: string
  category: string
  active: boolean
}

// A topic "seasonally peaks" in a given calendar month if that month was
// its single highest-scoring month in at least 2 different years — a
// deliberately conservative bar so this doesn't claim a pattern off one
// year of data, which is really just "it happened once."
function detectSeasonalPattern(chartRows: Record<string, any>[], topic: string): string | null {
  const byYear = new Map<string, { monthNum: string; score: number }[]>()
  for (const row of chartRows) {
    const score = row[topic]
    if (score === null || score === undefined) continue
    const [year, monthNum] = String(row.month).split('-')
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({ monthNum, score })
  }
  if (byYear.size < 2) return null // need at least 2 years of data to call anything seasonal

  const peakMonthByYear = new Map<string, string>()
  for (const [year, entries] of byYear.entries()) {
    const top = entries.reduce((a, b) => (b.score > a.score ? b : a))
    peakMonthByYear.set(year, top.monthNum)
  }

  const counts = new Map<string, number>()
  for (const m of peakMonthByYear.values()) counts.set(m, (counts.get(m) || 0) + 1)
  let bestMonth: string | null = null
  let bestCount = 0
  for (const [m, c] of counts.entries()) {
    if (c > bestCount) {
      bestCount = c
      bestMonth = m
    }
  }
  if (bestMonth && bestCount >= 2) {
    const monthName = new Date(2000, Number(bestMonth) - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
    })
    return `Tends to peak in ${monthName} — its top month in ${bestCount} of ${byYear.size} years on record.`
  }
  return null
}

// Builds one row per month across all months any selected topic has data
// for, each topic as its own column — same "peak score that month" logic
// as TrendSeasonalityStrip, just per-topic and unbounded in time range
// rather than the last 12 months for one category.
function buildMonthlySeries(
  rows: { topic: string; composite_score: number; as_of: string }[]
): Record<string, any>[] {
  const byTopicMonth = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const month = row.as_of.slice(0, 7)
    if (!byTopicMonth.has(row.topic)) byTopicMonth.set(row.topic, new Map())
    const m = byTopicMonth.get(row.topic)!
    // See TrendSeasonalityStrip.tsx's identical note — composite_score is
    // a Postgres numeric column and can come back as a JSON string.
    const score = Number(row.composite_score)
    const prev = m.get(month) ?? -Infinity
    if (score > prev) m.set(month, score)
  }

  const allMonths = new Set<string>()
  for (const m of byTopicMonth.values()) for (const month of m.keys()) allMonths.add(month)
  const sortedMonths = Array.from(allMonths).sort()

  return sortedMonths.map((month) => {
    const row: Record<string, any> = { month }
    for (const [topic, monthMap] of byTopicMonth.entries()) {
      row[topic] = monthMap.has(month) ? monthMap.get(month) : null
    }
    return row
  })
}

export default function TopicHistorySearch({ dark }: { dark: boolean }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<TopicMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [chartData, setChartData] = useState<Record<string, any>[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Debounced search across ALL topics ever recorded, active or retired,
  // any category — deliberately not scoped to the currently selected
  // category tab, since the point is to find something regardless of
  // whether it's still being tracked today.
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([])
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      supabase
        .from('trend_topics')
        .select('topic, category, active')
        .ilike('topic', `%${query.trim()}%`)
        .limit(10)
        .then(({ data }) => {
          setMatches((data as TopicMatch[]) || [])
          setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    if (selectedTopics.length === 0) {
      setChartData([])
      return
    }
    setLoadingHistory(true)
    supabase
      .from('trend_composite')
      .select('topic, composite_score, as_of')
      .in('topic', selectedTopics)
      .then(({ data }) => {
        setChartData(buildMonthlySeries((data as any[]) || []))
        setLoadingHistory(false)
      })
  }, [selectedTopics])

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => {
      if (prev.includes(topic)) return prev.filter((t) => t !== topic)
      if (prev.length >= MAX_SELECTED) return prev
      return [...prev, topic]
    })
  }

  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  return (
    <div className={`p-4 rounded-xl border mt-6 ${card}`}>
      <h3 className="text-sm font-semibold mb-1">Search Topic History</h3>
      <p className={`text-xs mb-3 ${muted}`}>
        Look up any topic ever recorded — including ones no longer actively tracked — and overlay up
        to {MAX_SELECTED} to compare their history side by side.
      </p>

      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 ${dark ? 'border-white/10 bg-white/[0.03]' : 'border-zinc-200 bg-zinc-50'}`}
      >
        <Search size={14} className={muted} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a topic, e.g. Mortgage Rates"
          className={`flex-1 bg-transparent outline-none text-sm ${dark ? 'text-white placeholder:text-white/25' : 'text-zinc-900 placeholder:text-zinc-400'}`}
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="mb-3">
          {searching ? (
            <p className={`text-xs ${muted}`}>Searching...</p>
          ) : matches.length === 0 ? (
            <p className={`text-xs ${muted}`}>No recorded topic matches "{query.trim()}".</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {matches.map((m) => {
                const isSelected = selectedTopics.includes(m.topic)
                return (
                  <button
                    key={m.topic}
                    onClick={() => toggleTopic(m.topic)}
                    disabled={!isSelected && selectedTopics.length >= MAX_SELECTED}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                        : dark
                          ? 'border-white/10 text-white/60 hover:bg-white/[0.05]'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {m.topic}
                    {!m.active && <span className="ml-1 opacity-60">(retired)</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {selectedTopics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {selectedTopics.map((topic, i) => (
            <span
              key={topic}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
              style={{ backgroundColor: `${SEARCH_COLORS[i]}20`, color: SEARCH_COLORS[i] }}
            >
              {topic}
              <button onClick={() => toggleTopic(topic)}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {selectedTopics.length === 0 ? (
        <p className={`text-xs py-6 text-center ${muted}`}>
          Search and select a topic above to see its recorded history.
        </p>
      ) : loadingHistory ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : chartData.length === 0 ? (
        <p className={`text-xs py-6 text-center ${muted}`}>
          No history recorded yet for the selected topic(s).
        </p>
      ) : (
        <>
          <div className="h-56 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: dark ? 'rgba(255,255,255,0.4)' : '#71717a' }}
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
                {selectedTopics.map((topic, i) => (
                  <Line
                    key={topic}
                    type="monotone"
                    dataKey={topic}
                    stroke={SEARCH_COLORS[i]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1">
            {selectedTopics.map((topic) => {
              const pattern = detectSeasonalPattern(chartData, topic)
              return pattern ? (
                <p key={topic} className={`text-xs ${muted}`}>
                  <span className="font-medium">{topic}:</span> {pattern}
                </p>
              ) : null
            })}
          </div>
        </>
      )}
    </div>
  )
}
