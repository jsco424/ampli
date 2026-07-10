import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const VALID_INDUSTRIES = [
  'Retail',
  'Healthcare',
  'Technology',
  'Finance',
  'Marketing',
  'Education',
  'Manufacturing',
  'Hospitality',
  'Real Estate',
  'Media',
  'Energy',
  'Nonprofit',
  'Logistics',
  'Other',
]

interface CrowdBuckets {
  avg_revenue_growth: number | null
  avg_conversion_rate: number | null
  avg_customer_growth: number | null
}

// Mirrors dataSummary.ts's CategoryMetricStat shape exactly — that's the
// shape every dimensionSummary.metricsByCategory entry arrives in from a
// single upload.
interface CategoryMetricStat {
  mode: 'rate' | 'index'
  average: number
  index: number | null
  raw: {
    sum: number
    rowCount: number
    metricGrandTotal: number
    totalRowCount: number
  }
}

function round2(n: number | null | undefined): number | null {
  return n === null || n === undefined ? null : Math.round(n * 100) / 100
}

// Deterministic — maps detected metric column names to the three ORIGINAL
// fixed buckets the existing benchmarks page reads. Kept exactly as-is for
// backward compatibility — every field this produces continues to work
// unchanged. The widened capture below is purely additive, stored alongside
// these, not a replacement for them.
function mapMetricsToCrowdBuckets(metrics: Record<string, any> | undefined): CrowdBuckets {
  const m = metrics || {}
  const find = (pattern: RegExp) => Object.keys(m).find((k) => pattern.test(k))
  const revenueKey = find(/revenue|sales|income/i)
  const conversionKey = find(/conversion/i)
  const customerKey = find(/customer|user|subscriber/i)
  return {
    avg_revenue_growth: revenueKey ? round2(m[revenueKey]?.changeFirstToLastPct) : null,
    avg_conversion_rate: conversionKey ? round2(m[conversionKey]?.average) : null,
    avg_customer_growth: customerKey ? round2(m[customerKey]?.changeFirstToLastPct) : null,
  }
}

// ── Phase 1 widening ─────────────────────────────────────────────────────────
// dataSummary.ts already computes per-metric time series and per-dimension
// category breakdowns for every contribution — this used to be discarded
// after extracting just the 3 fixed buckets above. These additions preserve
// it instead, generalized beyond marketing-specific metric names, so future
// querying isn't blocked on re-collecting data later.

// Rate-like metrics (conversion, churn, ROAS, etc.) are stored as their
// average LEVEL — a typical rate is comparable across companies of any size.
// Absolute-quantity metrics (revenue, customers, spend) are stored as their
// GROWTH % instead — raw levels aren't comparable across company sizes, but
// growth rate is.
//
// Kept in sync with isRateLikeMetric in dataSummary.ts, including the
// abbreviation set — CTR/CPC/CPA/CPM/CPL/ROI/ARPU/CVR/CAC don't contain
// "rate"/"ratio" as a literal substring of the abbreviation itself, so the
// regex alone would miss them here too.
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

function metricStorageMode(rawName: string): 'level' | 'growth' {
  const normalized = rawName
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '')
  if (RATE_LIKE_ABBREVIATIONS.has(normalized)) return 'level'
  return RATE_LIKE_PATTERN.test(rawName) ? 'level' : 'growth'
}

// Common synonyms for standard B2B marketing/sales metrics, so "Sales",
// "Revenue", and "Net_Revenue" from different contributors merge into one
// benchmark instead of fragmenting into separate keys. Anything that doesn't
// match still gets captured under its own slugified name — nothing is
// dropped just because it's unrecognized, it just won't merge with others.
const METRIC_SYNONYMS: Record<string, string> = {
  revenue: 'revenue',
  sales: 'revenue',
  income: 'revenue',
  earnings: 'revenue',
  net_revenue: 'revenue',
  conversion: 'conversion_rate',
  conversion_rate: 'conversion_rate',
  cvr: 'conversion_rate',
  customer: 'customers',
  customers: 'customers',
  user: 'customers',
  users: 'customers',
  subscriber: 'customers',
  subscribers: 'customers',
  new_customers: 'customers',
  order: 'orders',
  orders: 'orders',
  transaction: 'orders',
  transactions: 'orders',
  purchase: 'orders',
  spend: 'marketing_spend',
  budget: 'marketing_spend',
  ad_spend: 'marketing_spend',
  marketing_spend: 'marketing_spend',
  aov: 'average_order_value',
  average_order_value: 'average_order_value',
  order_value: 'average_order_value',
  basket_size: 'average_order_value',
  churn: 'churn_rate',
  churn_rate: 'churn_rate',
  attrition: 'churn_rate',
  retention: 'retention_rate',
  retention_rate: 'retention_rate',
  engagement: 'engagement_rate',
  session: 'engagement_rate',
  pageview: 'engagement_rate',
  roas: 'roas',
  cart_abandonment: 'cart_abandonment_rate',
  cart_abandonment_rate: 'cart_abandonment_rate',
  refund: 'refund_rate',
  refunds: 'refund_rate',
}

