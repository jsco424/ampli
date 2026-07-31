'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import { useBrand } from '@/hooks/useBrand'
import TagInput from '@/components/TagInput'
import AnalysisView from '@/components/AnalysisView'
import SlideSelector from '@/components/SlideSelector'
import type { AnalysisOutput, AnalysisHandoff } from '@/lib/analysisTypes'
import type { SelectedFinding } from '@/components/SlideSelector'
import {
  ArrowLeft,
  Target,
  Users,
  FileText,
  CheckCircle,
  ChevronRight,
  Briefcase,
  Microscope,
  Newspaper,
  Download,
  Table2,
} from 'lucide-react'

const TONE_META: Record<string, { label: string; icon: any; color: string }> = {
  executive: { label: 'Executive & Concise', icon: Briefcase, color: 'text-blue-400' },
  analytical: { label: 'Analytical & Detailed', icon: Microscope, color: 'text-purple-400' },
  educational: { label: 'Educational & Informative', icon: Newspaper, color: 'text-emerald-400' },
}

// Charts split back out into its own tab — a real rows-and-columns table
// view of project.charts, distinct from AnalysisView's inline chart
// previews (which stay as-is; that's about the narrative flow, this is
// about inspecting/downloading the underlying data).
type Tab = 'analysis' | 'data' | 'charts' | 'notes'

