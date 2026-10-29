'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import {
  UploadCloud,
  FileText,
  X,
  Sparkles,
  ChevronRight,
  MessageSquare,
  Target,
  Users,
  ShieldAlert,
  Info,
  CheckCircle,
  Briefcase,
  Microscope,
  Newspaper,
  TrendingUp,
  Lightbulb,
  BarChart2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { scanForPII, type PIIScanResult } from '@/lib/piiScanner'
import {
  applyFieldMapping,
  buildDataSummaryWithRows,
  INDUSTRY_OPTIONS,
  type DataSummary,
} from '@/lib/dataSummary'
import {
  matchColumns,
  needsAiLook,
  normalizeName,
  type ColumnInput,
  type ColumnMatch,
} from '@/lib/canonicalFields'
import ColumnMappingCard from '@/components/ColumnMappingCard'
import PrivacyModal from '@/components/PrivacyModal'
import PIIMeter from '@/components/PIIMeter'
import Link from 'next/link'

const TONES = [
  {
    key: 'executive',
    icon: Briefcase,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    label: 'Executive & Concise',
    description:
      'Punchy, leads with the number, minimal context. Built for time-pressed leadership.',
  },
  {
    key: 'analytical',
    icon: Microscope,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    label: 'Analytical & Detailed',
    description:
      'Methodical, explains the "why" behind each insight. Good for technical or skeptical audiences.',
  },
  {
    key: 'educational',
    icon: Newspaper,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    label: 'Educational & Informative',
    description:
      'Neutral, reports findings like a news brief. No persuasive framing, just clear information.',
  },
]

type DataSourceType = 'client_actual' | 'prospecting_benchmark'

function roleBadgeClass(role: string, dark: boolean): string {
  switch (role) {
    case 'date':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-500'
    case 'metric':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
    case 'dimension':
      return 'border-purple-500/30 bg-purple-500/10 text-purple-500'
    default:
      return dark ? 'border-white/10 text-white/40' : 'border-zinc-200 text-zinc-400'
  }
}

