'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import { useBrand } from '@/hooks/useBrand'
import ChartRenderer from '@/components/ChartRenderer'
import PDFExportModal from '@/components/PDFExportModal'
import TagInput from '@/components/TagInput'
import AnalysisView from '@/components/AnalysisView'
import SlideSelector from '@/components/SlideSelector'
import type { AnalysisOutput, AnalysisHandoff } from '@/lib/analysisTypes'
import type { SelectedFinding } from '@/components/SlideSelector'
import {
  ArrowLeft,
  Target,
  Users,
  Sparkles,
  FileText,
  CheckCircle,
  ChevronRight,
  Presentation,
  Download,
  Briefcase,
  Microscope,
  Newspaper,
} from 'lucide-react'
import Link from 'next/link'

const TONE_META: Record<string, { label: string; icon: any; color: string }> = {
  executive: { label: 'Executive & Concise', icon: Briefcase, color: 'text-blue-400' },
  analytical: { label: 'Analytical & Detailed', icon: Microscope, color: 'text-purple-400' },
  educational: { label: 'Educational & Informative', icon: Newspaper, color: 'text-emerald-400' },
}

type Tab = 'analysis' | 'visuals' | 'data' | 'notes'

export default function ProjectViewPage() {
  const { id } = useParams()
  const { user } = useUser()
  const { dark } = useTheme()
  const { brand } = useBrand()
  const router = useRouter()

  // Project data
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('analysis')
  const [tags, setTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [showPDFExport, setShowPDFExport] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const notesTimer = useRef<any>(null)

  // Analysis state
  const [analysisOutput, setAnalysisOutput] = useState<AnalysisOutput | null>(null)
  const [conversationHistory, setConversationHistory] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([])
  const [conversationEntries, setConversationEntries] = useState<
    { question: string; analysis: AnalysisOutput }[]
  >([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showSlideSelector, setShowSlideSelector] = useState(false)

  const analysisTriggered = useRef(false)

  useEffect(() => {
    if (!id) return

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
          return
        }

        if (!data.raw_data && !data.sampled_rows) return
        if (analysisTriggered.current) return
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
          }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Analysis failed: ${res.status}`)
            return res.json()
          })
          .then(({ analysis, assistantTurn }) => {
            setAnalysisOutput(analysis)
            setConversationHistory([assistantTurn])
            supabase
              .from('projects')
              .update({ analysis, status: 'complete' })
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
  }, [id])

  // Follow-up turns only — initial analysis fires in the useEffect above
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
          }),
        })

        if (!res.ok) throw new Error(`Analysis failed: ${res.status}`)
        const { analysis, assistantTurn } = await res.json()

        // Append to conversation thread — initial analysis stays as anchor
        setConversationEntries((prev) => [...prev, { question: followUpQuestion, analysis }])
        setConversationHistory([...historyToSend, assistantTurn])
      } catch (err: any) {
        console.error(err)
        setAnalysisError('Follow-up failed — please try again.')
      } finally {
        setAnalysisLoading(false)
      }
    },
    [project, conversationHistory]
  )

  const handleFollowUp = useCallback(
    (question: string) => {
      if (question.trim()) runAnalysis(question)
    },
    [runAnalysis]
  )

  const handleRequestSlides = useCallback(() => {
    setShowSlideSelector(true)
    setTab('analysis')
  }, [])

  const handleBuildSlides = useCallback(
    async (selections: SelectedFinding[]) => {
      if (!analysisOutput || !project) return

      const handoff: AnalysisHandoff = {
        dataSummaryJson: project.raw_data || '',
        conversationHistory,
        confirmedAnalysis: analysisOutput,
        selectedFindings: selections,
      }

      await supabase.from('projects').update({ analysis_handoff: handoff }).eq('id', id)
      router.push(`/projects/${id}/pitch`)
    },
    [analysisOutput, project, conversationHistory, id, router]
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

  const BRAND_COLORS = [
    brand.primaryColor,
    brand.secondaryColor,
    '#10b981',
    '#f59e0b',
    '#ef4444',
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
      {showPDFExport && (
        <PDFExportModal project={project} onClose={() => setShowPDFExport(false)} />
      )}

      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        {/* Header */}
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
          <button
            onClick={() => setShowPDFExport(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${dark ? 'border-white/[0.08] text-white/40 hover:bg-white/[0.04]' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
          >
            <Download size={13} /> Export PDF
          </button>
          <Link
            href={`/projects/${id}/pitch`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-400 transition-colors"
          >
            <Presentation size={13} /> Pitch Mode
          </Link>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <TagInput
            tags={tags}
            onChange={handleTagsChange}
            existingTags={allTags}
            placeholder="Add tags (client, campaign, industry...)"
          />
        </div>

        {/* Context banner */}
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
                  {project.target_audience}
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

        {/* Tabs */}
        <div
          className={`flex gap-1 mb-6 p-1 rounded-xl w-fit ${dark ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}
        >
          {(['analysis', 'visuals', 'data', 'notes'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`${tabBase} ${tab === t ? tabActive : tabInactive}`}
            >
              {t === 'notes' ? 'CRM Notes' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Analysis Tab ───────────────────────────────────────────────── */}
        {tab === 'analysis' && (
          <div>
            {/* Loading skeleton */}
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

            {/* Error state */}
            {analysisError && (
              <div
                className={`p-5 rounded-2xl border mb-4 ${dark ? 'bg-red-950/20 border-red-900/30' : 'bg-red-50 border-red-200'}`}
              >
                <p className="text-sm text-red-400 mb-3">{analysisError}</p>
                <button
                  onClick={() => {
                    analysisTriggered.current = false
                    window.location.reload()
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Slide selector */}
            {showSlideSelector && analysisOutput && (
              <SlideSelector
                analysis={analysisOutput}
                dark={dark}
                onConfirm={handleBuildSlides}
                onCancel={() => setShowSlideSelector(false)}
              />
            )}

            {/* Analysis view */}
            {!showSlideSelector && analysisOutput && (
              <AnalysisView
                analysis={analysisOutput}
                dark={dark}
                onFollowUp={handleFollowUp}
                onBuildSlides={handleRequestSlides}
                isLoading={analysisLoading}
                conversationEntries={conversationEntries}
              />
            )}
          </div>
        )}

        {/* ── Visuals Tab ────────────────────────────────────────────────── */}
        {tab === 'visuals' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {project.charts?.length > 0 ? (
              project.charts.map((chart: any, i: number) => (
                <div key={i} className={`p-5 rounded-xl border ${card}`}>
                  <h3 className="font-semibold text-sm mb-1">{chart.title}</h3>
                  <p className={`text-xs mb-4 ${muted}`}>{chart.description}</p>
                  <ChartRenderer chart={chart} colors={BRAND_COLORS} height={200} dark={dark} />
                </div>
              ))
            ) : (
              <div className={`col-span-2 p-10 rounded-xl border text-center ${card}`}>
                <p className={`text-sm ${muted}`}>
                  Charts appear here once you build slides from your analysis.
                </p>
                {analysisOutput && (
                  <button
                    onClick={handleRequestSlides}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors"
                  >
                    <Sparkles size={13} /> Build Slides
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Data Tab ──────────────────────────────────────────────────── */}
        {tab === 'data' && (
          <div className={`rounded-xl border overflow-auto ${card}`}>
            <div
              className={`p-4 border-b flex items-center justify-between ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
            >
              <span className="text-sm font-medium">Raw Data Summary</span>
              <button
                onClick={() => {
                  const blob = new Blob([project.raw_data || ''], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${project.file_name}_summary.json`
                  a.click()
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 transition-colors"
              >
                Download JSON
              </button>
            </div>
            <pre
              className={`p-4 text-xs overflow-auto max-h-96 ${dark ? 'text-white/50' : 'text-zinc-600'}`}
            >
              {project.raw_data
                ? JSON.stringify(JSON.parse(project.raw_data), null, 2)
                : 'No data summary available.'}
            </pre>
          </div>
        )}

        {/* ── CRM Notes Tab ──────────────────────────────────────────────── */}
        {tab === 'notes' && (
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
