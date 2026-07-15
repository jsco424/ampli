import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type {
  AnalysisOutput,
  KeyFinding,
  FormulaType,
  VerificationStatus,
  BenchmarkContext,
} from '@/lib/analysisTypes'
import type { DataSummary } from '@/lib/dataSummary'
import { stripDashJoins } from '@/lib/textCleanup'
import { logTokenUsage } from '@/lib/tokenUsage'
import { checkCreditLimit } from '@/lib/creditLimit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Service-role key, not anon — this is trusted first-party server code
// making its own database writes (saving analysis results), not acting on
// behalf of a specific user's browser session. Now that RLS is being
// properly locked down on brand_settings/company_research/crowd_insights/
// projects/user_settings, an anon-key client here would start failing its
// own reads/writes the moment those policies go live, since a server-side
// fetch has no Clerk token attached the way a browser request does.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── System prompt ──────────────────────────────────────────────────────────
// Rewritten to be data-type-first, not formula-first.
// The old prompt listed specific formulas (lift, T vs C, ROI) as things
// to look for — this biased Claude toward those frames even when the data
// didn't support them. The new prompt says: recognize the data structure
// first, apply the right analytical frame for what's actually there.

const SYSTEM_PROMPT = `You are a senior marketing data analyst reviewing a business dataset. Your job is to tell the most accurate and impactful story the data actually supports — not to apply a predetermined analytical framework.

STEP 1 — IDENTIFY WHAT KIND OF DATA THIS IS
Before doing any analysis, determine the dataset type from the column structure, values, and patterns:

- EXPERIMENTAL: Has explicit treatment/control groups, exposed/unexposed segments, A/B test flags, or before/after splits. → Apply lift analysis, statistical comparison, incremental value.
- TIME SERIES PERFORMANCE: Metrics tracked over time periods. → Apply trend analysis, period-over-period change, inflection point identification.
- CROSS-SECTIONAL SNAPSHOT: A single point-in-time view across segments, channels, or accounts. → Apply segment comparison, share analysis, outlier detection.
- FUNNEL / CONVERSION: Sequential stages from awareness to purchase. → Apply funnel drop-off, conversion rate by stage, bottleneck identification.
- MULTI-ENTITY BENCHMARK: Multiple companies, clients, campaigns, or accounts in one file. → Apply relative performance ranking, outlier flagging, cluster identification.
- MIXED: Multiple of the above in one file. → Identify each sub-structure and apply the right frame to each.

State the detected data type in your executiveSummary. If you're uncertain, say so and explain what additional context would clarify it.

STEP 2 — APPLY THE RIGHT ANALYTICAL FRAME
Only compute metrics that the data structure actually supports:

FOR EXPERIMENTAL DATA:
- Lift: (treatment_avg - control_avg) / |control_avg| × 100
- Incremental value: (treatment_avg - control_avg) × treatment_count
- ROI: incremental_value / cost
- Statistical note: flag if control group < 15% of treatment (underpowered)

FOR TIME SERIES:
- Period-over-period: (current - prior) / |prior| × 100
- Trend direction and inflection points
- Seasonality flags if period spans multiple years

FOR CROSS-SECTIONAL:
- Share: category / total × 100
- Index: (category_share_of_metric / category_share_of_rows) × 100
- Outlier identification: segments > 2x or < 0.5x the average

FOR FUNNEL:
- Stage conversion rate: next_stage / current_stage × 100
- Biggest drop-off identification
- Comparison to prior periods if available

FOR MULTI-ENTITY:
- Relative ranking
- Outlier flagging
- Common patterns vs. exceptions

STEP 3 — FIND WHAT MATTERS
Rank findings by business impact — what would most change a budget, strategy, or operational decision. Do not rank by what is easiest to describe or what has the largest absolute number.

STEP 4 — FLAG QUALITY ISSUES
- Underpowered groups (experimental data)
- Missing periods that break trends
- Contradictory metrics
- Ambiguous data structures that could be misread

STEP 5 — SUGGEST FRAME-REDIRECTING FOLLOW-UPS
If the data could support additional analytical frames the user might not have considered, suggest them explicitly. Examples:
- "If this data has a treatment/control split, ask me to reframe as an exposed vs. unexposed analysis"
- "If you have pre-campaign baseline data, I can run a pre/post comparison"
- "Ask me to break this out by [detected segment column] for a more granular view"

CRITICAL OUTPUT RULES:
- The "value" field must be a SHORT PUNCHY METRIC ONLY — a single number, percentage, multiplier, or dollar amount. Examples: "+9.2%", "$4,137", "0.25x", "811%". NEVER put a sentence or comparison in value. Full context goes in interpretation.
- Confidence: "high" = n > 1000, "medium" = n 100–1000, "low" = n < 100
- Executive summary: 2–3 sentences MAX. Lead with the data type detected, then the most important finding.
- Key findings: max 6 (not 8), ranked by business impact. Keep each interpretation to 1 sentence.
- Insight tables: max 2 tables. Max 6 rows each. Keep cell values short.
- Anomalies: max 3. One sentence each.
- Suggested follow-ups: exactly 3. One sentence each.
- Be concise throughout — the goal is signal density, not completeness.
- Writing style — read carefully, this is a hard rule, not a preference: NEVER join two clauses with an em-dash, en-dash, or a spaced hyphen (e.g. "word — word" or "word - word") anywhere in executiveSummary, interpretation, anomaly descriptions, suggestedAction, table descriptions/footnotes, or suggestedFollowUps. This specific pattern is one of the most recognizable tells of AI-generated text. Use a period, comma, or a connecting word ("and", "since", "because") instead. Word-internal hyphens (e.g. "high-revenue", "F-150") are fine and unaffected — this only applies to a dash used as punctuation between clauses.

Return JSON matching this exact schema. Do not wrap in markdown. Start with { and end with }.

{
  "executiveSummary": "string",
  "detectedDataType": "experimental|time_series|cross_sectional|funnel|multi_entity|mixed|unknown",
  "insightTables": [
    {
      "title": "string",
      "description": "string",
      "headers": ["string"],
      "rows": [[{ "display": "string", "raw": number|null, "formulaType": "average|lift_pct|share_pct|incremental_value|roi|weighted_average|period_over_period|sum|count|ratio|raw", "inputs": { "named_input": number } }]],
      "footnote": "string (optional)"
    }
  ],
  "keyFindings": [
    {
      "label": "string",
      "value": "string",
      "raw": number|null,
      "direction": "positive|negative|neutral|warning",
      "interpretation": "string",
      "confidence": "high|medium|low",
      "sampleSize": number,
      "formulaType": "string (optional)",
      "inputs": { "named_input": number }
    }
  ],
  "anomalies": [
    {
      "description": "string",
      "severity": "info|warning|critical",
      "affectedMetric": "string (optional)",
      "affectedDimension": "string (optional)",
      "suggestedAction": "string (optional)"
    }
  ],
  "suggestedFollowUps": ["string"]
}`