export default function NewProjectPage() {
  const { user } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [file, setFile] = useState<File | null>(null)
  const [piiResult, setPiiResult] = useState<PIIScanResult | null>(null)
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null)
  const [sampledRows, setSampledRows] = useState<Record<string, any>[]>([])
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState('executive')
  const [projectName, setProjectName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedProjectId, setSubmittedProjectId] = useState<string | null>(null)
  const [optIn, setOptIn] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [selectedCompany, setSelectedCompany] = useState<any>(null)
  const [selectedAudience, setSelectedAudience] = useState<any>(null)
  const [companySearch, setCompanySearch] = useState('')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [dataSourceType, setDataSourceType] = useState<DataSourceType | null>(null)
  const [clientDataAck, setClientDataAck] = useState(false)
  // Industry confirmation, shown once the file is parsed. Either the user
  // confirms the industries found in the data, or (nothing recognized, or they
  // say it is wrong) picks one themselves.
  // Column matching: each uploaded column mapped to a canonical field.
  const [mapInputs, setMapInputs] = useState<ColumnInput[]>([])
  const [matches, setMatches] = useState<ColumnMatch[]>([])
  const [mapQuestions, setMapQuestions] = useState<Record<string, string>>({})
  const [mapChecking, setMapChecking] = useState(false)
  const [industryConfirmed, setIndustryConfirmed] = useState(false)
  const [industryManualMode, setIndustryManualMode] = useState(false)
  const [manualIndustry, setManualIndustry] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('company_research')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCompanies(data || []))
  }, [user])

  useEffect(() => {
    if (dataSourceType === 'client_actual' && !clientDataAck) setOptIn(false)
  }, [dataSourceType, clientDataAck])

  useEffect(() => {
    setClientDataAck(false)
  }, [dataSourceType])

  // ── column matching ───────────────────────────────────────────────────────
  const loadRemembered = async (): Promise<Record<string, string>> => {
    if (!user) return {}
    try {
      const { data } = await supabase
        .from('column_mappings')
        .select('column_key, canonical')
        .eq('user_id', user.id)
      return Object.fromEntries((data || []).map((r: any) => [r.column_key, r.canonical]))
    } catch {
      return {}
    }
  }

  const runColumnMatching = async (summary: DataSummary, rows: Record<string, any>[]) => {
    const inputs: ColumnInput[] = summary.columns.map((c) => ({
      name: c.name,
      role: c.role,
      values: rows
        .map((r) => r[c.name])
        .filter((v) => v !== null && v !== undefined && v !== '')
        .slice(0, 50),
    }))
    setMapInputs(inputs)
    const remembered = await loadRemembered()
    const local = matchColumns(inputs, remembered)
    setMatches(local)

    // Ask the AI layer only about columns the local rules could not settle.
    // Only column names and a few numeric values leave the browser.
    const toAsk = local
      .filter((m, i) => m.layer !== 'remembered' && needsAiLook(m, inputs[i]))
      .slice(0, 12)
    if (toAsk.length === 0) return
    setMapChecking(true)
    try {
      const res = await fetch('/api/map-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allColumns: inputs.map((i) => i.name),
          columns: toAsk.map((m) => {
            const input = inputs.find((i) => i.name === m.column)!
            return {
              name: m.column,
              role: input.role,
              values:
                input.role === 'metric'
                  ? input.values.filter((v) => typeof v === 'number').slice(0, 5)
                  : [],
              candidates: m.candidates,
            }
          }),
        }),
      })
      if (!res.ok) return
      const json = await res.json()
      const results: {
        column: string
        field: string | null
        confidence: number
        candidates: string[]
        question: string
      }[] = json.results || []
      if (results.length === 0) return
      const qs: Record<string, string> = {}
      setMatches((prev) =>
        prev.map((m) => {
          const r = results.find((x) => x.column === m.column)
          if (!r || m.layer === 'user') return m
          if (r.field && r.confidence >= 0.85) {
            return {
              ...m,
              field: r.field,
              confidence: r.confidence,
              status: 'review',
              layer: 'ai',
              candidates: r.candidates,
            }
          }
          if (r.field || r.candidates.length > 0) {
            if (r.question) qs[m.column] = r.question
            const merged = Array.from(new Set([...(r.candidates || []), ...m.candidates]))
            return {
              ...m,
              field: null,
              status: 'question',
              layer: 'ai',
              confidence: r.confidence,
              candidates: merged.slice(0, 4),
            }
          }
          return m
        })
      )
      setMapQuestions((prev) => ({ ...prev, ...qs }))
    } catch (e) {
      console.error('map-columns request failed:', e)
    } finally {
      setMapChecking(false)
    }
  }

  const answerColumn = (column: string, field: string) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.column === column
          ? {
              ...m,
              field: field === 'custom' ? null : field,
              status: field === 'custom' ? 'custom' : 'auto',
              layer: 'user',
              confidence: 1,
              candidates: field === 'custom' ? [] : [field],
              note: undefined,
            }
          : m
      )
    )
    // Remember the answer for this account so the same layout never asks twice.
    if (user) {
      Promise.resolve(
        supabase
          .from('column_mappings')
          .upsert(
            {
              user_id: user.id,
              column_key: normalizeName(column),
              canonical: field,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,column_key' }
          )
      ).catch(() => {})
    }
  }

  const fieldMappingFromMatches = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const m of matches) if (m.field) out[m.column] = m.field
    return out
  }

  const processFile = async (f: File) => {
    setFile(f)
    setPiiResult(null)
    setDataSummary(null)
    setSampledRows([])
    setSummaryError(null)
    setIndustryConfirmed(false)
    setIndustryManualMode(false)
    setManualIndustry('')
    setMapInputs([])
    setMatches([])
    setMapQuestions({})

    const text = await f.text()
    const result = scanForPII(text)
    setPiiResult(result)
    if (result.riskLevel === 'high') setOptIn(false)

    setSummarizing(true)
    try {
      // buildDataSummaryWithRows parses once and returns both the summary
      // and 200 evenly-sampled rows — no second parse needed.
      const { summary, sampledRows: rows } = await buildDataSummaryWithRows(f)
      setDataSummary(summary)
      setSampledRows(rows)
      // Matching never blocks the upload: if anything in it fails the file
      // still goes through, just without the calculated metrics.
      runColumnMatching(summary, rows).catch((e) => console.error('Column matching failed:', e))
    } catch (err) {
      console.error(err)
      setSummaryError(
        "Couldn't fully parse this file. You can still continue, but analysis may have less to ground its numbers in."
      )
    } finally {
      setSummarizing(false)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  const needsDataSourceChoice = !!selectedCompany && !dataSourceType

  const detectedIndustries = (dataSummary?.industrySegments || []).map((seg) => seg.industry)
  const industryRecognized = detectedIndustries.length > 0 && !industryManualMode
  const industryResolved = industryRecognized ? industryConfirmed : manualIndustry !== ''
  // The confirmation only gates saving when the user is contributing to the
  // shared pool, since that is the only place industry placement matters.
  const industryBlocksSubmit = !!dataSummary && optIn && !industryResolved

  const resolvedSummary = (): DataSummary | null => {
    if (!dataSummary) return null
    if (industryRecognized && industryConfirmed) {
      return { ...dataSummary, industryConfirmedBy: 'column' }
    }
    if (!industryRecognized && manualIndustry) {
      return {
        ...dataSummary,
        industrySegments: null,
        industryColumn: null,
        confirmedIndustry: manualIndustry,
        industryConfirmedBy: 'user',
      }
    }
    return dataSummary
  }

  const resolvedIndustries = (): string[] => {
    if (industryRecognized && industryConfirmed) return detectedIndustries
    if (!industryRecognized && manualIndustry) return [manualIndustry]
    return []
  }

  const handleSubmit = async () => {
    if (!file || !projectName || !user || needsDataSourceChoice || summarizing) return
    if (industryBlocksSubmit) return
    setLoading(true)
    try {
      const baseSummary = resolvedSummary()
      // Calculated metrics (ROAS, CTR, CPA ...) from the confirmed field mapping.
      const finalSummary =
        baseSummary && matches.length > 0
          ? applyFieldMapping(baseSummary, fieldMappingFromMatches())
          : baseSummary
      const summaryPayload = finalSummary ? JSON.stringify(finalSummary) : null
      const confirmedIndustries = resolvedIndustries()
      const dominantIndustry =
        industryRecognized && industryConfirmed
          ? [...(dataSummary?.industrySegments || [])].sort((a, b) => b.rowCount - a.rowCount)[0]
              ?.industry || null
          : confirmedIndustries[0] || null
      const resolvedDataSourceType = selectedCompany ? dataSourceType : null

      // Insert the project row — analysis will be triggered on the project page
      // once we navigate there, keeping this flow fast.
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          user_id: user.id,
          user_email: user.emailAddresses[0].emailAddress,
          file_name: file.name,
          raw_data: summaryPayload,
          // sampled_rows stored as JSON — used by /api/analyze on the project
          // page so it never has to re-parse the original file.
          sampled_rows: sampledRows.length > 0 ? sampledRows : null,
          prompt,
          tone,
          status: 'processing',
          opt_in_crowd: optIn && piiResult?.riskLevel !== 'high',
          target_company: selectedCompany?.company_name || null,
          // Was `selectedAudience?.role || null` — saved only the role
          // STRING, but analyze/route.ts and generate/route.ts both expect
          // a full object ({role, seniority, cares_about, narrative_style,
          // avoid}). A string in that spot meant every property except
          // .role silently evaluated to undefined downstream — harmless in
          // analyze/route.ts (the tailoring block just contributed nothing),
          // actively broken in generate/route.ts (interpolated "undefined"
          // literally into the prompt sent to Gamma). Now saves the whole
          // selected audience object, matching what target_audience is
          // actually declared as (jsonb, per the migration that went with
          // this fix) and what both consumers already expected.
          target_audience: selectedAudience || null,
          data_source_type: resolvedDataSourceType,
          industry: dominantIndustry,
          industries: confirmedIndustries.length > 0 ? confirmedIndustries : null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      // Fire crowd contribution in the background if opted in —
      // doesn't block navigation.
      if (optIn && piiResult?.riskLevel !== 'high' && summaryPayload) {
        fetch('/api/crowd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: data.id, rawData: summaryPayload }),
        }).catch(console.error)
      }

      setSubmittedProjectId(data.id)
      setSubmitted(true)
      setLoading(false)
    } catch (err: any) {
      console.error(err)
      setLoading(false)
    }
  }

  const filteredCompanies = companies.filter((c) =>
    c.company_name?.toLowerCase().includes(companySearch.toLowerCase())
  )

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/25'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const section = dark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-zinc-50 border-zinc-200'
  const canOptIn = !piiResult || piiResult.riskLevel !== 'high'

  if (submitted && submittedProjectId) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center px-6 ${base}`}>
        <Navbar />
        <div className={`w-full max-w-md p-10 rounded-2xl border text-center ${card}`}>
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-5">
            <Sparkles size={26} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2 tracking-tight">Project saved</h1>
          <p className={`text-sm leading-relaxed mb-8 ${muted}`}>
            <span className="font-medium text-white">{file?.name}</span> is ready. Head to the
            project to start your analysis.
          </p>
          <div className="space-y-2 mb-8">
            {[
              { color: 'text-emerald-400', label: 'Project saved successfully' },
              ...(dataSummary
                ? [
                    {
                      color: 'text-cyan-400',
                      label: `${dataSummary.rowCount.toLocaleString()} rows parsed & ready`,
                    },
                  ]
                : []),
              ...(sampledRows.length > 0
                ? [
                    {
                      color: 'text-blue-400',
                      label: `${sampledRows.length} rows sampled for analysis`,
                    },
                  ]
                : []),
            ].map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-xl text-left ${dark ? 'bg-white/[0.03]' : 'bg-zinc-50'}`}
              >
                <CheckCircle size={15} className={`${item.color} shrink-0`} />
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push(`/projects/${submittedProjectId}`)}
              className="w-full py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors"
            >
              Open Project & Analyze →
            </button>
            <Link
              href="/"
              className={`w-full py-3 rounded-xl border text-sm font-medium transition-colors text-center ${dark ? 'border-white/[0.08] hover:bg-white/[0.04]' : 'border-zinc-200 hover:bg-zinc-50'}`}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}

      <main className="pt-24 px-6 max-w-2xl mx-auto pb-20">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-blue-500/10">
            <Sparkles size={22} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold mb-1 tracking-tight">New Project</h1>
          <p className={`text-sm ${muted}`}>
            Upload your data — analysis and insights come first, slides after.
          </p>
        </div>

        {/* Project Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Project Title</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter a name for your project"
            className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-blue-500/50 transition-colors ${input}`}
          />
        </div>

        {/* File Upload */}
        <div className="mb-2">
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all
              ${dragging ? 'border-blue-500/50 bg-blue-500/5' : dark ? 'border-white/[0.08]' : 'border-zinc-300'}`}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText size={18} className="text-blue-500" />
                <span className="text-sm font-medium">{file.name}</span>
                <button
                  onClick={() => {
                    setFile(null)
                    setPiiResult(null)
                    setDataSummary(null)
                    setSampledRows([])
                    setSummaryError(null)
                    setMapInputs([])
                    setMatches([])
                    setMapQuestions({})
                  }}
                  className={`${muted} hover:text-red-400 transition-colors`}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud size={28} className={`mx-auto mb-3 ${muted}`} />
                <p className="text-sm font-medium mb-1">Drop your file here, or browse</p>
                <p className={`text-xs mb-4 ${muted}`}>Supports CSV, XLSX, and XLS files</p>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors">
                  Browse Files
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={onFileChange}
                    className="hidden"
                  />
                </label>
              </>
            )}
          </div>
        </div>

        {!file && (
          <p className={`text-xs mb-3 ${muted}`}>
            💡 For best results: use plain column headers (e.g. "Date", "Revenue", "Region") and
            keep one consistent format per column.
          </p>
        )}

        {piiResult && (
          <div className="mb-4">
            <PIIMeter result={piiResult} />
          </div>
        )}

        {summarizing && (
          <div className={`mb-4 p-4 rounded-xl border flex items-center gap-3 ${section}`}>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className={`text-sm ${muted}`}>
              Parsing file and sampling rows for analysis...
            </span>
          </div>
        )}

        {summaryError && (
          <div
            className={`mb-4 p-4 rounded-xl border ${dark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50 border-amber-200'}`}
          >
            <div className="flex items-center gap-2 text-xs text-amber-500">
              <ShieldAlert size={12} className="shrink-0" /> {summaryError}
            </div>
          </div>
        )}

        {dataSummary && !summarizing && (
          <div className={`mb-4 p-4 rounded-xl border ${section}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-cyan-500/10">
                <BarChart2 size={13} className="text-cyan-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Ready to analyze</p>
                <p className={`text-xs ${muted}`}>
                  Quick check before you continue — does this look right?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
              <span className="font-medium">{dataSummary.rowCount.toLocaleString()} rows</span>
              {sampledRows.length > 0 && (
                <span className={`${muted}`}>{sampledRows.length} sampled for analysis</span>
              )}
              {dataSummary.dateRange && (
                <span className={muted}>
                  {dataSummary.dateRange.start} → {dataSummary.dateRange.end}
                </span>
              )}
            </div>
            {dataSummary.columns.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dataSummary.columns.map((c) => (
                  <span
                    key={c.name}
                    className={`text-xs px-2 py-1 rounded-full border ${roleBadgeClass(c.role, dark)}`}
                  >
                    {c.name} <span className="opacity-60">· {c.role}</span>
                  </span>
                ))}
              </div>
            )}
            {dataSummary.warnings.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {dataSummary.warnings.map((w, i) => (
                  <div key={i}>
                    <p className="text-xs text-amber-500 flex items-center gap-1.5">
                      <Info size={11} className="shrink-0" /> {w}
                    </p>
                    {w.includes('No date column detected') && (
                      <details className="mt-1 ml-4">
                        <summary
                          className={`text-xs cursor-pointer ${dark ? 'text-white/40 hover:text-white/60' : 'text-zinc-400 hover:text-zinc-600'}`}
                        >
                          See supported date formats
                        </summary>
                        <ul className={`mt-1.5 space-y-0.5 text-xs list-disc ml-4 ${muted}`}>
                          <li>Full dates — 2025-03-15, 03/15/2025</li>
                          <li>Month + year — January 2025, Jan 2025, Jan-25, 2025-01, 01/2025</li>
                          <li>Quarter — Q1 2025</li>
                          <li>
                            Month name only, if each row is already one month — January, February...
                          </li>
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dataSummary && !summarizing && matches.length > 0 && (
          <ColumnMappingCard
            dark={dark}
            matches={matches}
            inputs={mapInputs}
            questions={mapQuestions}
            checking={mapChecking}
            existingMetrics={Object.keys(dataSummary.metrics)}
            onAnswer={answerColumn}
          />
        )}

        {dataSummary && !summarizing && (
          <div className={`mb-4 p-4 rounded-xl border ${section}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-purple-500/10">
                <Users size={13} className="text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Confirm your industry</p>
                <p className={`text-xs ${muted}`}>
                  This decides which anonymized benchmark pool your data is compared against
                  {optIn ? ' and added to' : ''}.
                </p>
              </div>
            </div>

            {industryRecognized ? (
              <>
                <p className="text-sm mb-3">
                  I&apos;m seeing data from{' '}
                  <span className="font-semibold">
                    {detectedIndustries.length === 1
                      ? `the ${detectedIndustries[0]} industry`
                      : detectedIndustries.length === 2
                        ? `${detectedIndustries[0]} & ${detectedIndustries[1]}`
                        : `${detectedIndustries.slice(0, -1).join(', ')} & ${detectedIndustries[detectedIndustries.length - 1]}`}
                  </span>
                  . Is that correct?
                </p>
                {detectedIndustries.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(dataSummary.industrySegments || []).map((seg) => (
                      <span
                        key={seg.industry}
                        className="text-xs px-2 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-500"
                      >
                        {seg.industry}{' '}
                        <span className="opacity-60">{seg.rowCount.toLocaleString()} rows</span>
                      </span>
                    ))}
                  </div>
                )}
                {(dataSummary.industryUnmatchedRows || 0) > 0 && (
                  <p className="text-xs text-amber-500 flex items-center gap-1.5 mb-3">
                    <Info size={11} className="shrink-0" />
                    {dataSummary.industryUnmatchedRows?.toLocaleString()} rows in the{' '}
                    {dataSummary.industryColumn} column did not match a known industry and will not
                    be added to the benchmark pool.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIndustryConfirmed(true)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      industryConfirmed
                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                        : 'bg-blue-500 text-white hover:bg-blue-400'
                    }`}
                  >
                    {industryConfirmed ? 'Confirmed' : 'Yes, that is correct'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIndustryConfirmed(false)
                      setIndustryManualMode(true)
                    }}
                    className={`px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors ${dark ? 'border-white/[0.08] hover:bg-white/[0.04]' : 'border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    No, choose a different industry
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm mb-3">
                  {industryManualMode && detectedIndustries.length > 0
                    ? 'Choose the industry this data falls under.'
                    : "I'm not able to recognize an industry. Choose the industry this data falls under, or re-upload with an industry column."}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={manualIndustry}
                    onChange={(e) => setManualIndustry(e.target.value)}
                    className={`px-3 py-2 rounded-lg border text-xs outline-none ${input}`}
                  >
                    <option value="">Select an industry</option>
                    {INDUSTRY_OPTIONS.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      setDataSummary(null)
                      setSampledRows([])
                      setPiiResult(null)
                      setIndustryConfirmed(false)
                      setIndustryManualMode(false)
                      setManualIndustry('')
                    }}
                    className={`px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors ${dark ? 'border-white/[0.08] hover:bg-white/[0.04]' : 'border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    Re-upload file
                  </button>
                  {industryManualMode && detectedIndustries.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIndustryManualMode(false)
                        setManualIndustry('')
                      }}
                      className={`text-xs underline ${muted}`}
                    >
                      Back to detected industries
                    </button>
                  )}
                </div>
              </>
            )}
            {industryBlocksSubmit && (
              <p className="text-xs text-amber-500 mt-3 flex items-center gap-1.5">
                <Info size={11} className="shrink-0" /> Confirm an industry to contribute to the
                shared pool.
              </p>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={
            !file ||
            !projectName ||
            loading ||
            needsDataSourceChoice ||
            summarizing ||
            industryBlocksSubmit
          }
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
              Saving project...
            </>
          ) : summarizing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
              Parsing file...
            </>
          ) : (
            <>
              <Sparkles size={15} /> Save & Analyze <ChevronRight size={14} />
            </>
          )}
        </button>
        {needsDataSourceChoice && (
          <p className="text-xs text-amber-500 mb-5 text-center">
            Answer "Whose data is this?" below before continuing.
          </p>
        )}
        {!needsDataSourceChoice && <div className="mb-5" />}

        {/* Custom Prompt */}
        <div className={`p-4 rounded-xl border mb-4 ${section}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10">
              <MessageSquare size={13} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Analysis Focus</p>
              <p className={`text-xs ${muted}`}>Brief the AI like you're briefing an analyst</p>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`e.g. "Focus on campaign lift and ROI. Flag any statistical concerns."`}
            rows={3}
            className={`w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:border-blue-500/50 resize-none ${input}`}
          />
          <p className={`text-xs mt-2 ${muted}`}>
            💡 Mention what decisions this analysis needs to support
          </p>
        </div>

        {/* Narrative Tone */}
        <div className={`p-4 rounded-xl border mb-4 ${section}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-indigo-500/10">
              <Sparkles size={13} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Narrative Tone</p>
              <p className={`text-xs ${muted}`}>Used when building slides from your analysis</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {TONES.map((t) => {
              const Icon = t.icon
              const isSelected = tone === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTone(t.key)}
                  className={`text-left p-3 rounded-lg border transition-all
                    ${isSelected ? `${t.border} ${t.bg}` : dark ? 'border-white/[0.06] hover:border-white/[0.12]' : 'border-zinc-200 hover:border-zinc-300'}`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon size={13} className={isSelected ? t.color : muted} />
                    <span className={`text-xs font-semibold ${isSelected ? t.color : ''}`}>
                      {t.label}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${muted}`}>{t.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Target Company */}
        <div
          className={`p-4 rounded-xl border mb-4 ${dark ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50 border-emerald-200'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <Target size={13} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Tailor for a Target Company</p>
              <p className={`text-xs ${muted}`}>
                Pick a researched company to tailor insights for a pitch
              </p>
            </div>
          </div>
          {companies.length === 0 ? (
            <p className={`text-xs ${muted}`}>
              No researched companies yet. Use{' '}
              <span className="font-semibold">Company Research</span> on the dashboard first.
            </p>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${input}`}
              >
                <span className={selectedCompany ? '' : muted}>
                  {selectedCompany ? selectedCompany.company_name : 'Select a company...'}
                </span>
                <ChevronRight
                  size={13}
                  className={`transition-transform ${showCompanyDropdown ? 'rotate-90' : ''}`}
                />
              </button>
              {showCompanyDropdown && (
                <div
                  className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-2xl z-10 overflow-hidden ${dark ? 'bg-[#111118] border-white/[0.08]' : 'bg-white border-zinc-200'}`}
                >
                  <div className="p-2">
                    <input
                      value={companySearch}
                      onChange={(e) => setCompanySearch(e.target.value)}
                      placeholder="Search companies..."
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${input}`}
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <button
                      onClick={() => {
                        setSelectedCompany(null)
                        setSelectedAudience(null)
                        setDataSourceType(null)
                        setShowCompanyDropdown(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-500/10 ${muted}`}
                    >
                      No target company
                    </button>
                    {filteredCompanies.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCompany(c)
                          setSelectedAudience(null)
                          setDataSourceType(null)
                          setShowCompanyDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-500/10 font-medium"
                      >
                        {c.company_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedCompany && (
            <div className="mt-3">
              <p
                className={`text-xs font-medium mb-2 flex items-center gap-1 ${dark ? 'text-white/50' : 'text-zinc-600'}`}
              >
                <Info size={11} /> Whose data is this?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {[
                  {
                    type: 'client_actual' as DataSourceType,
                    icon: TrendingUp,
                    label: `${selectedCompany.company_name}'s performance data`,
                    desc: 'Highlighting their campaign results for ROI or upsell conversation.',
                  },
                  {
                    type: 'prospecting_benchmark' as DataSourceType,
                    icon: Lightbulb,
                    label: `Use our platform data to pitch ${selectedCompany.company_name}`,
                    desc: 'Industry benchmarks and platform growth data to win them as a client.',
                  },
                ].map(({ type, icon: Icon, label, desc }) => (
                  <button
                    key={type}
                    onClick={() => setDataSourceType(type)}
                    className={`text-left p-3 rounded-lg border transition-all
                      ${dataSourceType === type ? 'border-blue-500/50 bg-blue-500/10' : dark ? 'border-white/[0.06] hover:border-white/[0.12]' : 'border-zinc-200 hover:border-zinc-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        size={13}
                        className={dataSourceType === type ? 'text-blue-500' : muted}
                      />
                      <span className="text-xs font-semibold">{label}</span>
                    </div>
                    <p className={`text-xs leading-relaxed mt-0.5 ${muted}`}>{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedCompany?.audiences?.length > 0 && (
            <div className="mt-3">
              <p
                className={`text-xs font-medium mb-2 flex items-center gap-1 ${dark ? 'text-white/50' : 'text-zinc-600'}`}
              >
                <Users size={11} /> Select target audience
              </p>
              <div className="space-y-1.5">
                {selectedCompany.audiences.map((a: any, i: number) => (
                  <button
                    key={i}
                    onClick={() =>
                      setSelectedAudience(selectedAudience?.role === a.role ? null : a)
                    }
                    className={`w-full text-left p-3 rounded-lg border text-xs transition-all
                      ${selectedAudience?.role === a.role ? 'border-blue-500/50 bg-blue-500/10' : dark ? 'border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-500/40' : 'border-amber-300/60 bg-amber-50/70 hover:border-amber-400'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">{a.role}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full border ${
                          a.tier === 'executive'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : a.tier === 'director'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : a.tier === 'manager'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {a.seniority}
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed mt-0.5 ${muted}`}>{a.narrative_style}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Crowd opt-in */}
        <div
          className={`p-4 rounded-xl border ${dark ? 'bg-purple-950/20 border-purple-900/30' : 'bg-purple-50 border-purple-200'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-purple-500/10">
              <Users size={13} className="text-purple-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Contribute to Crowd-Sourced Insights</p>
              <p className={`text-xs ${muted}`}>
                Help build industry trends by sharing anonymized patterns
              </p>
            </div>
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 shrink-0"
            >
              <Info size={11} /> Learn more
            </button>
          </div>
          {!canOptIn ? (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <ShieldAlert size={12} /> Opt-in disabled — sensitive data detected.
            </div>
          ) : dataSourceType === 'client_actual' ? (
            <>
              <div
                className={`flex items-start gap-2 p-3 rounded-lg mb-3 ${dark ? 'bg-amber-950/30 border border-amber-900/40' : 'bg-amber-50 border border-amber-200'}`}
              >
                <ShieldAlert size={13} className="text-amber-500 shrink-0 mt-0.5" />
                <p
                  className={`text-xs leading-relaxed ${dark ? 'text-amber-200' : 'text-amber-800'}`}
                >
                  This is flagged as{' '}
                  <span className="font-semibold">
                    {selectedCompany?.company_name}'s actual performance data
                  </span>
                  . Confirm contributing anonymized aggregate insights complies with your agreement
                  before opting in.
                </p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={clientDataAck}
                  onChange={(e) => setClientDataAck(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span
                  className={`text-xs leading-relaxed ${dark ? 'text-white/50' : 'text-zinc-600'}`}
                >
                  I confirm contributing anonymized, aggregated insights from this data complies
                  with our agreement with {selectedCompany?.company_name}.
                </span>
              </label>
              <label
                className={`flex items-start gap-3 ${clientDataAck ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
              >
                <input
                  type="checkbox"
                  checked={optIn}
                  disabled={!clientDataAck}
                  onChange={(e) => setOptIn(e.target.checked)}
                  className="mt-0.5 accent-purple-500"
                />
                <span
                  className={`text-xs leading-relaxed ${dark ? 'text-white/50' : 'text-zinc-600'}`}
                >
                  Yes, contribute my anonymized data. All proprietary information will be removed.
                </span>
              </label>
            </>
          ) : (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                className="mt-0.5 accent-purple-500"
              />
              <span
                className={`text-xs leading-relaxed ${dark ? 'text-white/50' : 'text-zinc-600'}`}
              >
                Yes, contribute my anonymized data. All proprietary information will be removed.
              </span>
            </label>
          )}
          <p className={`text-xs mt-2 ${muted}`}>
            🔒 Your company name, brands, and proprietary data are never shared
          </p>
        </div>
      </main>
    </div>
  )
}
