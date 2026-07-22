'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MONTHS_BACK = 12
const TOP_N_PER_MONTH = 4

interface CompositeHistoryRow {
  topic: string
  composite_score: number
  as_of: string // YYYY-MM-DD
}

interface MonthEntry {
  month: string // YYYY-MM
  topTopics: { topic: string; peakScore: number }[]
}

function lastNMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1) // pin to the 1st so setMonth() never rolls over unpredictably
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// For each month, takes every topic's single highest composite_score that
// month (not an average) — a topic that spiked for a few days and cooled
// off should still show up as that month's story, not get diluted by the
// quiet days around it.
function buildMonthlyTopTopics(rows: CompositeHistoryRow[], months: string[]): MonthEntry[] {
  const byMonthTopic = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const month = row.as_of.slice(0, 7)
    if (!byMonthTopic.has(month)) byMonthTopic.set(month, new Map())
    const topicMap = byMonthTopic.get(month)!
    // composite_score is a Postgres numeric column and can come back as a
    // JSON string rather than a JS number — coerced here so comparisons
    // below are real numeric comparisons, not string comparisons.
    const score = Number(row.composite_score)
    const prev = topicMap.get(row.topic) ?? -Infinity
    if (score > prev) topicMap.set(row.topic, score)
  }

  return months.map((month) => {
    const topicMap = byMonthTopic.get(month) || new Map()
    const sorted = Array.from(topicMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N_PER_MONTH)
    return { month, topTopics: sorted.map(([topic, peakScore]) => ({ topic, peakScore })) }
  })
}

export default function TrendSeasonalityStrip({
  category,
  dark,
  onSelectTopic,
}: {
  category: string
  dark: boolean
  onSelectTopic?: (topic: string) => void
}) {
  const [months, setMonths] = useState<MonthEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const monthKeys = lastNMonths(MONTHS_BACK)
    const cutoffStr = `${monthKeys[0]}-01`

    supabase
      .from('trend_composite')
      .select('topic, composite_score, as_of')
      .eq('category', category)
      .gte('as_of', cutoffStr)
      .then(({ data }) => {
        setMonths(buildMonthlyTopTopics((data as CompositeHistoryRow[]) || [], monthKeys))
        setLoading(false)
      })
  }, [category])

  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const hasAnyData = months.some((m) => m.topTopics.length > 0)

  return (
    <div className={`p-4 rounded-xl border mt-6 ${card}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Seasonality — Trending Topics by Month</h3>
        <p className={`text-xs mt-0.5 ${muted}`}>
          Each column is a month's top topics by their peak score that month — a pattern that
          repeats year over year (e.g. the same topic spiking every spring) is a seasonal signal,
          not noise. Still shows a retired topic's history from when it was tracked.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasAnyData ? (
        <p className={`text-xs py-4 ${muted}`}>
          Not enough history yet — this fills in as daily refreshes accumulate over the coming weeks
          and months.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {months.map((m) => (
            <div
              key={m.month}
              className={`shrink-0 w-32 p-2.5 rounded-lg border ${dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50/60'}`}
            >
              <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>
                {monthLabel(m.month)}
              </p>
              {m.topTopics.length === 0 ? (
                <p className={`text-[11px] ${muted}`}>No data</p>
              ) : (
                <div className="space-y-1">
                  {m.topTopics.map((t) => (
                    <button
                      key={t.topic}
                      onClick={() => onSelectTopic?.(t.topic)}
                      disabled={!onSelectTopic}
                      className={`block w-full text-left text-[11px] leading-tight truncate hover:underline ${dark ? 'text-white/70' : 'text-zinc-700'}`}
                      title={`${t.topic} — peak score ${t.peakScore}`}
                    >
                      {t.topic}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
