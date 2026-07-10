import Papa from 'papaparse'
import * as XLSX from 'xlsx'

type ColumnRole = 'date' | 'metric' | 'dimension' | 'unknown'

interface ColumnProfile {
  name: string
  role: ColumnRole
}

interface MetricSummary {
  total: number
  average: number
  monthly: { period: string; value: number }[]
  changeFirstToLastPct: number | null
  trend: 'up' | 'down' | 'neutral'
}

export interface CategoryMetricStat {
  mode: 'rate' | 'index'
  average: number
  index: number | null
  raw: {
    sum: number
    rowCount: number
    metricGrandTotal: number
    totalRowCount: number
  }
}

export interface DimensionSummary {
  top: { name: string; value: number; sharePct: number }[]
  metricsByCategory: Record<string, Record<string, CategoryMetricStat>>
}

export interface IndustrySegment {
  industry: string
  rowCount: number
  metrics: Record<string, MetricSummary>
  dimensions: Record<string, DimensionSummary>
}

export interface ScatterPairSummary {
  xMetric: string
  yMetric: string
  points: { x: number; y: number }[]
  correlation: number | null
}

// A single metric value for one group in a group comparison — e.g. the
// average "conversion_rate" for the "Email" channel group.
export interface GroupMetricStat {
  raw: number
  formatted: string
}

// One group within a comparison — e.g. "Email" within a "channel" comparison.
export interface GroupStat {
  groupName: string
  rowCount: number
  shareOfTotal: number
  metrics: Record<string, GroupMetricStat>
}

// A full comparison across the groups of one dimension column — e.g.
// comparing all "channel" values (Email, Paid Search, Social) against
// each other on every metric column. Computed from ALL rows, not a sample,
// so /api/analyze can pass these to Claude as verified ground truth.
export interface GroupComparison {
  dimensionName: string
  totalRows: number
  hasStrongDivergence: boolean
  groups: GroupStat[]
}

export interface DataSummary {
  rowCount: number
  dateRange: { start: string; end: string } | null
  columns: ColumnProfile[]
  metrics: Record<string, MetricSummary>
  dimensions: Record<string, DimensionSummary>
  industrySegments: IndustrySegment[] | null
  scatterPairs: ScatterPairSummary[] | null
  // Pre-computed group comparisons from ALL rows — verified server-side.
  // Claude uses these directly instead of computing from the sample.
  groupComparisons: GroupComparison[]
  warnings: string[]
}

// Returned by buildDataSummaryWithRows — the summary plus the evenly-sampled
// raw rows needed by /api/analyze. Kept separate from DataSummary itself so
// the summary shape stays serialization-friendly (no giant row arrays) and
// callers that only need the summary can keep using buildDataSummary.
export interface DataSummaryWithRows {
  summary: DataSummary
  sampledRows: Record<string, any>[]
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

interface ParsedDate {
  date: Date
  hasExplicitYear: boolean
}

const PLACEHOLDER_YEAR = 2000

function normalizeYear(raw: string): number {
  let year = parseInt(raw, 10)
  if (raw.length <= 2) year += year < 50 ? 2000 : 1900
  return year
}

function tryParseFlexibleDate(value: any): ParsedDate | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : { date: value, hasExplicitYear: true }
  }
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  let m = raw.match(/^([a-zA-Z]{3,9})[\s\-/.,]+(\d{2,4})$/)
  if (m && MONTH_MAP[m[1].toLowerCase()] !== undefined) {
    return {
      date: new Date(normalizeYear(m[2]), MONTH_MAP[m[1].toLowerCase()], 1),
      hasExplicitYear: true,
    }
  }
  m = raw.match(/^(\d{4})[-/.](\d{1,2})$/)
  if (m && +m[2] >= 1 && +m[2] <= 12) {
    return { date: new Date(+m[1], +m[2] - 1, 1), hasExplicitYear: true }
  }
  m = raw.match(/^(\d{1,2})[-/.](\d{4})$/)
  if (m && +m[1] >= 1 && +m[1] <= 12) {
    return { date: new Date(+m[2], +m[1] - 1, 1), hasExplicitYear: true }
  }
  m = raw.match(/^q([1-4])[\s\-.]?(\d{2,4})$/i)
  if (m) {
    return { date: new Date(normalizeYear(m[2]), (+m[1] - 1) * 3, 1), hasExplicitYear: true }
  }
  const bareMonth = MONTH_MAP[raw.toLowerCase()]
  if (bareMonth !== undefined) {
    return { date: new Date(PLACEHOLDER_YEAR, bareMonth, 1), hasExplicitYear: false }
  }
  const looksDateStructured = /[a-zA-Z]/.test(raw) || /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(raw)
  if (!looksDateStructured) return null
  const native = new Date(raw)
  return isNaN(native.getTime()) ? null : { date: native, hasExplicitYear: true }
}

