'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Lock, TrendingUp, TrendingDown, Lightbulb, RefreshCw } from 'lucide-react'
import Link from 'next/link'

const INDUSTRY_ICONS: Record<string, string> = {
  Retail: '🛍️', Healthcare: '🏥', Technology: '💻', Finance: '💰',
  Marketing: '📣', Education: '🎓', Manufacturing: '🏭', Hospitality: '🏨',
  'Real Estate': '🏢', Media: '📱', Energy: '⚡', Nonprofit: '🤝',
  Logistics: '🚚', Other: '📊',
}

const INDUSTRY_COLORS: Record<string, string> = {
  Retail: '#3b82f6', Healthcare: '#10b981', Technology: '#8b5cf6',
  Finance: '#f59e0b', Marketing: '#ef4444', Education: '#06b6d4',
  Manufacturing: '#84cc16', Hospitality: '#f97316', 'Real Estate': '#ec4899',
  Media: '#a855f7', Energy: '#eab308', Nonprofit: '#14b8a6',
  Logistics: '#6366f1', Other: '#94a3b8',
}

export default function CrowdInsightsPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [industries, setIndustries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hasOptedIn, setHasOptedIn] = useState(false)
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  useEffect(() => {
    if (!user) return

    // Check if user has ever opted in
    supabase.from('projects')
      .select('id').eq('user_id', user.id).eq('opt_in_crowd', true).limit(1)
      .then(({ data }) => setHasOptedIn((data?.length ?? 0) > 0))

    // Load all industry aggregates
    supabase.from('crowd_insights')
      .select('*').order('contribution_count', { ascending: false })
      .then(({ data }) => {
        setIndustries(data || [])
        if (data && data.length > 0) setSelected(data[0])
        setLoading(false)
      })
  }, [user])

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'

  if (!isLoaded || !user) return null

  // Locked state — user has never opted in
  if (!hasOptedIn && !loading) {
    return (
      <div className={`min-h-screen ${base}`}>
        <Navbar />
        <main className="pt-24 px-6 max-w-lg mx-auto text-center">
          <div className={`p-10 rounded-2xl border ${card}`}>
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
              <Lock size={24} className="text-purple-500" />
            </div>
            <h1 className="text-xl font-bold mb-2">Crowd Insights Locked</h1>
            <p className={`text-sm leading-relaxed mb-6 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Crowd Insights is a shared intelligence pool built from anonymized contributions. To access it, contribute at least one dataset first — this keeps the pool fair and valuable for everyone.
            </p>
            <Link href="/projects/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors">
              <Users size={15} />
              Upload & Opt In to Unlock
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">

        {/* Header */}
        <div className="mt-6 mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Crowd Insights</h1>
            <p className={`text-sm ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Anonymized industry aggregates built from {industries.reduce((sum, i) => sum + i.contribution_count, 0)} contributions across {industries.length} industries
            </p>
          </div>
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${dark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
            <RefreshCw size={11} />
            Updated in real-time
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : industries.length === 0 ? (
          <div className={`p-10 rounded-2xl border text-center ${card}`}>
            <p className={`text-sm ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              No crowd data yet. Be the first to contribute by opting in on your next upload.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Industry List */}
            <div className="lg:col-span-1 space-y-2">
              {industries.map(ind => (
                <button key={ind.id}
                  onClick={() => setSelected(ind)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all
                    ${selected?.id === ind.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : dark ? `border-zinc-800 hover:border-zinc-700 ${card}` : `border-zinc-200 hover:border-zinc-300 ${card}`}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{INDUSTRY_ICONS[ind.industry] || '📊'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{ind.industry}</p>
                      <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {ind.contribution_count} contribution{ind.contribution_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: INDUSTRY_COLORS[ind.industry] || '#94a3b8' }} />
                  </div>
                </button>
              ))}
            </div>

            {/* Industry Detail */}
            {selected && (
              <div className="lg:col-span-2 space-y-4">

                {/* Header */}
                <div className={`p-5 rounded-2xl border ${card}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{INDUSTRY_ICONS[selected.industry] || '📊'}</span>
                    <div>
                      <h2 className="text-xl font-bold">{selected.industry}</h2>
                      <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Aggregate from {selected.contribution_count} anonymous contribution{selected.contribution_count !== 1 ? 's' : ''}
                        {' · '}Last updated {new Date(selected.last_updated).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Metric Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Avg Revenue Growth', value: selected.metrics?.avg_revenue_growth, suffix: '%', icon: TrendingUp },
                      { label: 'Avg Conversion Rate', value: selected.metrics?.avg_conversion_rate, suffix: '%', icon: TrendingUp },
                      { label: 'Avg Customer Growth', value: selected.metrics?.avg_customer_growth, suffix: '%', icon: TrendingUp },
                    ].map(({ label, value, suffix, icon: Icon }) => (
                      <div key={label} className={`p-3 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
                        <p className={`text-xs mb-1 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>{label}</p>
                        <p className="text-lg font-bold">
                          {value !== null && value !== undefined ? `${value}${suffix}` : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart */}
                {industries.length > 1 && (
                  <div className={`p-5 rounded-2xl border ${card}`}>
                    <h3 className="font-semibold text-sm mb-4">Conversion Rate by Industry</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={industries.map(i => ({
                        name: i.industry.length > 10 ? i.industry.slice(0, 10) + '…' : i.industry,
                        value: i.metrics?.avg_conversion_rate || 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#27272a' : '#f4f4f5'} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: dark ? '#71717a' : '#a1a1aa' }} />
                        <YAxis tick={{ fontSize: 10, fill: dark ? '#71717a' : '#a1a1aa' }} />
                        <Tooltip contentStyle={{ background: dark ? '#18181b' : '#fff', border: 'none', borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}
                          fill={INDUSTRY_COLORS[selected.industry] || '#3b82f6'} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Trends */}
                {selected.metrics?.top_trends?.length > 0 && (
                  <div className={`p-5 rounded-2xl border ${card}`}>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <TrendingUp size={14} className="text-blue-500" /> Observed Trends
                    </h3>
                    <ul className="space-y-2">
                      {selected.metrics.top_trends.map((t: string, i: number) => (
                        <li key={i} className={`flex items-start gap-2 text-sm ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Insights */}
                {selected.metrics?.key_insights?.length > 0 && (
                  <div className={`p-5 rounded-2xl border ${card}`}>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Lightbulb size={14} className="text-amber-400" /> Key Insights
                    </h3>
                    <ul className="space-y-2">
                      {selected.metrics.key_insights.map((insight: string, i: number) => (
                        <li key={i} className={`flex items-start gap-2 text-sm ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}