// ── Formula verifier ───────────────────────────────────────────────────────

const TOLERANCE_RELATIVE = 0.005
const TOLERANCE_ABSOLUTE = 0.01

function withinTolerance(a: number, b: number): boolean {
  if (a === b) return true
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / scale <= TOLERANCE_RELATIVE || Math.abs(a - b) <= TOLERANCE_ABSOLUTE
}

function verifyFormula(
  formulaType: FormulaType,
  inputs: Record<string, number> | undefined,
  claimedRaw: number | null
): { status: VerificationStatus; serverValue: number | null } {
  if (formulaType === 'raw') return { status: 'not_applicable', serverValue: claimedRaw }
  if (!inputs || claimedRaw === null) return { status: 'unverified', serverValue: null }

  let serverValue: number | null = null
  try {
    switch (formulaType) {
      case 'average': {
        const { sum, count } = inputs
        if (count === undefined || sum === undefined || count === 0) break
        serverValue = sum / count
        break
      }
      case 'lift_pct': {
        const { treatment_avg, control_avg } = inputs
        if (treatment_avg === undefined || control_avg === undefined || control_avg === 0) break
        serverValue = ((treatment_avg - control_avg) / Math.abs(control_avg)) * 100
        break
      }
      case 'share_pct': {
        const { category_value, total_value } = inputs
        if (category_value === undefined || total_value === undefined || total_value === 0) break
        serverValue = (category_value / total_value) * 100
        break
      }
      case 'incremental_value': {
        const { treatment_avg, control_avg, treatment_count } = inputs
        if (
          treatment_avg === undefined ||
          control_avg === undefined ||
          treatment_count === undefined
        )
          break
        serverValue = (treatment_avg - control_avg) * treatment_count
        break
      }
      case 'roi': {
        const { incremental_value, cost_awarded } = inputs
        if (incremental_value === undefined || cost_awarded === undefined || cost_awarded === 0)
          break
        serverValue = incremental_value / cost_awarded
        break
      }
      case 'weighted_average': {
        const { weighted_sum, total_weight } = inputs
        if (weighted_sum === undefined || total_weight === undefined || total_weight === 0) break
        serverValue = weighted_sum / total_weight
        break
      }
      case 'period_over_period': {
        const { current_value, prior_value } = inputs
        if (current_value === undefined || prior_value === undefined || prior_value === 0) break
        serverValue = ((current_value - prior_value) / Math.abs(prior_value)) * 100
        break
      }
      case 'sum': {
        if ('total' in inputs) {
          serverValue = inputs.total
          break
        }
        serverValue = Object.values(inputs).reduce((a, b) => a + b, 0)
        break
      }
      case 'count': {
        if ('count' in inputs) {
          serverValue = inputs.count
          break
        }
        serverValue = Object.keys(inputs).length
        break
      }
      case 'ratio': {
        const { numerator, denominator } = inputs
        if (numerator === undefined || denominator === undefined || denominator === 0) break
        serverValue = numerator / denominator
        break
      }
    }
  } catch {
    return { status: 'unverified', serverValue: null }
  }

  if (serverValue === null) return { status: 'unverified', serverValue: null }
  return {
    status: withinTolerance(serverValue, claimedRaw) ? 'verified' : 'mismatch',
    serverValue,
  }
}

