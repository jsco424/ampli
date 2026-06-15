'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Users,
  Sparkles,
  RotateCcw,
  FileText,
  Save,
  CheckCircle,
  X,
  ChevronRight,
  Palette,
} from 'lucide-react'
import { useBrand } from '@/hooks/useBrand'

const { brand } = useBrand()
const BRAND_COLORS = [
  brand.primaryColor,
  brand.secondaryColor,
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
]

export default function ProjectViewPage() {
  const { id } = useParams()
  const { user } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'narrative' | 'visuals' | 'data'>('narrative')

  // Regenerate
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [regenPrompt, setRegenPrompt] = useState('')
  const [regenerating, setRegenerating] = useState(false)

  // CRM Notes
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const notesTimer = useRef<any>(null)

  useEffect(() => {
    if (!id) return
    supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setProject(data)
        setNotes(data?.crm_notes || '')
        setLoading(false)
      })
  }, [id])

  // Auto-save notes with debounce
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

  const handleRegenerate = async () => {
    if (!regenPrompt.trim() || !project) return
    setRegenerating(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: project.raw_data,
          prompt: regenPrompt,
          projectName: project.name,
          targetCompany: project.target_company,
          targetAudience: project.target_audience ? { role: project.target_audience } : null,
        }),
      })
      const { narrative, insights, charts } = await res.json()
      await supabase
        .from('projects')
        .update({ narrative, insights, charts, prompt: regenPrompt })
        .eq('id', id)
      setProject((p: any) => ({ ...p, narrative, insights, charts, prompt: regenPrompt }))
      setShowRegenerate(false)
      setRegenPrompt('')
    } catch (err) {
      console.error(err)
    }
    setRegenerating(false)
  }

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
  const tabBase = 'px-4 py-2 text-sm font-medium rounded-xl transition-colors'
  const tabActive = dark ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-white'
  const tabInactive = dark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'

  const renderChart = (chart: any, i: number) => {
    const color = BRAND_COLORS[i % BRAND_COLORS.length]
    const chartProps = { data: chart.data, margin: { top: 5, right: 10, left: -20, bottom: 5 } }

    return (
      <div key={i} className={`p-5 rounded-2xl border ${card}`}>
        <h3 className="font-semibold text-sm mb-1">{chart.title}</h3>
        <p className={`text-xs mb-4 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          {chart.description}
        </p>
        <ResponsiveContainer width="100%" height={200}>
          {chart.type === 'bar' ? (
            <BarChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#27272a' : '#f4f4f5'} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <YAxis tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <Tooltip
                contentStyle={{
                  background: dark ? '#18181b' : '#fff',
                  border: 'none',
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : chart.type === 'line' ? (
            <LineChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#27272a' : '#f4f4f5'} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <YAxis tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <Tooltip
                contentStyle={{
                  background: dark ? '#18181b' : '#fff',
                  border: 'none',
                  borderRadius: 8,
                }}
              />
              <Line dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          ) : chart.type === 'area' ? (
            <AreaChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#27272a' : '#f4f4f5'} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <YAxis tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <Tooltip
                contentStyle={{
                  background: dark ? '#18181b' : '#fff',
                  border: 'none',
                  borderRadius: 8,
                }}
              />
              <Area dataKey="value" stroke={color} fill={`${color}33`} strokeWidth={2} />
            </AreaChart>
          ) : chart.type === 'pie' ? (
            <PieChart>
              <Pie
                data={chart.data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
              >
                {chart.data.map((_: any, idx: number) => (
                  <Cell key={idx} fill={BRAND_COLORS[idx % BRAND_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: dark ? '#18181b' : '#fff',
                  border: 'none',
                  borderRadius: 8,
                }}
              />
            </PieChart>
          ) : (
            <BarChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#27272a' : '#f4f4f5'} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <YAxis tick={{ fontSize: 11, fill: dark ? '#71717a' : '#a1a1aa' }} />
              <Tooltip
                contentStyle={{
                  background: dark ? '#18181b' : '#fff',
                  border: 'none',
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    )
  }

  if (loading)
    return (
      <div className={`min-h-screen flex items-center justify-center ${base}`}>
        <Navbar />
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )

  if (!project)
    return (
      <div className={`min-h-screen flex items-center justify-center ${base}`}>
        <Navbar />
        <p>Project not found.</p>
      </div>
    )

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 mt-4">
          <button
            onClick={() => router.push('/')}
            className={`p-2 rounded-xl transition-colors ${dark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{project.name}</h1>
            <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {project.file_name} · {new Date(project.created_at).toLocaleDateString()}
            </p>
          </div>
          {/* Regenerate button */}
          <button
            onClick={() => setShowRegenerate(!showRegenerate)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors
              ${
                showRegenerate
                  ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                  : dark
                    ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                    : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
              }`}
          >
            <RotateCcw size={14} />
            Regenerate
          </button>
        </div>

        {/* Context Banner — target company + audience */}
        {(project.target_company || project.target_audience) && (
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
          >
            {project.target_company && (
              <div className="flex items-center gap-1.5">
                <Target size={13} className="text-emerald-500" />
                <span
                  className={`text-xs font-medium ${dark ? 'text-emerald-400' : 'text-emerald-600'}`}
                >
                  {project.target_company}
                </span>
              </div>
            )}
            {project.target_company && project.target_audience && (
              <ChevronRight size={12} className={dark ? 'text-zinc-600' : 'text-zinc-300'} />
            )}
            {project.target_audience && (
              <div className="flex items-center gap-1.5">
                <Users size={13} className="text-purple-500" />
                <span
                  className={`text-xs font-medium ${dark ? 'text-purple-400' : 'text-purple-600'}`}
                >
                  {project.target_audience}
                </span>
              </div>
            )}
            {project.prompt && (
              <>
                <ChevronRight size={12} className={dark ? 'text-zinc-600' : 'text-zinc-300'} />
                <p className={`text-xs truncate ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  "{project.prompt}"
                </p>
              </>
            )}
          </div>
        )}

        {/* Regenerate Panel */}
        {showRegenerate && (
          <div
            className={`p-4 rounded-2xl border mb-4 ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}
          >
            <p className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Sparkles size={14} className="text-blue-500" />
              Regenerate with a new prompt
            </p>
            <p className={`text-xs mb-3 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              The same data will be used — only the focus and framing will change.
            </p>
            <textarea
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              placeholder={`e.g. "Focus on year-over-year growth" or "Frame this for a CFO audience"`}
              rows={2}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3 ${input}`}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowRegenerate(false)
                  setRegenPrompt('')
                }}
                className={`px-4 py-2 rounded-xl border text-sm font-medium ${dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerate}
                disabled={!regenPrompt.trim() || regenerating}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40"
              >
                {regenerating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles size={13} /> Regenerate
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div
          className={`flex gap-2 mb-6 p-1 rounded-2xl w-fit ${dark ? 'bg-zinc-900' : 'bg-zinc-100'}`}
        >
          {(['narrative', 'visuals', 'data', 'notes'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`${tabBase} ${tab === t ? tabActive : tabInactive}`}
            >
              {t === 'notes' ? 'CRM Notes' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Narrative Tab */}
        {tab === 'narrative' && (
          <div className="space-y-6">
            {project.insights?.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {project.insights.map((insight: any, i: number) => (
                  <div key={i} className={`p-4 rounded-2xl border ${card}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {insight.title}
                      </span>
                      {insight.trend === 'up' ? (
                        <TrendingUp size={14} className="text-emerald-500" />
                      ) : insight.trend === 'down' ? (
                        <TrendingDown size={14} className="text-red-400" />
                      ) : (
                        <Minus size={14} className="text-zinc-400" />
                      )}
                    </div>
                    <div className="text-xl font-bold mb-1">{insight.value}</div>
                    <p className={`text-xs ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {insight.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className={`p-6 rounded-2xl border ${card}`}>
              <h2 className="font-semibold mb-4">Narrative</h2>
              <div
                className={`text-sm leading-relaxed whitespace-pre-wrap ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}
              >
                {project.narrative}
              </div>
            </div>
          </div>
        )}

        {/* Visuals Tab */}
        {tab === 'visuals' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {project.charts?.map((chart: any, i: number) => renderChart(chart, i))}
          </div>
        )}

        {/* Data Tab */}
        {tab === 'data' && (
          <div className={`rounded-2xl border overflow-auto ${card}`}>
            <div className="p-4 border-b flex items-center justify-between">
              <span className="text-sm font-medium">Raw Data</span>
              <button
                onClick={() => {
                  const blob = new Blob([project.raw_data], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = project.file_name
                  a.click()
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                Download CSV
              </button>
            </div>
            <pre
              className={`p-4 text-xs overflow-auto max-h-96 ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}
            >
              {project.raw_data}
            </pre>
          </div>
        )}

        {/* CRM Notes Tab */}
        {tab === 'notes' && (
          <div className={`rounded-2xl border ${card}`}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={15} className={dark ? 'text-zinc-400' : 'text-zinc-500'} />
                <span className="text-sm font-medium">CRM Notes</span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs transition-opacity ${notesSaved ? 'opacity-100' : 'opacity-0'}`}
              >
                <CheckCircle size={12} className="text-emerald-400" />
                <span className={dark ? 'text-zinc-400' : 'text-zinc-500'}>Saved</span>
              </div>
            </div>
            <div className="p-4">
              <p className={`text-xs mb-3 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Log pitch notes, feedback, next steps, and follow-up context. Auto-saves as you
                type.
              </p>
              <textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder={`e.g. "Spoke with Sarah (VP Marketing) on June 10 — she responded well to the conversion rate slide. Follow up with Q3 benchmarks. Next call June 24."`}
                rows={12}
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none ${input}`}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
