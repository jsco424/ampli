'use client'

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import IntelligencePreview, { type SectionKey } from '@/components/IntelligencePreview'
import { useTheme } from '@/hooks/useTheme'
import { TrendingUp, Building2, Users } from 'lucide-react'

// Was a pure redirect straight to /trends with zero content — replaced
// with an actual breakdown, since landing here with no explanation at all
// wastes the chance to show someone what's actually in the hub before they
// click into a specific section.
//
// The top pill subnav (IntelligenceSubNav) was removed from this page —
// the three cards below now ARE the navigation. They no longer link out to
// separate pages either: clicking one just sets which tab is active in the
// Explore preview further down THIS page and scrolls it into view, so the
// hub itself is always the view, regardless of which of the three features
// is selected. (The "Open" button inside Explore still goes to the real
// dedicated page for whichever section is active — that's a distinct,
// deliberate action, not something that happens from a card click.)
export default function IntelligenceHubPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<SectionKey>('behavior')
  const exploreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  if (!isLoaded || !user) return null

  const cards: { key: SectionKey; icon: typeof TrendingUp; title: string; description: string }[] =
    [
      {
        key: 'behavior',
        icon: TrendingUp,
        title: 'User Behavior',
        description:
          'Real-time public interest tracking — Wikipedia and YouTube signal for any topic, company, or competitor.',
      },
      {
        key: 'benchmarks',
        icon: Building2,
        title: 'Company Benchmarks',
        description: 'Your own metrics, trended over time. Coming soon.',
      },
      {
        key: 'crowd',
        icon: Users,
        title: 'Crowd Insights',
        description:
          'Anonymized industry benchmarks pooled from real contributions across every industry.',
      },
    ]

  const selectSection = (key: SectionKey) => {
    setActiveSection(key)
    exploreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />

      <main className="px-6 max-w-5xl mx-auto pb-20 pt-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Intelligence</h1>
          <p className={`text-sm ${muted}`}>
            Everything ampli knows beyond what's in your own uploaded data — public interest
            signals, your own history, and pooled industry benchmarks.
          </p>
        </div>

        {/* Quick-nav cards — buttons, not links. Selecting one sets the
            active tab in the Explore preview below and scrolls to it,
            rather than navigating to a separate page. The selected card
            gets a green ring so it's clear which one is currently showing
            in Explore. Icons render plain (no colored box), same treatment
            as the Pillars/Pipeline cards on About. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {cards.map((c) => {
            const Icon = c.icon
            const isActive = activeSection === c.key
            return (
              <button
                key={c.key}
                onClick={() => selectSection(c.key)}
                className={`text-left p-5 rounded-2xl border h-full transition-colors ${card} ${
                  isActive ? 'border-[#5DCAA5]' : 'hover:border-[#5DCAA5]/40'
                }`}
              >
                <Icon size={26} strokeWidth={2.25} className="text-[#5DCAA5] mb-3" />
                <p className="font-semibold text-sm mb-1">{c.title}</p>
                <p className={`text-xs leading-relaxed ${muted}`}>{c.description}</p>
              </button>
            )
          })}
        </div>

        {/* Interactive preview — same component used on the public landing
            page, but in 'hub' mode so the active tab shows a real "Open"
            link into that section. Active tab is controlled from this page
            (via the cards above), not managed internally. */}
        <div ref={exploreRef}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${muted}`}>Explore</p>
          <IntelligencePreview
            dark={dark}
            variant="hub"
            active={activeSection}
            onActiveChange={setActiveSection}
          />
        </div>
      </main>
    </div>
  )
}
