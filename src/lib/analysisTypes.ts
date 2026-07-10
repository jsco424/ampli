// Shared types for the analysis pipeline.
// Imported by /api/analyze/route.ts, /api/generate/route.ts,
// and the AnalysisView UI component.

export type FormulaType =
  | 'average'
  | 'lift_pct'
  | 'share_pct'
  | 'incremental_value'
  | 'roi'
  | 'weighted_average'
  | 'period_over_period'
  | 'sum'
  | 'count'
  | 'ratio'
  | 'raw' // direct from data, no formula applied

// A single cell in an AI-computed insight table.
// `display` is always what the UI renders.
// `raw` + `formulaType` + `inputs` are what the verifier checks.
// If formulaType is 'raw', the value came directly from the data
// and no formula verification is needed.
export interface InsightTableCell {
  display: string
  raw: number | null
  formulaType: FormulaType
  // Named inputs Claude used to compute `raw` — e.g. for lift_pct:
  // { treatment_avg: 5.93, control_avg: 5.77 }
  // Absent when formulaType is 'raw' or inputs aren't applicable.
  inputs?: Record<string, number>
}

export type VerificationStatus =
  | 'verified' // server re-ran formula, result matches within tolerance
  | 'unverified' // formulaType not recognized, or inputs missing — display only
  | 'mismatch' // server result differs from Claude's by > tolerance
  | 'pending' // not yet checked
  | 'not_applicable' // formulaType === 'raw', nothing to verify

export interface InsightTable {
  title: string
  description: string // one sentence — what this table shows
  headers: string[]
  rows: InsightTableCell[][]
  footnote?: string // e.g. "Control n=115 — estimates less stable at this sample size"
  // Set by the verifier pass — not present in Claude's raw output.
  // One status per cell, parallel to rows[][].
  verificationGrid?: VerificationStatus[][]
}

export type FindingDirection = 'positive' | 'negative' | 'neutral' | 'warning'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface BenchmarkContext {
  // The crowd pool metric this finding is being compared against
  metricLabel: string
  // The pooled industry average value
  industryAvg: number
  // Formatted for display e.g. "+6.1%" or "$48K"
  industryAvgDisplay: string
  // Number of contributions behind the benchmark
  contributionCount: number
  // Total row count behind the benchmark
  sampleRowCount: number
  // Direction relative to industry: above, below, in-line
  vsIndustry: 'above' | 'below' | 'in-line'
  // e.g. "50% above the healthcare industry average"
  vsIndustryDisplay: string
}

export interface KeyFinding {
  label: string
  value: string
  raw: number | null
  direction: FindingDirection
  interpretation: string
  confidence: ConfidenceLevel
  sampleSize?: number
  formulaType?: FormulaType
  inputs?: Record<string, number>
  verificationStatus?: VerificationStatus
  // Injected server-side from crowd pool after Claude's analysis pass —
  // not produced by Claude directly, so it's always based on real pooled data.
  benchmarkContext?: BenchmarkContext
}

export interface Anomaly {
  description: string
  severity: 'info' | 'warning' | 'critical'
  affectedMetric?: string
  affectedDimension?: string
  suggestedAction?: string
}

// The full output of one analysis pass — initial or follow-up.
// The same schema is used for both so the UI renderer is identical
// for initial analysis and conversational follow-up responses.
export interface AnalysisOutput {
  executiveSummary: string // 2-3 sentences, plain language, most important thing first
  insightTables: InsightTable[]
  keyFindings: KeyFinding[] // ranked by business impact, not by what's easy to describe
  anomalies: Anomaly[]
  suggestedFollowUps: string[] // 3-5 specific questions that would change a decision
  // Set server-side after the verifier pass — not from Claude.
  verificationComplete?: boolean
}

// What gets passed to the slide builder once the user is satisfied.
// Carries the full conversation so deck narrative is grounded in
// what was actually discussed, not a cold re-analysis of the file.
export interface AnalysisHandoff {
  dataSummaryJson: string
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  confirmedAnalysis: AnalysisOutput
  // User-confirmed slide selections from SlideSelector — hero stats,
  // takeaways, and chart types are locked and passed verbatim to generate.
  // Import SelectedFinding from SlideSelector.tsx at call sites.
  selectedFindings?: any[]
}
