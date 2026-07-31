'use client'

import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import {
  Shield,
  Clock,
  Lock,
  BarChart2,
  Layers,
  Check,
  X,
  ArrowRight,
  Sparkles,
  UploadCloud,
  Presentation,
  Globe2,
} from 'lucide-react'

const FLOW_STEPS = [
  {
    icon: UploadCloud,
    accent: 'blue',
    title: 'Your data',
    description: 'Upload a spreadsheet. No cleanup and no template required.',
  },
  {
    icon: Shield,
    accent: 'emerald',
    title: 'Verified analysis',
    description: 'Every number is checked against your raw data before anyone sees it.',
  },
  {
    icon: BarChart2,
    accent: 'red',
    title: 'Crowd benchmarks',
    description: 'Compared against real, pooled results across your industry.',
  },
  {
    icon: Presentation,
    accent: 'purple',
    title: 'A branded story',
    description: 'Exported in your own colors, ready to present or send.',
  },
]

const PILLARS = [
  {
    icon: Shield,
    accent: 'blue',
    title: 'Every number is checked, not guessed',
    description:
      'AI narrates results that are already computed and checked against your raw data in code. It never does the arithmetic itself. See the exact math behind any hero stat with the Show the math button. A plain chat session doing the calculation inside the model is the difference between provably right and probably right.',
  },
  {
    icon: Clock,
    accent: 'amber',
    title: 'Hours back, not minutes saved',
    description:
      'Prompting, then prompting again to fix the framing, then building slides by hand can take several hours per deck. ampli runs the full pipeline, from verified analysis to a branded export, in under a minute.',
  },
  {
    icon: Lock,
    accent: 'emerald',
    title: 'Your client data stays yours',
    description:
      "Pasting a client's campaign data into a consumer chat tool comes with no clear guarantee about how it's used or stored. ampli is built to handle client data professionally, not as a side effect of a general chat window.",
  },
  {
    icon: BarChart2,
    accent: 'red',
    title: 'Data no prompt can produce',
    description:
      "See how your numbers compare to real, pooled, anonymized results across your industry. This dataset simply does not exist anywhere outside ampli's own Crowd Insights pool, no matter how good the prompt is.",
  },
  {
    icon: Layers,
    accent: 'purple',
    title: 'One pipeline, not five tools',
    description:
      'Cleaning data in one tool, writing in another, and building slides in a third means the final result has no single, coherent voice. ampli keeps analysis, brand, and export in one connected place every time, instead of reassembled by hand each session.',
  },
]

const ACCENT_STYLES: Record<
  string,
  { light: string; dark: string; text: string; textDark: string }
> = {
  blue: {
    light: 'bg-[#5DCAA5]/10 border-[#5DCAA5]/30',
    dark: 'bg-[#5DCAA5]/10 border-[#5DCAA5]/20',
    text: 'text-[#3DA37D]',
    textDark: 'text-[#5DCAA5]',
  },
  amber: {
    light: 'bg-amber-50 border-amber-200',
    dark: 'bg-amber-500/10 border-amber-500/20',
    text: 'text-amber-600',
    textDark: 'text-amber-400',
  },
  emerald: {
    light: 'bg-emerald-50 border-emerald-200',
    dark: 'bg-emerald-500/10 border-emerald-500/20',
    text: 'text-emerald-600',
    textDark: 'text-emerald-400',
  },
  red: {
    light: 'bg-red-50 border-red-200',
    dark: 'bg-red-500/10 border-red-500/20',
    text: 'text-red-600',
    textDark: 'text-red-400',
  },
  purple: {
    light: 'bg-purple-50 border-purple-200',
    dark: 'bg-purple-500/10 border-purple-500/20',
    text: 'text-purple-600',
    textDark: 'text-purple-400',
  },
}