function runVerificationPass(output: AnalysisOutput): void {
  for (const table of output.insightTables) {
    table.verificationGrid = table.rows.map((row) =>
      row.map((cell) => verifyFormula(cell.formulaType, cell.inputs, cell.raw).status)
    )
  }
  for (const finding of output.keyFindings) {
    if (finding.formulaType) {
      const { status } = verifyFormula(
        finding.formulaType as FormulaType,
        finding.inputs,
        finding.raw
      )
      finding.verificationStatus = status
    } else {
      finding.verificationStatus = 'not_applicable'
    }
  }
  output.verificationComplete = true
}

// ── Text cleanup pass ───────────────────────────────────────────────────────
// Deterministic backstop on top of the prompt instruction above — runs
// stripDashJoins on every free-text field Claude wrote. Never touches
// numeric fields, formulaType, inputs, or table cell "display" strings
// (which can legitimately contain numeric ranges like "10 - 20").
function cleanAnalysisOutputText(output: AnalysisOutput): void {
  output.executiveSummary = stripDashJoins(output.executiveSummary)

  for (const finding of output.keyFindings) {
    finding.interpretation = stripDashJoins(finding.interpretation)
  }

  for (const table of output.insightTables) {
    table.description = stripDashJoins(table.description)
    if (table.footnote) table.footnote = stripDashJoins(table.footnote)
  }

  for (const anomaly of output.anomalies) {
    anomaly.description = stripDashJoins(anomaly.description)
    if (anomaly.suggestedAction) anomaly.suggestedAction = stripDashJoins(anomaly.suggestedAction)
  }

  output.suggestedFollowUps = output.suggestedFollowUps.map((q) => stripDashJoins(q))
}