function normalizeMetricName(raw: string): { key: string; label: string } {
  const slug = raw.toLowerCase().trim().replace(/\s+/g, '_')
  const canonical = METRIC_SYNONYMS[slug]
  if (canonical) return { key: canonical, label: canonical.replace(/_/g, ' ') }
  return { key: slug, label: raw }
}

// Extracts every detected metric (not just the 3 fixed buckets) into a
// normalized { key -> value } map, ready to merge into the pool.
function extractAllMetrics(
  metrics: Record<string, any> | undefined
): Record<string, { value: number; label: string }> {
  const result: Record<string, { value: number; label: string }> = {}
  for (const [rawName, summary] of Object.entries(metrics || {})) {
    const { key, label } = normalizeMetricName(rawName)
    const mode = metricStorageMode(rawName)
    const value = mode === 'level' ? summary?.average : summary?.changeFirstToLastPct
    if (typeof value === 'number' && !(key in result)) {
      result[key] = { value: round2(value) as number, label }
    }
  }
  return result
}

// Common synonyms for dimension TYPES (the column itself — region vs
// territory vs zone — not the category values inside it). Deliberately
// conservative: only merges cases where the synonymy is high-confidence and
// low-ambiguity. Generic terms like "category" or "segment" alone are NOT
// merged, since a wrong merge (e.g. silently combining a product-category
// breakdown with a customer-tier breakdown) actively corrupts the data —
// worse than a missed merge, which just means slower pool growth.
const DIMENSION_TYPE_SYNONYMS: Record<string, string> = {
  region: 'region',
  territory: 'region',
  zone: 'region',
  area: 'region',
  market: 'region',
  channel: 'channel',
  source: 'channel',
  medium: 'channel',
  traffic_source: 'channel',
  product: 'product_category',
  product_category: 'product_category',
  product_line: 'product_category',
  customer_segment: 'customer_segment',
  customer_tier: 'customer_segment',
  account_tier: 'customer_segment',
  plan: 'customer_segment',
  device: 'device_platform',
  platform: 'device_platform',
  os: 'device_platform',
  state: 'state',
  us_state: 'state',
  state_code: 'state',
  ship_state: 'state',
  billing_state: 'state',
}

// Campaign-name-style dimensions are excluded from the SHARED crowd pool
// entirely — unlike region/channel/state/segment, campaign names carry no
// vocabulary shared across different companies' uploads, so they'd just
// accumulate as unmergeable noise (a different campaign name from every
// single contributor, forever). This is deliberately scoped to the crowd
// layer only: dataSummary.ts still summarizes these normally, since a
// campaign breakdown is genuinely useful in a user's own individual deck.
function isCampaignLikeDimensionName(raw: string): boolean {
  return /campaign|ad[\s_-]?(name|set)/i.test(raw)
}

function normalizeDimensionName(raw: string): string {
  const slug = raw.toLowerCase().trim().replace(/\s+/g, '_')
  return DIMENSION_TYPE_SYNONYMS[slug] || slug
}

// What gets carried PER CATEGORY PER METRIC from a single contribution into
// the pool merge step — the raw ingredients, never a pre-resolved
// average/index. See PooledCategoryMetric below for why pooling must happen
// on these raw sums, not on resolved per-contributor numbers.
interface ContributionCategoryMetric {
  mode: 'rate' | 'index'
  label: string
  sum: number
  rowCount: number
  metricGrandTotal: number
  totalRowCount: number
}