function looksLikeDate(value: any): boolean {
  return tryParseFlexibleDate(value) !== null
}

const INDUSTRIES = [
  'Retail',
  'Healthcare',
  'Technology',
  'Finance',
  'Marketing',
  'Education',
  'Manufacturing',
  'Hospitality',
  'Real Estate',
  'Media',
  'Energy',
  'Nonprofit',
  'Logistics',
  'Other',
] as const

const INDUSTRY_SYNONYMS: Record<string, string> = {
  tech: 'Technology',
  saas: 'Technology',
  software: 'Technology',
  it: 'Technology',
  fintech: 'Finance',
  banking: 'Finance',
  insurance: 'Finance',
  ecommerce: 'Retail',
  'e-commerce': 'Retail',
  shopping: 'Retail',
  cpg: 'Retail',
  health: 'Healthcare',
  medical: 'Healthcare',
  pharma: 'Healthcare',
  wellness: 'Healthcare',
  edu: 'Education',
  school: 'Education',
  university: 'Education',
  mfg: 'Manufacturing',
  industrial: 'Manufacturing',
  hotel: 'Hospitality',
  travel: 'Hospitality',
  restaurant: 'Hospitality',
  food: 'Hospitality',
  realty: 'Real Estate',
  property: 'Real Estate',
  construction: 'Real Estate',
  advertising: 'Marketing',
  agency: 'Marketing',
  ngo: 'Nonprofit',
  charity: 'Nonprofit',
  'non-profit': 'Nonprofit',
  nonprofit: 'Nonprofit',
  shipping: 'Logistics',
  freight: 'Logistics',
  supply: 'Logistics',
  transportation: 'Logistics',
  utilities: 'Energy',
  power: 'Energy',
  oil: 'Energy',
  gas: 'Energy',
  entertainment: 'Media',
  publishing: 'Media',
  broadcast: 'Media',
  gaming: 'Media',
}

function normalizeIndustry(raw: string): string | null {
  const t = raw.trim().toLowerCase()
  if (!t) return null
  const exact = INDUSTRIES.find((i) => i.toLowerCase() === t)
  if (exact) return exact
  if (INDUSTRY_SYNONYMS[t]) return INDUSTRY_SYNONYMS[t]
  for (const [syn, canon] of Object.entries(INDUSTRY_SYNONYMS)) {
    if (t.includes(syn)) return canon
  }
  for (const ind of INDUSTRIES) {
    if (t.includes(ind.toLowerCase())) return ind
  }
  return null
}

function detectIndustryColumn(
  rows: Record<string, any>[],
  dimensionCols: string[]
): { column: string; valueMap: Record<string, string> } | null {
  let best: { column: string; valueMap: Record<string, string>; score: number } | null = null
  for (const col of dimensionCols) {
    const values = Array.from(
      new Set(rows.map((r) => r[col]).filter((v) => typeof v === 'string' && v.trim()))
    ) as string[]
    if (values.length === 0) continue
    const valueMap: Record<string, string> = {}
    let matched = 0
    for (const v of values) {
      const norm = normalizeIndustry(v)
      if (norm) {
        valueMap[v] = norm
        matched++
      }
    }
    const score = matched / values.length
    if (score > 0.6 && (!best || score > best.score)) best = { column: col, valueMap, score }
  }
  return best ? { column: best.column, valueMap: best.valueMap } : null
}

const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
}

