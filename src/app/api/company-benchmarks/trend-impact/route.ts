import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth, currentUser } from '@clerk/nextjs/server'
import { deriveCompanyKey } from '@/lib/companyBenchmarks'

// Service-role client — same reasoning as /api/company-benchmarks: this
// route derives companyKey from the signed-in Clerk user server-side, then
// reads on their behalf, rather than exposing these tables to client-side
// queries.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A (target_company, metric) pairing needs at least this many total
// contributions before it's worth evaluating at all, and each of the two
// buckets below needs at least this many on its own before that bucket's
// average is shown — a bucket average from a single data point isn't a
// pattern, it's a coincidence wearing a pattern's clothes.
const MIN_TOTAL_CONTRIBUTIONS = 3
const MIN_PER_BUCKET = 2

interface BenchmarkRow {
  metric_key: string
  metric_label: string
  value: number
  mode: string
  target_company: string
  contributed_at: string
}

interface TrendImpactResult {
  targetCompany: string
  metricKey: string
  metricLabel: string
  mode: string
  companyMedianScore: number
  highInterest: { avg: number; count: number }
  lowInterest: { avg: number; count: number }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null
  const companyKey = deriveCompanyKey(email)

  if (!companyKey) {
    return NextResponse.json({ companyKey: null, results: [] })
  }

  // Only rows with a target_company are candidates — most benchmark rows
  // have none (most projects have no target company at all), and those
  // simply can't be linked to any trend history.
  const { data: rows, error } = await supabaseAdmin
    .from('company_benchmark_history')
    .select('metric_key, metric_label, value, mode, target_company, contributed_at')
    .eq('company_key', companyKey)
    .not('target_company', 'is', null)

  if (error) {
    console.error('Failed to fetch benchmark rows for trend impact:', error)
    return NextResponse.json({ error: 'Failed to fetch benchmark history' }, { status: 500 })
  }

  // Group by (target_company, metric_key) — a correlation only makes sense
  // within one company and one metric at a time, never mixed across
  // different tracked companies or different metrics.
  const groups = new Map<string, BenchmarkRow[]>()
  for (const row of (rows || []) as BenchmarkRow[]) {
    const key = `${row.target_company}::${row.metric_key}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const results: TrendImpactResult[] = []

  // One trend_composite fetch per distinct target_company (not per group),
  // reused across every metric tied to that company — the number of
  // distinct tracked companies for one account is expected to stay small,
  // so this N+1-shaped query pattern is fine for now; worth revisiting if
  // that assumption stops holding.
  const trendHistoryByCompany = new Map<string, { composite_score: number; as_of: string }[]>()

  for (const [key, groupRows] of groups.entries()) {
    if (groupRows.length < MIN_TOTAL_CONTRIBUTIONS) continue

    const targetCompany = groupRows[0].target_company

    if (!trendHistoryByCompany.has(targetCompany)) {
      const { data: history } = await supabaseAdmin
        .from('trend_composite')
        .select('composite_score, as_of')
        .eq('topic', targetCompany)
        .order('as_of', { ascending: true })
      trendHistoryByCompany.set(
        targetCompany,
        (history || []).map((h: any) => ({
          composite_score: Number(h.composite_score),
          as_of: h.as_of,
        }))
      )
    }

    const trendHistory = trendHistoryByCompany.get(targetCompany)!
    if (trendHistory.length === 0) continue // company tracked, but no trend history yet

    const companyMedianScore = median(trendHistory.map((h) => h.composite_score))

    const highValues: number[] = []
    const lowValues: number[] = []

    for (const row of groupRows) {
      const contributedDate = row.contributed_at.slice(0, 10)
      // Closest trend_composite reading ON OR BEFORE this contribution's
      // date — trend history is daily, benchmark contributions happen
      // whenever an analysis runs, so this finds "what public interest
      // looked like as of that moment," not a same-day coincidence match.
      const priorReadings = trendHistory.filter((h) => h.as_of <= contributedDate)
      if (priorReadings.length === 0) continue
      const closest = priorReadings[priorReadings.length - 1]

      if (closest.composite_score >= companyMedianScore) {
        highValues.push(row.value)
      } else {
        lowValues.push(row.value)
      }
    }

    if (highValues.length < MIN_PER_BUCKET || lowValues.length < MIN_PER_BUCKET) continue

    results.push({
      targetCompany,
      metricKey: groupRows[0].metric_key,
      metricLabel: groupRows[0].metric_label,
      mode: groupRows[0].mode,
      companyMedianScore: Math.round(companyMedianScore),
      highInterest: {
        avg: round2(highValues.reduce((a, b) => a + b, 0) / highValues.length),
        count: highValues.length,
      },
      lowInterest: {
        avg: round2(lowValues.reduce((a, b) => a + b, 0) / lowValues.length),
        count: lowValues.length,
      },
    })
  }

  return NextResponse.json({ companyKey, results })
}
