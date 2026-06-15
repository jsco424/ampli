'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
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

  // Poll every 5s if any projects are processing
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

      // Save to Supabase
      await supabase.from('company_research').insert({
        user_id: user.id,
        url,
        company_name: data.company_name,
        description: data.description,
        products: data.products,
        competitors: data.competitors,
        audiences: data.audiences,
      })

      // Fetch news in parallel
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

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        {/* Welcome */}
        <div className="mt-6 mb-8">
          <h1 className="text-2xl font-bold mb-1">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          <p className={`text-sm ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            What would you like to do today?
          </p>
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
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all hover:border-blue-500 ${card}`}
            >
              <Icon size={16} className="text-blue-500" />
              {label}
            </Link>
          ))}
        </div>

        {/* Welcome state for new users */}
        {projects.length === 0 && !loading ? (
          <WelcomeState firstName={user?.firstName || undefined} />
        ) : (
          <>
            {/* Recent Projects */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">Recent Projects</h2>
                <div className="flex items-center gap-3">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search projects..."
                    className={`px-3 py-1.5 rounded-xl border text-sm outline-none w-48 ${input}`}
                  />
                  <Link
                    href="/projects"
                    className="text-sm text-blue-500 flex items-center gap-1 hover:underline"
                  >
                    View All <ArrowRight size={14} />
                  </Link>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className={`p-10 rounded-2xl border text-center ${card}`}>
                  <UploadCloud
                    size={32}
                    className={`mx-auto mb-3 ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}
                  />
                  <p className={`text-sm ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    No projects yet. Create your first one!
                  </p>
                  <Link
                    href="/projects/new"
                    className="mt-4 inline-block px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                  >
                    New Project
                  </Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Processing */}
                  {processing.length > 0 && (
                    <div>
                      <h3
                        className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
                      >
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        In Progress
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {processing.map((p) => (
                          <div key={p.id} className={`p-4 rounded-2xl border opacity-75 ${card}`}>
                            <div className="flex items-start justify-between mb-2">
                              <div className="p-2 rounded-xl bg-amber-500/10">
                                <BarChart2 size={16} className="text-amber-500" />
                              </div>
                              <span className="flex items-center gap-1.5 text-xs text-amber-400">
                                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                Processing
                              </span>
                            </div>
                            <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                            <p
                              className={`text-xs truncate mb-3 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}
                            >
                              {p.file_name}
                            </p>
                            <p className={`text-xs ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              Your insights are being generated...
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completed */}
                  {completed.length > 0 && (
                    <div>
                      <h3
                        className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
                      >
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        Completed
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {completed.map((p) => (
                          <Link
                            key={p.id}
                            href={`/projects/${p.id}`}
                            className={`group p-4 rounded-2xl border transition-all hover:border-blue-500 hover:shadow-md ${card}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="p-2 rounded-xl bg-blue-500/10">
                                <BarChart2 size={16} className="text-blue-500" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 text-xs text-emerald-500">
                                  <CheckCircle size={12} /> Completed
                                </span>
                                <button
                                  onClick={(e) => deleteProject(p.id, e)}
                                  className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:text-red-400 ${dark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                            <p
                              className={`text-xs truncate mb-3 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}
                            >
                              {p.file_name}
                            </p>
                            <div
                              className={`flex items-center gap-1 text-xs ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}
                            >
                              <Clock size={11} />
                              {new Date(p.created_at).toLocaleDateString()}
                            </div>
                            <div
                              className={`mt-3 pt-3 border-t flex items-center gap-1 text-xs font-medium text-blue-500 ${dark ? 'border-zinc-800' : 'border-zinc-100'}`}
                            >
                              View Results <ArrowRight size={12} />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Company Research */}
        <div id="research">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Company Research</h2>
            <span className="text-xs text-blue-500 font-medium">AI-Powered</span>
          </div>

          <div className={`p-5 rounded-2xl border ${card}`}>
            <p className={`text-sm mb-4 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Enter a company website URL to get an instant AI breakdown of what they do, their
              products, audiences, and top competitors.
            </p>
            <div className="flex gap-2">
              <div
                className={`flex items-center gap-2 flex-1 px-4 py-2.5 rounded-xl border ${input}`}
              >
                <Globe2 size={15} className={dark ? 'text-zinc-500' : 'text-zinc-400'} />
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
                className="px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {researching && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {researching ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>

            {/* Research Results */}
            {research && (
              <div className="mt-6 space-y-4">
                <div>
                  <h3 className="font-bold text-lg">{research.company_name}</h3>
                  <p className={`text-sm mt-1 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {research.description}
                  </p>
                </div>

                {/* News */}
                <div
                  className={`rounded-xl border overflow-hidden ${dark ? 'border-zinc-800' : 'border-zinc-200'}`}
                >
                  <button
                    onClick={() => setExpandedSection(expandedSection === 'news' ? null : 'news')}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${dark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Newspaper size={14} className="text-blue-500" /> Recent News
                    </span>
                    {expandedSection === 'news' ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  {expandedSection === 'news' && (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {news.length === 0 ? (
                        <div className="p-4 flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            Fetching latest news...
                          </span>
                        </div>
                      ) : (
                        news.map((n: any, i: number) => (
                          <div key={i} className={`p-3 ${dark ? 'bg-zinc-900' : 'bg-white'}`}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-medium leading-snug">{n.headline}</p>
                              <span
                                className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${
                                  n.sentiment === 'positive'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : n.sentiment === 'negative'
                                      ? 'bg-red-500/10 text-red-400'
                                      : 'bg-zinc-500/10 text-zinc-400'
                                }`}
                              >
                                {n.sentiment}
                              </span>
                            </div>
                            <p
                              className={`text-xs mb-1 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
                            >
                              {n.summary}
                            </p>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-medium ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}
                              >
                                {n.publication}
                              </span>
                              <span
                                className={`text-xs ${dark ? 'text-zinc-600' : 'text-zinc-300'}`}
                              >
                                ·
                              </span>
                              <span
                                className={`text-xs ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}
                              >
                                {n.date}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Products */}
                <div
                  className={`rounded-xl border overflow-hidden ${dark ? 'border-zinc-800' : 'border-zinc-200'}`}
                >
                  <button
                    onClick={() =>
                      setExpandedSection(expandedSection === 'products' ? null : 'products')
                    }
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${dark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Package size={14} className="text-blue-500" /> Products & Services
                    </span>
                    {expandedSection === 'products' ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  {expandedSection === 'products' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800">
                      {research.products?.map((p: any, i: number) => (
                        <div key={i} className={`p-3 ${dark ? 'bg-zinc-900' : 'bg-white'}`}>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p
                            className={`text-xs mt-0.5 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
                          >
                            {p.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Audiences */}
                <div
                  className={`rounded-xl border overflow-hidden ${dark ? 'border-zinc-800' : 'border-zinc-200'}`}
                >
                  <button
                    onClick={() =>
                      setExpandedSection(expandedSection === 'audiences' ? null : 'audiences')
                    }
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${dark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Users size={14} className="text-purple-500" /> Audience Map
                    </span>
                    {expandedSection === 'audiences' ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  {expandedSection === 'audiences' && (
                    <div className="p-3 space-y-3">
                      {research.audiences?.map((a: any, i: number) => (
                        <div
                          key={i}
                          className={`p-3 rounded-xl border ${dark ? 'border-zinc-800 bg-zinc-800/30' : 'border-zinc-100 bg-zinc-50'}`}
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
                              <p
                                className={`font-medium mb-1 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
                              >
                                Cares about
                              </p>
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
                              <p
                                className={`font-medium mb-1 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
                              >
                                Narrative style
                              </p>
                              <p className={dark ? 'text-zinc-300' : 'text-zinc-600'}>
                                {a.narrative_style}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Competitors */}
                <div
                  className={`rounded-xl border overflow-hidden ${dark ? 'border-zinc-800' : 'border-zinc-200'}`}
                >
                  <button
                    onClick={() =>
                      setExpandedSection(expandedSection === 'competitors' ? null : 'competitors')
                    }
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${dark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Swords size={14} className="text-red-400" /> Top Competitors
                    </span>
                    {expandedSection === 'competitors' ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  {expandedSection === 'competitors' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-200 dark:bg-zinc-800">
                      {research.competitors?.map((c: any, i: number) => (
                        <div key={i} className={`p-3 ${dark ? 'bg-zinc-900' : 'bg-white'}`}>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p
                            className={`text-xs mt-0.5 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
                          >
                            {c.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