const TRADITIONAL_STATE_ABBREVIATIONS: Record<string, string> = {
  ala: 'Alabama',
  ariz: 'Arizona',
  ark: 'Arkansas',
  calif: 'California',
  colo: 'Colorado',
  conn: 'Connecticut',
  del: 'Delaware',
  fla: 'Florida',
  ga: 'Georgia',
  ill: 'Illinois',
  ind: 'Indiana',
  kan: 'Kansas',
  kans: 'Kansas',
  ky: 'Kentucky',
  la: 'Louisiana',
  mass: 'Massachusetts',
  mich: 'Michigan',
  minn: 'Minnesota',
  miss: 'Mississippi',
  mo: 'Missouri',
  mont: 'Montana',
  neb: 'Nebraska',
  nebr: 'Nebraska',
  nev: 'Nevada',
  okla: 'Oklahoma',
  ore: 'Oregon',
  oreg: 'Oregon',
  penn: 'Pennsylvania',
  pa: 'Pennsylvania',
  tenn: 'Tennessee',
  tex: 'Texas',
  vt: 'Vermont',
  va: 'Virginia',
  wash: 'Washington',
  wis: 'Wisconsin',
  wisc: 'Wisconsin',
  wyo: 'Wyoming',
}

function normalizeStateValue(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const upper = t.toUpperCase()
  if (US_STATES[upper]) return US_STATES[upper]
  const lowerFull = t.toLowerCase()
  for (const name of Object.values(US_STATES)) {
    if (name.toLowerCase() === lowerFull) return name
  }
  const stripped = lowerFull.replace(/\.$/, '')
  if (TRADITIONAL_STATE_ABBREVIATIONS[stripped]) return TRADITIONAL_STATE_ABBREVIATIONS[stripped]
  return null
}

function detectStateColumn(
  rows: Record<string, any>[],
  dimensionCols: string[]
): { column: string; valueMap: Record<string, string> } | null {
  let best: { column: string; valueMap: Record<string, string>; score: number } | null = null
  for (const col of dimensionCols) {
    if (/country|nation/i.test(col)) continue
    const values = Array.from(
      new Set(rows.map((r) => r[col]).filter((v) => typeof v === 'string' && v.trim()))
    ) as string[]
    if (values.length === 0) continue
    const valueMap: Record<string, string> = {}
    let matched = 0
    for (const v of values) {
      const norm = normalizeStateValue(v)
      if (norm) {
        valueMap[v] = norm
        matched++
      }
    }
    const score = matched / values.length
    if (score > 0.6 && (!best || score > best.score)) best = { column: col, valueMap, score }
  }
  return best ? { column: best.column, valueMap: best.valueMap } : null
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

function isRateLikeMetric(rawName: string): boolean {
  const normalized = rawName
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '')
  if (RATE_LIKE_ABBREVIATIONS.has(normalized)) return true
  return /rate|ratio|margin|percent|roas|churn|retention|engagement/i.test(rawName)
}

export function isCampaignLikeColumn(rows: Record<string, any>[], columnName: string): boolean {
  if (/campaign|ad[\s_-]?(name|set)/i.test(columnName)) return true
  const values = rows
    .map((r) => r[columnName])
    .filter((v) => v !== null && v !== undefined && v !== '')
  if (values.length < 5) return false
  const uniqueValues = new Set(values.map((v) => String(v).toLowerCase().trim()))
  return uniqueValues.size / values.length > 0.4
}

function coerceNumeric(s: string): number | null {
  let cleaned = s.trim()
  let negative = false
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true
    cleaned = cleaned.slice(1, -1).trim()
  }
  cleaned = cleaned
    .replace(/^[$€£¥₹₩]\s*/, '')
    .replace(/,/g, '')
    .replace(/%$/, '')
    .trim()
  if (cleaned.startsWith('-')) {
    negative = true
    cleaned = cleaned.slice(1).trim()
  }
  const suffixMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmbt])$/i)
  if (suffixMatch) {
    const base = parseFloat(suffixMatch[1])
    const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[
      suffixMatch[2].toLowerCase() as 'k' | 'm' | 'b' | 't'
    ]
    return negative ? -(base * mult) : base * mult
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const value = parseFloat(cleaned)
  return negative ? -value : value
}

function coerceValue(raw: any): any {
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (tryParseFlexibleDate(trimmed)) return trimmed
  const numeric = coerceNumeric(trimmed)
  if (numeric !== null) return numeric
  return trimmed
}

function stripLeadingBlankLines(text: string): string {
  const lines = text.split(/\r\n|\n|\r/)
  let start = 0
  while (start < lines.length) {
    const line = lines[start]
    if (line.trim() === '' || /^[,;\t|\s]*$/.test(line)) {
      start++
      continue
    }
    break
  }
  return lines.slice(start).join('\n')
}

