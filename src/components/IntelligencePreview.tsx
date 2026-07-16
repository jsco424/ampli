'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Users,
  ArrowRight,
  BarChart2,
} from 'lucide-react'

type SectionKey = 'behavior' | 'benchmarks' | 'crowd'

const SECTIONS: {
  key: SectionKey
  label: string
  shortLabel: string
  description: string
  href: string | null // null = not built yet, no real destination
}[] = [
  {
    key: 'behavior',
    label: 'User Behavior',
    shortLabel: 'Behavior',
    description:
      'Real-time public interest tracking — Wikipedia and YouTube signal for any topic, company, or competitor, updated daily.',
    href: '/trends',
  },
  {
    key: 'benchmarks',
    label: 'Company Benchmarks',
    shortLabel: 'Benchmarks',
    description:
      "Your own metrics, trended over time. Pick which numbers matter to you and watch your company's own history unfold.",
    href: null,
  },
  {
    key: 'crowd',
    label: 'Crowd Insights',
    shortLabel: 'Crowd',
    description:
      'Anonymized industry benchmarks pooled from real contributions — see how your numbers stack up against your peers.',
    href: '/crowd',
  },
]

// ── Mock visuals — hand-built with divs/CSS, same pattern as the landing
// page's existing "Product preview" mockup section, not real screenshots.
// Each roughly matches the real page's actual visual language (score +
// delta for Behavior, industry cards for Crowd, metric picker + trend line
// for the not-yet-built Benchmarks) so this reads as a genuine preview
// rather than a generic placeholder.

function BehaviorMock({ dark }: { dark: boolean }) {
  const topics = [
    { name: 'Tesla Model 3', score: 87, delta: 12 },
    { name: 'Electric Vehicle Tax Credit', score: 64, delta: -4 },
    { name: 'Used Car Prices', score: 52, delta: 2 },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {topics.map((t) => (
        <div
          key={t.name}
          className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
        >
          <p
            className={`text-[11px] font-medium mb-1.5 truncate ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}
          >
            {t.name}
          </p>
          <div className="flex items-end gap-1.5">
            <span className="text-xl font-black">{t.score}</span>
            <span
              className={`flex items-center gap-0.5 text-[11px] font-medium mb-0.5 ${t.delta > 0 ? 'text-emerald-500' : 'text-red-400'}`}
            >
              {t.delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {t.delta > 0 ? '+' : ''}
              {t.delta}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function BenchmarksMock({ dark }: { dark: boolean }) {
  const chips = ['Conversion Rate', 'Revenue Growth', 'Customer Growth']
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((c, i) => (
          <span
            key={c}
            className={`text-[11px] px-2.5 py-1 rounded-full border ${
              i === 0
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : dark
                  ? 'border-white/10 text-zinc-400'
                  : 'border-zinc-200 text-zinc-500'
            }`}
          >
            {c}
          </span>
        ))}
      </div>
      <div
        className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
      >
        <p className={`text-[11px] mb-3 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Conversion Rate — last 6 uploads
        </p>
        <div className="flex items-end gap-2 h-16">
          {[40, 45, 42, 58, 61, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-blue-500/60"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CrowdMock({ dark }: { dark: boolean }) {
  const rows = [
    { label: 'Avg Conversion Rate', value: '3.2%' },
    { label: 'Avg Revenue Growth', value: '+14%' },
    { label: 'Avg Customer Growth', value: '+9%' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {rows.map((r) => (
        <div
          key={r.label}
          className={`p-3 rounded-xl border ${dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-zinc-200'}`}
        >
          <p className={`text-[11px] mb-1.5 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {r.label}
          </p>
          <p className="text-xl font-black">{r.value}</p>
        </div>
      ))}
    </div>
  )
}

interface Props {
  dark?: boolean
  // 'marketing' = public landing page, no real navigation (visitor isn't
  // signed in yet). 'hub' = signed-in /intelligence overview, shows a real
  // "Open" link into the actual page for sections that exist.
  variant: 'marketing' | 'hub'
}

export default function IntelligencePreview({ dark = false, variant }: Props) {
  const [active, setActive] = useState<SectionKey>('behavior')
  const activeSection = SECTIONS.find((s) => s.key === active)!

  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-zinc-50 border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  return (
    <div className={`rounded-2xl border overflow-hidden ${card}`}>
      {/* Fake browser chrome — same pattern as the landing page's existing
          product preview mockup, for visual consistency */}
      <div
        className={`flex items-center gap-1.5 px-4 py-3 border-b ${dark ? 'border-white/10 bg-white/[0.02]' : 'border-zinc-200 bg-white'}`}
      >
        <div className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
        <div className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
        <div className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
        <div
          className={`flex-1 mx-4 h-6 rounded-md flex items-center px-3 ${dark ? 'bg-white/5' : 'bg-zinc-100'}`}
        >
          <span className={`text-xs ${muted}`}>
            am-pli.com/{activeSection.href ? activeSection.href.replace('/', '') : 'intelligence'}
          </span>
        </div>
      </div>

      {/* Tab switcher */}
      <div
        className={`flex gap-1 p-3 border-b ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
      >
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              active === s.key
                ? dark
                  ? 'bg-white/10 text-white'
                  : 'bg-zinc-900 text-white'
                : dark
                  ? 'text-white/40 hover:text-white/70'
                  : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {s.shortLabel}
            {!s.href && <span className="ml-1.5 text-[9px] opacity-60">Soon</span>}
          </button>
        ))}
      </div>

      {/* Active section content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="font-semibold text-sm mb-1">{activeSection.label}</p>
            <p className={`text-xs leading-relaxed ${muted}`}>{activeSection.description}</p>
          </div>
          {variant === 'hub' && activeSection.href && (
            <Link
              href={activeSection.href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-400 transition-colors shrink-0"
            >
              Open <ArrowRight size={12} />
            </Link>
          )}
        </div>

        {active === 'behavior' && <BehaviorMock dark={dark} />}
        {active === 'benchmarks' && <BenchmarksMock dark={dark} />}
        {active === 'crowd' && <CrowdMock dark={dark} />}
      </div>
    </div>
  )
}