// Extracts top-category shares for every dimension column (region, channel,
// segment, etc.) so they can be merged into a running benchmark per category.
// Pulls the RAW per-category accumulators (sum, rowCount, and this
// contribution's grand totals) rather than a resolved average/index — see
// PooledCategoryMetric for why resolving per-contributor and then averaging
// is mathematically wrong for index-mode metrics, and a weaker approximation
// even for rate-mode ones.
//
// Campaign-like dimension columns are skipped entirely here (see
// isCampaignLikeDimensionName) — they never enter the shared pool, though
// they remain visible in the contributor's own single-upload view via
// dataSummary.ts directly.
//
// NOTE: this normalizes the dimension TYPE name (so "Region"/"Territory"
// merge), but does NOT normalize the category VALUES inside it (so "West"
// from one contributor and "Western US" from another won't merge with each
// other, even though a human would read them as the same thing). Exact-string
// category matches merge correctly, which covers a meaningful share of real
// cases since common category vocabularies (region names, major channel
// names) are fairly conventional — but the long tail of mismatched value
// names is an open problem, better solved once a real query UI reveals which
// specific mismatches actually matter, rather than guessed at now.
function extractDimensionShares(
  dimensions: Record<string, any> | undefined
): Record<
  string,
  { name: string; sharePct: number; metrics: Record<string, ContributionCategoryMetric> }[]
> {
  const result: Record<
    string,
    { name: string; sharePct: number; metrics: Record<string, ContributionCategoryMetric> }[]
  > = {}
  for (const [dimName, dimSummary] of Object.entries(dimensions || {})) {
    if (isCampaignLikeDimensionName(dimName)) continue

    const top = dimSummary?.top
    const metricsByCategory = dimSummary?.metricsByCategory || {}
    const key = normalizeDimensionName(dimName)
    if (Array.isArray(top) && top.length > 0 && !(key in result)) {
      result[key] = top.map((t: any) => {
        const rawMetrics: Record<string, CategoryMetricStat> = metricsByCategory[t.name] || {}
        const normalizedMetrics: Record<string, ContributionCategoryMetric> = {}
        for (const [rawMetricName, stat] of Object.entries(rawMetrics)) {
          if (!stat || typeof stat !== 'object' || !stat.raw) continue
          const { key: mKey, label } = normalizeMetricName(rawMetricName)
          if (!(mKey in normalizedMetrics)) {
            normalizedMetrics[mKey] = {
              mode: stat.mode,
              label,
              sum: stat.raw.sum,
              rowCount: stat.raw.rowCount,
              metricGrandTotal: stat.raw.metricGrandTotal,
              totalRowCount: stat.raw.totalRowCount,
            }
          }
        }
        return { name: t.name, sharePct: t.sharePct, metrics: normalizedMetrics }
      })
    }
  }
  return result
}

function mergeExtendedMetric(
  prev: { avg: number; n: number; label: string } | undefined,
  next: { value: number; label: string } | undefined
): { avg: number; n: number; label: string } | undefined {
  if (!next) return prev
  if (!prev) return { avg: next.value, n: 1, label: next.label }
  const n = prev.n + 1
  return {
    avg: round2((prev.avg * prev.n + next.value) / n) as number,
    n,
    label: next.label || prev.label,
  }
}

// What's actually stored in Supabase per category per metric. Pure
// accumulators — NOT a pre-divided average/index — so the displayed number
// is always derived fresh from true pooled totals (see resolvePooledStat in
// crowd/page.tsx). This is the fix for the original bug: averaging
// per-contributor indexes is a different, biased quantity from the real
// pooled index, the same way averaging two batting averages by games played
// doesn't equal the true combined batting average — only summing actual
// hits and at-bats does.
//
// sumOfMetricGrandTotal / sumOfTotalRowCount accumulate EACH CONTRIBUTION'S
// OWN scope-wide totals (e.g. each contributor's whole-industry spend and row
// count) — summing these across contributions gives the correct combined
// denominator for the index, without ever needing to re-touch raw rows.
interface PooledCategoryMetric {
  mode: 'rate' | 'index'
  label: string
  sumOfMetricInCategory: number
  sumOfRowCountInCategory: number
  sumOfMetricGrandTotal: number
  sumOfTotalRowCount: number
  contributionCount: number
}