// ── Benchmark injection ────────────────────────────────────────────────────
// Runs after Claude's analysis pass. Queries the crowd pool for the
// project's industry and injects benchmark context directly into each
// finding where a matching metric exists. This is always real pooled data —
// never estimated or hallucinated by Claude.

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function resolveBenchmarkValue(pooledMetric: any): number | null {
  if (!pooledMetric) return null
  if (pooledMetric.mode === 'rate') {
    const { sumOfMetricInCategory, sumOfRowCountInCategory } = pooledMetric
    if (!sumOfRowCountInCategory) return null
    return round2(sumOfMetricInCategory / sumOfRowCountInCategory)
  }
  if (pooledMetric.mode === 'index') {
    const {
      sumOfMetricInCategory,
      sumOfMetricGrandTotal,
      sumOfRowCountInCategory,
      sumOfTotalRowCount,
    } = pooledMetric
    if (!sumOfMetricGrandTotal || !sumOfTotalRowCount || !sumOfRowCountInCategory) return null
    const shareOfMetric = sumOfMetricInCategory / sumOfMetricGrandTotal
    const shareOfRows = sumOfRowCountInCategory / sumOfTotalRowCount
    if (shareOfRows === 0) return null
    return Math.round((shareOfMetric / shareOfRows) * 100)
  }
  return null
}

// Tries to find a crowd pool metric that matches a finding's label/formulaType.
// Deliberately conservative — only injects a benchmark when the match is
// high-confidence, since a wrong benchmark is worse than no benchmark.
function matchFindingToBenchmark(
  finding: KeyFinding,
  crowdMetrics: Record<string, any>
): {
  metricKey: string
  pooledValue: number
  contributionCount: number
  sampleRowCount: number
} | null {
  const label = (finding.label || '').toLowerCase()
  const ft = finding.formulaType || ''

  // Exact and fuzzy metric key matching
  const candidates = Object.entries(crowdMetrics)
  for (const [key, metric] of candidates) {
    const k = key.toLowerCase()
    // Match by formula type and label keywords
    if (
      (ft === 'lift_pct' && (k.includes('lift') || k.includes('conversion'))) ||
      (ft === 'roi' && (k.includes('roi') || k.includes('roas'))) ||
      (ft === 'share_pct' && label.includes(k)) ||
      (ft === 'period_over_period' && k.includes('growth')) ||
      label.includes(k) ||
      k.includes(label.split(' ')[0]) // first word of label
    ) {
      const pooledValue = resolveBenchmarkValue(metric)
      if (pooledValue === null) continue
      return {
        metricKey: key,
        pooledValue,
        contributionCount: metric.contributionCount || 0,
        sampleRowCount: metric.sumOfRowCountInCategory || 0,
      }
    }
  }
  return null
}

async function injectBenchmarkContext(
  output: AnalysisOutput,
  industry: string | null
): Promise<void> {
  if (!industry) return

  const { data: crowdRow } = await supabase
    .from('crowd_insights')
    .select('metrics')
    .eq('industry', industry)
    .single()

  if (!crowdRow?.metrics) return

  const extendedMetrics = crowdRow.metrics.extendedMetrics || {}
  const fixedMetrics = {
    conversion_rate: {
      mode: 'rate',
      avg: crowdRow.metrics.avg_conversion_rate,
      n: crowdRow.metrics.avg_conversion_rate_n,
    },
    revenue_growth: {
      mode: 'rate',
      avg: crowdRow.metrics.avg_revenue_growth,
      n: crowdRow.metrics.avg_revenue_growth_n,
    },
    customer_growth: {
      mode: 'rate',
      avg: crowdRow.metrics.avg_customer_growth,
      n: crowdRow.metrics.avg_customer_growth_n,
    },
  }
  const allMetrics = { ...fixedMetrics, ...extendedMetrics }

  for (const finding of output.keyFindings) {
    if (finding.raw === null) continue

    const match = matchFindingToBenchmark(finding, allMetrics)
    if (!match) continue

    const { pooledValue, contributionCount, sampleRowCount } = match
    if (contributionCount < 2) continue // don't show benchmarks with only 1 contributor

    const diff = finding.raw - pooledValue
    const pctDiff = pooledValue !== 0 ? Math.abs(diff / pooledValue) * 100 : 0
    const vsIndustry: BenchmarkContext['vsIndustry'] =
      pctDiff < 5 ? 'in-line' : diff > 0 ? 'above' : 'below'

    const pctDiffDisplay = `${Math.round(pctDiff)}%`
    const vsDisplay =
      vsIndustry === 'in-line'
        ? `in line with the ${industry} industry average`
        : `${pctDiffDisplay} ${vsIndustry} the ${industry} industry average`

    // Format industry avg to match the finding's value format
    const isPercent = finding.value.includes('%')
    const isDollar = finding.value.includes('$')
    const industryAvgDisplay = isPercent
      ? `${pooledValue > 0 ? '+' : ''}${round2(pooledValue)}%`
      : isDollar
        ? `$${pooledValue.toLocaleString()}`
        : String(round2(pooledValue))

    finding.benchmarkContext = {
      metricLabel: match.metricKey.replace(/_/g, ' '),
      industryAvg: pooledValue,
      industryAvgDisplay,
      contributionCount,
      sampleRowCount,
      vsIndustry,
      vsIndustryDisplay: vsDisplay,
    }
  }
}