async function parseFile(file: File): Promise<Record<string, any>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  let rows: Record<string, any>[]
  if (ext === 'csv') {
    const text = await file.text()
    const cleanedText = stripLeadingBlankLines(text)
    const { data } = Papa.parse<Record<string, any>>(cleanedText, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', ';', '|'],
      transformHeader: (h) => h.trim(),
    })
    rows = data
  } else {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const arrayRows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: null })
    const headerRowIndex = arrayRows.findIndex((r) =>
      r.some((cell) => cell !== null && String(cell).trim() !== '')
    )
    rows = []
    if (headerRowIndex !== -1) {
      const headers = arrayRows[headerRowIndex].map((h) => (h === null ? '' : String(h).trim()))
      rows = arrayRows.slice(headerRowIndex + 1).map((row) => {
        const obj: Record<string, any> = {}
        headers.forEach((h, i) => {
          if (h) obj[h] = row[i] === undefined ? null : row[i]
        })
        return obj
      })
    }
  }
  return rows.map((row) => {
    const coerced: Record<string, any> = {}
    for (const key in row) coerced[key] = coerceValue(row[key])
    return coerced
  })
}

function profileColumns(rows: Record<string, any>[]): ColumnProfile[] {
  if (rows.length === 0) return []
  const columns = Object.keys(rows[0])
  const sample = rows.slice(0, Math.min(50, rows.length))
  return columns.map((name) => {
    const values = sample
      .map((r) => r[name])
      .filter((v) => v !== null && v !== undefined && v !== '')
    if (values.length === 0) return { name, role: 'unknown' as ColumnRole }
    const dateHits = values.filter(looksLikeDate).length
    const numericHits = values.filter((v) => typeof v === 'number').length
    const nameHintsDate = /date|month|period|week|quarter|year|time/i.test(name)
    const dateThreshold = nameHintsDate ? 0.5 : 0.7
    if (dateHits / values.length > dateThreshold) return { name, role: 'date' as ColumnRole }
    if (numericHits / values.length > 0.7) return { name, role: 'metric' as ColumnRole }
    const uniqueValues = new Set(values.map((v) => String(v).toLowerCase().trim()))
    const cardinality = uniqueValues.size / values.length
    if (cardinality < 0.5) return { name, role: 'dimension' as ColumnRole }
    return { name, role: 'unknown' as ColumnRole }
  })
}

function formatPeriod(date: Date, hasExplicitYear: boolean): string {
  if (!hasExplicitYear) return date.toLocaleString('en-US', { month: 'short' })
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function summarizeMetric(
  rows: Record<string, any>[],
  dateCol: string | null,
  metricCol: string
): MetricSummary {
  const values = rows.map((r) => r[metricCol]).filter((v) => typeof v === 'number')
  const total = values.reduce((a, b) => a + b, 0)
  const average = values.length ? total / values.length : 0
  let monthly: { period: string; value: number }[] = []
  if (dateCol) {
    const byMonth = new Map<string, number>()
    let anyExplicitYear = false
    for (const row of rows) {
      const parsed = tryParseFlexibleDate(row[dateCol])
      const v = row[metricCol]
      if (!parsed || typeof v !== 'number') continue
      if (parsed.hasExplicitYear) anyExplicitYear = true
      const key = `${parsed.date.getFullYear()}-${String(parsed.date.getMonth() + 1).padStart(2, '0')}`
      byMonth.set(key, (byMonth.get(key) || 0) + v)
    }
    monthly = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => {
        const [y, mo] = key.split('-').map(Number)
        return { period: formatPeriod(new Date(y, mo - 1, 1), anyExplicitYear), value }
      })
  }
  let changeFirstToLastPct: number | null = null
  if (monthly.length >= 2) {
    const first = monthly[0].value
    const last = monthly[monthly.length - 1].value
    if (first !== 0) changeFirstToLastPct = ((last - first) / Math.abs(first)) * 100
  }
  const trend: MetricSummary['trend'] =
    changeFirstToLastPct === null
      ? 'neutral'
      : changeFirstToLastPct > 2
        ? 'up'
        : changeFirstToLastPct < -2
          ? 'down'
          : 'neutral'
  return { total, average, monthly, changeFirstToLastPct, trend }
}