function mergeDimensionBreakdown(
  prev:
    | Record<
        string,
        {
          totalRowCount: number
          contributionCount: number
          metrics: Record<string, PooledCategoryMetric>
        }
      >
    | undefined,
  nextCategories:
    | { name: string; sharePct: number; metrics: Record<string, ContributionCategoryMetric> }[]
    | undefined,
  // The category's row count for THIS contribution — needed to accumulate a
  // true row-count-weighted sharePct average (sum of rowCount / sum of
  // totalRowCount), replacing the old equal-weighted avgSharePct average for
  // the same reason described above.
  categoryRowCounts: Record<string, number>
): Record<
  string,
  {
    totalRowCount: number
    contributionCount: number
    metrics: Record<string, PooledCategoryMetric>
  }
> {
  const merged = { ...(prev || {}) }
  for (const cat of nextCategories || []) {
    const existing = merged[cat.name]
    const mergedMetrics = { ...(existing?.metrics || {}) }
    for (const [mKey, mData] of Object.entries(cat.metrics)) {
      const prevM = mergedMetrics[mKey]
      if (prevM) {
        mergedMetrics[mKey] = {
          mode: mData.mode,
          label: mData.label,
          sumOfMetricInCategory: prevM.sumOfMetricInCategory + mData.sum,
          sumOfRowCountInCategory: prevM.sumOfRowCountInCategory + mData.rowCount,
          sumOfMetricGrandTotal: prevM.sumOfMetricGrandTotal + mData.metricGrandTotal,
          sumOfTotalRowCount: prevM.sumOfTotalRowCount + mData.totalRowCount,
          contributionCount: prevM.contributionCount + 1,
        }
      } else {
        mergedMetrics[mKey] = {
          mode: mData.mode,
          label: mData.label,
          sumOfMetricInCategory: mData.sum,
          sumOfRowCountInCategory: mData.rowCount,
          sumOfMetricGrandTotal: mData.metricGrandTotal,
          sumOfTotalRowCount: mData.totalRowCount,
          contributionCount: 1,
        }
      }
    }
    const rowCountThisContribution = categoryRowCounts[cat.name] || 0
    merged[cat.name] = {
      totalRowCount: (existing?.totalRowCount || 0) + rowCountThisContribution,
      contributionCount: (existing?.contributionCount || 0) + 1,
      metrics: mergedMetrics,
    }
  }
  return merged
}

// Time series isn't merged across contributors yet — different contributors'
// data spans different calendar windows, and aligning that properly is real
// design work better done once there's an actual query UI driving the
// requirements. For now, the last 5 contributions' raw monthly series are
// preserved as-is (capped so the row doesn't grow unbounded), so the data
// exists to build that alignment logic on later instead of needing to
// re-collect it.
function appendRecentSample(prevSamples: any[] | undefined, newSample: any): any[] {
  return [newSample, ...(prevSamples || [])].slice(0, 5)
}

// Keep last 10 unique strings
function mergeStrings(existing: string[], next: string | null): string[] {
  if (!next) return existing
  return [next, ...existing.filter((t) => t !== next)].slice(0, 10)
}

function mergeMetric(
  prevAvg: number | null,
  prevN: number,
  next: number | null
): { avg: number | null; n: number } {
  if (next === null) return { avg: prevAvg, n: prevN }
  if (prevAvg === null || prevN === 0) return { avg: round2(next), n: 1 }
  const n = prevN + 1
  return { avg: round2((prevAvg * prevN + next) / n), n }
}

