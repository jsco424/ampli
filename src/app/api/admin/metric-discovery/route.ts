import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isCurrentUserAdmin } from '@/lib/isAdmin'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors api/crowd/route.ts's METRIC_SYNONYMS value set — duplicated
// rather than imported, same reasoning as every other small cross-file
// helper in this codebase (boxesForLayout, getDataKeysLocal, etc.): this
// route only needs the small, static set of CANONICAL keys the ingestion
// route already normalizes toward, not its full column-name matching
// logic. If a new synonym is ever added there, it should be added here
// too so "known" stays accurate.
const KNOWN_CANONICAL_METRICS = new Set([
  'revenue',
  'conversion_rate',
  'customers',
  'orders',
  'marketing_spend',
  'average_order_value',
  'churn_rate',
  'retention_rate',
  'engagement_rate',
  'roas',
  'cart_abandonment_rate',
  'refund_rate',
])

// These three already have their own dedicated columns and are shown as
// the fixed hero stats on every industry's page by default — they're
// excluded from this list since "should this be promoted to a hero stat"
// doesn't apply to something that already is one.
const FIXED_HERO_METRICS = new Set(['revenue', 'conversion_rate', 'customers'])

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: industries, error } = await supabaseAdmin
    .from('crowd_insights')
    .select('industry, contribution_count, metrics')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // key -> aggregate across every industry that has seen it. Every
  // extendedMetrics entry is ALREADY visible somewhere today (the real
  // dashboard's "Additional Benchmarks" section renders every key
  // dynamically, per industry) — what this view adds is the CROSS-industry
  // view nothing else surfaces: which metrics recur widely enough to be
  // worth promoting to a fixed hero stat everyone sees by default, and
  // which raw, unrecognized keys might actually be the same underlying
  // metric fragmenting under different contributors' column-naming
  // conventions (e.g. "cac", "cost_per_acquisition", "acquisition_cost"
  // all landing as three separate, smaller-sample entries instead of one).
  const agg: Record<
    string,
    { label: string; totalContributions: number; industries: Set<string>; isKnown: boolean }
  > = {}

  for (const ind of industries || []) {
    const extended = ind.metrics?.extendedMetrics || {}
    for (const [key, val] of Object.entries(extended) as [string, any][]) {
      if (!agg[key]) {
        agg[key] = {
          label: val.label || key,
          totalContributions: 0,
          industries: new Set(),
          isKnown: KNOWN_CANONICAL_METRICS.has(key),
        }
      }
      agg[key].totalContributions += val.n || 0
      agg[key].industries.add(ind.industry)
    }
  }

  const rows = Object.entries(agg)
    .filter(([key]) => !FIXED_HERO_METRICS.has(key))
    .map(([key, v]) => ({
      key,
      label: v.label,
      isKnown: v.isKnown,
      industryCount: v.industries.size,
      industries: Array.from(v.industries).sort(),
      totalContributions: v.totalContributions,
    }))
    .sort(
      (a, b) => b.totalContributions - a.totalContributions || b.industryCount - a.industryCount
    )

  return NextResponse.json({ rows, industryCount: (industries || []).length })
}
