// Story Mode slide model.
//
// Turns a project (analysis handoff, generated charts, recommendations) into
// an ordered list of slides on a fixed story arc:
//
//   title -> summary -> hero stats -> evidence (charts, tables) -> next steps
//
// Pure functions only, so the same model drives the editor, the present view,
// copy as image, PDF export and CSV download.

export type StoryKind = 'title' | 'summary' | 'stats' | 'chart' | 'table' | 'recs'

export type ChartKind = 'line' | 'bar' | 'ranked' | 'grouped' | 'stacked' | 'donut' | 'scatter'

export interface ChartAnnotation {
  x: string
  label: string
}

export interface StoryChart {
  kind: ChartKind
  // the unshaped rows, so the chart can be redrawn as another kind
  raw?: Record<string, any>[]
  // numeric series keys in the order they should be drawn
  keys: string[]
  data: Record<string, any>[]
  annotations?: ChartAnnotation[]
  reference?: { label: string; value: number }
}

export interface StoryTable {
  headers: string[]
  rows: string[][]
  footnote?: string
}

export interface FieldSpec {
  key: string
  label: string
  long?: boolean
}

export interface StorySlide {
  id: string
  kind: StoryKind
  // Every piece of editable text, by key. Layouts read from here.
  fields: Record<string, string>
  spec: FieldSpec[]
  chart?: StoryChart
  table?: StoryTable
  // number of cards (stats) or recommendations (recs) on the slide
  count?: number
}

export interface StoryEdits {
  fields?: Record<string, Record<string, string>>
  hidden?: string[]
  order?: string[]
  // chart kind chosen by the user per slide id
  kinds?: Record<string, ChartKind>
  // the summary slide is off unless this is true
  summary?: boolean
}

// ── number formatting ───────────────────────────────────────────────────────

function trimNum(n: number, digits: number): string {
  return Number(n.toFixed(digits)).toString()
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return ''
  const a = Math.abs(n)
  if (a >= 1e9) return trimNum(n / 1e9, 1) + 'B'
  if (a >= 1e6) return trimNum(n / 1e6, 1) + 'M'
  if (a >= 1e4) return trimNum(n / 1e3, 1) + 'K'
  // Keep up to two decimals so a label matches the number in the headline,
  // for example 24.97 stays 24.97 and never becomes 25.
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// ── chart type rules ────────────────────────────────────────────────────────

const TIME_LIKE =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|^(19|20)\d{2}\b|^q[1-4]\b|^w(eek)?\s?\d+|^\d{1,2}[\/\-]\d{1,2}|^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|^day\s?\d+|^month\s?\d+/i

export function numericKeys(data: Record<string, any>[]): string[] {
  const sample = data.find((d) => d && typeof d === 'object') || {}
  const keys = Object.keys(sample).filter(
    (k) =>
      k !== 'name' &&
      k !== 'label' &&
      (typeof sample[k] === 'number' ||
        (typeof sample[k] === 'string' && sample[k] !== '' && !isNaN(Number(sample[k]))))
  )
  return keys.length > 0 ? keys : ['value']
}

function isTimeLike(data: Record<string, any>[]): boolean {
  if (data.length < 3) return false
  const hits = data.filter((d) => TIME_LIKE.test(String(d.name ?? d.label ?? '').trim())).length
  return hits / data.length >= 0.8
}

// One value is a stat, never a chart. Time with five or more points is a
// line. Few categories is a sorted bar, many is ranked bars. Several series
// is grouped bars, or stacked when the data says so. Parts of a whole with
// five or fewer slices is a donut. Two numeric measures per point is a
// scatter.
export function pickChartKind(chart: any): ChartKind | 'stat' {
  const data: Record<string, any>[] = Array.isArray(chart?.data) ? chart.data.filter(Boolean) : []
  const type = String(chart?.type || 'bar')
  if (type === 'stat' || type === 'hero_stat_only' || data.length <= 1) return 'stat'
  const keys = numericKeys(data)
  const n = data.length
  // A line only makes sense when the x axis is time. The generator labels
  // many categorical charts as "line", so the shape of the data decides.
  const timeLike = isTimeLike(data)

  if (type === 'scatter') {
    const hasXY = keys.includes('x') && keys.includes('y')
    if (hasXY || keys.length >= 2) return 'scatter'
  }
  if (type === 'pie' || type === 'treemap') {
    return n <= 5 ? 'donut' : 'ranked'
  }
  if (keys.length > 1) {
    if (timeLike && n >= 5) return 'line'
    if (chart?.stacked) return 'stacked'
    return n > 8 ? 'ranked' : 'grouped'
  }
  if (timeLike && n >= 5) return 'line'
  if (n > 6) return 'ranked'
  return 'bar'
}

// Kinds that can honestly draw this data, for the chart type pickers.
export function compatibleKinds(data: Record<string, any>[]): ChartKind[] {
  const rows = (Array.isArray(data) ? data : []).filter(Boolean)
  const keys = numericKeys(rows)
  const n = rows.length
  const out: ChartKind[] = ['bar', 'ranked']
  if (n >= 3) out.push('line')
  if (keys.length > 1) out.push('grouped', 'stacked')
  if (n >= 2 && n <= 8) out.push('donut')
  if (keys.length > 1) out.push('scatter')
  return out
}

export const CHART_KIND_LABEL: Record<ChartKind, string> = {
  bar: 'Sorted bars',
  ranked: 'Ranked bars',
  line: 'Line',
  grouped: 'Grouped bars',
  stacked: 'Stacked bars',
  donut: 'Donut',
  scatter: 'Scatter',
}

const KIND_TAG: Record<ChartKind, string> = {
  line: 'TREND',
  bar: 'COMPARISON',
  ranked: 'RANKING',
  grouped: 'COMPARISON',
  stacked: 'COMPOSITION',
  donut: 'COMPOSITION',
  scatter: 'RELATIONSHIP',
}

// ── helpers ─────────────────────────────────────────────────────────────────

const clean = (v: any): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))