async function upsertIndustry(
  industry: string,
  bucketed: CrowdBuckets,
  rawMetrics: Record<string, any> | undefined,
  rawDimensions: Record<string, any> | undefined,
  topTrend: string | null,
  keyInsight: string | null,
  rowCount: number | undefined
) {
  const { data: existing } = await supabase
    .from('crowd_insights')
    .select('*')
    .eq('industry', industry)
    .single()

  const prev = existing?.metrics || {}
  const fallbackN = existing?.contribution_count || 0

  // Original 3-bucket merge — unchanged, still backs the existing display page.
  const rev = mergeMetric(
    prev.avg_revenue_growth ?? null,
    prev.avg_revenue_growth_n ?? fallbackN,
    bucketed.avg_revenue_growth
  )
  const conv = mergeMetric(
    prev.avg_conversion_rate ?? null,
    prev.avg_conversion_rate_n ?? fallbackN,
    bucketed.avg_conversion_rate
  )
  const cust = mergeMetric(
    prev.avg_customer_growth ?? null,
    prev.avg_customer_growth_n ?? fallbackN,
    bucketed.avg_customer_growth
  )

  // Widened capture — additive, doesn't touch anything above.
  const extracted = extractAllMetrics(rawMetrics)
  const extendedMetrics = { ...(prev.extendedMetrics || {}) }
  for (const [key, val] of Object.entries(extracted)) {
    extendedMetrics[key] = mergeExtendedMetric(extendedMetrics[key], val)
  }

  const dimShares = extractDimensionShares(rawDimensions)
  const dimensionBreakdowns = { ...(prev.dimensionBreakdowns || {}) }
  for (const [dimName, categories] of Object.entries(dimShares)) {
    const categoryRowCounts: Record<string, number> = {}
    for (const cat of categories) {
      // Every metric for this category was computed from the same category
      // row set within this contribution, so rowCount is identical across
      // metrics — take it from whichever metric happens to be present.
      const anyMetric = Object.values(cat.metrics)[0]
      categoryRowCounts[cat.name] = anyMetric?.rowCount || 0
    }
    dimensionBreakdowns[dimName] = mergeDimensionBreakdown(
      dimensionBreakdowns[dimName],
      categories,
      categoryRowCounts
    )
  }

  const recentSamples = appendRecentSample(prev.recentSamples, {
    contributedAt: new Date().toISOString(),
    rowCount: rowCount ?? null,
    metrics: rawMetrics
      ? Object.fromEntries(
          Object.entries(rawMetrics).map(([k, v]: [string, any]) => [
            k,
            { monthly: v?.monthly || [], changeFirstToLastPct: v?.changeFirstToLastPct ?? null },
          ])
        )
      : {},
  })

  const newMetrics = {
    avg_revenue_growth: rev.avg,
    avg_revenue_growth_n: rev.n,
    avg_conversion_rate: conv.avg,
    avg_conversion_rate_n: conv.n,
    avg_customer_growth: cust.avg,
    avg_customer_growth_n: cust.n,
    top_trends: mergeStrings(prev.top_trends || [], topTrend),
    key_insights: mergeStrings(prev.key_insights || [], keyInsight),
    extendedMetrics,
    dimensionBreakdowns,
    recentSamples,
  }

  if (existing) {
    await supabase
      .from('crowd_insights')
      .update({
        metrics: newMetrics,
        contribution_count: existing.contribution_count + 1,
        last_updated: new Date().toISOString(),
      })
      .eq('industry', industry)
  } else {
    await supabase.from('crowd_insights').insert({
      industry,
      metrics: newMetrics,
      contribution_count: 1,
    })
  }
}