const COMPARISON_ROWS = [
  {
    label: 'Time per deck',
    diy: 'Several hours of prompting and manual slide building',
    ampli: 'Under a minute, start to finish',
  },
  {
    label: 'Number accuracy',
    diy: 'The model does the math and can be confidently wrong',
    ampli: 'Every figure checked against your raw data',
  },
  {
    label: 'Client data handling',
    diy: 'No clear guarantee on how uploaded data is used or stored',
    ampli: 'Built for professional client data, not a chat window side effect',
  },
  {
    label: 'Industry benchmarking',
    diy: 'Not possible. This comparison data does not exist to prompt with',
    ampli: 'Real, pooled, anonymized benchmarks included automatically',
  },
  {
    label: 'Brand consistency',
    diy: 'Explain your colors, tone, and logo again every session',
    ampli: 'Applied automatically to every export, every time',
  },
  {
    label: 'Tooling',
    diy: 'Cleanup, writing, and slides split across separate tools',
    ampli: 'One connected pipeline, one consistent voice',
  },
]

// Bottom footer — matches the landing page's Company/Legal grouping.
// No "Product" group here since this page has no anchored sections of
// its own to point at. Real destinations only where pages exist, an
// honest "Soon" tag everywhere else rather than a dead link.
const FOOTER_GROUPS: {
  heading: string
  items: { label: string; href: string; comingSoon?: boolean; external?: boolean }[]
}[] = [
  {
    heading: 'Company',
    items: [
      { label: 'Careers', href: '#', comingSoon: true },
      { label: 'Press', href: '#', comingSoon: true },
      { label: 'Contact', href: 'mailto:support@am-pli.com', external: true },
    ],
  },
  {
    heading: 'Legal',
    items: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '#', comingSoon: true },
    ],
  },
]