function computeMetricTotals(
  rows: Record<string, any>[],
  metricCols: string[]
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const m of metricCols) {
    totals[m] = rows.reduce((sum, r) => (typeof r[m] === 'number' ? sum + r[m] : sum), 0)
  }
  return totals
}

function summarizeDimension(
  rows: Record<string, any>[],
  totalRowCountInScope: number,
  dimCol: string,
  metricCols: string[],
  metricTotals: Record<string, number>
): DimensionSummary {
  const byCategory = new Map<
    string,
    {
      rowCount: number
      displayName: string
      metricSums: Record<string, { sum: number; count: number }>
    }
  >()
  for (const row of rows) {
    const raw = String(row[dimCol] ?? 'Unknown')
    const key = raw.toLowerCase().trim()
    let entry = byCategory.get(key)
    if (!entry) {
      entry = { rowCount: 0, displayName: raw, metricSums: {} }
      byCategory.set(key, entry)
    }
    entry.rowCount += 1
    for (const m of metricCols) {
      const v = row[m]
      if (typeof v === 'number') {
        if (!entry.metricSums[m]) entry.metricSums[m] = { sum: 0, count: 0 }
        entry.metricSums[m].sum += v
        entry.metricSums[m].count += 1
      }
    }
  }
  const totalRows = Array.from(byCategory.values()).reduce((a, b) => a + b.rowCount, 0)
  const top = Array.from(byCategory.values())
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 6)
    .map((c) => ({
      name: c.displayName,
      value: c.rowCount,
      sharePct: totalRows ? (c.rowCount / totalRows) * 100 : 0,
    }))
  const metricsByCategory: Record<string, Record<string, CategoryMetricStat>> = {}
  for (const entry of byCategory.values()) {
    const stats: Record<string, CategoryMetricStat> = {}
    for (const [m, s] of Object.entries(entry.metricSums)) {
      if (s.count === 0) continue
      const average = Math.round((s.sum / s.count) * 100) / 100
      const grandTotal = metricTotals[m] || 0
      const raw = {
        sum: s.sum,
        rowCount: entry.rowCount,
        metricGrandTotal: grandTotal,
        totalRowCount: totalRowCountInScope,
      }
      if (isRateLikeMetric(m)) {
        stats[m] = { mode: 'rate', average, index: null, raw }
        continue
      }
      const shareOfMetric = grandTotal ? s.sum / grandTotal : 0
      const shareOfRows = totalRowCountInScope ? entry.rowCount / totalRowCountInScope : 0
      const index = shareOfRows > 0 ? Math.round((shareOfMetric / shareOfRows) * 100) : null
      stats[m] = { mode: 'index', average, index, raw }
    }
    metricsByCategory[entry.displayName] = stats
  }
  return { top, metricsByCategory }
}

// ── Group comparisons ───────────────────────────────────────────────────────
// Builds a per-dimension comparison table across ALL rows (not sampled),
// so /api/analyze can hand Claude verified numbers instead of asking it to
// compute segment differences from a 200-row sample. Each comparison groups
// one dimension column's values and computes every metric column's average
// per group, plus a display-formatted string for each.

