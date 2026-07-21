'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
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
} from 'lucide-react'

const TONE_META: Record<string, { label: string; icon: any; color: string }> = {
  executive: { label: 'Executive & Concise', icon: Briefcase, color: 'text-blue-400' },
  analytical: { label: 'Analytical & Detailed', icon: Microscope, color: 'text-purple-400' },
  educational: { label: 'Educational & Informative', icon: Newspaper, color: 'text-emerald-400' },
}

// 'visuals' removed — its chart grid now renders inline inside AnalysisView
// (see the 'analysis' tab render below), between Anomalies and the
// Follow-up Thread, instead of living behind a separate tab with its own
// duplicate "Build Slides" button.
type Tab = 'analysis' | 'data' | 'notes'

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
  // chartsGenTriggered ref removed — Build Visuals is now an explicit
  // button click (handleBuildVisuals), not an auto-firing effect, so
  // there's no remount-reset race to guard against the way there was
  // before. chartsGenerating itself now serves as the re-click guard.
  const [recommendationsGenerating, setRecommendationsGenerating] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null)

  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const analysisTriggered = useRef(false)

  useEffect(() => {
    // Waits for Clerk to finish loading before firing ANY Supabase query.
    // This was the actual root cause of a 406 (Not Acceptable) on this
    // exact fetch: Supabase's accessToken callback in src/lib/supabase.ts
    // calls window.Clerk.session.getToken() on every request, but this
    // effect previously fired as soon as `id` was available — with no
    // guard on Clerk having actually finished initializing. On a hard
    // reload, Clerk needs real time to bootstrap (verify cookies, load the
    // session), especially on development keys, which are documented as
    // slower than production keys. If this query raced ahead of that,
    // window.Clerk.session didn't exist yet, the accessToken callback
    // returned null, and with no token attached, RLS filtered the row out
    // entirely — Postgres returned zero rows, and PostgREST turned that
    // into exactly this 406. With `data` then null, `project` state never
    // got set, which meant the chart-generation effect further down
    // (gated on `if (!project || !analysisOutput) return`) never fired
    // either — so /api/generate was never even called client-side. That's
    // consistent with everything observed: zero server logs, no
    // generation_error recorded, charts stuck null indefinitely.
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
          // Restore follow-up "Dig deeper" state — previously this was
          // pure React state with no persistence at all, so navigating
          // away and back lost every follow-up turn. Both fields are
          // nullable jsonb columns; a project with no follow-ups yet
          // simply has null here, which the || [] fallbacks handle.
          if (data.conversation_history) setConversationHistory(data.conversation_history)
          if (data.conversation_entries) setConversationEntries(data.conversation_entries)
          return
        }

        if (!data.raw_data && !data.sampled_rows) return
        if (analysisTriggered.current) return
        // analysisTriggered is just an in-memory ref scoped to this one page
        // mount — it resets the moment you navigate away and back, so it
        // couldn't stop a second /api/analyze call from firing if you
        // reopened this project before the first one finished. status
        // === 'analyzing' is the real, persistent signal: analyze/route.ts
        // sets it right when analysis starts and only clears it on
        // success/failure, so it survives across page loads and browser
        // tabs, not just this one mount.
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
            // NEW — lets the analysis itself (hero numbers, findings) be
            // audience-shaped, and triggers the on-demand public interest
            // fetch when a target company is set.
            targetAudience: data.target_audience || null,
            targetCompany: data.target_company || null,
            // Was previously only sent to /api/generate — meant the initial
            // executive summary and key findings could describe prospecting/
            // benchmark data as though it were the target company's own
            // performance, with the "this isn't actually their data" framing
            // only applying later at deck-build time. Now applied from the
            // first pass onward.
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
            if (!result) return // credit limit hit, already handled above
            const { analysis, assistantTurn } = result
            setAnalysisOutput(analysis)
            setConversationHistory([assistantTurn])
            supabase
              .from('projects')
              .update({
                analysis,
                status: 'complete',
                // Persist the very first turn immediately too, so even a
                // project with zero follow-up questions yet has a
                // consistent, restorable conversation_history from the start.
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

  // Was an auto-firing useEffect that ran the instant analysisOutput
  // existed — now an explicit handler, called only from the "Build
  // Visuals" button in AnalysisView. No more silent background generation
  // with no visible state; the button IS the loading state.
  const handleBuildVisuals = useCallback(() => {
    if (!project || !analysisOutput) return
    if (chartsGenerating) return // already in flight, ignore a duplicate click

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

  // Recommendations — previously a silent background call fired from inside
  // /api/generate right after charts saved, with zero visible state and the
  // exact "did it work or not?" ambiguity that took most of a session to
  // diagnose. Now its own explicit button, its own endpoint
  // (/api/generate-recommendations), its own loading/error state — same
  // reasoning as Build Visuals above.
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
            // Now sent on follow-ups too — needed for dataFramingInstruction
            // (the "this isn't the target company's own data" framing) to
            // apply on follow-up questions, not just the initial analysis.
            // Previously omitted specifically to avoid re-triggering the
            // on-demand public interest fetch on every follow-up; that fetch
            // is now separately gated on !isFollowUp in analyze/route.ts, so
            // sending targetCompany here no longer re-runs it.
            targetCompany: project.target_company || null,
            dataSourceType: project.data_source_type || null,
            // Was missing entirely — meant follow-up questions were never
            // counted against the credit limit at all, and never logged to
            // token_usage_log's 'analyze_followup' route either.
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

        // Persist immediately — this is the fix for follow-up turns
        // disappearing on navigation. Previously both of these only ever
        // lived in React state, so leaving the page and coming back had
        // nothing to restore from.
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
    // Renders independent of which tab is active — the selector has its
    // own internal Visuals / Findings & Tables toggle.
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

        // downloadUrl is our own /api/exports/[id]/download route, which
        // sets Content-Disposition: attachment — a direct navigation here
        // actually downloads instead of leaving the page, since the browser
        // sees it as same-origin. Gamma's raw exportUrl no longer reaches
        // the client at all.
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
                  {/* target_audience is now the full object saved by
                      new/page.tsx ({role, seniority, cares_about,
                      narrative_style, avoid}), not a plain string — this
                      used to render the raw string directly, and rendering
                      the whole object here threw React error #31 ("Objects
                      are not valid as a React child"). Only .role belongs
                      in this compact metadata bar; the rest of the object
                      is used server-side for tailoring, not displayed here. */}
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
          {(['analysis', 'data', 'notes'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`${tabBase} ${tab === t ? tabActive : tabInactive}`}
            >
              {t === 'notes' ? 'CRM Notes' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Slide selector — rendered independent of the active tab, so
            opening it never redirects anywhere. It has its own internal
            Visuals / Findings & Tables toggle. */}
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

        {!showSlideSelector && tab === 'data' && (
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