export default function AboutPage() {
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

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />

      {/* ── Hero — full bleed green band starting from the very top of the
          page, so it fills the space behind the fixed, translucent Navbar
          too, not just the content below it. ─────────────────────────── */}
      <section className="relative bg-[#5DCAA5] pt-28 pb-20 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#080C14] text-white text-xs font-semibold mb-6 tracking-wide">
                <Sparkles size={11} />
                What is ampli
              </div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.1] mb-5 text-[#080C14]">
                Stories, not spreadsheets.
              </h1>
              <p className="text-lg leading-relaxed mb-8 text-[#080C14]/70">
                ampli turns a raw spreadsheet into a verified, branded story in under a minute.
                Built for the people who live in data but present to people, not for one more chat
                window.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/projects/new"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#080C14] text-white font-semibold text-sm hover:bg-[#0F1420] transition-colors shadow-lg shadow-black/10"
                >
                  Start a Project <ArrowRight size={15} />
                </Link>
                <a
                  href="#why-ampli"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#080C14]/20 bg-white/40 text-[#080C14] hover:bg-white/70 transition-colors text-sm font-medium"
                >
                  Why not just prompt it myself
                </a>
              </div>
            </div>

            {/* Abstract product glimpse — a stylized card combining a
                prompt bar, stat blocks, a bar chart, and a company
                research row. Deliberately abstract (shapes and blocks,
                not literal ampli UI or real copy) rather than a pixel
                accurate screenshot. */}
            <div className="relative hidden lg:block">
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-black/10 p-5 rotate-1">
                {/* Prompt bar */}
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#5DCAA5] shrink-0" />
                  <div className="h-2 flex-1 rounded-full bg-zinc-200" />
                  <div className="w-12 h-5 rounded-md bg-[#080C14] shrink-0" />
                </div>

                {/* Stat blocks */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="p-2.5 rounded-lg bg-[#5DCAA5]/10">
                    <div className="h-1.5 w-7 rounded-full bg-[#5DCAA5]/40 mb-2" />
                    <div className="h-3 w-9 rounded bg-[#3DA37D]" />
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#F4A7B9]/10">
                    <div className="h-1.5 w-7 rounded-full bg-[#F4A7B9]/50 mb-2" />
                    <div className="h-3 w-9 rounded bg-[#F4A7B9]" />
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-50">
                    <div className="h-1.5 w-7 rounded-full bg-zinc-200 mb-2" />
                    <div className="h-3 w-9 rounded bg-[#080C14]" />
                  </div>
                </div>

                {/* Abstract bar chart */}
                <div className="flex items-end gap-1.5 h-16 mb-4 px-0.5">
                  {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${h}%`,
                        background: i % 3 === 0 ? '#5DCAA5' : i % 3 === 1 ? '#F4A7B9' : '#080C14',
                        opacity: i % 3 === 2 ? 0.9 : 1,
                      }}
                    />
                  ))}
                </div>

                {/* Company research row */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-100">
                  <Globe2 size={12} className="text-zinc-400 shrink-0" />
                  <div className="h-2 flex-1 rounded-full bg-zinc-100" />
                  <div className="h-2 w-8 rounded-full bg-zinc-100" />
                </div>
              </div>

              {/* Floating accent badges around the card, for depth */}
              <div className="absolute -top-4 -right-4 w-14 h-14 rounded-2xl bg-[#080C14] flex items-center justify-center shadow-lg shadow-black/10 -rotate-6">
                <Shield size={20} className="text-white" />
              </div>
              <div className="absolute -bottom-4 -left-4 w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-black/10 rotate-6">
                <Presentation size={18} className="text-[#F4A7B9]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="px-6 max-w-5xl mx-auto pb-24">
        {/* Data flow — the pipeline, visually */}
        <section className="relative mb-20 mt-20">
          {/* Faint echo of the hero's abstract bar chart — subtle, not
              competing with the heading text sitting on top of it. */}
          <div className="absolute inset-x-0 top-0 flex items-end justify-center gap-2 h-24 opacity-[0.06] pointer-events-none -z-10">
            {[35, 60, 45, 75, 50, 85, 40, 65].map((h, i) => (
              <div
                key={i}
                className="w-6 rounded-t"
                style={{
                  height: `${h}%`,
                  background: i % 3 === 0 ? '#5DCAA5' : i % 3 === 1 ? '#F4A7B9' : '#080C14',
                }}
              />
            ))}
          </div>
          <div className="text-center mb-10">
            <p
              className={`text-xs font-semibold uppercase tracking-widest mb-2 ${dark ? 'text-[#5DCAA5]' : 'text-[#3DA37D]'}`}
            >
              The pipeline
            </p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              From spreadsheet to story
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FLOW_STEPS.map((step, i) => {
              const Icon = step.icon
              const accent = ACCENT_STYLES[step.accent]
              return (
                <div key={i} className="relative">
                  <div className={`p-5 rounded-2xl border h-full ${card}`}>
                    <Icon
                      size={24}
                      strokeWidth={2.25}
                      className={`mb-4 ${dark ? accent.textDark : accent.text}`}
                    />
                    <h3 className="font-bold text-sm mb-1.5">{step.title}</h3>
                    <p className={`text-xs leading-relaxed ${muted}`}>{step.description}</p>
                  </div>
                  {i < FLOW_STEPS.length - 1 && (
                    <ArrowRight
                      size={14}
                      className={`absolute top-1/2 -right-2 -translate-y-1/2 hidden lg:block z-10 ${dark ? 'text-white/20' : 'text-zinc-300'}`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Why ampli — the supporting detail, not the front door */}
        <section id="why-ampli" className="mb-20 pt-8">
          <div className="text-center mb-10">
            <p
              className={`text-xs font-semibold uppercase tracking-widest mb-2 ${dark ? 'text-[#5DCAA5]' : 'text-[#3DA37D]'}`}
            >
              A fair question
            </p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
              Why not just ask ChatGPT or Claude directly
            </h2>
            <p className={`text-base max-w-xl mx-auto ${muted}`}>
              A real answer, not because the AI is different inside ampli, but because of everything
              built around it.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PILLARS.map((p, i) => {
              const Icon = p.icon
              const accent = ACCENT_STYLES[p.accent]
              const isWide = i === 4
              return (
                <div
                  key={i}
                  className={`p-6 rounded-2xl border ${card} ${isWide ? 'sm:col-span-2' : ''}`}
                >
                  <Icon
                    size={26}
                    strokeWidth={2.25}
                    className={`mb-4 ${dark ? accent.textDark : accent.text}`}
                  />
                  <h3 className="font-bold text-base mb-2">{p.title}</h3>
                  <p className={`text-sm leading-relaxed ${muted}`}>{p.description}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Comparison */}
        <section className="mb-20">
          <div className="text-center mb-8">
            <p
              className={`text-xs font-semibold uppercase tracking-widest mb-2 ${dark ? 'text-[#5DCAA5]' : 'text-[#3DA37D]'}`}
            >
              Side by side
            </p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Doing it yourself vs ampli
            </h2>
          </div>

          <div className={`rounded-2xl border overflow-hidden ${card}`}>
            <div
              className={`grid grid-cols-[1fr_1.4fr_1.4fr] sm:grid-cols-[1fr_1.6fr_1.6fr] border-b ${dark ? 'border-white/[0.07]' : 'border-zinc-200'}`}
            >
              <div className="p-4" />
              <div className="p-4">
                <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
                  Doing it yourself
                </p>
              </div>
              <div className="p-4">
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-[#5DCAA5]' : 'text-[#3DA37D]'}`}
                >
                  With ampli
                </p>
              </div>
            </div>

            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1fr_1.4fr_1.4fr] sm:grid-cols-[1fr_1.6fr_1.6fr] ${
                  i < COMPARISON_ROWS.length - 1
                    ? `border-b ${dark ? 'border-white/[0.05]' : 'border-zinc-100'}`
                    : ''
                }`}
              >
                <div className="p-4 flex items-center">
                  <p className="text-sm font-semibold">{row.label}</p>
                </div>
                <div className="p-4 flex items-start gap-2">
                  <X size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className={`text-xs leading-relaxed ${muted}`}>{row.diy}</p>
                </div>
                <div className="p-4 flex items-start gap-2">
                  <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">{row.ampli}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-2xl mx-auto">
          <div className={`relative p-10 rounded-3xl border text-center overflow-hidden ${card}`}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-96 h-48 rounded-full"
                style={{
                  background: 'radial-gradient(ellipse, rgba(93,202,165,0.15) 0%, transparent 70%)',
                }}
              />
            </div>
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">
                See it on your own data
              </h2>
              <p className={`text-sm mb-6 max-w-md mx-auto ${muted}`}>
                Upload a real dataset and get a verified, branded story in under a minute. No prompt
                engineering required.
              </p>
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#080C14] text-white font-semibold text-sm hover:bg-[#0F1420] transition-colors shadow-lg shadow-black/10"
              >
                Start a Project <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer — matches the landing page's Company/Legal grouping,
          replacing the old right side menu entirely. ──────────────────── */}
      <footer className={`border-t px-6 py-14 ${dark ? 'border-white/[0.07]' : 'border-zinc-200'}`}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 mb-10">
            <div className="col-span-2 sm:col-span-1">
              <span className="text-base font-bold tracking-tight">
                <span className="text-[#5DCAA5]">a</span>
                <span className={dark ? 'text-white/70' : 'text-zinc-500'}>mp</span>
                <span className="text-[#F4A7B9]">-</span>
                <span className={dark ? 'text-white/70' : 'text-zinc-500'}>l</span>
                <span className="text-[#5DCAA5]">i</span>
              </span>
              <p className={`text-xs mt-2 leading-relaxed ${muted}`}>Stories, not spreadsheets.</p>
            </div>

            {FOOTER_GROUPS.map((group) => (
              <div key={group.heading}>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>
                  {group.heading}
                </p>
                <div className="space-y-2">
                  {group.items.map((item) =>
                    item.comingSoon ? (
                      <p
                        key={item.label}
                        className={`text-sm flex items-center gap-1.5 ${dark ? 'text-white/25' : 'text-zinc-300'}`}
                      >
                        {item.label}
                        <span
                          className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${dark ? 'bg-white/5 text-white/30' : 'bg-zinc-100 text-zinc-400'}`}
                        >
                          Soon
                        </span>
                      </p>
                    ) : item.external ? (
                      <a
                        key={item.label}
                        href={item.href}
                        className={`block text-sm transition-colors ${dark ? 'text-white/60 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={`block text-sm transition-colors ${dark ? 'text-white/60 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
                      >
                        {item.label}
                      </Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
          <div
            className={`pt-6 border-t text-xs ${dark ? 'border-white/[0.05] text-white/25' : 'border-zinc-100 text-zinc-400'}`}
          >
            {'\u00a9'} 2026 ampli. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
