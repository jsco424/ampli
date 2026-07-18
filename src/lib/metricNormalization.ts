// Shared metric-normalization logic, originally built inline in
// api/crowd/route.ts for the shared crowd-sourced pool. Copied here rather
// than importing directly from that route, to avoid risk of touching a
// large, already-working file under time pressure — TODO: refactor
// api/crowd/route.ts to import from this shared module instead of its own
// inline copy, so the two don't drift out of sync over time. Until that
// refactor happens, any change to the synonym tables or normalization
// rules needs to be made in BOTH places.

export function round2(n: number | null | undefined): number | null {
  return n === null || n === undefined ? null : Math.round(n * 100) / 100
}

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

export function metricStorageMode(rawName: string): 'level' | 'growth' {
  const normalized = rawName
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '')
  if (RATE_LIKE_ABBREVIATIONS.has(normalized)) return 'level'
  return RATE_LIKE_PATTERN.test(rawName) ? 'level' : 'growth'
}

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

export function normalizeMetricName(raw: string): { key: string; label: string } {
  const slug = raw.toLowerCase().trim().replace(/\s+/g, '_')
  const canonical = METRIC_SYNONYMS[slug]
  if (canonical) return { key: canonical, label: canonical.replace(/_/g, ' ') }
  return { key: slug, label: raw }
}

// Extracts every detected metric (not just a fixed subset) into a
// normalized { key -> value } map. Same logic api/crowd/route.ts uses to
// build its extendedMetrics, generalized here for reuse.
export function extractAllMetrics(
  metrics: Record<string, any> | undefined
): Record<string, { value: number; label: string; mode: 'level' | 'growth' }> {
  const result: Record<string, { value: number; label: string; mode: 'level' | 'growth' }> = {}
  for (const [rawName, summary] of Object.entries(metrics || {})) {
    const { key, label } = normalizeMetricName(rawName)
    const mode = metricStorageMode(rawName)
    const value = mode === 'level' ? summary?.average : summary?.changeFirstToLastPct
    if (typeof value === 'number' && !(key in result)) {
      result[key] = { value: round2(value) as number, label, mode }
    }
  }
  return result
}