function sameText(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  return n(a) !== '' && n(a) === n(b)
}

function sortForKind(kind: ChartKind, data: Record<string, any>[], keys: string[]) {
  if (kind === 'ranked') {
    return [...data].sort((a, b) => Number(b[keys[0]]) - Number(a[keys[0]])).slice(0, 8)
  }
  if (kind === 'bar') {
    return isTimeLike(data)
      ? data
      : [...data].sort((a, b) => Number(b[keys[0]]) - Number(a[keys[0]]))
  }
  if (kind === 'grouped') return data.slice(0, 8)
  return data
}

export function shapeChart(kind: ChartKind, raw: Record<string, any>[]) {
  const data = raw.filter(Boolean)
  const all = numericKeys(data)
  const keys =
    kind === 'scatter'
      ? all.slice(0, 2)
      : kind === 'donut' || kind === 'bar' || kind === 'ranked'
        ? all.slice(0, 1)
        : all.slice(0, 4)
  return { keys, data: sortForKind(kind, data, keys) }
}

function sourceLine(project: any, sampleSize?: number): string {
  const base = 'Source: your uploaded data'
  return sampleSize ? `${base}, n = ${sampleSize.toLocaleString('en-US')}` : base
}

function monthYear(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ── build ───────────────────────────────────────────────────────────────────

export function buildStory(project: any, edits?: StoryEdits): StorySlide[] {
  if (!project) return []
  const handoff = project.analysis_handoff
  const allSelections: any[] = handoff?.selectedFindings || []
  const included: number[] | undefined = Array.isArray(project.pitch_included_findings)
    ? project.pitch_included_findings
    : undefined
  const charts: any[] = (project.charts || []).map((c: any) =>
    c && typeof c === 'object' ? c : null
  )

  type Item = { index: number; sel?: any; chart?: any }
  let items: Item[] = []
  if (allSelections.length > 0) {
    allSelections.forEach((sel, i) => {
      if (included && !included.includes(i)) return
      if (sel.type === 'recommendation') return
      // A picked visual carries its own chart. Findings and tables line up with
      // the generated charts by selection position.
      const own =
        sel.type === 'visual' && sel.chart && typeof sel.chart === 'object' ? sel.chart : null
      items.push({ index: i, sel, chart: own || charts[i] || undefined })
    })
  } else {
    charts.forEach((c, i) => {
      if (!c) return
      if (included && !included.includes(i)) return
      items.push({ index: i, chart: c })
    })
  }

  const statCards: { index: number; label: string; value: string; text: string }[] = []
  const evidence: StorySlide[] = []

  for (const it of items) {
    const { sel, chart } = it
    if (sel?.type === 'table' && sel.table) {
      const t = sel.table
      evidence.push({
        id: `table-${it.index}`,
        kind: 'table',
        fields: {
          tag: 'DETAIL',
          title: clean(t.title),
          subtitle: clean(t.description),
          statLabel: 'WHAT TO NOTICE',
          sentence:
            clean(sel.takeaway) && !sameText(sel.takeaway, t.description)
              ? clean(sel.takeaway)
              : '',
          source: sourceLine(project),
        },
        spec: [
          { key: 'tag', label: 'Tag' },
          { key: 'title', label: 'Title' },
          { key: 'subtitle', label: 'Subtitle', long: true },
          { key: 'sentence', label: 'Takeaway', long: true },
          { key: 'source', label: 'Source line' },
        ],
        table: {
          headers: (t.headers || []).map(clean),
          rows: (t.rows || []).map((r: any[]) => r.map((c) => clean(c?.display ?? c))),
          footnote: clean(t.footnote),
        },
      })
      continue
    }

    const merged: any = {
      ...(chart || {}),
      data:
        sel?.isIndexed && sel?.chartData?.length > 0
          ? sel.chartData
          : chart?.data?.length > 0
            ? chart.data
            : sel?.chartData || [],
      type: chart?.type || (sel?.chartType === 'grouped_bar' ? 'bar' : sel?.chartType) || 'bar',
    }
    const title = clean(chart?.title || sel?.finding?.label)
    const heroStat = clean(sel?.heroStat || chart?.hero_stat || sel?.finding?.value)
    const takeaway = clean(sel?.takeaway || chart?.takeaway)
    const description = clean(chart?.description || sel?.finding?.interpretation)
    const picked = pickChartKind(merged)
    const chosen = sel?.storyKind as ChartKind | undefined
    const kind: ChartKind | 'stat' =
      sel?.chartType === 'hero_stat_only'
        ? 'stat'
        : picked !== 'stat' && chosen && compatibleKinds(merged.data).includes(chosen)
          ? chosen
          : picked

    if (kind === 'stat') {
      statCards.push({
        index: it.index,
        label: title.toUpperCase(),
        value: heroStat,
        text: takeaway || description,
      })
      continue
    }

    const data = merged.data.filter(Boolean)
    const { keys, data: shown } = shapeChart(kind, data)
    // The label above the big number. Never the slide title again, so it is
    // only set when the generator or the finding supplies a distinct one.
    const statLabel =
      clean(chart?.stat_label) ||
      clean(sel?.finding?.label && !sameText(sel.finding.label, title) ? sel.finding.label : '')
        .toUpperCase()
        .slice(0, 36)
    evidence.push({
      id: `chart-${it.index}`,
      kind: 'chart',
      fields: {
        tag: KIND_TAG[kind],
        title,
        subtitle: description && !sameText(description, title) ? description : '',
        statLabel,
        stat: heroStat,
        sentence: takeaway && !sameText(takeaway, title) ? takeaway : '',
        takeaway: clean(chart?.implication),
        source: sourceLine(project, sel?.finding?.sampleSize),
      },
      spec: [
        { key: 'tag', label: 'Tag' },
        { key: 'title', label: 'Title', long: true },
        { key: 'subtitle', label: 'Chart subtitle', long: true },
        { key: 'statLabel', label: 'Stat label' },
        { key: 'stat', label: 'Big number' },
        { key: 'sentence', label: 'Explanation', long: true },
        { key: 'takeaway', label: 'Next step or implication', long: true },
        { key: 'source', label: 'Source line' },
      ],
      chart: {
        kind,
        keys,
        data: shown,
        raw: data,
        annotations: Array.isArray(chart?.annotations) ? chart.annotations : undefined,
        reference:
          chart?.reference_line && typeof chart.reference_line.value === 'number'
            ? { label: clean(chart.reference_line.label), value: chart.reference_line.value }
            : undefined,
      },
    })
  }

  // ── title
  const slides: StorySlide[] = []
  const deckTitle = clean(project.pitch_title) || clean(project.name) || 'Your story'
  slides.push({
    id: 'title',
    kind: 'title',
    fields: {
      tag: 'PERFORMANCE STORY',
      title: deckTitle,
      subtitle: project.target_company ? `Prepared for ${clean(project.target_company)}` : '',
      date: monthYear(),
    },
    spec: [
      { key: 'tag', label: 'Tag' },
      { key: 'title', label: 'Title', long: true },
      { key: 'subtitle', label: 'Subtitle' },
      { key: 'date', label: 'Date line' },
    ],
  })

  // ── summary
  const exec = clean(handoff?.confirmedAnalysis?.executiveSummary) || clean(project.narrative)
  if (exec && edits?.summary) {
    const sentences = exec
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3)
    const lead = items.find((i) => i.sel?.heroStat || i.chart?.hero_stat)
    const leadStat = clean(lead?.sel?.heroStat || lead?.chart?.hero_stat)
    const leadLabel = clean(
      lead?.chart?.stat_label ||
        (lead?.sel?.finding?.label && !sameText(lead.sel.finding.label, lead?.chart?.title || '')
          ? lead.sel.finding.label
          : '')
    )
      .toUpperCase()
      .slice(0, 36)
    const leadSentence = clean(lead?.sel?.takeaway || lead?.chart?.takeaway)
    slides.push({
      id: 'summary',
      kind: 'summary',
      count: sentences.length,
      fields: {
        tag: 'SUMMARY',
        title: 'The short version',
        ...Object.fromEntries(sentences.map((s, i) => [`point${i}`, s])),
        statLabel: leadLabel,
        stat: leadStat,
        sentence: leadSentence,
        source: sourceLine(project),
      },
      spec: [
        { key: 'tag', label: 'Tag' },
        { key: 'title', label: 'Title' },
        ...sentences.map((_, i) => ({ key: `point${i}`, label: `Point ${i + 1}`, long: true })),
        { key: 'statLabel', label: 'Stat label' },
        { key: 'stat', label: 'Big number' },
        { key: 'sentence', label: 'Stat explanation', long: true },
        { key: 'source', label: 'Source line' },
      ],
    })
  }

  // ── hero stats, three to a slide
  for (let i = 0; i < statCards.length; i += 3) {
    const group = statCards.slice(i, i + 3)
    const fields: Record<string, string> = {
      tag: 'AT A GLANCE',
      title:
        group.length === 1
          ? group[0].label.charAt(0) + group[0].label.slice(1).toLowerCase()
          : 'The numbers that matter',
      source: sourceLine(project),
    }
    const spec: FieldSpec[] = [
      { key: 'tag', label: 'Tag' },
      { key: 'title', label: 'Title', long: true },
    ]
    group.forEach((g, j) => {
      fields[`card${j}.label`] = g.label
      fields[`card${j}.value`] = g.value
      fields[`card${j}.text`] = g.text
      spec.push(
        { key: `card${j}.label`, label: `Card ${j + 1} label` },
        { key: `card${j}.value`, label: `Card ${j + 1} number` },
        { key: `card${j}.text`, label: `Card ${j + 1} text`, long: true }
      )
    })
    spec.push({ key: 'source', label: 'Source line' })
    slides.push({ id: `stats-${group[0].index}`, kind: 'stats', count: group.length, fields, spec })
  }

  slides.push(...evidence)

  // ── next steps, three to a slide
  const recs: any[] = (project.recommendations || []).filter((r: any) => r && r.title)
  for (let i = 0; i < recs.length; i += 3) {
    const group = recs.slice(i, i + 3)
    const fields: Record<string, string> = {
      tag: 'NEXT STEPS',
      title: i === 0 ? 'Where to go from here' : 'More to consider',
      source: 'Suggestions drawn from the findings in this story',
    }
    const spec: FieldSpec[] = [
      { key: 'tag', label: 'Tag' },
      { key: 'title', label: 'Title' },
    ]
    group.forEach((r, j) => {
      const evidenceText = [clean(r.stat), clean(r.stat_label)].filter(Boolean).join(' ')
      fields[`rec${j}.title`] = clean(r.title)
      fields[`rec${j}.text`] = clean(r.description)
      fields[`rec${j}.evidence`] = evidenceText
      spec.push(
        { key: `rec${j}.title`, label: `Step ${j + 1} title` },
        { key: `rec${j}.text`, label: `Step ${j + 1} text`, long: true },
        { key: `rec${j}.evidence`, label: `Step ${j + 1} evidence` }
      )
    })
    spec.push({ key: 'source', label: 'Source line' })
    slides.push({ id: `recs-${i / 3}`, kind: 'recs', count: group.length, fields, spec })
  }

  return applyEdits(slides, edits)
}