// Renders any array of plain objects as a real HTML table — used for both
// the Data tab (project.sampled_rows) and the Charts tab (each chart's own
// data array). Columns come from the first row's own keys, so this works
// for any shape without needing to know it ahead of time.
function DataTable({ rows, dark, muted }: { rows: any[]; dark: boolean; muted: string }) {
  if (!rows || rows.length === 0) {
    return <p className={`text-xs p-4 ${muted}`}>No rows to show.</p>
  }
  const columns = Object.keys(rows[0])
  return (
    <div className="overflow-auto max-h-96">
      <table className="w-full text-xs">
        <thead className={`sticky top-0 ${dark ? 'bg-[#111118]' : 'bg-white'}`}>
          <tr className={`border-b ${dark ? 'border-white/[0.08]' : 'border-zinc-200'}`}>
            {columns.map((col) => (
              <th
                key={col}
                className={`text-left px-3 py-2 font-semibold whitespace-nowrap ${muted}`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b ${dark ? 'border-white/[0.04]' : 'border-zinc-100'}`}>
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 whitespace-nowrap">
                  {typeof row[col] === 'object' && row[col] !== null
                    ? JSON.stringify(row[col])
                    : String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProjectViewPage() {
  const { id } = useParams()
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const { brand } = useBrand()
  const router = useRouter()

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('analysis')
  const [tags, setTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const notesTimer = useRef<any>(null)

  const [analysisOutput, setAnalysisOutput] = useState<AnalysisOutput | null>(null)
  const [conversationHistory, setConversationHistory] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([])
  const [conversationEntries, setConversationEntries] = useState<
    { question: string; analysis: AnalysisOutput }[]
  >([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isCreditLimitError, setIsCreditLimitError] = useState(false)
  const [showSlideSelector, setShowSlideSelector] = useState(false)

  const [chartsGenerating, setChartsGenerating] = useState(false)
  const [recommendationsGenerating, setRecommendationsGenerating] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null)

  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const analysisTriggered = useRef(false)

  useEffect(() => {
    if (!id || !isLoaded) return

    supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) {
          setLoading(false)
          return
        }
        setProject(data)
        setNotes(data.crm_notes || '')
        setTags(data.tags || [])
        setLoading(false)

        if (data.analysis) {
          setAnalysisOutput(data.analysis as AnalysisOutput)
          if (data.conversation_history) setConversationHistory(data.conversation_history)
          if (data.conversation_entries) setConversationEntries(data.conversation_entries)
          return
        }

        if (!data.raw_data && !data.sampled_rows) return
        if (analysisTriggered.current) return
        if (data.status === 'analyzing') return
        analysisTriggered.current = true

        setAnalysisLoading(true)
        setAnalysisError(null)

        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataSummaryJson: data.raw_data || null,
            rawRowsJson: data.sampled_rows ? JSON.stringify(data.sampled_rows) : null,
            conversationHistory: [],
            prompt: data.prompt || null,
            tone: data.tone || 'executive',
            industry: data.industry || null,
            targetAudience: data.target_audience || null,
            targetCompany: data.target_company || null,
            dataSourceType: data.data_source_type || null,
            projectId: data.id,
          }),
        })
          .then(async (res) => {
            if (res.status === 402) {
              const limitInfo = await res.json()
              setIsCreditLimitError(true)
              setAnalysisError(
                `You've used all ${limitInfo.creditsLimit} credits for this month. Upgrade to keep going.`
              )
              setAnalysisLoading(false)
              return null
            }
            if (!res.ok) throw new Error(`Analysis failed: ${res.status}`)
            return res.json()
          })
          .then((result) => {
            if (!result) return
            const { analysis, assistantTurn } = result
            setAnalysisOutput(analysis)
            setConversationHistory([assistantTurn])
            supabase
              .from('projects')
              .update({
                analysis,
                status: 'complete',
                conversation_history: [assistantTurn],
              })
              .eq('id', id)
              .then(() => {})
          })
          .catch((err) => {
            console.error(err)
            setAnalysisError('Analysis failed — please try again.')
          })
          .finally(() => setAnalysisLoading(false))
      })

    if (user) {
      supabase
        .from('projects')
        .select('tags')
        .eq('user_id', user.id)
        .then(({ data }) => {
          const t = [...new Set((data || []).flatMap((p: any) => p.tags || []))] as string[]
          setAllTags(t)
        })
    }
  }, [id, isLoaded])

  const handleBuildVisuals = useCallback(() => {
    if (!project || !analysisOutput) return
    if (chartsGenerating) return

    setChartsGenerating(true)
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        dataSummary: project.raw_data || null,
        rawSample: null,
        prompt: project.prompt || null,
        tone: project.tone || 'executive',
        projectName: project.name,
        targetCompany: project.target_company || null,
        targetAudience: project.target_audience || null,
        optIn: project.opt_in_crowd || false,
        dataSourceType: project.data_source_type || null,
        confirmedAnalysis: analysisOutput,
        selectedFindings: null,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Visual generation failed: ${res.status}`)
      })
      .then(() => supabase.from('projects').select('*').eq('id', project.id).single())
      .then(({ data }) => {
        if (data) setProject(data)
      })
      .catch((err) => {
        console.error('Visual generation failed:', err)
      })
      .finally(() => setChartsGenerating(false))
  }, [project, analysisOutput, chartsGenerating])

  const handleBuildRecommendations = useCallback(() => {
    if (!project) return
    if (recommendationsGenerating) return

    setRecommendationsGenerating(true)
    setRecommendationsError(null)
    fetch('/api/generate-recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Recommendations failed: ${res.status}`)
        return data
      })
      .then(() => supabase.from('projects').select('*').eq('id', project.id).single())
      .then(({ data }) => {
        if (data) setProject(data)
      })
      .catch((err) => {
        console.error('Recommendations failed:', err)
        setRecommendationsError(err.message || 'Recommendations failed — please try again.')
      })
      .finally(() => setRecommendationsGenerating(false))
  }, [project, recommendationsGenerating])

  const runAnalysis = useCallback(
    async (followUpQuestion: string) => {
      if (!project) return
      setAnalysisLoading(true)
      setAnalysisError(null)

      const historyToSend = [
        ...conversationHistory,
        { role: 'user' as const, content: followUpQuestion },
      ]

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataSummaryJson: project.raw_data || null,
            rawRowsJson: project.sampled_rows ? JSON.stringify(project.sampled_rows) : null,
            conversationHistory: historyToSend,
            prompt: project.prompt || null,
            tone: project.tone || 'executive',
            industry: project.industry || null,
            targetAudience: project.target_audience || null,
            targetCompany: project.target_company || null,
            dataSourceType: project.data_source_type || null,
            projectId: project.id,
          }),
        })

        if (res.status === 402) {
          const limitInfo = await res.json()
          setIsCreditLimitError(true)
          setAnalysisError(
            `You've used all ${limitInfo.creditsLimit} credits for this month. Upgrade to keep going.`
          )
          setAnalysisLoading(false)
          return
        }
        if (!res.ok) throw new Error(`Analysis failed: ${res.status}`)
        const { analysis, assistantTurn } = await res.json()

        const newEntries = [...conversationEntries, { question: followUpQuestion, analysis }]
        const newHistory = [...historyToSend, assistantTurn]

        setConversationEntries(newEntries)
        setConversationHistory(newHistory)

        await supabase
          .from('projects')
          .update({
            conversation_entries: newEntries,
            conversation_history: newHistory,
          })
          .eq('id', project.id)
      } catch (err: any) {
        console.error(err)
        setAnalysisError('Follow-up failed — please try again.')
      } finally {
        setAnalysisLoading(false)
      }
    },
    [project, conversationHistory, conversationEntries]
  )

  const handleFollowUp = useCallback(
    (question: string) => {
      if (question.trim()) runAnalysis(question)
    },
    [runAnalysis]
  )

  const handleRequestSlides = useCallback(() => {
    setShowSlideSelector(true)
    setExportError(null)
  }, [])

  const handleExport = useCallback(
    async (format: 'pptx' | 'pdf', selections: SelectedFinding[]) => {
      if (!analysisOutput || !project) return
      setIsExporting(true)
      setExportError(null)

      try {
        const handoff: AnalysisHandoff = {
          dataSummaryJson: project.raw_data || '',
          conversationHistory,
          confirmedAnalysis: analysisOutput,
          selectedFindings: selections,
        }
        await supabase.from('projects').update({ analysis_handoff: handoff }).eq('id', id)

        const res = await fetch('/api/gamma', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, exportFormat: format }),
        })
        const data = await res.json()
        if (!res.ok || !data.downloadUrl) throw new Error(data.error || 'Export failed')

        window.location.href = data.downloadUrl

        setShowSlideSelector(false)
      } catch (err: any) {
        setExportError(err.message || 'Export failed — please try again')
      } finally {
        setIsExporting(false)
      }
    },
    [analysisOutput, project, conversationHistory, id]
  )

  const handleTagsChange = async (newTags: string[]) => {
    setTags(newTags)
    await supabase.from('projects').update({ tags: newTags }).eq('id', id)
  }

  const handleNotesChange = (val: string) => {
    setNotes(val)
    setNotesSaved(false)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await supabase.from('projects').update({ crm_notes: val }).eq('id', id)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }, 1000)
  }

  // Only real download left on this page — raw ingested data isn't
  // downloadable here at all anymore, since the user already has that on
  // their own machine (they uploaded it). Charts are computed/derived data,
  // which is the thing actually worth a backup copy of. One workbook, one
  // sheet per chart, so a user who doesn't like Gamma's auto-generated
  // visuals can rebuild every one of them manually.
  const handleDownloadChartsExcel = () => {
    const charts = project?.charts || []
    if (charts.length === 0) return

    const workbook = XLSX.utils.book_new()
    const usedNames = new Set<string>()

    charts.forEach((chart: any, i: number) => {
      const base =
        (chart.title || `Chart ${i + 1}`).replace(/[\\/*?:\[\]]/g, '').slice(0, 28) ||
        `Chart ${i + 1}`
      let sheetName = base
      let suffix = 1
      while (usedNames.has(sheetName)) {
        sheetName = `${base}_${suffix++}`.slice(0, 31)
      }
      usedNames.add(sheetName)

      const worksheet = XLSX.utils.json_to_sheet(chart.data || [])
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    })

    XLSX.writeFile(workbook, `${project.file_name || 'charts'}_charts.xlsx`)
  }

  // Chart color sequence for multi-series visuals — brand.primaryColor and
  // secondaryColor come first since those are the user's own set colors,
  // then the new site palette (green, pink) before the remaining distinct
  // hues used for charts needing more than 4 series.
  const BRAND_COLORS = [
    brand.primaryColor,
    brand.secondaryColor,
    '#5DCAA5',
    '#F4A7B9',
    '#f59e0b',
    '#06b6d4',
  ]

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/25'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const tabBase = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors'
  const tabActive = dark ? 'bg-white/10 text-white' : 'bg-zinc-900 text-white'
  const tabInactive = dark
    ? 'text-white/35 hover:text-white/70'
    : 'text-zinc-500 hover:text-zinc-900'

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${base}`}>
        <Navbar />
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${base}`}>
        <Navbar />
        <p>Project not found.</p>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />

      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        <div className="flex items-center gap-3 mb-4 mt-6">
          <button
            onClick={() => router.push('/')}
            className={`p-2 rounded-lg transition-colors ${dark ? 'hover:bg-white/[0.05] text-white/40' : 'hover:bg-zinc-100 text-zinc-500'}`}
          >
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate tracking-tight">{project.name}</h1>
            <p className={`text-xs ${muted}`}>
              {project.file_name} · {new Date(project.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <TagInput
            tags={tags}
            onChange={handleTagsChange}
            existingTags={allTags}
            placeholder="Add tags (client, campaign, industry...)"
          />
        </div>

        {(project.target_company || project.target_audience || project.tone) && (
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-4 flex-wrap ${dark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-zinc-50 border-zinc-200'}`}
          >
            {project.tone && TONE_META[project.tone] && (
              <div className="flex items-center gap-1.5">
                {(() => {
                  const Icon = TONE_META[project.tone].icon
                  return <Icon size={12} className={TONE_META[project.tone].color} />
                })()}
                <span className={`text-xs font-medium ${TONE_META[project.tone].color}`}>
                  {TONE_META[project.tone].label}
                </span>
              </div>
            )}
            {project.tone && (project.target_company || project.target_audience) && (
              <ChevronRight size={11} className={muted} />
            )}
            {project.target_company && (
              <div className="flex items-center gap-1.5">
                <Target size={12} className="text-emerald-500" />
                <span
                  className={`text-xs font-medium ${dark ? 'text-emerald-400' : 'text-emerald-600'}`}
                >
                  {project.target_company}
                </span>
              </div>
            )}
            {project.target_company && project.target_audience && (
              <ChevronRight size={11} className={muted} />
            )}
            {project.target_audience && (
              <div className="flex items-center gap-1.5">
                <Users size={12} className="text-purple-500" />
                <span
                  className={`text-xs font-medium ${dark ? 'text-purple-400' : 'text-purple-600'}`}
                >
                  {project.target_audience.role || 'Custom audience'}
                </span>
              </div>
            )}
            {project.prompt && (
              <>
                <ChevronRight size={11} className={muted} />
                <p className={`text-xs truncate ${muted}`}>"{project.prompt}"</p>
              </>
            )}
          </div>
        )}

        <div
          className={`flex gap-1 mb-6 p-1 rounded-xl w-fit ${dark ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}
        >
          {(['analysis', 'data', 'charts', 'notes'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`${tabBase} ${tab === t ? tabActive : tabInactive}`}
            >
              {t === 'notes' ? 'CRM Notes' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {showSlideSelector && analysisOutput && (
          <SlideSelector
            analysis={analysisOutput}
            charts={project.charts || []}
            chartsLoading={chartsGenerating}
            dark={dark}
            isExporting={isExporting}
            exportError={exportError}
            onExport={handleExport}
            onCancel={() => setShowSlideSelector(false)}
            conversationEntries={conversationEntries}
            chartColors={BRAND_COLORS}
            recommendations={project.recommendations || []}
          />
        )}

        {!showSlideSelector && tab === 'analysis' && (
          <div>
            {analysisLoading && !analysisOutput && (
              <div className="space-y-4">
                <div className={`p-5 rounded-2xl border ${card}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                    <p className="text-sm font-medium">Analyzing your data...</p>
                  </div>
                  <div className="space-y-2">
                    {[
                      'Identifying data type and structure',
                      'Computing derived metrics',
                      'Running formula verification',
                      'Flagging anomalies',
                    ].map((step, i) => (
                      <div key={i} className={`flex items-center gap-2 text-xs ${muted}`}>
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-blue-500 animate-pulse' : dark ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                        />
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {analysisError && (
              <div
                className={`p-5 rounded-2xl border mb-4 ${dark ? 'bg-red-950/20 border-red-900/30' : 'bg-red-50 border-red-200'}`}
              >
                <p className="text-sm text-red-400 mb-3">{analysisError}</p>
                {isCreditLimitError ? (
                  <Link
                    href="/pricing"
                    className="inline-block text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 transition-colors"
                  >
                    View Plans
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      analysisTriggered.current = false
                      window.location.reload()
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}

            {analysisOutput && (
              <AnalysisView
                analysis={analysisOutput}
                dark={dark}
                onFollowUp={handleFollowUp}
                onBuildSlides={handleRequestSlides}
                isLoading={analysisLoading}
                conversationEntries={conversationEntries}
                charts={project.charts || []}
                chartsGenerating={chartsGenerating}
                chartColors={BRAND_COLORS}
                onBuildVisuals={handleBuildVisuals}
                generationError={project.generation_error || null}
                recommendations={project.recommendations || []}
                recommendationsGenerating={recommendationsGenerating}
                onBuildRecommendations={handleBuildRecommendations}
                recommendationsError={recommendationsError || project.recommendations_error || null}
              />
            )}
          </div>
        )}

        {/* Data tab — the raw rows the user actually uploaded, shown as a
            real table. No download here at all: they already have this
            data on their own machine, since they're the ones who ingested
            it in the first place. */}
        {!showSlideSelector && tab === 'data' && (
          <div className={`rounded-xl border overflow-hidden ${card}`}>
            <div
              className={`p-4 border-b flex items-center gap-2 ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
            >
              <Table2 size={14} className={muted} />
              <span className="text-sm font-medium">Your Data</span>
            </div>
            {project.sampled_rows && project.sampled_rows.length > 0 ? (
              <DataTable rows={project.sampled_rows} dark={dark} muted={muted} />
            ) : (
              <p className={`text-xs p-4 ${muted}`}>No sample rows available for this project.</p>
            )}
          </div>
        )}

        {/* Charts tab — one table per chart, the actual computed/derived
            data behind each visual, plus the one download that's actually
            worth having: an Excel workbook, one sheet per chart, so a user
            who doesn't like Gamma's auto-generated visual can rebuild any
            of them by hand. */}
        {!showSlideSelector && tab === 'charts' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border flex items-center justify-between ${card}`}>
              <span className={`text-xs ${muted}`}>
                {(project.charts || []).length} chart
                {(project.charts || []).length !== 1 ? 's' : ''} computed for this project
              </span>
              <button
                onClick={handleDownloadChartsExcel}
                disabled={!project.charts || project.charts.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={12} />
                Download as Excel
              </button>
            </div>

            {(project.charts || []).length === 0 ? (
              <div className={`p-8 rounded-xl border text-center ${card}`}>
                <p className={`text-sm ${muted}`}>
                  No charts built yet — build visuals from the Analysis tab first.
                </p>
              </div>
            ) : (
              (project.charts || []).map((chart: any, i: number) => (
                <div key={i} className={`rounded-xl border overflow-hidden ${card}`}>
                  <div
                    className={`p-4 border-b ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
                  >
                    <p className="text-sm font-medium">{chart.title || `Chart ${i + 1}`}</p>
                    {chart.type && <p className={`text-[11px] mt-0.5 ${muted}`}>{chart.type}</p>}
                  </div>
                  <DataTable rows={chart.data || []} dark={dark} muted={muted} />
                </div>
              ))
            )}
          </div>
        )}

        {!showSlideSelector && tab === 'notes' && (
          <div className={`rounded-xl border ${card}`}>
            <div
              className={`p-4 border-b flex items-center justify-between ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className={muted} />
                <span className="text-sm font-medium">CRM Notes</span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs transition-opacity ${notesSaved ? 'opacity-100' : 'opacity-0'}`}
              >
                <CheckCircle size={11} className="text-emerald-400" />
                <span className={muted}>Saved</span>
              </div>
            </div>
            <div className="p-4">
              <p className={`text-xs mb-3 ${muted}`}>
                Log pitch notes, feedback, next steps, and follow-up context. Auto-saves as you
                type.
              </p>
              <textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder={`e.g. "Spoke with Sarah on June 10 — responded well to conversion rate slide."`}
                rows={12}
                className={`w-full px-4 py-3 rounded-lg border text-sm outline-none focus:border-blue-500/50 resize-none ${input}`}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
