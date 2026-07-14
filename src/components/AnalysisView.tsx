'use client'

import { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  XCircle,
  ChevronDown,
  Sparkles,
  MessageSquare,
  PresentationIcon,
  RefreshCw,
  BarChart2,
} from 'lucide-react'
import type {
  AnalysisOutput,
  KeyFinding,
  Anomaly,
  VerificationStatus,
  FindingDirection,
} from '@/lib/analysisTypes'

function VerificationBadge({ status }: { status?: VerificationStatus }) {
  if (!status || status === 'pending' || status === 'not_applicable') return null
  const config: Record<string, { icon: React.ReactNode; label: string; className: string } | null> =
    {
      verified: {
        icon: <CheckCircle2 size={10} />,
        label: 'Verified',
        className: 'text-emerald-500',
      },
      mismatch: { icon: <XCircle size={10} />, label: 'Review', className: 'text-amber-500' },
      unverified: {
        icon: <HelpCircle size={10} />,
        label: 'AI-computed',
        className: 'text-zinc-400',
      },
      not_applicable: null,
      pending: null,
    }
  const c = config[status]
  if (!c) return null
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${c.className}`}>
      {c.icon} {c.label}
    </span>
  )
}

function directionColor(direction: FindingDirection, dark: boolean): string {
  return {
    positive: 'text-emerald-500',
    negative: 'text-red-400',
    neutral: dark ? 'text-zinc-200' : 'text-zinc-700',
    warning: 'text-amber-400',
  }[direction]
}

function confidenceColor(level: string): string {
  return (
    { high: 'bg-emerald-500', medium: 'bg-amber-400', low: 'bg-red-400' }[level] || 'bg-zinc-500'
  )
}

function DirectionIcon({ direction }: { direction: FindingDirection }) {
  return (
    <>
      {
        {
          positive: <TrendingUp size={12} className="text-emerald-500" />,
          negative: <TrendingDown size={12} className="text-red-400" />,
          neutral: <Minus size={12} className="text-zinc-400" />,
          warning: <AlertTriangle size={12} className="text-amber-400" />,
        }[direction]
      }
    </>
  )
}

// Collapsed state is now deliberately minimal — just the hero number and a
// short label underneath, centered, no chevron, no confidence dots, no
// benchmark hint. Everything that used to live in the collapsed view
// (interpretation, confidence, verification, sample size, benchmark detail)
// now only appears after a click, in the expanded section below.
// Generic, human-readable formula per type — paired with the finding's
// actual `inputs` values in the "Show the math" toggle, so someone sees
// both the general shape of the calculation and the specific numbers
// that produced this exact hero number.
const FORMULA_LABELS: Record<string, string> = {
  average: 'sum ÷ count',
  lift_pct: '(treatment_avg − control_avg) ÷ |control_avg| × 100',
  share_pct: 'category_value ÷ total_value × 100',
  incremental_value: '(treatment_avg − control_avg) × treatment_count',
  roi: 'incremental_value ÷ cost_awarded',
  weighted_average: 'weighted_sum ÷ total_weight',
  period_over_period: '(current_value − prior_value) ÷ |prior_value| × 100',
  sum: 'sum of inputs',
  count: 'count of inputs',
  ratio: 'numerator ÷ denominator',
}

function formatInputValue(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function FindingCard({ finding, dark }: { finding: KeyFinding; dark: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [showMath, setShowMath] = useState(false)
  const subtle = dark ? 'text-zinc-500' : 'text-zinc-400'
  const divider = dark ? 'border-zinc-800' : 'border-zinc-100'
  const collapsedBg = dark ? 'bg-zinc-800/60' : 'bg-zinc-100'
  const expandedBg = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const bm = finding.benchmarkContext
  const hasFormula =
    finding.formulaType &&
    finding.formulaType !== 'raw' &&
    finding.inputs &&
    Object.keys(finding.inputs).length > 0

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full text-left rounded-2xl border transition-all overflow-hidden ${
        expanded ? expandedBg : `${collapsedBg} border-transparent hover:border-blue-500/30`
      }`}
    >
      {/* Collapsed — number + short label only */}
      <div className="px-5 py-7 flex flex-col items-center text-center">
        <p
          className={`text-3xl sm:text-4xl font-black leading-none mb-2 ${directionColor(finding.direction, dark)}`}
        >
          {finding.value}
        </p>
        <p className={`text-sm font-medium ${dark ? 'text-zinc-200' : 'text-zinc-700'}`}>
          {finding.label}
        </p>
      </div>

      {/* Expanded — interpretation, confidence, verification, benchmark detail */}
      {expanded && (
        <div className={`px-5 pb-5 pt-4 border-t text-left ${divider}`}>
          <p className={`text-xs leading-relaxed mb-3 ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
            {finding.interpretation}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${confidenceColor(finding.confidence)}`}
              />
              <span className={`text-[10px] ${subtle}`}>
                {finding.confidence} confidence
                {finding.sampleSize ? ` · n=${finding.sampleSize.toLocaleString()}` : ''}
              </span>
            </span>
            <DirectionIcon direction={finding.direction} />
            <VerificationBadge status={finding.verificationStatus} />
          </div>

          {/* Secondary expand — the actual calculation behind the hero
              number. Only rendered when the finding has a real formula
              and inputs to show (not for formulaType 'raw', which has
              nothing computed to explain). Nested inside a span with its
              own stopPropagation so clicking it doesn't collapse the
              whole card. */}
          {hasFormula && (
            <div className="mt-2">
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMath(!showMath)
                }}
                className={`inline-flex items-center gap-1 text-[10px] font-medium cursor-pointer ${dark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
              >
                {showMath ? 'Hide' : 'Show'} the math
                <ChevronDown
                  size={10}
                  className={`transition-transform ${showMath ? 'rotate-180' : ''}`}
                />
              </span>
              {showMath && (
                <div
                  className={`mt-2 p-3 rounded-xl text-[11px] ${dark ? 'bg-zinc-800 border border-zinc-700' : 'bg-zinc-50 border border-zinc-200'}`}
                >
                  <p className={`font-mono mb-2 ${dark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    {FORMULA_LABELS[finding.formulaType as string] || finding.formulaType}
                  </p>
                  <div className="space-y-0.5">
                    {Object.entries(finding.inputs || {}).map(([key, value]) => (
                      <p key={key} className={subtle}>
                        <span className="font-mono">{key}</span> = {formatInputValue(value)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {bm && (
            <div
              className={`mt-3 p-3 rounded-xl ${dark ? 'bg-zinc-800 border border-zinc-700' : 'bg-zinc-50 border border-zinc-200'}`}
            >
              <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${subtle}`}>
                Industry Benchmark · {bm.metricLabel}
              </p>
              <p className={`text-xs ${dark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Industry avg: <span className="font-semibold">{bm.industryAvgDisplay}</span> · Your
                result is{' '}
                <span
                  className={
                    bm.vsIndustry === 'above'
                      ? 'text-emerald-500 font-semibold'
                      : bm.vsIndustry === 'below'
                        ? 'text-red-400 font-semibold'
                        : 'font-semibold'
                  }
                >
                  {bm.vsIndustryDisplay}
                </span>
              </p>
              <p className={`text-[10px] mt-1 ${subtle}`}>
                Based on {bm.contributionCount} contributions
                {bm.sampleRowCount > 0 ? ` · ${bm.sampleRowCount.toLocaleString()} rows` : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </button>
  )
}

function AnomalyItem({ anomaly, dark }: { anomaly: Anomaly; dark: boolean }) {
  const config = {
    info: {
      icon: <Info size={13} />,
      color: 'text-blue-400',
      bg: dark ? 'bg-blue-500/8' : 'bg-blue-50',
      border: dark ? 'border-blue-500/20' : 'border-blue-200',
    },
    warning: {
      icon: <AlertTriangle size={13} />,
      color: 'text-amber-400',
      bg: dark ? 'bg-amber-500/8' : 'bg-amber-50',
      border: dark ? 'border-amber-500/20' : 'border-amber-200',
    },
    critical: {
      icon: <AlertCircle size={13} />,
      color: 'text-red-400',
      bg: dark ? 'bg-red-500/8' : 'bg-red-50',
      border: dark ? 'border-red-500/20' : 'border-red-200',
    },
  }[anomaly.severity]

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${config.bg} ${config.border}`}>
      <span className={`${config.color} mt-0.5 shrink-0`}>{config.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${dark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          {anomaly.description}
        </p>
        {anomaly.suggestedAction && (
          <p className={`text-[11px] mt-1 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            → {anomaly.suggestedAction}
          </p>
        )}
      </div>
    </div>
  )
}

function ConversationTurn({
  question,
  analysis,
  dark,
  turnIndex,
}: {
  question: string
  analysis: AnalysisOutput
  dark: boolean
  turnIndex: number
}) {
  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const subtler = dark ? 'text-zinc-500' : 'text-zinc-400'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div
          className={`max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm ${dark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-50 text-blue-800'}`}
        >
          {question}
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${card}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={12} className="text-blue-400" />
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${subtler}`}>
            Follow-up Analysis · Turn {turnIndex + 1}
          </p>
        </div>
        <p className={`text-sm leading-relaxed mb-4 ${dark ? 'text-zinc-200' : 'text-zinc-700'}`}>
          {analysis.executiveSummary}
        </p>
        {analysis.keyFindings.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {analysis.keyFindings.slice(0, 4).map((f, i) => (
              <FindingCard key={i} finding={f} dark={dark} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ConversationEntry {
  question: string
  analysis: AnalysisOutput
}

interface AnalysisViewProps {
  analysis: AnalysisOutput
  dark?: boolean
  onFollowUp: (question: string) => void
  onBuildSlides: () => void
  isLoading?: boolean
  conversationEntries?: ConversationEntry[]
}

export default function AnalysisView({
  analysis,
  dark = true,
  onFollowUp,
  onBuildSlides,
  isLoading = false,
  conversationEntries = [],
}: AnalysisViewProps) {
  const [followUpInput, setFollowUpInput] = useState('')
  const [showAnomalies, setShowAnomalies] = useState(false)

  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const subtler = dark ? 'text-zinc-500' : 'text-zinc-400'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const divider = dark ? 'border-zinc-800' : 'border-zinc-100'

  const handleFollowUp = () => {
    const q = followUpInput.trim()
    if (!q) return
    setFollowUpInput('')
    onFollowUp(q)
  }

  const allStatuses = [
    ...analysis.insightTables.flatMap((t) => (t.verificationGrid || []).flat()),
    ...analysis.keyFindings.map((f) => f.verificationStatus),
  ].filter(Boolean) as VerificationStatus[]
  const hasMismatch = allStatuses.some((s) => s === 'mismatch')
  const verifiedCount = allStatuses.filter((s) => s === 'verified').length
  const totalCheckable = allStatuses.filter((s) => s !== 'not_applicable' && s !== 'pending').length
  const hasBenchmarks = analysis.keyFindings.some((f) => f.benchmarkContext)

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={13} className="text-blue-400" />
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${subtler}`}>
            Analysis
            {analysis.detectedDataType && analysis.detectedDataType !== 'unknown' && (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${dark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}
              >
                {analysis.detectedDataType.replace('_', ' ')}
              </span>
            )}
          </p>
          {analysis.verificationComplete && (
            <span
              className={`ml-auto text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${hasMismatch ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-500'}`}
            >
              {hasMismatch ? <AlertTriangle size={9} /> : <CheckCircle2 size={9} />}
              {hasMismatch
                ? 'Some values need review'
                : `${verifiedCount}/${totalCheckable} verified`}
            </span>
          )}
        </div>
        <p
          className={`text-base leading-relaxed font-medium ${dark ? 'text-zinc-100' : 'text-zinc-800'}`}
        >
          {analysis.executiveSummary}
        </p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <p className={`text-[11px] ${subtler}`}>AI-generated · verify before sharing</p>
          {hasBenchmarks && (
            <p className={`text-[11px] flex items-center gap-1 ${subtler}`}>
              <BarChart2 size={10} />
              Industry benchmarks from crowd pool
            </p>
          )}
        </div>
      </div>

      {analysis.keyFindings.length > 0 && (
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-3 ${subtler}`}>
            Key Findings
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {analysis.keyFindings.map((f, i) => (
              <FindingCard key={i} finding={f} dark={dark} />
            ))}
          </div>
        </div>
      )}

      {analysis.insightTables.length > 0 && (
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-3 ${subtler}`}>
            Computed Tables
          </p>
          <div className="space-y-3">
            {analysis.insightTables.map((table, i) => {
              const [open, setOpen] = useState(false)
              return (
                <div key={i} className={`rounded-2xl border overflow-hidden ${card}`}>
                  <button
                    onClick={() => setOpen(!open)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-sm">{table.title}</p>
                      <p className={`text-xs mt-0.5 ${subtle}`}>{table.description}</p>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 transition-transform ${subtle} ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className={`border-t overflow-x-auto ${divider}`}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={dark ? 'bg-zinc-800/60' : 'bg-zinc-50'}>
                            {table.headers.map((h, hi) => (
                              <th
                                key={hi}
                                className={`px-3 py-2 text-left font-semibold tracking-wide uppercase text-[10px] ${subtle}`}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, ri) => (
                            <tr
                              key={ri}
                              className={`border-t ${divider} ${dark ? 'hover:bg-zinc-800/40' : 'hover:bg-zinc-50'}`}
                            >
                              {row.map((cell, ci) => (
                                <td
                                  key={ci}
                                  className={`px-3 py-2.5 ${dark ? 'text-zinc-200' : 'text-zinc-800'}`}
                                >
                                  {typeof cell === 'object' && cell !== null
                                    ? cell.display
                                    : String(cell ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {table.footnote && (
                        <div
                          className={`px-4 py-2 border-t text-[11px] flex items-start gap-1.5 ${divider} ${subtle}`}
                        >
                          <Info size={10} className="mt-0.5 shrink-0" />
                          {table.footnote}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {analysis.anomalies.length > 0 && (
        <div>
          <button
            onClick={() => setShowAnomalies(!showAnomalies)}
            className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide mb-3 ${subtler} hover:opacity-80 transition-opacity`}
          >
            <AlertTriangle size={11} className="text-amber-400" />
            Flags & Anomalies
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${dark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}
            >
              {analysis.anomalies.length}
            </span>
            <ChevronDown
              size={12}
              className={`transition-transform ${showAnomalies ? 'rotate-180' : ''}`}
            />
          </button>
          {showAnomalies && (
            <div className="space-y-2">
              {analysis.anomalies.map((a, i) => (
                <AnomalyItem key={i} anomaly={a} dark={dark} />
              ))}
            </div>
          )}
        </div>
      )}

      {conversationEntries.length > 0 && (
        <div className="space-y-6">
          <div className={`h-px ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${subtler}`}>
            Follow-up Thread
          </p>
          {conversationEntries.map((entry, i) => (
            <ConversationTurn
              key={i}
              question={entry.question}
              analysis={entry.analysis}
              dark={dark}
              turnIndex={i}
            />
          ))}
        </div>
      )}

      <div className={`rounded-2xl border ${card}`}>
        <div className="p-4 pb-3">
          <p
            className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${subtler} flex items-center gap-2`}
          >
            <MessageSquare size={11} /> Dig deeper
          </p>
          <p className={`text-xs mb-3 ${subtler}`}>
            Ask to reframe, break out by segment, or add context the AI may have missed.
            {analysis.detectedDataType === 'time_series' &&
              ' Try: "Break this out by channel" or "Is there a treatment vs control split?"'}
            {analysis.detectedDataType === 'experimental' &&
              ' Try: "Run a significance test on the main lift" or "Break out by segment."'}
            {analysis.detectedDataType === 'cross_sectional' &&
              ' Try: "Which segment is most over-indexed?" or "Show the top vs bottom performers."'}
          </p>

          {analysis.suggestedFollowUps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {analysis.suggestedFollowUps.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onFollowUp(q)}
                  disabled={isLoading}
                  className={`text-xs px-3 py-1.5 rounded-xl border transition-colors text-left ${
                    dark
                      ? 'border-zinc-700 text-zinc-300 hover:border-blue-500 hover:text-blue-300'
                      : 'border-zinc-200 text-zinc-600 hover:border-blue-400 hover:text-blue-600'
                  } disabled:opacity-40`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFollowUp()}
              disabled={isLoading}
              placeholder={
                analysis.detectedDataType === 'time_series'
                  ? 'e.g. "Break this out by channel" or "Is there a T vs C split I missed?"'
                  : analysis.detectedDataType === 'experimental'
                    ? 'e.g. "Run significance test on the lift" or "Break out by offer type"'
                    : 'e.g. "Break this out by segment" or "Focus on the top 3 metrics"'
              }
              className={`flex-1 text-sm px-4 py-2.5 rounded-xl border outline-none transition-colors disabled:opacity-40 ${
                dark
                  ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
                  : 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-blue-400'
              }`}
            />
            <button
              onClick={handleFollowUp}
              disabled={!followUpInput.trim() || isLoading}
              className="px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40 flex items-center gap-2 shrink-0"
            >
              {isLoading && <RefreshCw size={12} className="animate-spin" />}
              {isLoading ? 'Thinking…' : 'Ask'}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`p-5 rounded-2xl border-2 border-dashed flex items-center justify-between gap-4 ${dark ? 'border-zinc-700' : 'border-zinc-300'}`}
      >
        <div>
          <p className="font-semibold text-sm">Ready to build slides?</p>
          <p className={`text-xs mt-0.5 ${subtle}`}>
            The deck is grounded in this analysis — not a cold re-read of the file.
          </p>
        </div>
        <button
          onClick={onBuildSlides}
          disabled={isLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors shrink-0 disabled:opacity-40"
        >
          <PresentationIcon size={14} />
          Build Slides
        </button>
      </div>
    </div>
  )
}