export function applyEdits(slides: StorySlide[], edits?: StoryEdits): StorySlide[] {
  if (!edits) return slides
  let out = slides.map((s) => {
    const o = edits.fields?.[s.id]
    let next = s
    const k = edits.kinds?.[s.id]
    if (
      k &&
      s.chart &&
      s.chart.raw &&
      k !== s.chart.kind &&
      compatibleKinds(s.chart.raw).includes(k)
    ) {
      const shaped = shapeChart(k, s.chart.raw)
      const tagWasDefault = s.fields.tag === KIND_TAG[s.chart.kind]
      next = {
        ...s,
        fields: tagWasDefault ? { ...s.fields, tag: KIND_TAG[k] } : s.fields,
        chart: { ...s.chart, kind: k, keys: shaped.keys, data: shaped.data },
      }
    }
    return o ? { ...next, fields: { ...next.fields, ...o } } : next
  })
  if (edits.order && edits.order.length > 0) {
    const pos = new Map(edits.order.map((id, i) => [id, i]))
    const known = out.filter((s) => pos.has(s.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!)
    const fresh = out.filter((s) => !pos.has(s.id))
    // New slides (not yet in the saved order) go before next steps.
    const recsAt = known.findIndex((s) => s.kind === 'recs')
    out =
      recsAt === -1
        ? [...known, ...fresh]
        : [...known.slice(0, recsAt), ...fresh, ...known.slice(recsAt)]
  }
  return out
}

// ── copy and data out ───────────────────────────────────────────────────────

const csvCell = (v: any) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvRows = (rows: any[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

// The numbers behind a slide, as CSV. Null when a slide has no data of its own.
export function slideToCsv(slide: StorySlide): string | null {
  if (slide.chart) {
    const { data, keys, kind } = slide.chart
    if (kind === 'scatter') {
      const [kx, ky] = keys
      return csvRows([
        ['name', kx, ky],
        ...data.map((d) => [d.name ?? d.label ?? '', d[kx], d[ky]]),
      ])
    }
    return csvRows([
      ['name', ...keys],
      ...data.map((d) => [d.name ?? d.label ?? '', ...keys.map((k) => d[k])]),
    ])
  }
  if (slide.table) return csvRows([slide.table.headers, ...slide.table.rows])
  if (slide.kind === 'stats') {
    const rows: string[][] = [['metric', 'value', 'note']]
    for (let i = 0; i < (slide.count || 0); i++)
      rows.push([
        slide.fields[`card${i}.label`],
        slide.fields[`card${i}.value`],
        slide.fields[`card${i}.text`],
      ])
    return csvRows(rows)
  }
  return null
}

// The words on a slide, as plain text for pasting into another deck.
export function slideToText(slide: StorySlide): string {
  const f = slide.fields
  const lines: string[] = []
  const push = (s?: string) => s && s.trim() && lines.push(s.trim())
  if (slide.kind === 'stats') {
    push(f.title)
    for (let i = 0; i < (slide.count || 0); i++)
      push(`${f[`card${i}.value`]}  ${f[`card${i}.label`]}\n${f[`card${i}.text`]}`)
  } else if (slide.kind === 'recs') {
    push(f.title)
    for (let i = 0; i < (slide.count || 0); i++)
      push(
        `${i + 1}. ${f[`rec${i}.title`]}\n${f[`rec${i}.text`]}${f[`rec${i}.evidence`] ? `\n${f[`rec${i}.evidence`]}` : ''}`
      )
  } else if (slide.kind === 'summary') {
    push(f.title)
    for (let i = 0; i < (slide.count || 0); i++) push(f[`point${i}`])
    push(f.stat && `${f.stat}  ${f.statLabel}`)
  } else {
    push(f.title)
    push(f.subtitle)
    push(f.stat && `${f.stat}  ${f.statLabel || ''}`)
    push(f.sentence)
    push(f.takeaway)
  }
  push(f.source)
  return lines.join('\n\n')
}
