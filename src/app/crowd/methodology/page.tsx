'use client'

import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { ArrowLeft, ShieldCheck, Users, Layers, Sigma, Tags, Lightbulb, Lock } from 'lucide-react'

export default function CrowdMethodologyPage() {
  const { dark } = useTheme()

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-[#080C14]'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/50' : 'text-zinc-500'

  const sections = [
    {
      icon: Lock,
      title: 'What actually leaves your account',
      body: 'Only pre aggregated numbers ever reach the shared pool. Raw rows, company names, and any identifying detail stay in your own account and are never sent anywhere. What does leave is a pre computed summary, the same kind of totals and averages your own dashboard already shows you, with every name and label stripped out first.',
    },
    {
      icon: Users,
      title: 'How you join the pool',
      body: 'Crowd Insights is available on the Business plan, and only unlocks once you have opted in on 5 uploads. That threshold exists so the pool stays fair. It is built from real contributions, not a handful of early adopters carrying the weight for everyone else.',
    },
    {
      icon: Tags,
      title: 'How your industry is chosen',
      body: 'Each upload is classified into one of a fixed set of industries, Retail, Healthcare, Technology, and so on, based on the anonymized data summary alone, never your company name or any identifying detail. If your data plausibly fits an industry that already has contributions, it joins that same bucket instead of starting a new one.',
    },
    {
      icon: Sigma,
      title: 'How the numbers are actually combined',
      body: 'Every contribution adds its raw totals into a running pool, and the displayed average is calculated fresh from those true combined totals every time, never by averaging the individual averages that came before it. That distinction matters. Averaging averages quietly overweights small contributions and underweights large ones, the same way averaging two batting averages by games played gives a different, wrong number than combining the actual hits and at bats. This app always does the latter.',
    },
    {
      icon: Layers,
      title: 'Which breakdowns are shown, and which are not',
      body: 'Only a small set of common business dimensions are pooled: region, state, sales channel, sales stage, ad format, audience type, campaign objective, product category, customer segment, and device or platform. Anything else in your file, like an internal product code or an account name, is never pooled, even anonymized, because it would not mean the same thing across two different companies. A breakdown is also skipped entirely if one value makes up almost all of it, or if it has far more distinct values than that kind of field should reasonably have. Both are signs it is not a genuine, comparable segment.',
    },
    {
      icon: ShieldCheck,
      title: 'Extra protection against small numbers',
      body: 'A specific category, like one state or one sales stage, is only ever shown once at least 2 separate companies have contributed to it. A single contributor sitting alone in a category is not a benchmark, it is closer to identifying that one company, so it stays hidden until another company sits alongside it. Row counts shown next to a stat are also rounded, so an exact figure can never be used to guess at the size of any one contributor.',
    },
    {
      icon: Lightbulb,
      title: 'Observed trends and key insights',
      body: 'The short trend and insight sentences you see per industry are written by AI from the anonymized numbers only, with an explicit instruction to strip out any brand, company, or product name before writing. Each new sentence is also checked against what has already been said for that industry, so the same observation is not just reworded and repeated every time a similar contribution comes in.',
    },
  ]

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-24 px-6 max-w-3xl mx-auto pb-20">
        <Link
          href="/crowd"
          className={`inline-flex items-center gap-1.5 text-xs font-medium mb-6 ${muted} hover:text-[#5DCAA5] transition-colors`}
        >
          <ArrowLeft size={13} />
          Back to Crowd Insights
        </Link>

        <h1 className="text-2xl font-bold tracking-tight mb-2">How Crowd Insights Works</h1>
        <p className={`text-sm leading-relaxed mb-10 ${muted}`}>
          Crowd Insights shows how your numbers compare to anonymized, pooled data from other
          companies in your industry. Here is exactly what powers it, so you know what you are
          looking at and how your own data is protected along the way.
        </p>

        <div className="space-y-4">
          {sections.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.title} className={`p-5 rounded-2xl border ${card}`}>
                <div className="flex items-start gap-3">
                  <Icon size={22} strokeWidth={2.25} className="text-[#5DCAA5] mt-0.5 shrink-0" />
                  <div>
                    <h2 className="font-semibold text-sm mb-1.5">{s.title}</h2>
                    <p className={`text-sm leading-relaxed ${muted}`}>{s.body}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div
          className={`mt-8 p-5 rounded-2xl border ${dark ? 'bg-[#5DCAA5]/[0.06] border-[#5DCAA5]/20' : 'bg-[#5DCAA5]/10 border-[#5DCAA5]'}`}
        >
          <p
            className={`text-xs leading-relaxed ${dark ? 'text-[#5DCAA5]/80' : 'text-[#080C14]/70'}`}
          >
            None of this can be reverse engineered back to a single company. Every number shown is a
            pooled total from multiple contributors, every identifying detail is stripped before
            anything leaves your account, and any category too thin to protect on its own simply
            stays hidden until it is not.
          </p>
        </div>
      </main>
    </div>
  )
}
