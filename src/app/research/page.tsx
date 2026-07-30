'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  Globe2,
  ChevronDown,
  ChevronUp,
  Package,
  Users,
  Swords,
  Newspaper,
  Clock,
  Building2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Link2,
  Sparkles,
} from 'lucide-react'

const TIER_COLORS: Record<string, string> = {
  executive: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  director: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  manager: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  individual: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

const SOURCE_LABELS: Record<string, string> = {
  wikipedia: 'Wikipedia',
  youtube: 'YouTube',
  google_trends: 'Google Trends',
}
const RAW_UNIT_LABELS: Record<string, string> = {
  wikipedia: 'pageviews',
  youtube: 'views',
  google_trends: 'interest index',
}

interface CompositeRow {
  topic: string
  composite_score: number
  delta_vs_prior: number | null
  as_of: string
}
interface SignalRow {
  topic: string
  source: string
  signal_score: number
  raw_value: number
  as_of: string
}

// Postgres numeric columns can come back as JSON strings — confirmed via
// a real export of these same tables earlier in the project. Coerced at
// the point of reading, same fix as trends/page.tsx.
function toCompositeRow(row: any): CompositeRow {
  return {
    topic: row.topic,
    composite_score: Number(row.composite_score),
    delta_vs_prior: row.delta_vs_prior === null ? null : Number(row.delta_vs_prior),
    as_of: row.as_of,
  }
}
function toSignalRow(row: any): SignalRow {
  return {
    topic: row.topic,
    source: row.source,
    signal_score: Number(row.signal_score),
    raw_value: Number(row.raw_value),
    as_of: row.as_of,
  }
}

function TrendArrow({ delta }: { delta: number | null }) {
  if (delta === null) return <Minus size={13} className="text-zinc-400" />
  if (delta > 2) return <TrendingUp size={13} className="text-emerald-500" />
  if (delta < -2) return <TrendingDown size={13} className="text-red-400" />
  return <Minus size={13} className="text-zinc-400" />
}
function deltaColor(delta: number | null): string {
  if (delta === null) return 'text-zinc-400'
  if (delta > 2) return 'text-emerald-500'
  if (delta < -2) return 'text-red-400'
  return 'text-zinc-400'
}
function formatRaw(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

export default function ResearchPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  // ── Company Research tool (moved from the home dashboard) ──────────────
  const [url, setUrl] = useState('')
  const [researching, setResearching] = useState(false)
  const [research, setResearch] = useState<any>(null)
  const [news, setNews] = useState<any[]>([])
  const [expandedSection, setExpandedSection] = useState<
    'products' | 'competitors' | 'audiences' | 'news' | null
  >('news')

  // ── Recent Searches ──────────────────────────────────────────────────
  const [recentSearches, setRecentSearches] = useState<any[]>([])
  const [recentLoading, setRecentLoading] = useState(true)

  const loadRecentSearches = () => {
    if (!user) return
    supabase
      .from('company_research')
      .select('id, url, company_name, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRecentSearches(data || [])
        setRecentLoading(false)
      })
  }

  useEffect(() => {
    loadRecentSearches()
  }, [user])

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
      loadRecentSearches()
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

  const reopenRecentSearch = (entry: any) => {
    setUrl(entry.url)
    setResearch({
      company_name: entry.company_name,
      description: entry.description,
      products: entry.products,
      competitors: entry.competitors,
      audiences: entry.audiences,
    })
    setExpandedSection('news')
    setNews([])
    fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: entry.company_name }),
    })
      .then((r) => r.json())
      .then((n) => setNews(n.news || []))
  }

  // ── Companies roster (moved from the Intelligence/User Behaviors page) ─
  const [companies, setCompanies] = useState<CompositeRow[]>([])
  const [signalsByKey, setSignalsByKey] = useState<Map<string, SignalRow>>(new Map())
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [companySearch, setCompanySearch] = useState('')

  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [sparkline, setSparkline] = useState<CompositeRow[]>([])
  const [sourceBreakdown, setSourceBreakdown] = useState<SignalRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [knownCompetitors, setKnownCompetitors] = useState<{ name: string; description: string }[]>(
    []
  )
  const [competitorsLoading, setCompetitorsLoading] = useState(false)
  const [relatedQueries, setRelatedQueries] = useState<{ query: string; value: number }[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  useEffect(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 3)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    Promise.all([
      supabase
        .from('trend_composite')
        .select('topic, composite_score, delta_vs_prior, as_of')
        .eq('category', 'company')
        .gte('as_of', cutoffStr)
        .order('as_of', { ascending: false }),
      supabase
        .from('trend_signals')
        .select('topic, source, signal_score, raw_value, as_of')
        .eq('category', 'company')
        .gte('as_of', cutoffStr)
        .order('as_of', { ascending: false }),
      fetch('/api/trends/researched-companies').then((r) => r.json()),
    ]).then(([compositeRes, signalsRes, researchedRes]) => {
      const researchedNames = new Set<string>((researchedRes.names || []) as string[])

      const latestByTopic = new Map<string, CompositeRow>()
      for (const raw of (compositeRes.data as any[]) || []) {
        const row = toCompositeRow(raw)
        // Only companies that have actually been researched — a company
        // with no possible competitor data isn't worth showing here.
        if (!researchedNames.has(row.topic.toLowerCase().trim())) continue
        const existing = latestByTopic.get(row.topic)
        if (!existing || row.as_of > existing.as_of) latestByTopic.set(row.topic, row)
      }
      setCompanies(Array.from(latestByTopic.values()))

      const bySourceKey = new Map<string, SignalRow>()
      for (const raw of (signalsRes.data as any[]) || []) {
        const row = toSignalRow(raw)
        const key = `${row.topic}::${row.source}`
        const existing = bySourceKey.get(key)
        if (!existing || row.as_of > existing.as_of) bySourceKey.set(key, row)
      }
      setSignalsByKey(bySourceKey)
      setCompaniesLoading(false)
    })
  }, [])

  const openCompanyDetail = (topic: string) => {
    setSelectedCompany(topic)
    setDetailLoading(true)
    setCompetitorsLoading(true)
    setKnownCompetitors([])
    setRelatedLoading(true)
    setRelatedQueries([])

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    Promise.all([
      supabase
        .from('trend_composite')
        .select('topic, composite_score, delta_vs_prior, as_of')
        .eq('topic', topic)
        .gte('as_of', cutoffStr)
        .order('as_of', { ascending: true }),
      supabase
        .from('trend_signals')
        .select('topic, source, signal_score, raw_value, as_of')
        .eq('topic', topic)
        .order('as_of', { ascending: false })
        .limit(10),
    ]).then(([compositeRes, signalsRes]) => {
      setSparkline(((compositeRes.data as any[]) || []).map(toCompositeRow))
      const bySource = new Map<string, SignalRow>()
      for (const raw of (signalsRes.data as any[]) || []) {
        const row = toSignalRow(raw)
        const existing = bySource.get(row.source)
        if (!existing || row.as_of > existing.as_of) bySource.set(row.source, row)
      }
      setSourceBreakdown(Array.from(bySource.values()))
      setDetailLoading(false)
    })

    fetch(`/api/trends/competitors?company=${encodeURIComponent(topic)}`)
      .then((res) => res.json())
      .then((data) => setKnownCompetitors(data.competitors || []))
      .catch(() => setKnownCompetitors([]))
      .finally(() => setCompetitorsLoading(false))

    fetch(`/api/trends/related?topic=${encodeURIComponent(topic)}`)
      .then((res) => res.json())
      .then((data) => setRelatedQueries(data.related || []))
      .catch(() => setRelatedQueries([]))
      .finally(() => setRelatedLoading(false))
  }

  const selectedRow = companies.find((c) => c.topic === selectedCompany) || null
  const filteredCompanies = companies
    .filter((c) => c.topic.toLowerCase().includes(companySearch.trim().toLowerCase()))
    .sort((a, b) => b.composite_score - a.composite_score)

  // ── Token-based styles ──────────────────────────────────────────────
  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/25'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-24 px-6 max-w-5xl mx-auto pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Research</h1>
          <p className={`text-sm ${muted}`}>
            Research a company, revisit past searches, and browse every company you've tracked — all
            in one place.
          </p>
        </div>

        {/* Company Research tool */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-base tracking-tight">Company Research</h2>
            <span className="text-xs text-blue-500 font-medium px-2 py-0.5 rounded-full bg-blue-500/10">
              AI Powered
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

            {research && (
              <div className="mt-6 space-y-3">
                <div>
                  <h3 className="font-bold text-lg">{research.company_name}</h3>
                  <p className={`text-sm mt-1 ${muted}`}>{research.description}</p>
                </div>

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

        {/* Recent Searches */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-5">
            <Clock size={15} className={muted} />
            <h2 className="font-semibold text-base tracking-tight">Recent Searches</h2>
          </div>
          <div className={`rounded-xl border overflow-hidden ${card}`}>
            {recentLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recentSearches.length === 0 ? (
              <p className={`text-xs p-4 ${muted}`}>No searches yet — try one above.</p>
            ) : (
              <div className={`divide-y ${dark ? 'divide-white/[0.05]' : 'divide-zinc-100'}`}>
                {recentSearches.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => reopenRecentSearch(entry)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${dark ? 'hover:bg-white/[0.03]' : 'hover:bg-zinc-50'}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.company_name}</p>
                      <p className={`text-xs truncate ${muted}`}>{entry.url}</p>
                    </div>
                    {entry.created_at && (
                      <span className={`text-xs shrink-0 ml-3 ${muted}`}>
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Companies roster — moved here from Intelligence, per James's ask
            to have all company-related things live in one place */}
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Building2 size={15} className={muted} />
            <h2 className="font-semibold text-base tracking-tight">Companies You've Tracked</h2>
          </div>

          {companiesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : companies.length === 0 ? (
            <div className={`p-10 rounded-xl border text-center ${card}`}>
              <p className={`text-sm ${muted}`}>
                No companies tracked yet — companies you research above, or analyze in a project,
                show up here once they start being tracked.
              </p>
            </div>
          ) : (
            <div className={`p-4 rounded-xl border ${card}`}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Filter companies…"
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${dark ? 'bg-white/[0.03] border-white/10 text-white placeholder-white/25' : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400'}`}
                />
                <span className={`text-xs shrink-0 ${muted}`}>
                  {filteredCompanies.length} tracked
                </span>
              </div>
              <div className="space-y-2">
                {filteredCompanies.map((c) => (
                  <button
                    key={c.topic}
                    onClick={() => openCompanyDetail(c.topic)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors hover:border-blue-500/40 hover:bg-blue-500/[0.03] ${card}`}
                  >
                    <span className="text-sm font-medium truncate">{c.topic}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-lg font-bold">{c.composite_score}</span>
                      <span
                        className={`flex items-center gap-1 text-xs font-medium w-16 ${deltaColor(c.delta_vs_prior)}`}
                      >
                        <TrendArrow delta={c.delta_vs_prior} />
                        {c.delta_vs_prior !== null
                          ? `${c.delta_vs_prior > 0 ? '+' : ''}${c.delta_vs_prior}%`
                          : 'new'}
                      </span>
                    </div>
                  </button>
                ))}
                {filteredCompanies.length === 0 && (
                  <p className={`text-xs text-center py-6 ${muted}`}>
                    No tracked companies match "{companySearch}"
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Company detail panel */}
        {selectedCompany && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setSelectedCompany(null)}
            />
            <div
              className={`relative w-full max-w-lg p-6 rounded-2xl border shadow-2xl max-h-[85vh] overflow-y-auto ${card}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">{selectedCompany}</h3>
                  {selectedRow && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-3xl font-black">{selectedRow.composite_score}</span>
                      <span
                        className={`flex items-center gap-1 text-sm font-medium ${deltaColor(selectedRow.delta_vs_prior)}`}
                      >
                        <TrendArrow delta={selectedRow.delta_vs_prior} />
                        {selectedRow.delta_vs_prior !== null
                          ? `${selectedRow.delta_vs_prior > 0 ? '+' : ''}${selectedRow.delta_vs_prior}% vs. last week`
                          : 'Not enough history yet'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedCompany(null)}
                  className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/[0.05] text-white/40' : 'hover:bg-zinc-100 text-zinc-500'}`}
                >
                  <X size={16} />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="mb-5">
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>
                      Source Breakdown
                    </p>
                    <div className="space-y-3">
                      {sourceBreakdown.length === 0 ? (
                        <p className={`text-xs ${muted}`}>No source data available yet.</p>
                      ) : (
                        sourceBreakdown.map((s) => (
                          <div key={s.source}>
                            <div className="flex items-center gap-3">
                              <span className={`text-xs w-20 shrink-0 ${muted}`}>
                                {SOURCE_LABELS[s.source] || s.source}
                              </span>
                              <div
                                className={`flex-1 h-2 rounded-full overflow-hidden ${dark ? 'bg-white/5' : 'bg-zinc-100'}`}
                              >
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${s.signal_score}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right">
                                {s.signal_score}
                              </span>
                            </div>
                            <p className={`text-[11px] mt-1 ml-[84px] ${muted}`}>
                              {formatRaw(s.raw_value)} {RAW_UNIT_LABELS[s.source] || 'units'}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Swords size={11} className="text-red-400" />
                      <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
                        Known Competitors
                      </p>
                    </div>
                    <p className={`text-[11px] mb-2.5 ${muted}`}>
                      From Company Research above — AI analyzed from {selectedCompany}'s own
                      website, not inferred from search behavior.
                    </p>
                    {competitorsLoading ? (
                      <p className={`text-xs ${muted}`}>Checking Company Research…</p>
                    ) : knownCompetitors.length === 0 ? (
                      <p className={`text-xs ${muted}`}>
                        No match yet — research this company above to populate this.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {knownCompetitors.map((c) => (
                          <div
                            key={c.name}
                            className={`p-2.5 rounded-lg border ${dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50'}`}
                          >
                            <p className="text-xs font-semibold">{c.name}</p>
                            <p className={`text-[11px] mt-0.5 ${muted}`}>{c.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Link2 size={11} className={muted} />
                      <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
                        Related Searches
                      </p>
                    </div>
                    <p className={`text-[11px] mb-2.5 ${muted}`}>
                      What people actually search for alongside {selectedCompany} — real public
                      search behavior, a different signal from Known Competitors above.
                    </p>
                    {relatedLoading ? (
                      <p className={`text-xs ${muted}`}>Looking up related searches…</p>
                    ) : relatedQueries.length === 0 ? (
                      <p className={`text-xs ${muted}`}>Nothing found for this one yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {relatedQueries.map((r) => (
                          <span
                            key={r.query}
                            className={`text-xs px-2.5 py-1 rounded-full border ${dark ? 'border-white/10 text-white/70' : 'border-zinc-200 text-zinc-700'}`}
                          >
                            {r.query}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
