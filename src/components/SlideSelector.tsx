'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2, Circle, Table2, Sparkles, BarChart3, FileDown, Download } from 'lucide-react'
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

export interface SelectedFinding {
  type: 'finding' | 'table' | 'visual'
  id: string
  finding?: KeyFinding
  table?: InsightTable
  chart?: GeneratedChart
  chartIndex?: number // original index into project.charts, for visuals
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

type Section = 'visuals' | 'analysis'

// Lets the user flip between the Visuals grid and the Findings/Tables view
// while building one shared selection — selections persist across both,
// only the visible section changes.
function SectionToggle({
  value,
  onChange,
  dark,
  visualsCount,
  analysisCount,
}: {
  value: Section
  onChange: (s: Section) => void
  dark: boolean
  visualsCount: number
  analysisCount: number
}) {
  const base = 'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors'
  const active = dark ? 'bg-zinc-700 text-white' : 'bg-white text-zinc-900 shadow-sm'
  const inactive = dark ? 'text-zinc-500' : 'text-zinc-400'
  return (
    <div
      className={`flex items-center rounded-lg border p-0.5 ${dark ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-200 bg-zinc-100'}`}
    >
      <button
        onClick={() => onChange('visuals')}
        className={`${base} ${value === 'visuals' ? active : inactive}`}
      >
        Visuals ({visualsCount})
      </button>
      <button
        onClick={() => onChange('analysis')}
        className={`${base} ${value === 'analysis' ? active : inactive}`}
      >
        Findings & Tables ({analysisCount})
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
}: SlideSelectorProps) {
  const [selected, setSelected] = useState<Record<string, SelectedFinding>>({})
  // detailedMode: when true, selected cards expand to show editable fields.
  // Toggling this at any time immediately affects ALL currently selected cards.
  const [detailedMode, setDetailedMode] = useState(false)
  // Which section is visible right now — independent of what's selected,
  // so switching back and forth never loses or resets your picks.
  const [activeSection, setActiveSection] = useState<Section>('visuals')

  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const inputCls = dark
    ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
    : 'bg-zinc-50 border-zinc-200 text-zinc-800 placeholder-zinc-400'

  const selectedCount = Object.keys(selected).length
  const atLimit = selectedCount >= MAX_SLIDES
  const analysisCount = analysis.keyFindings.length + analysis.insightTables.length

  const toggleFinding = (finding: KeyFinding, idx: number) => {
    const id = `finding-${idx}`
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

  const toggleTable = (table: InsightTable, idx: number) => {
    const id = `table-${idx}`
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

  const updateSelected = (id: string, patch: Partial<SelectedFinding>) => {
    if (!selected[id]) return
    setSelected({ ...selected, [id]: { ...selected[id], ...patch } })
  }

  const orderedSelections = useMemo(
    () =>
      Object.values(selected).sort(
        (a, b) => parseInt(a.id.split('-')[1]) - parseInt(b.id.split('-')[1])
      ),
    [selected]
  )

  // ── Shared expanded editor ─────────────────────────────────────────────
  // Rendered inside any selected card when detailedMode is true.
  // showHeroStat covers both findings and visuals — tables never show it.
  const renderDetailFields = (id: string, showHeroStat: boolean) => {
    const sel = selected[id]
    if (!sel || !detailedMode) return null
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
              className={`text-[10px] font-semibold uppercase tracking-wide mb-1 block ${subtle}`}
            >
              Chart Type
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

      {/* Section toggle + Compact/Detailed toggle, side by side */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionToggle
          value={activeSection}
          onChange={setActiveSection}
          dark={dark}
          visualsCount={charts.length}
          analysisCount={analysisCount}
        />
        <div className="flex items-center gap-3">
          <p className={`text-xs ${subtle}`}>
            {detailedMode ? 'Detailed — edit hero stat & takeaway' : 'Compact — tap to select'}
          </p>
          <CompactDetailedToggle value={detailedMode} onChange={setDetailedMode} dark={dark} />
        </div>
      </div>

      {/* Visuals section */}
      {activeSection === 'visuals' && (
        <div>
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
                return (
                  <div
                    key={idx}
                    className={cardBase(isSelected, disabled)}
                    onClick={() => !disabled && toggleVisual(chart, idx)}
                  >
                    <div className="p-4 flex items-start gap-3">
                      <span className="mt-0.5 shrink-0">
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
                    {isSelected && renderDetailFields(id, true)}
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
      )}

      {/* Findings & Tables section */}
      {activeSection === 'analysis' && (
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
                  return (
                    <div
                      key={idx}
                      className={cardBase(isSelected, disabled)}
                      onClick={() => !disabled && toggleFinding(finding, idx)}
                    >
                      <div className="p-4 flex items-start gap-3">
                        <span className="mt-0.5 shrink-0">
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
                      {isSelected && renderDetailFields(id, true)}
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
                  return (
                    <div
                      key={idx}
                      className={cardBase(isSelected, disabled)}
                      onClick={() => !disabled && toggleTable(table, idx)}
                    >
                      <div className="p-4 flex items-start gap-3">
                        <span className="mt-0.5 shrink-0">
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
                      {isSelected && renderDetailFields(id, false)}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
