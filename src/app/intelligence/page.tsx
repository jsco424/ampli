'use client'

import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import IntelligencePreview from '@/components/IntelligencePreview'
import { useTheme } from '@/hooks/useTheme'
import { TrendingUp, Building2, Users } from 'lucide-react'
import Link from 'next/link'

// Was a pure redirect straight to /trends with zero content — replaced
// with an actual breakdown, since landing here with no explanation at all
// wastes the chance to show someone what's actually in the hub before they
// click into a specific section.
//
// The top pill subnav (IntelligenceSubNav) was removed from this page —
// the three cards below now ARE the navigation into each section, so a
// second redundant nav bar above them just duplicated the same three
// destinations.
export default function IntelligenceHubPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  if (!isLoaded || !user) return null

  const cards = [
    {
      icon: TrendingUp,
      title: 'User Behavior',
      description:
        'Real-time public interest tracking — Wikipedia and YouTube signal for any topic, company, or competitor.',
      href: '/trends',
    },
    {
      icon: Building2,
      title: 'Company Benchmarks',
      description: 'Your own metrics, trended over time. Coming soon.',
      href: '/intelligence/company-benchmarks',
    },
    {
      icon: Users,
      title: 'Crowd Insights',
      description:
        'Anonymized industry benchmarks pooled from real contributions across every industry.',
      href: '/crowd',
    },
  ]

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

        {/* Quick-nav cards — every card is now a real Link, since all three
            sections have a live destination. Icons render plain (no colored
            box), same treatment as the Pillars/Pipeline cards on About. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {cards.map((c) => {
            const Icon = c.icon
            return (
              <Link key={c.title} href={c.href}>
                <div
                  className={`p-5 rounded-2xl border h-full ${card} hover:border-[#5DCAA5]/40 transition-colors`}
                >
                  <Icon size={26} strokeWidth={2.25} className="text-[#5DCAA5] mb-3" />
                  <p className="font-semibold text-sm mb-1">{c.title}</p>
                  <p className={`text-xs leading-relaxed ${muted}`}>{c.description}</p>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Interactive preview — same component used on the public landing
            page, but in 'hub' mode so the active tab shows a real "Open"
            link into that section */}
        <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${muted}`}>Explore</p>
        <IntelligencePreview dark={dark} variant="hub" />
      </main>
    </div>
  )
}
