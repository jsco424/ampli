'use client'

import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  Circle,
  Table2,
  Sparkles,
  BarChart3,
  FileDown,
  Download,
  Info,
} from 'lucide-react'
import ChartRenderer from '@/components/ChartRenderer'
import type { AnalysisOutput, KeyFinding, InsightTable } from '@/lib/analysisTypes'

// ── Chart type resolver ────────────────────────────────────────────────────

export type ResolvedChartType =
  | 'bar'
  | 'grouped_bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'treemap'
  | 'scatter'
  | 'composed'
  | 'table'
  | 'hero_stat_only'

// A single already-generated chart, as stored in project.charts.
// Shape inferred from how pitch/page.tsx reads chart fields today.
export interface GeneratedChart {
  title: string
  description?: string
  type: string
  data: Record<string, any>[]
  hero_stat?: string
  takeaway?: string
  layout?: string
  [key: string]: any
}

// A single already-generated recommendation, as stored in
// project.recommendations. Matches the shape generate/route.ts's
// recommendations background call produces.
export interface Recommendation {
  number?: string
  title: string
  description: string
  stat?: string
  stat_label?: string
}

export interface SelectedFinding {
  type: 'finding' | 'table' | 'visual' | 'recommendation'
  id: string
  finding?: KeyFinding
  table?: InsightTable
  chart?: GeneratedChart
  chartIndex?: number // original index into project.charts, for visuals
  recommendation?: Recommendation
  heroStat: string
  takeaway: string
  chartType: ResolvedChartType
  chartData?: Record<string, any>[]
}

function resolveChartType(finding: KeyFinding): ResolvedChartType {
  const ft = finding.formulaType || ''
  const inputs = finding.inputs || {}
  if (ft === 'lift_pct' || ft === 'incremental_value' || ft === 'roi') return 'grouped_bar'
  if (ft === 'share_pct') return Object.keys(inputs).length >= 6 ? 'treemap' : 'pie'
  if (ft === 'period_over_period') return 'line'
  if (ft === 'weighted_average' || ft === 'ratio') return 'composed'
  return 'bar'
}

function resolveChartData(
  finding: KeyFinding,
  chartType: ResolvedChartType
): Record<string, any>[] {
  const inputs = finding.inputs || {}
  if (chartType === 'grouped_bar') {
    if ('treatment_avg' in inputs && 'control_avg' in inputs)
      return [
        { name: 'Treatment', value: inputs.treatment_avg },
        { name: 'Control', value: inputs.control_avg },
      ]
    if ('current_value' in inputs && 'prior_value' in inputs)
      return [
        { name: 'Current', value: inputs.current_value },
        { name: 'Prior', value: inputs.prior_value },
      ]
  }
  if (chartType === 'pie' || chartType === 'treemap') {
    if ('category_value' in inputs && 'total_value' in inputs)
      return [
        { name: finding.label, value: inputs.category_value },
        { name: 'Other', value: inputs.total_value - inputs.category_value },
      ]
  }
  if (chartType === 'line' || chartType === 'bar') {
    if ('current_value' in inputs && 'prior_value' in inputs)
      return [
        { name: 'Prior', value: inputs.prior_value },
        { name: 'Current', value: inputs.current_value },
      ]
  }
  return [{ name: finding.label, value: finding.raw ?? 0 }]
}

// Maps a generated chart's own `type` field (recharts-style: bar, line, area,
// pie, composed, treemap, funnel, scatter) to our ResolvedChartType. Falls
// back to 'bar' for anything unrecognized rather than erroring.
function normalizeGeneratedChartType(rawType: string): ResolvedChartType {
  const known: ResolvedChartType[] = [
    'bar',
    'grouped_bar',
    'line',
    'area',
    'pie',
    'treemap',
    'scatter',
    'composed',
  ]
  return (known as string[]).includes(rawType) ? (rawType as ResolvedChartType) : 'bar'
}

const MAX_SLIDES = 10
const DEFAULT_CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6']

