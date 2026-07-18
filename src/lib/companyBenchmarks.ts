import { createClient } from '@supabase/supabase-js'
import { extractAllMetrics } from './metricNormalization'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Common personal email providers — excluded from company grouping, since
// grouping strangers together under "gmail.com" would be actively wrong,
// not just imprecise. Anyone on one of these domains simply doesn't get
// a company_key at all (their own projects aren't written here), rather
// than being incorrectly pooled with unrelated people.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
])

export function deriveCompanyKey(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null
  return domain
}

// Writes one row per detected metric for this project into
// company_benchmark_history — distinct timestamped rows, NOT a blended
// running average (that's what crowd_insights does for the shared pool;
// Company Benchmarks needs each project to stay its own point in time so
// it can be charted as a real trend).
//
// NOT YET WIRED to a trigger point — this function is ready to call, but
// nothing calls it yet. The natural hook is wherever a project's analysis
// completes (likely inside /api/generate/route.ts, which already has
// access to the parsed dataSummary and the project's user), independent
// of whether the user has opted into crowd-sourcing — those are two
// separate decisions and this one shouldn't depend on the other.
export async function recordCompanyBenchmarks(params: {
  userId: string
  userEmail: string | null
  projectId: string
  metrics: Record<string, any> | undefined
}): Promise<void> {
  const { userId, userEmail, projectId, metrics } = params

  const companyKey = deriveCompanyKey(userEmail)
  if (!companyKey) return // personal email domain or no email — nothing to record

  const extracted = extractAllMetrics(metrics)
  const rows = Object.entries(extracted).map(([key, data]) => ({
    company_key: companyKey,
    project_id: projectId,
    user_id: userId,
    metric_key: key,
    metric_label: data.label,
    value: data.value,
    mode: data.mode,
  }))

  if (rows.length === 0) return

  const { error } = await supabaseAdmin.from('company_benchmark_history').insert(rows)
  if (error) {
    // Never let this block the actual generation flow it's called from —
    // Company Benchmarks is supplementary, not on the critical path.
    console.error('Failed to record company benchmarks (non-fatal):', error)
  }
}