function formatGroupMetricValue(value: number, metricName: string): string {
  if (isRateLikeMetric(metricName)) {
    return `${value.toFixed(2)}%`
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  return value.toFixed(2)
}

function computeGroupComparisons(
  rows: Record<string, any>[],
  dimensionCols: string[],
  metricCols: string[]
): GroupComparison[] {
  if (metricCols.length === 0 || rows.length === 0) return []

  const totalRows = rows.length
  const comparisons: GroupComparison[] = []

  for (const dimCol of dimensionCols) {
    const byGroup = new Map<
      string,
      {
        displayName: string
        rowCount: number
        metricSums: Record<string, { sum: number; count: number }>
      }
    >()

    for (const row of rows) {
      const raw = String(row[dimCol] ?? 'Unknown')
      const key = raw.toLowerCase().trim()
      let entry = byGroup.get(key)
      if (!entry) {
        entry = { displayName: raw, rowCount: 0, metricSums: {} }
        byGroup.set(key, entry)
      }
      entry.rowCount += 1
      for (const m of metricCols) {
        const v = row[m]
        if (typeof v === 'number') {
          if (!entry.metricSums[m]) entry.metricSums[m] = { sum: 0, count: 0 }
          entry.metricSums[m].sum += v
          entry.metricSums[m].count += 1
        }
      }
    }

    // A comparison only makes sense with at least 2 groups, and stops being
    // readable as a table beyond a dozen or so — skip outside that range.
    if (byGroup.size < 2 || byGroup.size > 12) continue

    const groups: GroupStat[] = Array.from(byGroup.values())
      .sort((a, b) => b.rowCount - a.rowCount)
      .map((entry) => {
        const metrics: Record<string, GroupMetricStat> = {}
        for (const [m, s] of Object.entries(entry.metricSums)) {
          if (s.count === 0) continue
          const average = s.sum / s.count
          metrics[m] = { raw: average, formatted: formatGroupMetricValue(average, m) }
        }
        return {
          groupName: entry.displayName,
          rowCount: entry.rowCount,
          shareOfTotal: totalRows ? Math.round((entry.rowCount / totalRows) * 1000) / 10 : 0,
          metrics,
        }
      })

    // Flags this comparison as worth highlighting when the widest gap
    // between any two groups' averages on the primary metric exceeds
    // half the larger value — a rough signal for "this dimension matters."
    let hasStrongDivergence = false
    const primaryMetric = metricCols[0]
    const primaryValues = groups
      .map((g) => g.metrics[primaryMetric]?.raw)
      .filter((v): v is number => typeof v === 'number')
    if (primaryValues.length >= 2) {
      const max = Math.max(...primaryValues)
      const min = Math.min(...primaryValues)
      if (max !== 0 && (max - min) / Math.abs(max) > 0.5) hasStrongDivergence = true
    }

    comparisons.push({
      dimensionName: dimCol,
      totalRows,
      hasStrongDivergence,
      groups,
    })
  }

  // Cap at 4 comparisons for the prompt — prioritize the ones flagged as
  // strongly divergent, since those are the most likely to matter to the user.
  return comparisons
    .sort((a, b) => Number(b.hasStrongDivergence) - Number(a.hasStrongDivergence))
    .slice(0, 4)
}

function pearsonCorrelation(points: { x: number; y: number }[]): number | null {
  const n = points.length
  if (n < 2) return null
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0,
    denX = 0,
    denY = 0
  for (const p of points) {
    const dx = p.x - meanX
    const dy = p.y - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (denX === 0 || denY === 0) return null
  return Math.round((num / Math.sqrt(denX * denY)) * 100) / 100
}

function evenlySample<T>(arr: T[], maxCount: number): T[] {
  if (arr.length <= maxCount) return arr
  const step = arr.length / maxCount
  return Array.from({ length: maxCount }, (_, i) => arr[Math.floor(i * step)])
}

function computeScatterPairs(
  rows: Record<string, any>[],
  metricCols: string[]
): ScatterPairSummary[] {
  const pairs: ScatterPairSummary[] = []
  for (let i = 0; i < metricCols.length; i++) {
    for (let j = i + 1; j < metricCols.length; j++) {
      const xCol = metricCols[i]
      const yCol = metricCols[j]
      const points = rows
        .map((r) => ({ x: r[xCol], y: r[yCol] }))
        .filter(
          (p): p is { x: number; y: number } => typeof p.x === 'number' && typeof p.y === 'number'
        )
      if (points.length < 3) continue
      pairs.push({
        xMetric: xCol,
        yMetric: yCol,
        points: evenlySample(points, 40),
        correlation: pearsonCorrelation(points),
      })
    }
  }
  return pairs
}

// ── Core build function (shared by both exports) ───────────────────────────

async function buildCore(
  file: File
): Promise<{ summary: DataSummary; rows: Record<string, any>[] }> {
  const warnings: string[] = []
  const rows = await parseFile(file)

  if (rows.length === 0) {
    return {
      rows: [],
      summary: {
        rowCount: 0,
        dateRange: null,
        columns: [],
        metrics: {},
        dimensions: {},
        industrySegments: null,
        scatterPairs: null,
        groupComparisons: [],
        warnings: ['File contained no rows.'],
      },
    }
  }

  const columns = profileColumns(rows)
  const dateCol = columns.find((c) => c.role === 'date')?.name || null
  const metricCols = columns.filter((c) => c.role === 'metric').map((c) => c.name)
  const dimensionCols = columns.filter((c) => c.role === 'dimension').map((c) => c.name)

  if (!dateCol) warnings.push('No date column detected — time-series charts will be skipped.')
  if (metricCols.length === 0) warnings.push('No numeric metric columns detected.')

  let dateRange: DataSummary['dateRange'] = null
  if (dateCol) {
    const parsedDates = rows
      .map((r) => tryParseFlexibleDate(r[dateCol]))
      .filter((p): p is ParsedDate => p !== null)
    if (parsedDates.length) {
      const sortedDates = parsedDates.map((p) => p.date).sort((a, b) => a.getTime() - b.getTime())
      const anyExplicitYear = parsedDates.some((p) => p.hasExplicitYear)
      dateRange = anyExplicitYear
        ? {
            start: sortedDates[0].toISOString().slice(0, 10),
            end: sortedDates[sortedDates.length - 1].toISOString().slice(0, 10),
          }
        : {
            start: formatPeriod(sortedDates[0], false),
            end: formatPeriod(sortedDates[sortedDates.length - 1], false),
          }
    }
  }

  const metrics: Record<string, MetricSummary> = {}
  for (const col of metricCols) metrics[col] = summarizeMetric(rows, dateCol, col)

  const dimensions: Record<string, DimensionSummary> = {}
  const stateDetection = detectStateColumn(rows, dimensionCols)
  const fileMetricTotals = computeMetricTotals(rows, metricCols)
  for (const col of dimensionCols) {
    const rowsForDim =
      stateDetection && col === stateDetection.column
        ? rows.map((r) => ({ ...r, [col]: stateDetection.valueMap[r[col] as string] ?? r[col] }))
        : rows
    dimensions[col] = summarizeDimension(
      rowsForDim,
      rows.length,
      col,
      metricCols[0] ? [metricCols[0]] : [],
      fileMetricTotals
    )
  }

  let industrySegments: IndustrySegment[] | null = null
  const industryDetection = detectIndustryColumn(rows, dimensionCols)
  if (industryDetection) {
    const { column, valueMap } = industryDetection
    const grouped = new Map<string, Record<string, any>[]>()
    for (const row of rows) {
      const raw = row[column]
      const canon = typeof raw === 'string' ? valueMap[raw] : undefined
      if (!canon) continue
      if (!grouped.has(canon)) grouped.set(canon, [])
      grouped.get(canon)!.push(row)
    }
    if (grouped.size > 0) {
      industrySegments = Array.from(grouped.entries()).map(([industry, segRows]) => {
        const segMetricTotals = computeMetricTotals(segRows, metricCols)
        return {
          industry,
          rowCount: segRows.length,
          metrics: Object.fromEntries(
            metricCols.map((m) => [m, summarizeMetric(segRows, dateCol, m)])
          ),
          dimensions: Object.fromEntries(
            dimensionCols
              .filter((d) => d !== column)
              .map((d) => {
                const segRowsForDim =
                  stateDetection && d === stateDetection.column
                    ? segRows.map((r) => ({
                        ...r,
                        [d]: stateDetection.valueMap[r[d] as string] ?? r[d],
                      }))
                    : segRows
                return [
                  d,
                  summarizeDimension(segRowsForDim, segRows.length, d, metricCols, segMetricTotals),
                ]
              })
          ),
        }
      })
    }
  }

  const summary: DataSummary = {
    rowCount: rows.length,
    dateRange,
    columns,
    metrics,
    dimensions,
    industrySegments,
    scatterPairs: metricCols.length >= 2 ? computeScatterPairs(rows, metricCols) : null,
    groupComparisons: computeGroupComparisons(rows, dimensionCols, metricCols),
    warnings,
  }

  return { summary, rows }
}

// ── Public exports ─────────────────────────────────────────────────────────

// Original export — unchanged signature, safe for all existing callers.
export async function buildDataSummary(file: File): Promise<DataSummary> {
  const { summary } = await buildCore(file)
  return summary
}

// New export — returns the summary PLUS 200 evenly-sampled raw rows.
// Used by the upload flow to store sampled_rows in Supabase alongside
// the summary, so /api/analyze has real row data without re-parsing the file.
export async function buildDataSummaryWithRows(file: File): Promise<DataSummaryWithRows> {
  const { summary, rows } = await buildCore(file)
  return { summary, sampledRows: evenlySample(rows, 200) }
}