function directionColor(direction: string): string {
  return (
    { positive: 'text-emerald-500', negative: 'text-red-400', warning: 'text-amber-400' }[
      direction
    ] || 'text-zinc-300'
  )
}

function chartTypeLabel(type: ResolvedChartType): string {
  return (
    {
      bar: 'Bar chart',
      grouped_bar: 'Grouped bar (T vs C)',
      line: 'Line chart',
      area: 'Area chart',
      pie: 'Pie chart',
      treemap: 'Treemap',
      scatter: 'Scatter plot',
      composed: 'Dual-axis chart',
      table: 'Data table',
      hero_stat_only: 'Hero number only (no chart)',
    }[type] || type
  )
}

// ── Toggle components ──────────────────────────────────────────────────────

function CompactDetailedToggle({
  value,
  onChange,
  dark,
}: {
  value: boolean
  onChange: (v: boolean) => void
  dark: boolean
}) {
  return (
    <div
      className={`flex items-center rounded-lg border p-0.5 text-xs shrink-0 ${dark ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-200 bg-zinc-100'}`}
    >
      <button
        onClick={() => onChange(false)}
        className={`px-2.5 py-1 rounded-md transition-colors ${!value ? (dark ? 'bg-zinc-700 text-white' : 'bg-white text-zinc-900 shadow-sm') : dark ? 'text-zinc-500' : 'text-zinc-400'}`}
      >
        Compact
      </button>
      <button
        onClick={() => onChange(true)}
        className={`px-2.5 py-1 rounded-md transition-colors ${value ? (dark ? 'bg-zinc-700 text-white' : 'bg-white text-zinc-900 shadow-sm') : dark ? 'text-zinc-500' : 'text-zinc-400'}`}
      >
        Detailed
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface SlideSelectorProps {
  analysis: AnalysisOutput
  charts?: GeneratedChart[]
  chartsLoading?: boolean
  dark?: boolean
  isExporting?: boolean
  exportError?: string | null
  onExport: (format: 'pptx' | 'pdf', selections: SelectedFinding[]) => void
  onCancel: () => void
  // Follow-up "Dig deeper" turns — each has its own findings/tables that
  // previously had no way to reach the selector at all. Optional so this
  // component still works exactly as before wherever it's rendered without
  // a conversation history to pass.
  conversationEntries?: { question: string; analysis: AnalysisOutput }[]
  // Colors for the real chart previews on Visuals cards (see below) — same
  // brand palette the project page and AnalysisView already use elsewhere,
  // so a chart looks the same here as it will in the final deck. Falls back
  // to a generic palette if the caller doesn't pass one.
  chartColors?: string[]
  // AI-generated recommendations from project.recommendations. Previously
  // these were invisible in the UI entirely — auto-stuffed into the deck
  // server-side (gammaFormatter.ts took up to 3 automatically) with no way
  // to see, choose, or edit them before export. Now rendered as its own
  // selectable/editable section, same as findings.
  recommendations?: Recommendation[]
}

export default function SlideSelector({
  analysis,
  charts = [],
  chartsLoading = false,
  dark = true,
  isExporting = false,
  exportError = null,
  onExport,
  onCancel,
  conversationEntries = [],
  chartColors = DEFAULT_CHART_COLORS,
  recommendations = [],
}: SlideSelectorProps) {
  const [selected, setSelected] = useState<Record<string, SelectedFinding>>({})
  // detailedMode: a shortcut that force-expands EVERY currently selected
  // card at once. Independent of manuallyExpanded below — a card can be
  // open because of either one, and closing detailedMode doesn't close
  // cards a user individually opened by clicking them.
  const [detailedMode, setDetailedMode] = useState(false)
  // Per-card expand state, set by clicking a card's body (not its
  // checkbox). This is what makes clicking a card open its editor
  // immediately, without needing to flip the global Compact/Detailed
  // toggle first.
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set())

  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const inputCls = dark
    ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
    : 'bg-zinc-50 border-zinc-200 text-zinc-800 placeholder-zinc-400'

  const selectedCount = Object.keys(selected).length
  const atLimit = selectedCount >= MAX_SLIDES

  // turnIndex is undefined for the original analysis, a number for a
  // follow-up turn — this is what keeps IDs unique across all of them
  // (e.g. "finding-2" from the original vs. "finding-t0-2" from the first
  // follow-up), since both start counting from 0 independently.
  const toggleFinding = (finding: KeyFinding, idx: number, turnIndex?: number) => {
    const id = turnIndex === undefined ? `finding-${idx}` : `finding-t${turnIndex}-${idx}`
    if (selected[id]) {
      const next = { ...selected }
      delete next[id]
      setSelected(next)
    } else {
      if (atLimit) return
      const chartType = resolveChartType(finding)
      setSelected({
        ...selected,
        [id]: {
          type: 'finding',
          id,
          finding,
          heroStat: finding.value,
          takeaway: finding.interpretation,
          chartType,
          chartData: resolveChartData(finding, chartType),
        },
      })
    }
  }

  const toggleTable = (table: InsightTable, idx: number, turnIndex?: number) => {
    const id = turnIndex === undefined ? `table-${idx}` : `table-t${turnIndex}-${idx}`
    if (selected[id]) {
      const next = { ...selected }
      delete next[id]
      setSelected(next)
    } else {
      if (atLimit) return
      setSelected({
        ...selected,
        [id]: {
          type: 'table',
          id,
          table,
          heroStat: '',
          takeaway: table.description,
          chartType: 'table',
        },
      })
    }
  }

  const toggleVisual = (chart: GeneratedChart, idx: number) => {
    const id = `visual-${idx}`
    if (selected[id]) {
      const next = { ...selected }
      delete next[id]
      setSelected(next)
    } else {
      if (atLimit) return
      setSelected({
        ...selected,
        [id]: {
          type: 'visual',
          id,
          chart,
          chartIndex: idx,
          heroStat: chart.hero_stat || '',
          takeaway: chart.takeaway || chart.description || '',
          chartType: normalizeGeneratedChartType(chart.type),
          chartData: chart.data,
        },
      })
    }
  }

  // heroStat comes from `stat` (e.g. "57%"), takeaway from `description` —
  // same generic heroStat/takeaway fields every other card type uses, so
  // renderDetailFields below works for recommendations with zero new code.
  // chartType is set to 'table' just to reuse the "no chart type dropdown"
  // rendering path (showHeroStat=true still shows the Hero Stat field,
  // chartType itself is irrelevant for a recommendation card).
  const toggleRecommendation = (rec: Recommendation, idx: number) => {
    const id = `recommendation-${idx}`
    if (selected[id]) {
      const next = { ...selected }
      delete next[id]
      setSelected(next)
    } else {
      if (atLimit) return
      setSelected({
        ...selected,
        [id]: {
          type: 'recommendation',
          id,
          recommendation: rec,
          heroStat: rec.stat || '',
          takeaway: rec.description || '',
          chartType: 'table',
        },
      })
    }
  }

  const updateSelected = (id: string, patch: Partial<SelectedFinding>) => {
    if (!selected[id]) return
    setSelected({ ...selected, [id]: { ...selected[id], ...patch } })
  }

  // Clicking a card's body: if it isn't selected yet, select it AND open
  // its editor immediately (matches "click it and it expands so you can
  // edit"). If it's already selected, a body click just toggles that one
  // card's expand state open/closed — selection itself doesn't change.
  const handleCardClick = (
    id: string,
    isSelected: boolean,
    disabled: boolean,
    select: () => void
  ) => {
    if (disabled) return
    if (!isSelected) {
      select()
      setManuallyExpanded((prev) => new Set(prev).add(id))
    } else {
      setManuallyExpanded((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    }
  }

  // Clicking the checkbox/circle icon itself: select/deselect only, never
  // expand. stopPropagation keeps this from also firing the card's own body
  // click handler above. Deselecting also clears any manual expand state
  // for that id, so it doesn't reappear pre-expanded if reselected later.
  const handleCheckboxClick = (
    e: React.MouseEvent,
    id: string,
    isSelected: boolean,
    disabled: boolean,
    select: () => void
  ) => {
    e.stopPropagation()
    if (disabled) return
    select()
    if (isSelected) {
      setManuallyExpanded((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Selection order — relies on JS preserving insertion order for string
  // object keys (guaranteed for non-integer-like keys, which all of ours
  // are, e.g. "finding-2" or "finding-t0-2"). No custom sort needed, and
  // none would work reliably across both ID formats anyway.
  const orderedSelections = useMemo(() => Object.values(selected), [selected])

  // ── Shared expanded editor ─────────────────────────────────────────────
  // Rendered inside a card whenever `expanded` is true for it — true when
  // EITHER the global detailedMode shortcut is on, OR the card was
  // individually opened via handleCardClick. showHeroStat covers both
  // findings and visuals — tables never show it.
  const renderDetailFields = (id: string, showHeroStat: boolean, expanded: boolean) => {
    const sel = selected[id]
    if (!sel || !expanded) return null
    return (
      <div
        className={`px-4 pb-4 pt-3 space-y-2 border-t ${dark ? 'border-zinc-800' : 'border-zinc-100'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showHeroStat && (
          <div>
            <label
              className={`text-[10px] font-semibold uppercase tracking-wide mb-1 block ${subtle}`}
            >
              Hero Stat
            </label>
            <input
              value={sel.heroStat}
              onChange={(e) => updateSelected(id, { heroStat: e.target.value })}
              className={`w-full text-sm px-3 py-2 rounded-lg border outline-none ${inputCls}`}
              placeholder="+2.8%"
            />
          </div>
        )}
        <div>
          <label
            className={`text-[10px] font-semibold uppercase tracking-wide mb-1 block ${subtle}`}
          >
            Takeaway
          </label>
          <textarea
            value={sel.takeaway}
            onChange={(e) => updateSelected(id, { takeaway: e.target.value })}
            rows={2}
            className={`w-full text-xs px-3 py-2 rounded-lg border outline-none resize-none ${inputCls}`}
            placeholder="One punchy sentence..."
          />
        </div>
        {showHeroStat && (
          <div>
            <label
              className={`text-[10px] font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${subtle}`}
            >
              Chart Type
              <span
                title="This is a suggestion sent to Gamma, not a guarantee — Gamma picks the visual it judges best for each card and may choose something different."
                className="cursor-help"
              >
                <Info size={10} />
              </span>
            </label>
            <select
              value={sel.chartType}
              onChange={(e) =>
                updateSelected(id, { chartType: e.target.value as ResolvedChartType })
              }
              className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${inputCls}`}
            >
              {(
                [
                  'hero_stat_only',
                  'bar',
                  'grouped_bar',
                  'line',
                  'area',
                  'pie',
                  'treemap',
                  'scatter',
                  'composed',
                ] as ResolvedChartType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {chartTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    )
  }

  const cardBase = (isSelected: boolean, disabled: boolean) =>
    `rounded-2xl border transition-all cursor-pointer ${
      isSelected
        ? 'border-blue-500 bg-blue-500/8'
        : dark
          ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
          : 'bg-white border-zinc-200 hover:border-zinc-300'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div
        className={`p-5 rounded-2xl border ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-bold text-base mb-1 flex items-center gap-2">
              <Sparkles size={15} className="text-blue-400" />
              Select What to Export
            </h2>
            <p className={`text-xs leading-relaxed ${subtle}`}>
              Pick up to {MAX_SLIDES} findings, tables, or visuals — mix and match freely, switch
              sections anytime without losing your picks.
            </p>
          </div>
          <button
            onClick={onCancel}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0 ${dark ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
          >
            Cancel
          </button>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: MAX_SLIDES }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i < selectedCount ? 'bg-blue-500' : dark ? 'bg-zinc-700' : 'bg-zinc-200'}`}
            />
          ))}
          <span className={`text-[11px] shrink-0 ml-1 ${subtle}`}>
            {selectedCount}/{MAX_SLIDES}
          </span>
        </div>
      </div>

      {/* Compact/Detailed toggle — the Visuals/Findings & Tables section
          toggle that used to sit here was removed, since everything now
          renders as one continuous list below and switching sections had
          nothing left to do. */}
      <div className="flex items-center justify-end gap-3">
        <p className={`text-xs ${subtle}`}>
          {detailedMode
            ? 'Detailed — every selected card is expanded'
            : 'Compact — click a card to expand and edit it'}
        </p>
        <CompactDetailedToggle value={detailedMode} onChange={setDetailedMode} dark={dark} />
      </div>

      {/* Visuals */}
      <div>
        {(charts.length > 0 || chartsLoading) && (
          <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${subtle}`}>Visuals</p>
        )}
        {chartsLoading ? (
          <div
            className={`p-6 rounded-2xl border text-center ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}
          >
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className={`text-xs ${subtle}`}>AI is building your visuals...</p>
          </div>
        ) : charts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {charts.map((chart, idx) => {
              const id = `visual-${idx}`
              const isSelected = !!selected[id]
              const disabled = !isSelected && atLimit
              const isExpanded = isSelected && (detailedMode || manuallyExpanded.has(id))
              return (
                <div
                  key={idx}
                  className={cardBase(isSelected, disabled)}
                  onClick={() =>
                    handleCardClick(id, isSelected, disabled, () => toggleVisual(chart, idx))
                  }
                >
                  <div className="p-4 flex items-start gap-3">
                    <span
                      className="mt-0.5 shrink-0"
                      onClick={(e) =>
                        handleCheckboxClick(e, id, isSelected, disabled, () =>
                          toggleVisual(chart, idx)
                        )
                      }
                    >
                      {isSelected ? (
                        <CheckCircle2 size={15} className="text-blue-500" />
                      ) : (
                        <Circle size={15} className={subtle} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <BarChart3 size={11} className={subtle} />
                        <p className={`text-[11px] ${subtle}`}>
                          {chartTypeLabel(normalizeGeneratedChartType(chart.type))}
                        </p>
                      </div>
                      <p className="text-sm font-semibold truncate mb-1">{chart.title}</p>
                      {chart.hero_stat && (
                        <p className="text-xl font-black leading-none text-blue-400">
                          {chart.hero_stat}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Real chart preview — always rendered, not gated
                        behind selection. Previously a card only showed the
                        title and hero stat as text, so there was no way to
                        actually see a visual before picking it. This uses
                        the same ChartRenderer as everywhere else so the
                        preview matches what the deck will actually contain,
                        not a re-derived approximation of it. Click-through
                        is stopped from here so interacting with the chart
                        itself (e.g. a tooltip) doesn't toggle selection. */}
                  <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
                    <ChartRenderer chart={chart} colors={chartColors} height={140} dark={dark} />
                  </div>
                  {renderDetailFields(id, true, isExpanded)}
                </div>
              )
            })}
          </div>
        ) : (
          <div
            className={`p-5 rounded-2xl border text-center ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}
          >
            <p className={`text-xs ${subtle}`}>No visuals available for this analysis yet.</p>
          </div>
        )}
      </div>

      {/* Findings & Tables — Key Findings, Computed Tables, and any
          follow-up ("Dig deeper") turns, all rendered together with Visuals
          above as one continuous list. */}
      <div className="space-y-6">
        {analysis.keyFindings.length > 0 && (
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${subtle}`}>
              Key Findings
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {analysis.keyFindings.map((finding, idx) => {
                const id = `finding-${idx}`
                const isSelected = !!selected[id]
                const disabled = !isSelected && atLimit
                const isExpanded = isSelected && (detailedMode || manuallyExpanded.has(id))
                return (
                  <div
                    key={idx}
                    className={cardBase(isSelected, disabled)}
                    onClick={() =>
                      handleCardClick(id, isSelected, disabled, () => toggleFinding(finding, idx))
                    }
                  >
                    <div className="p-4 flex items-start gap-3">
                      <span
                        className="mt-0.5 shrink-0"
                        onClick={(e) =>
                          handleCheckboxClick(e, id, isSelected, disabled, () =>
                            toggleFinding(finding, idx)
                          )
                        }
                      >
                        {isSelected ? (
                          <CheckCircle2 size={15} className="text-blue-500" />
                        ) : (
                          <Circle size={15} className={subtle} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-medium mb-0.5 truncate ${subtle}`}>
                          {finding.label}
                        </p>
                        <p
                          className={`text-2xl font-black leading-none ${directionColor(finding.direction)}`}
                        >
                          {finding.value}
                        </p>
                      </div>
                    </div>
                    {renderDetailFields(id, true, isExpanded)}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {analysis.insightTables.length > 0 && (
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${subtle}`}>
              Computed Tables
            </p>
            <div className="space-y-3">
              {analysis.insightTables.map((table, idx) => {
                const id = `table-${idx}`
                const isSelected = !!selected[id]
                const disabled = !isSelected && atLimit
                const isExpanded = isSelected && (detailedMode || manuallyExpanded.has(id))
                return (
                  <div
                    key={idx}
                    className={cardBase(isSelected, disabled)}
                    onClick={() =>
                      handleCardClick(id, isSelected, disabled, () => toggleTable(table, idx))
                    }
                  >
                    <div className="p-4 flex items-start gap-3">
                      <span
                        className="mt-0.5 shrink-0"
                        onClick={(e) =>
                          handleCheckboxClick(e, id, isSelected, disabled, () =>
                            toggleTable(table, idx)
                          )
                        }
                      >
                        {isSelected ? (
                          <CheckCircle2 size={15} className="text-blue-500" />
                        ) : (
                          <Circle size={15} className={subtle} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Table2 size={11} className={subtle} />
                          <p className={`text-[11px] ${subtle}`}>Data Table</p>
                        </div>
                        <p className="text-sm font-semibold truncate">{table.title}</p>
                      </div>
                    </div>
                    {renderDetailFields(id, false, isExpanded)}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recommendations — previously invisible in the UI entirely.
              gammaFormatter.ts used to auto-include up to 3 of these
              server-side regardless of any user choice, with no way to see,
              pick a count, or edit them before export. Now selectable and
              editable exactly like Key Findings, reusing the same card
              shell and renderDetailFields editor. */}
        {recommendations.length > 0 && (
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${subtle}`}>
              Recommendations
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recommendations.map((rec, idx) => {
                const id = `recommendation-${idx}`
                const isSelected = !!selected[id]
                const disabled = !isSelected && atLimit
                const isExpanded = isSelected && (detailedMode || manuallyExpanded.has(id))
                return (
                  <div
                    key={idx}
                    className={cardBase(isSelected, disabled)}
                    onClick={() =>
                      handleCardClick(id, isSelected, disabled, () =>
                        toggleRecommendation(rec, idx)
                      )
                    }
                  >
                    <div className="p-4 flex items-start gap-3">
                      <span
                        className="mt-0.5 shrink-0"
                        onClick={(e) =>
                          handleCheckboxClick(e, id, isSelected, disabled, () =>
                            toggleRecommendation(rec, idx)
                          )
                        }
                      >
                        {isSelected ? (
                          <CheckCircle2 size={15} className="text-blue-500" />
                        ) : (
                          <Circle size={15} className={subtle} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-medium mb-0.5 ${subtle}`}>
                          {rec.number ? `${rec.number} · ` : ''}
                          {rec.title}
                        </p>
                        {rec.stat && (
                          <p className="text-2xl font-black leading-none text-blue-400">
                            {rec.stat}
                            {rec.stat_label && (
                              <span className={`text-xs font-medium ml-1.5 ${subtle}`}>
                                {rec.stat_label}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {renderDetailFields(id, true, isExpanded)}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Follow-up "Dig deeper" findings — previously had no way to
              reach the selector at all. Each turn gets its own labeled
              group so it's clear which follow-up question a finding came
              from, but selecting one works exactly like an original finding. */}
        {conversationEntries.map((entry, turnIndex) => (
          <div key={turnIndex} className="space-y-4">
            {entry.analysis.keyFindings.length > 0 && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${subtle}`}>
                  Follow-up · "{entry.question}"
                </p>
                <p className={`text-[11px] mb-3 ${subtle}`}>Key Findings</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {entry.analysis.keyFindings.map((finding, idx) => {
                    const id = `finding-t${turnIndex}-${idx}`
                    const isSelected = !!selected[id]
                    const disabled = !isSelected && atLimit
                    const isExpanded = isSelected && (detailedMode || manuallyExpanded.has(id))
                    return (
                      <div
                        key={idx}
                        className={cardBase(isSelected, disabled)}
                        onClick={() =>
                          handleCardClick(id, isSelected, disabled, () =>
                            toggleFinding(finding, idx, turnIndex)
                          )
                        }
                      >
                        <div className="p-4 flex items-start gap-3">
                          <span
                            className="mt-0.5 shrink-0"
                            onClick={(e) =>
                              handleCheckboxClick(e, id, isSelected, disabled, () =>
                                toggleFinding(finding, idx, turnIndex)
                              )
                            }
                          >
                            {isSelected ? (
                              <CheckCircle2 size={15} className="text-blue-500" />
                            ) : (
                              <Circle size={15} className={subtle} />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-medium mb-0.5 truncate ${subtle}`}>
                              {finding.label}
                            </p>
                            <p
                              className={`text-2xl font-black leading-none ${directionColor(finding.direction)}`}
                            >
                              {finding.value}
                            </p>
                          </div>
                        </div>
                        {renderDetailFields(id, true, isExpanded)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {entry.analysis.insightTables.length > 0 && (
              <div>
                <p className={`text-[11px] mb-3 ${subtle}`}>Computed Tables</p>
                <div className="space-y-3">
                  {entry.analysis.insightTables.map((table, idx) => {
                    const id = `table-t${turnIndex}-${idx}`
                    const isSelected = !!selected[id]
                    const disabled = !isSelected && atLimit
                    const isExpanded = isSelected && (detailedMode || manuallyExpanded.has(id))
                    return (
                      <div
                        key={idx}
                        className={cardBase(isSelected, disabled)}
                        onClick={() =>
                          handleCardClick(id, isSelected, disabled, () =>
                            toggleTable(table, idx, turnIndex)
                          )
                        }
                      >
                        <div className="p-4 flex items-start gap-3">
                          <span
                            className="mt-0.5 shrink-0"
                            onClick={(e) =>
                              handleCheckboxClick(e, id, isSelected, disabled, () =>
                                toggleTable(table, idx, turnIndex)
                              )
                            }
                          >
                            {isSelected ? (
                              <CheckCircle2 size={15} className="text-blue-500" />
                            ) : (
                              <Circle size={15} className={subtle} />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Table2 size={11} className={subtle} />
                              <p className={`text-[11px] ${subtle}`}>Data Table</p>
                            </div>
                            <p className="text-sm font-semibold truncate">{table.title}</p>
                          </div>
                        </div>
                        {renderDetailFields(id, false, isExpanded)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky footer CTA — direct export, no intermediate slide build.
          Reflects the TOTAL selected count across both sections, regardless
          of which one is currently visible. */}
      {selectedCount > 0 && (
        <div
          className={`sticky bottom-4 p-4 rounded-2xl border shadow-xl flex items-center justify-between gap-4 flex-wrap ${dark ? 'bg-zinc-900/95 border-zinc-700' : 'bg-white/95 border-zinc-200'}`}
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold">
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
              </p>
              <p className={`text-xs ${subtle}`}>
                {exportError ? (
                  <span className="text-red-400">{exportError}</span>
                ) : (
                  'Hero stats and takeaways are locked — no AI rewriting'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onExport('pptx', orderedSelections)}
              disabled={isExporting}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors disabled:opacity-40 ${dark ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}
            >
              {isExporting ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileDown size={14} />
              )}
              PPTX
            </button>
            <button
              onClick={() => onExport('pdf', orderedSelections)}
              disabled={isExporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors shrink-0 disabled:opacity-40"
            >
              {isExporting ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {isExporting ? 'Exporting…' : 'PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
