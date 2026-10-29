'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, HelpCircle, Loader2, Sparkles } from 'lucide-react'
import {
  CANONICAL_FIELDS,
  FIELD_BY_KEY,
  metricAvailability,
  slotLabel,
  type ColumnInput,
  type ColumnMatch,
} from '@/lib/canonicalFields'

interface Props {
  dark: boolean
  matches: ColumnMatch[]
  inputs: ColumnInput[]
  // question text written by the AI layer, by column name
  questions: Record<string, string>
  checking: boolean
  existingMetrics: string[]
  // field is a canonical key, or 'custom' for "leave as is"
  onAnswer: (column: string, field: string) => void
}

function sampleText(input?: ColumnInput): string {
  if (!input) return ''
  const seen: string[] = []
  for (const v of input.values) {
    if (v === null || v === undefined || v === '') continue
    const s = typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v).slice(0, 24)
    if (!seen.includes(s)) seen.push(s)
    if (seen.length >= 3) break
  }
  return seen.join(', ')
}

const GROUPS = Array.from(new Set(CANONICAL_FIELDS.map((c) => c.group)))

function FieldSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Choose a field</option>
      <option value="custom">Leave as is</option>
      {GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {CANONICAL_FIELDS.filter((c) => c.group === g).map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export default function ColumnMappingCard({ dark, matches, inputs, questions, checking, existingMetrics, onAnswer }: Props) {
  const [showAll, setShowAll] = useState(false)
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const section = dark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-zinc-50 border-zinc-200'
  const inner = dark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-white border-zinc-200'
  const selectCls = `w-full text-xs px-3 py-2 rounded-lg border outline-none ${
    dark ? 'bg-white/[0.04] border-white/[0.08] text-white' : 'bg-white border-zinc-300 text-zinc-900'
  }`
  const chipBase = 'text-xs px-3 py-1.5 rounded-lg border transition-colors'
  const chipCls = dark
    ? `${chipBase} border-white/[0.12] hover:bg-white/[0.06]`
    : `${chipBase} border-zinc-300 hover:bg-zinc-100`

  const inputByName = useMemo(() => new Map(inputs.map((i) => [i.name, i])), [inputs])
  const open = matches.filter((m) => m.status === 'question')
  const answered = matches.filter((m) => m.layer === 'user')
  const review = matches.filter((m) => m.status === 'review')

  const mapping = useMemo(() => {
    const out: Record<string, string> = {}
    for (const m of matches) if (m.field) out[m.column] = m.field
    return out
  }, [matches])
  const avail = useMemo(() => metricAvailability(mapping, existingMetrics), [mapping, existingMetrics])
  const ready = avail.filter((a) => a.missing.length === 0)
  const almost = avail.filter((a) => a.haveAny && a.missing.length > 0).slice(0, 4)

  const measureCols = matches.filter((m) => m.field || m.status !== 'custom' || (inputByName.get(m.column)?.role === 'metric'))
  const nothingToShow = open.length === 0 && review.length === 0 && ready.length === 0 && almost.length === 0 && !checking
  if (nothingToShow && measureCols.length === 0) return null

  return (
    <div className={`mb-4 p-4 rounded-xl border ${section}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-emerald-500/10">
          <Sparkles size={13} className="text-emerald-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Check your columns</p>
          <p className={`text-xs ${muted}`}>
            ampli matches your columns to standard fields so metrics like ROAS or CPA are calculated from the right numbers.
          </p>
        </div>
        {checking && <Loader2 size={14} className={`animate-spin ${muted}`} />}
      </div>

      {open.length > 0 && (
        <div className="space-y-3 mb-3">
          {open.map((m) => {
            const sample = sampleText(inputByName.get(m.column))
            const q = questions[m.column] || m.note || 'What is this column?'
            return (
              <div key={m.column} className={`p-3 rounded-lg border ${inner}`}>
                <div className="flex items-start gap-2 mb-2">
                  <HelpCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm">
                      We see a column called <span className="font-semibold">&ldquo;{m.column}&rdquo;</span>
                      {sample ? <span className={muted}> (values like {sample})</span> : null}.
                    </p>
                    <p className={`text-xs mt-0.5 ${muted}`}>{q}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {m.candidates
                    .filter((k) => FIELD_BY_KEY[k])
                    .map((k) => (
                      <button key={k} onClick={() => onAnswer(m.column, k)} className={chipCls}>
                        {FIELD_BY_KEY[k].label}
                      </button>
                    ))}
                  <button onClick={() => onAnswer(m.column, 'custom')} className={`${chipCls} ${muted}`}>
                    Leave as is
                  </button>
                </div>
                <FieldSelect value="" onChange={(v) => v && onAnswer(m.column, v)} className={selectCls} />
              </div>
            )
          })}
        </div>
      )}

      {(ready.length > 0 || almost.length > 0) && (
        <div className="mb-3 space-y-2">
          {ready.length > 0 && (
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>ampli will calculate</p>
              <div className="flex flex-wrap gap-1.5">
                {ready.map((a) => (
                  <span
                    key={a.metric.key}
                    className="text-xs px-2.5 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                    title={a.metric.formula}
                  >
                    {a.metric.label}: {a.metric.formula}
                  </span>
                ))}
              </div>
            </div>
          )}
          {almost.length > 0 && (
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Not enough fields yet</p>
              <ul className={`text-xs space-y-0.5 ${muted}`}>
                {almost.map((a) => (
                  <li key={a.metric.key}>
                    {a.metric.label} needs {a.missing.map((s) => slotLabel(a.metric, s)).join(' and ')}.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(review.length > 0 || answered.length > 0) && !showAll && (
        <p className={`text-xs mb-2 flex items-center gap-1.5 ${muted}`}>
          <CheckCircle2 size={12} className="text-emerald-500" />
          {answered.length > 0 ? `${answered.length} answered by you. ` : ''}
          {review.length > 0 ? `${review.length} matched with medium confidence, worth a quick look.` : ''}
        </p>
      )}

      <button
        onClick={() => setShowAll(!showAll)}
        className={`text-xs flex items-center gap-1 ${muted} hover:opacity-80`}
      >
        <ChevronDown size={12} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
        {showAll ? 'Hide all columns' : 'Show all columns'}
      </button>

      {showAll && (
        <div className="mt-3 space-y-1.5">
          {matches.map((m) => (
            <div key={m.column} className="grid grid-cols-[1fr_180px] gap-3 items-center">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{m.column}</p>
                <p className={`text-[11px] truncate ${muted}`}>
                  {sampleText(inputByName.get(m.column))}
                  {m.status === 'review' ? '  ·  check this one' : ''}
                </p>
              </div>
              <FieldSelect
                value={m.field || (m.status === 'custom' && m.layer === 'user' ? 'custom' : '')}
                onChange={(v) => v && onAnswer(m.column, v)}
                className={selectCls}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}