export async function POST(req: Request) {
  const { projectId, rawData, insights, narrative } = await req.json()

  let summary: any = null
  try {
    summary = rawData ? JSON.parse(rawData) : null
  } catch {
    summary = null // rawData wasn't valid JSON (e.g. legacy raw-text payload) — fall back below
  }

  const segments:
    | {
        industry: string
        rowCount: number
        metrics: Record<string, any>
        dimensions: Record<string, any>
      }[]
    | null = summary?.industrySegments?.length > 0 ? summary.industrySegments : null

  // ── MULTI-INDUSTRY PATH ───────────────────────────────────────────────────
  if (segments) {
    // Fetch each distinct industry's EXISTING observations before generating
    // new prose — otherwise the model has no way to know it's already said
    // something close to this, and just writes a freshly-worded restatement
    // of the same underlying numbers every time they recur across contributions.
    const distinctIndustries = [...new Set(segments.map((s) => s.industry))]
    const { data: existingRows } = await supabase
      .from('crowd_insights')
      .select('industry, metrics')
      .in('industry', distinctIndustries)
    const existingByIndustry = new Map((existingRows || []).map((r) => [r.industry, r.metrics]))

    const promptSegments = segments.map((s, i) => ({
      index: i,
      industry: s.industry,
      metrics: mapMetricsToCrowdBuckets(s.metrics),
      existingObservations: [
        ...(existingByIndustry.get(s.industry)?.top_trends || []),
        ...(existingByIndustry.get(s.industry)?.key_insights || []),
      ].slice(0, 6),
    }))

    let prose: { index: number; top_trend: string | null; key_insight: string | null }[] = []
    try {
      const res = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: `You write short, fully anonymized observations about anonymous data segments. For EACH segment given, write one trend sentence and one insight sentence that add a genuinely NEW angle beyond what's already been observed for that industry — see each segment's "existingObservations". Do not just reword an existing observation in different words. If the new contribution doesn't reveal anything meaningfully different from what's already there, write something brief and complementary instead of padding out a near-duplicate — a short or even minimal addition is fine. The metrics provided are already verified — do not alter, re-derive, or contradict them, just write prose that reflects them. Remove ALL brand names, company names, product names, and any identifying information — describe patterns generically. Return ONLY a valid JSON array, one object per segment, same order as given:
[{ "index": 0, "top_trend": "...", "key_insight": "..." }]`,
        messages: [
          {
            role: 'user',
            content: `Segments:\n${JSON.stringify(promptSegments, null, 2)}\n\nNarrative context (tone/qualitative color only — not a source of numbers):\n${narrative?.slice(0, 500) || ''}`,
          },
        ],
      })
      const raw = res.content[0].type === 'text' ? res.content[0].text : ''
      prose = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch (err) {
      console.error('Crowd prose generation failed, continuing with numbers only:', err)
    }

    for (const seg of promptSegments) {
      const p = prose.find((x) => x.index === seg.index)
      const originalSeg = segments[seg.index]
      await upsertIndustry(
        seg.industry,
        seg.metrics,
        originalSeg.metrics,
        originalSeg.dimensions,
        p?.top_trend || null,
        p?.key_insight || null,
        originalSeg.rowCount
      )
    }

    const industries = [...new Set(segments.map((s) => s.industry))]
    const dominant =
      [...segments].sort((a, b) => b.rowCount - a.rowCount)[0]?.industry || industries[0]

    await supabase.from('projects').update({ industry: dominant, industries }).eq('id', projectId)
    return NextResponse.json({ success: true, industries })
  }

  // ── SINGLE-INDUSTRY FALLBACK ──────────────────────────────────────────────
  const { data: existingRows } = await supabase.from('crowd_insights').select('industry')
  const existingIndustries = (existingRows || []).map((r) => r.industry)

  const classifyRes = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: `You are a data analyst. Given a pre-computed data summary and insights from an anonymous upload, classify its industry and write two short anonymized observations. Return ONLY valid JSON:
{
  "industry": "one of: ${VALID_INDUSTRIES.join(', ')}",
  "top_trend": "one sentence anonymous trend observed",
  "key_insight": "one sentence anonymous insight, no brand names or company identifiers"
}
${existingIndustries.length ? `These industries already have contributions in the shared pool: ${existingIndustries.join(', ')}. Prefer reusing one of these if the data plausibly fits, rather than introducing a near-duplicate category.` : ''}
Remove ALL brand names, company names, product names, and any identifying information. The data summary may include "top category" breakdowns (e.g. by region, segment, or account) — if any of those category names look like a specific company, client, or person rather than a generic category, never reference that name directly in top_trend or key_insight; describe the pattern generically instead.
Return ONLY valid JSON.`,
    messages: [
      {
        role: 'user',
        content: `Data summary (pre-aggregated, computed from the original upload — not raw rows):\n${rawData}\n\nInsights:\n${JSON.stringify(insights)}\n\nNarrative summary:\n${narrative?.slice(0, 500) || ''}`,
      },
    ],
  })

  const raw = classifyRes.content[0].type === 'text' ? classifyRes.content[0].text : ''
  const cleaned = raw.replace(/```json|```/g, '').trim()

  let extracted: any
  try {
    extracted = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Failed to classify industry' }, { status: 500 })
  }

  const industry = VALID_INDUSTRIES.includes(extracted.industry) ? extracted.industry : 'Other'
  const bucketed = mapMetricsToCrowdBuckets(summary?.metrics)

  await upsertIndustry(
    industry,
    bucketed,
    summary?.metrics,
    summary?.dimensions,
    extracted.top_trend || null,
    extracted.key_insight || null,
    summary?.rowCount
  )
  await supabase
    .from('projects')
    .update({ industry, industries: [industry] })
    .eq('id', projectId)

  return NextResponse.json({ success: true, industry })
}
