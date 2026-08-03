import { createClient } from '@supabase/supabase-js'
import { extractAllMetrics, extractMetricsFromCharts } from './metricNormalization'

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

// Explicit per-email override so specific test/internal accounts can see
// Company Benchmarks populated even on a personal email domain, without
// opening the exclusion up broadly. Comma-separated full addresses in
// TEST_COMPANY_EMAILS, e.g. "james@gmail.com,gabriella@yahoo.com" — each
// maps to its OWN private company key (test-company:<local-part>), so two
// different people testing this never accidentally get pooled together
// under one shared bucket, and this data can never be mistaken for a real
// company's real benchmark data.
//
// Deliberately NOT gated by NODE_ENV, unlike devCompanyKeyOverride() below
// — this is meant to work wherever you're actually signed in and testing,
// including a deployed environment, not just local dev. Scoped narrowly to
// an explicit allowlist of specific addresses, which is what makes that
// safe to leave un-gated.
const TEST_COMPANY_EMAILS = new Set(
  (process.env.TEST_COMPANY_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
)

function testCompanyKeyOverride(normalizedEmail: string): string | null {
  if (!TEST_COMPANY_EMAILS.has(normalizedEmail)) return null
  const localPart = normalizedEmail.split('@')[0]
  return `test-company:${localPart}`
}

// Dev-only override so local testing doesn't require signing in with a real
// company email domain. Set DEV_COMPANY_KEY in .env.local (e.g.
// DEV_COMPANY_KEY=test-company.dev) to force every signed-in user to
// resolve to that single company key while developing, regardless of their
// actual email. Gated on NODE_ENV so this can never fire in production even
// if the env var were accidentally left set — Vercel production builds run
// with NODE_ENV=production regardless of what's in .env.local locally.
// Both recordCompanyBenchmarks() (the write side) and the /api/company-benchmarks
// read route call deriveCompanyKey(), so this one override covers writing
// test data and reading it back in the dashboard consistently.
function devCompanyKeyOverride(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  return process.env.DEV_COMPANY_KEY || null
}

export function deriveCompanyKey(email: string | null | undefined): string | null {
  const devOverride = devCompanyKeyOverride()
  if (devOverride) return devOverride

  if (!email || !email.includes('@')) return null
  const normalizedEmail = email.toLowerCase().trim()

  const testOverride = testCompanyKeyOverride(normalizedEmail)
  if (testOverride) return testOverride

  const domain = normalizedEmail.split('@')[1]?.trim()
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null
  return domain
}

// Writes one row per detected metric for this project into
// company_benchmark_history — distinct timestamped rows, NOT a blended
// running average (that's what crowd_insights does for the shared pool;
// Company Benchmarks needs each project to stay its own point in time so
// it can be charted as a real trend).
//
// Two metric sources are merged: raw column stats from the data summary
// (extractAllMetrics) and, where available, metrics pulled directly from
// the deck's own charts (extractMetricsFromCharts). Chart-derived metrics
// win on a key collision, since they reflect what Claude actually
// surfaced as meaningful for the deck rather than a blind average of
// every column. Raw stats still fill in anything the charts didn't cover.
//
// targetCompany is stored alongside each row (nullable — most projects
// have no target company at all) specifically so a later query can join a
// benchmark contribution back to that company's own trend_topics/
// trend_composite history, e.g. "was public interest in this company above
// or below its own typical level around the time of this contribution."
// Requires a target_company column on company_benchmark_history — see the
// accompanying one-time SQL. Existing rows written before this column
// existed simply have target_company = null and won't participate in that
// correlation, only new contributions going forward will.
export async function recordCompanyBenchmarks(params: {
  userId: string
  userEmail: string | null
  projectId: string
  metrics: Record<string, any> | undefined
  charts?: { title: string; type?: string; data: Record<string, any>[] }[]
  targetCompany?: string | null
}): Promise<void> {
  const { userId, userEmail, projectId, metrics, charts, targetCompany } = params

  const companyKey = deriveCompanyKey(userEmail)
  if (!companyKey) return // personal email domain or no email — nothing to record

  const fromSummary = extractAllMetrics(metrics)
  const fromCharts = extractMetricsFromCharts(charts)
  const extracted = { ...fromSummary, ...fromCharts }

  const rows = Object.entries(extracted).map(([key, data]) => ({
    company_key: companyKey,
    project_id: projectId,
    user_id: userId,
    metric_key: key,
    metric_label: data.label,
    value: data.value,
    mode: data.mode,
    target_company: targetCompany?.trim() || null,
  }))

  if (rows.length === 0) return

  const { error } = await supabaseAdmin.from('company_benchmark_history').insert(rows)
  if (error) {
    // Never let this block the actual generation flow it's called from —
    // Company Benchmarks is supplementary, not on the critical path.
    console.error('Failed to record company benchmarks (non-fatal):', error)
  }
}
