'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  UploadCloud,
  FolderOpen,
  BarChart2,
  Globe,
  ArrowRight,
  Trash2,
  Clock,
  CheckCircle,
  Search,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import WelcomeState from '@/components/WelcomeState'
import OnboardingModal from '@/components/OnboardingModal'
import ExportsDropdown from '@/components/ExportsDropdown'

export default function Home() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // ── Smart Search — replaces the old inline Company Research tool here,
  // which moved to its own page at /research alongside Recent Searches
  // and the Companies roster. Phase 1 only: company/industry/date filters,
  // counts and lists — see /api/dashboard-search for the real scope and
  // why this deliberately isn't an open text-to-SQL tool.
  const [smartQuery, setSmartQuery] = useState('')
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartResult, setSmartResult] = useState<any>(null)

  const runSmartSearch = async (q: string) => {
    if (!q.trim()) return
    setSmartLoading(true)
    setSmartResult(null)
    try {
      const res = await fetch('/api/dashboard-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      setSmartResult(data)
    } catch (err) {
      console.error(err)
      setSmartResult({ matched: false, suggestion: 'Search failed — try again.', suggestions: [] })
    }
    setSmartLoading(false)
  }

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_settings')
      .select('onboarding_complete')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (!data || !data.onboarding_complete) setShowOnboarding(true)
      })
  }, [user])

  const completeOnboarding = async () => {
    if (!user) return
    setShowOnboarding(false)
    await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, onboarding_complete: true }, { onConflict: 'user_id' })
  }

  const loadProjects = () => {
    if (!user) return
    supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        setProjects(data || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    loadProjects()
  }, [user])

  useEffect(() => {
    if (!projects.some((p) => p.status === 'processing')) return
    const interval = setInterval(loadProjects, 5000)
    return () => clearInterval(interval)
  }, [projects])

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await supabase.from('projects').delete().eq('id', id)
    setProjects((p) => p.filter((x) => x.id !== id))
  }

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.file_name?.toLowerCase().includes(search.toLowerCase())
  )
  const processing = filtered.filter((p) => p.status === 'processing')
  const completed = filtered.filter((p) => p.status === 'completed')

  // ── Token-based styles ──────────────────────────────────────────────────────
  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-[#080C14]'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/25'
    : 'bg-white border-zinc-300 text-[#080C14] placeholder-zinc-400'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const sectionLabel = dark ? 'text-white/30' : 'text-zinc-400'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      {showOnboarding && <OnboardingModal onComplete={completeOnboarding} />}

      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        {/* Welcome */}
        <div className="mt-8 mb-8">
          <h1 className="text-2xl font-bold mb-1 tracking-tight">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          <p className={`text-sm ${muted}`}>What would you like to do today?</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { icon: UploadCloud, label: 'New Project', href: '/projects/new' },
            { icon: FolderOpen, label: 'My Projects', href: '/projects' },
            { icon: BarChart2, label: 'Crowd Insights', href: '/crowd' },
            { icon: Globe, label: 'Research', href: '/research' },
          ].map(({ icon: Icon, label, href }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                hover:border-[#5DCAA5]/50 hover:bg-[#5DCAA5]/5 ${card}`}
            >
              <Icon size={15} className="text-[#5DCAA5] shrink-0" />
              {label}
            </Link>
          ))}
        </div>

        {/* Smart Search */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-[#5DCAA5]" />
            <h2 className="font-semibold text-base tracking-tight">Ask ampli</h2>
          </div>
          <div className={`p-4 rounded-xl border ${card}`}>
            <div className="flex gap-2">
              <div
                className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-lg border ${input}`}
              >
                <Search size={14} className={muted} />
                <input
                  value={smartQuery}
                  onChange={(e) => setSmartQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSmartSearch(smartQuery)}
                  placeholder="e.g. How many decks have I built for Acme Corp?"
                  className="flex-1 bg-transparent outline-none text-sm"
                />
              </div>
              <button
                onClick={() => runSmartSearch(smartQuery)}
                disabled={!smartQuery.trim() || smartLoading}
                className="px-5 py-2.5 rounded-lg bg-[#080C14] text-white text-sm font-medium hover:bg-[#0F1420] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
              >
                {smartLoading && (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                Ask
              </button>
            </div>

            {smartResult && (
              <div className="mt-4">
                {!smartResult.matched ? (
                  <div>
                    <p className={`text-sm mb-3 ${muted}`}>{smartResult.suggestion}</p>
                    {smartResult.suggestions?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {smartResult.suggestions.map((s: string) => (
                          <button
                            key={s}
                            onClick={() => {
                              setSmartQuery(s)
                              runSmartSearch(s)
                            }}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${dark ? 'border-white/10 text-white/70 hover:bg-white/5' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : smartResult.intent === 'count' ? (
                  <p className="text-sm">
                    <span className="text-2xl font-black mr-2">{smartResult.count}</span>
                    project{smartResult.count !== 1 ? 's' : ''} match
                    {smartResult.filters?.company && ` for "${smartResult.filters.company}"`}
                    {smartResult.filters?.industry && ` in ${smartResult.filters.industry}`}
                  </p>
                ) : smartResult.projects.length === 0 ? (
                  <p className={`text-sm ${muted}`}>No matching projects found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {smartResult.projects.map((p: any) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${dark ? 'hover:bg-white/[0.04]' : 'hover:bg-zinc-50'}`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className={`text-xs shrink-0 ml-3 ${muted}`}>
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent Projects */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-base tracking-tight">Recent Projects</h2>
            <div className="flex items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className={`px-3 py-1.5 rounded-lg border text-sm outline-none w-44 focus:border-[#5DCAA5]/50 transition-colors ${input}`}
              />
              <Link
                href="/projects"
                className="text-sm text-[#5DCAA5] flex items-center gap-1 hover:text-[#5DCAA5] transition-colors"
              >
                View All <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {projects.length === 0 && !loading ? (
            <WelcomeState firstName={user?.firstName || undefined} />
          ) : (
            <div className="space-y-6">
              {processing.length > 0 && (
                <div>
                  <h3
                    className={`text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2 ${sectionLabel}`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    In Progress
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {processing.map((p) => (
                      <div key={p.id} className={`p-4 rounded-xl border opacity-60 ${card}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-1.5 rounded-lg bg-amber-500/10">
                            <BarChart2 size={14} className="text-amber-500" />
                          </div>
                          <span className="flex items-center gap-1.5 text-xs text-amber-400">
                            <div className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                            Processing
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                        <p className={`text-xs truncate mb-2 ${muted}`}>{p.file_name}</p>
                        <p className={`text-xs ${muted}`}>Generating insights...</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {completed.length > 0 && (
                <div>
                  <h3
                    className={`text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2 ${sectionLabel}`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Completed
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {completed.map((p) => (
                      <div key={p.id} className="relative group">
                        <Link
                          href={`/projects/${p.id}`}
                          className={`block p-4 rounded-xl border transition-all hover:border-[#5DCAA5]/40 hover:bg-[#5DCAA5]/[0.03] ${card}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-1.5 rounded-lg bg-[#5DCAA5]/10">
                              <BarChart2 size={14} className="text-[#5DCAA5]" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-xs text-emerald-500">
                                <CheckCircle size={11} /> Completed
                              </span>
                              <ExportsDropdown projectId={p.id} dark={dark} />
                              <button
                                onClick={(e) => deleteProject(p.id, e)}
                                className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:text-red-400 ${dark ? 'hover:bg-white/5' : 'hover:bg-zinc-100'}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                          <p className={`text-xs truncate mb-3 ${muted}`}>{p.file_name}</p>
                          <div className={`flex items-center gap-1 text-xs ${muted}`}>
                            <Clock size={10} /> {new Date(p.created_at).toLocaleDateString()}
                          </div>
                          <div
                            className={`mt-3 pt-3 border-t flex items-center gap-1 text-xs font-medium text-[#5DCAA5] ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
                          >
                            View Results <ArrowRight size={11} />
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
