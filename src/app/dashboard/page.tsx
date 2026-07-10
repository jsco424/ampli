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
  Globe2,
  ChevronDown,
  ChevronUp,
  Package,
  Users,
  Swords,
  Newspaper,
} from 'lucide-react'
import Link from 'next/link'
import WelcomeState from '@/components/WelcomeState'
import OnboardingModal from '@/components/OnboardingModal'

const TIER_COLORS: Record<string, string> = {
  executive: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  director: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  manager: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  individual: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

export default function Home() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [url, setUrl] = useState('')
  const [researching, setResearching] = useState(false)
  const [research, setResearch] = useState<any>(null)
  const [news, setNews] = useState<any[]>([])
  const [expandedSection, setExpandedSection] = useState<
    'products' | 'competitors' | 'audiences' | 'news' | null
  >('news')

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

  const handleResearch = async () => {
    if (!url || !user) return
    setResearching(true)
    setResearch(null)
    setNews([])
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      setResearch(data)
      setExpandedSection('news')
      await supabase.from('company_research').insert({
        user_id: user.id,
        url,
        company_name: data.company_name,
        description: data.description,
        products: data.products,
        competitors: data.competitors,
        audiences: data.audiences,
      })
      fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: data.company_name }),
      })
        .then((r) => r.json())
        .then((n) => setNews(n.news || []))
    } catch (err) {
      console.error(err)
    }
    setResearching(false)
  }

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
  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/25'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {[
            { icon: UploadCloud, label: 'New Project', href: '/projects/new' },
            { icon: FolderOpen, label: 'My Projects', href: '/projects' },
            { icon: BarChart2, label: 'Crowd Insights', href: '/crowd' },
            { icon: Globe, label: 'Research', href: '#research' },
          ].map(({ icon: Icon, label, href }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                hover:border-blue-500/50 hover:bg-blue-500/5 ${card}`}
            >
              <Icon size={15} className="text-blue-500 shrink-0" />
              {label}
            </Link>
          ))}
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
                className={`px-3 py-1.5 rounded-lg border text-sm outline-none w-44 focus:border-blue-500/50 transition-colors ${input}`}
              />
              <Link
                href="/projects"
                className="text-sm text-blue-500 flex items-center gap-1 hover:text-blue-400 transition-colors"
              >
                View All <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {projects.length === 0 && !loading ? (
            <WelcomeState firstName={user?.firstName || undefined} />
          ) : (
            <div className="space-y-6">
              {/* Processing */}
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

              {/* Completed */}
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
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className={`group p-4 rounded-xl border transition-all hover:border-blue-500/40 hover:bg-blue-500/[0.03] ${card}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-1.5 rounded-lg bg-blue-500/10">
                            <BarChart2 size={14} className="text-blue-500" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-xs text-emerald-500">
                              <CheckCircle size={11} /> Completed
                            </span>
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
                          className={`mt-3 pt-3 border-t flex items-center gap-1 text-xs font-medium text-blue-500 ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
                        >
                          View Results <ArrowRight size={11} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Company Research */}
        <div id="research">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-base tracking-tight">Company Research</h2>
            <span className="text-xs text-blue-500 font-medium px-2 py-0.5 rounded-full bg-blue-500/10">
              AI-Powered
            </span>
          </div>

          <div className={`p-5 rounded-xl border ${card}`}>
            <p className={`text-sm mb-4 ${muted}`}>
              Enter a company website URL to get an instant AI breakdown of products, audiences, and
              top competitors.
            </p>
            <div className="flex gap-2">
              <div
                className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-lg border ${input}`}
              >
                <Globe2 size={14} className={muted} />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
                  placeholder="https://example.com"
                  className="flex-1 bg-transparent outline-none text-sm"
                />
              </div>
              <button
                onClick={handleResearch}
                disabled={!url || researching}
                className="px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {researching && (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {researching ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>

            {/* Research Results */}
            {research && (
              <div className="mt-6 space-y-3">
                <div>
                  <h3 className="font-bold text-lg">{research.company_name}</h3>
                  <p className={`text-sm mt-1 ${muted}`}>{research.description}</p>
                </div>

                {/* Accordion sections */}
                {[
                  {
                    key: 'news',
                    icon: Newspaper,
                    label: 'Recent News',
                    iconColor: 'text-blue-500',
                    content: (
                      <div
                        className={`divide-y ${dark ? 'divide-white/[0.05]' : 'divide-zinc-100'}`}
                      >
                        {news.length === 0 ? (
                          <div className="p-4 flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <span className={`text-xs ${muted}`}>Fetching latest news...</span>
                          </div>
                        ) : (
                          news.map((n: any, i: number) => (
                            <div key={i} className={`p-3 ${dark ? 'bg-[#0d0d14]' : 'bg-white'}`}>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-sm font-medium leading-snug">{n.headline}</p>
                                <span
                                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${
                                    n.sentiment === 'positive'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : n.sentiment === 'negative'
                                        ? 'bg-red-500/10 text-red-400'
                                        : 'bg-white/5 text-white/30'
                                  }`}
                                >
                                  {n.sentiment}
                                </span>
                              </div>
                              <p className={`text-xs mb-1 ${muted}`}>{n.summary}</p>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium ${muted}`}>
                                  {n.publication}
                                </span>
                                <span className={`text-xs ${muted}`}>·</span>
                                <span className={`text-xs ${muted}`}>{n.date}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'products',
                    icon: Package,
                    label: 'Products & Services',
                    iconColor: 'text-blue-500',
                    content: (
                      <div
                        className={`grid grid-cols-1 sm:grid-cols-2 gap-px ${dark ? 'bg-white/[0.05]' : 'bg-zinc-100'}`}
                      >
                        {research.products?.map((p: any, i: number) => (
                          <div key={i} className={`p-3 ${dark ? 'bg-[#0d0d14]' : 'bg-white'}`}>
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className={`text-xs mt-0.5 ${muted}`}>{p.description}</p>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: 'audiences',
                    icon: Users,
                    label: 'Audience Map',
                    iconColor: 'text-purple-500',
                    content: (
                      <div className="p-3 space-y-2">
                        {research.audiences?.map((a: any, i: number) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg border ${dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50'}`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-semibold">{a.role}</span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border ${TIER_COLORS[a.tier] || TIER_COLORS.individual}`}
                              >
                                {a.seniority}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className={`font-medium mb-1 ${muted}`}>Cares about</p>
                                <ul className="space-y-0.5">
                                  {a.cares_about?.map((c: string, j: number) => (
                                    <li key={j} className="flex items-center gap-1">
                                      <span className="w-1 h-1 rounded-full bg-blue-500 inline-block" />
                                      {c}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className={`font-medium mb-1 ${muted}`}>Narrative style</p>
                                <p className={dark ? 'text-white/70' : 'text-zinc-600'}>
                                  {a.narrative_style}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: 'competitors',
                    icon: Swords,
                    label: 'Top Competitors',
                    iconColor: 'text-red-400',
                    content: (
                      <div
                        className={`grid grid-cols-1 sm:grid-cols-2 gap-px ${dark ? 'bg-white/[0.05]' : 'bg-zinc-100'}`}
                      >
                        {research.competitors?.map((c: any, i: number) => (
                          <div key={i} className={`p-3 ${dark ? 'bg-[#0d0d14]' : 'bg-white'}`}>
                            <p className="text-sm font-medium">{c.name}</p>
                            <p className={`text-xs mt-0.5 ${muted}`}>{c.description}</p>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ].map(({ key, icon: Icon, label, iconColor, content }) => (
                  <div
                    key={key}
                    className={`rounded-xl border overflow-hidden ${dark ? 'border-white/[0.07]' : 'border-zinc-200'}`}
                  >
                    <button
                      onClick={() =>
                        setExpandedSection(expandedSection === (key as any) ? null : (key as any))
                      }
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium ${dark ? 'bg-white/[0.03] hover:bg-white/[0.05]' : 'bg-zinc-50 hover:bg-zinc-100'} transition-colors`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon size={13} className={iconColor} /> {label}
                      </span>
                      {expandedSection === key ? (
                        <ChevronUp size={13} className={muted} />
                      ) : (
                        <ChevronDown size={13} className={muted} />
                      )}
                    </button>
                    {expandedSection === key && content}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
