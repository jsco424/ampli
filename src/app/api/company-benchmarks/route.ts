import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth, currentUser } from '@clerk/nextjs/server'
import { deriveCompanyKey } from '@/lib/companyBenchmarks'

// Service-role client, not the anon/browser client — company_benchmark_history's
// RLS is deliberately locked to service-role only (see project overview:
// per-company read access needs a server route deriving the domain from
// Clerk's verified user object, not a pure Postgres policy, since a plain
// `auth.jwt()` policy can't check email domain). This route is that server
// route: it derives companyKey from the signed-in user, then reads on
// their behalf, rather than exposing the table to client-side queries.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null
  const companyKey = deriveCompanyKey(email)

  // Personal email domain (or no email) — same rule recordCompanyBenchmarks
  // uses when deciding whether to write. Nothing to read either.
  if (!companyKey) {
    return NextResponse.json({ companyKey: null, metrics: [] })
  }

  const { searchParams } = new URL(req.url)
  const metricKey = searchParams.get('metric')

  // Detail mode — full history for one metric, ascending, for the sparkline
  // and the comparison overlay.
  if (metricKey) {
    const { data, error } = await supabaseAdmin
      .from('company_benchmark_history')
      .select('value, mode, contributed_at')
      .eq('company_key', companyKey)
      .eq('metric_key', metricKey)
      .order('contributed_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch benchmark history:', error)
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }

    return NextResponse.json({ companyKey, metricKey, history: data || [] })
  }

  // List mode — every row for this company, newest first, collapsed
  // server-side into one summary per metric_key (latest value, prior value
  // for the delta, and a contribution count). Mirrors the client-side
  // latestPerTopic()/latestPerTopicSource() dedupe pattern in
  // trends/page.tsx, just done here since this is a fresh aggregation
  // query rather than a dedupe of an already-small client-side dataset.
  const { data, error } = await supabaseAdmin
    .from('company_benchmark_history')
    .select('metric_key, metric_label, value, mode, contributed_at')
    .eq('company_key', companyKey)
    .order('contributed_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch benchmark metrics:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }

  const byMetric = new Map<
    string,
    {
      metricKey: string
      metricLabel: string
      mode: string
      rows: { value: number; contributed_at: string }[]
    }
  >()
  for (const row of data || []) {
    const existing = byMetric.get(row.metric_key)
    const entry = { value: row.value, contributed_at: row.contributed_at }
    if (existing) {
      existing.rows.push(entry)
    } else {
      byMetric.set(row.metric_key, {
        metricKey: row.metric_key,
        metricLabel: row.metric_label,
        mode: row.mode,
        rows: [entry],
      })
    }
  }

  const metrics = Array.from(byMetric.values()).map((m) => {
    const latest = m.rows[0]
    const prior = m.rows[1]
    const deltaPct =
      prior && prior.value !== 0
        ? ((latest.value - prior.value) / Math.abs(prior.value)) * 100
        : null
    return {
      metricKey: m.metricKey,
      metricLabel: m.metricLabel,
      mode: m.mode,
      latestValue: latest.value,
      latestAt: latest.contributed_at,
      deltaPct: deltaPct !== null ? Math.round(deltaPct * 10) / 10 : null,
      contributionCount: m.rows.length,
    }
  })

  return NextResponse.json({ companyKey, metrics })
}