// ── Row sampler ────────────────────────────────────────────────────────────

function sampleRows(rows: Record<string, any>[], maxRows = 200): Record<string, any>[] {
  if (rows.length <= maxRows) return rows
  const step = rows.length / maxRows
  return Array.from({ length: maxRows }, (_, i) => rows[Math.floor(i * step)])
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const {
    dataSummaryJson,
    rawRowsJson,
    conversationHistory,
    prompt,
    tone,
    industry, // passed from project.industry for benchmark injection
    // NEW — targetAudience previously only reached /api/generate, meaning
    // the deck's narrative wrapper could be audience-shaped but the core
    // findings/hero numbers themselves never were. Passing it here lets
    // the analysis itself — not just the prose built around it later —
    // reflect who it's actually being built for.
    targetAudience,
    // NEW — target company + competitors, used for the on-demand public
    // interest fetch below. Optional — analysis works exactly as before
    // if these aren't passed (e.g. a project with no target company set).
    targetCompany,
    projectId,
  }: {
    dataSummaryJson: string
    rawRowsJson?: string
    conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
    prompt?: string
    tone?: string
    industry?: string | null
    targetAudience?: {
      role?: string
      seniority?: string
      cares_about?: string[]
      narrative_style?: string
      avoid?: string
    } | null
    targetCompany?: string | null
    projectId?: string | null
  } = await req.json()

  // ── Interim credit limit check ──────────────────────────────────────────
  // Blanket Free-tier cap applied to every account right now, since there's
  // no plan concept in the app yet (pending Clerk Billing). This is the
  // stopgap that prevents unlimited usage on brand-new signups while real
  // billing gets built — see src/lib/creditLimit.ts for the full reasoning.
  if (projectId) {
    const { data: projectRow } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single()

    if (projectRow?.user_id) {
      const limitCheck = await checkCreditLimit(projectRow.user_id)
      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            error: 'CREDIT_LIMIT_EXCEEDED',
            message: "You've used all your credits for this month.",
            creditsUsed: limitCheck.creditsUsed,
            creditsLimit: limitCheck.creditsLimit,
          },
          { status: 402 }
        )
      }
    }
  }

  let summary: DataSummary | null = null
  let rawRows: Record<string, any>[] = []

  try {
    summary = JSON.parse(dataSummaryJson)
  } catch {
    return NextResponse.json({ error: 'Invalid dataSummaryJson' }, { status: 400 })
  }
  try {
    rawRows = rawRowsJson ? JSON.parse(rawRowsJson) : []
  } catch {
    rawRows = []
  }
  if (!summary) {
    return NextResponse.json({ error: 'Missing data summary' }, { status: 400 })
  }

  const dateColumns = summary.columns.filter((c) => c.role === 'date').map((c) => c.name)
  const metricColumns = summary.columns.filter((c) => c.role === 'metric').map((c) => c.name)
  const dimensionColumns = summary.columns.filter((c) => c.role === 'dimension').map((c) => c.name)
  const sampledRows = sampleRows(rawRows)

  // ── Audience tailoring ──────────────────────────────────────────────────
  // Shapes the actual findings/hero numbers/interpretations, not just the
  // narrative wrapper built later in /api/generate. Mirrors the same
  // targetAudience shape that route already accepts, so callers pass the
  // identical object to both endpoints.
  let audienceInstruction = ''
  if (targetAudience) {
    audienceInstruction = `
AUDIENCE TAILORING:
This analysis is being built for: ${targetAudience.role || 'a business stakeholder'}${targetAudience.seniority ? ` (${targetAudience.seniority})` : ''}.
${targetAudience.cares_about?.length ? `They care about: ${targetAudience.cares_about.join(', ')}. Prioritize findings and hero numbers that speak to these specifically over ones that don't.` : ''}
${targetAudience.narrative_style ? `Match this narrative style throughout: ${targetAudience.narrative_style}.` : ''}
${targetAudience.avoid ? `Avoid: ${targetAudience.avoid}.` : ''}
This shapes which findings you rank highest and how you interpret them — it never changes what the data actually says, only which true things you choose to lead with and how you frame them.`
  }

  // ── On-demand public interest fetch (Crowd Insights + User Behaviors) ──
  // Synchronous, not gated behind the daily Trends cron — a target company
  // being pitched right now almost certainly isn't already one of the
  // curated topics. Reuses the same Wikipedia/YouTube fetchers and
  // normalization the scheduled pipeline uses, and persists into
  // trend_topics/trend_signals so it's tracked going forward too, per the
  // decision to let ampli's tracked list grow organically. Explicitly
  // supplementary — instructed below to confirm the story, never drive it.
  let publicInterestInstruction = ''
  if (targetCompany) {
    try {
      // Same lookup pattern generate/route.ts already uses for
      // competitorInstruction — kept server-side so the caller doesn't
      // need to duplicate this fetch.
      const { data: research } = await supabase
        .from('company_research')
        .select('competitors')
        .eq('company_name', targetCompany)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      const competitorNames = (research?.competitors || []).slice(0, 3).map((c: any) => c.name)

      const { fetchCompanyTrendOnDemand } = await import('@/lib/trends/onDemandFetch')
      const namesToFetch = [targetCompany, ...competitorNames]
      const results = await Promise.all(
        namesToFetch.map((name) => fetchCompanyTrendOnDemand(name, projectId || null))
      )
      const sentences = results.map((r) => r.summarySentence).join(' ')
      publicInterestInstruction = `
SUPPLEMENTARY CONTEXT — Public Interest (from ampli's User Behaviors tracking):
${sentences}
This is real-time public interest data, separate from the uploaded dataset. Use it only as confirming color in the executive summary or a suggested follow-up if it genuinely strengthens the story already told by the core data — never as a primary finding, never in place of a verified number from the dataset, and never if it doesn't clearly support what the data already shows. If it doesn't add anything, don't mention it at all.`
    } catch (err) {
      console.error('On-demand public interest fetch failed, continuing without it:', err)
    }
  }

  // ── Format group comparisons as a verified data table ─────────────────
  // These are computed from ALL rows in dataSummary.ts — server-verified,
  // not estimated from the sample. Claude reads these directly and builds
  // its comparison stories from them rather than computing from sample rows.
  const groupComparisonText =
    summary.groupComparisons.length > 0
      ? [
          '## Verified Group Comparisons (computed from ALL rows — use these numbers directly)',
          ...summary.groupComparisons.slice(0, 4).map((gc) => {
            const metricCols = Object.keys(gc.groups[0]?.metrics || {})
            const header = ['Group', 'Rows', 'Share %', ...metricCols].join(' | ')
            const divider = ['---', '---', '---', ...metricCols.map(() => '---')].join(' | ')
            const rows = gc.groups.map((g: any) =>
              [
                g.groupName,
                g.rowCount.toLocaleString(),
                `${g.shareOfTotal}%`,
                ...metricCols.map((m) => g.metrics[m]?.formatted || '—'),
              ].join(' | ')
            )
            return [
              `### ${gc.dimensionName} (${gc.groups.length} groups, ${gc.totalRows.toLocaleString()} total rows)${gc.hasStrongDivergence ? ' ⚡ Strong divergence detected' : ''}`,
              header,
              divider,
              ...rows,
            ].join('\n')
          }),
          '',
          'These numbers are server-verified from the complete dataset. Do not recompute them from the sample rows. Build your comparison story from these verified figures.',
        ].join('\n')
      : ''

  const userMessage = [
    '## Dataset Summary',
    '```json',
    JSON.stringify(
      {
        rowCount: summary.rowCount,
        dateRange: summary.dateRange,
        warnings: summary.warnings,
        metrics: Object.fromEntries(
          Object.entries(summary.metrics).map(([k, v]) => [
            k,
            {
              total: v.total,
              average: v.average,
              trend: v.trend,
              changeFirstToLastPct: v.changeFirstToLastPct,
              monthlyPeriods: v.monthly.length,
            },
          ])
        ),
        dimensions: Object.fromEntries(
          Object.entries(summary.dimensions).map(([k, v]) => [
            k,
            { topCategories: v.top.slice(0, 8) },
          ])
        ),
        scatterPairs: summary.scatterPairs?.map((p) => ({
          xMetric: p.xMetric,
          yMetric: p.yMetric,
          correlation: p.correlation,
        })),
      },
      null,
      2
    ),
    '```',
    '',
    groupComparisonText,
    '',
    '## Column Classifications',
    `Date columns: ${dateColumns.join(', ') || 'none detected'}`,
    `Metric columns: ${metricColumns.join(', ') || 'none detected'}`,
    `Dimension columns: ${dimensionColumns.join(', ') || 'none detected'}`,
    prompt ? `\n## User Focus\n${prompt}` : '',
    tone ? `\n## Tone\n${tone}` : '',
    audienceInstruction ? `\n${audienceInstruction}` : '',
    publicInterestInstruction ? `\n${publicInterestInstruction}` : '',
    '',
    `## Raw Rows Sample (${sampledRows.length} of ${summary.rowCount} rows — for pattern recognition only, not arithmetic)`,
    '```json',
    JSON.stringify(sampledRows, null, 0),
    '```',
    '',
    'Identify the data type, apply the right analytical frame, and find what matters. Use the verified group comparisons above for any numerical claims about segment differences.',
  ].join('\n')

  const isFollowUp = Array.isArray(conversationHistory) && conversationHistory.length > 0
  const messages: { role: 'user' | 'assistant'; content: string }[] = isFollowUp
    ? [{ role: 'user', content: userMessage }, ...conversationHistory]
    : [{ role: 'user', content: userMessage }]

  let rawText = ''
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10000,
      system: SYSTEM_PROMPT,
      messages,
    })
    rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Real usage, not an estimate — response.usage is Anthropic's own
    // accounting of exactly what this call cost, including any cache
    // read/write savings already applied.
    await logTokenUsage({
      projectId: projectId || null,
      route: isFollowUp ? 'analyze_followup' : 'analyze',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    })
  } catch (err) {
    console.error('Analysis API error:', err)
    return NextResponse.json({ error: 'Analysis generation failed' }, { status: 500 })
  }

  let analysisOutput: AnalysisOutput
  try {
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonCandidate = fenceMatch ? fenceMatch[1].trim() : rawText.trim()
    const start = jsonCandidate.indexOf('{')
    const end = jsonCandidate.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found')
    analysisOutput = JSON.parse(jsonCandidate.slice(start, end + 1))
  } catch (parseErr) {
    const wasTruncated = rawText.length > 0 && !rawText.trimEnd().endsWith('}')
    console.error(
      wasTruncated
        ? `Analysis truncated — response length: ${rawText.length}`
        : `Failed to parse analysis output: ${parseErr}`,
      '\nPreview:',
      rawText.slice(0, 300)
    )
    return NextResponse.json(
      {
        error: wasTruncated
          ? 'Analysis response was too long — try a smaller file or fewer metrics.'
          : 'Failed to parse analysis output',
      },
      { status: 500 }
    )
  }

  // Pass 2 — deterministic formula verification (<100ms)
  runVerificationPass(analysisOutput)

  // Pass 3 — dash-join cleanup (deterministic backstop on the prompt rule)
  cleanAnalysisOutputText(analysisOutput)

  // Pass 4 — crowd pool benchmark injection
  // Runs async after verification — queries Supabase for the project's
  // industry and injects inline benchmark context into matching findings.
  // Only injects when the crowd pool has ≥2 contributions for that industry.
  if (industry) {
    await injectBenchmarkContext(analysisOutput, industry)
  }

  return NextResponse.json({
    analysis: analysisOutput,
    assistantTurn: { role: 'assistant', content: rawText },
  })
}
