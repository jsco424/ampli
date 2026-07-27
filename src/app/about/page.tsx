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
    light: 'bg-blue-50 border-blue-200',
    dark: 'bg-blue-500/10 border-blue-500/20',
    text: 'text-blue-600',
    textDark: 'text-blue-400',
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
      <main className="pt-24 pb-24">
        {/* Hero — what ampli is, plain and upfront */}
        <section className="px-6 max-w-5xl mx-auto mb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6 tracking-wide ${dark ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600'}`}
              >
                <Sparkles size={11} />
                What is ampli
              </div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.1] mb-5">
                Stories, not spreadsheets.
              </h1>
              <p className={`text-lg leading-relaxed mb-8 ${muted}`}>
                ampli turns a raw spreadsheet into a verified, branded story in under a minute.
                Built for the people who live in data but present to people, not for one more chat
                window.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/projects/new"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-400 transition-colors shadow-lg shadow-blue-500/20"
                >
                  Start a Project <ArrowRight size={15} />
                </Link>
                <a
                  href="#why-ampli"
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl border text-sm font-medium transition-colors ${dark ? 'border-white/10 text-white/70 hover:bg-white/5' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                >
                  Why not just prompt it myself
                </a>
              </div>
            </div>

            {/* Decorative icon collage, standing in for a data stack graphic */}
            <div className="relative h-72 hidden lg:block">
              <div
                className={`absolute inset-0 m-auto w-56 h-56 rounded-full ${dark ? 'bg-blue-500/[0.06]' : 'bg-blue-50'}`}
              />
              <div
                className={`absolute top-2 right-6 w-24 h-24 rounded-3xl border flex items-center justify-center ${dark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}
              >
                <UploadCloud size={30} className={dark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div
                className={`absolute top-24 left-2 w-28 h-28 rounded-3xl border flex items-center justify-center ${dark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}
              >
                <Shield size={34} className={dark ? 'text-emerald-400' : 'text-emerald-600'} />
              </div>
              <div
                className={`absolute bottom-8 right-16 w-24 h-24 rounded-3xl border flex items-center justify-center ${dark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'}`}
              >
                <BarChart2 size={28} className={dark ? 'text-red-400' : 'text-red-600'} />
              </div>
              <div
                className={`absolute bottom-0 left-20 w-20 h-20 rounded-3xl border flex items-center justify-center ${dark ? 'bg-purple-500/10 border-purple-500/20' : 'bg-purple-50 border-purple-200'}`}
              >
                <Presentation size={24} className={dark ? 'text-purple-400' : 'text-purple-600'} />
              </div>
            </div>
          </div>
        </section>

        {/* Data flow — the pipeline, visually */}
        <section className="px-6 max-w-5xl mx-auto mb-20">
          <div className="text-center mb-10">
            <p
              className={`text-xs font-semibold uppercase tracking-widest mb-2 ${dark ? 'text-blue-400' : 'text-blue-600'}`}
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
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${dark ? accent.dark : accent.light}`}
                    >
                      <Icon size={17} className={dark ? accent.textDark : accent.text} />
                    </div>
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
        <section id="why-ampli" className="px-6 max-w-5xl mx-auto mb-20 pt-8">
          <div className="text-center mb-10">
            <p
              className={`text-xs font-semibold uppercase tracking-widest mb-2 ${dark ? 'text-blue-400' : 'text-blue-600'}`}
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
              const isWide = i === 3
              return (
                <div
                  key={i}
                  className={`p-6 rounded-2xl border ${card} ${isWide ? 'sm:col-span-2' : ''}`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 border ${dark ? accent.dark : accent.light}`}
                  >
                    <Icon size={17} className={dark ? accent.textDark : accent.text} />
                  </div>
                  <h3 className="font-bold text-base mb-2">{p.title}</h3>
                  <p className={`text-sm leading-relaxed ${muted}`}>{p.description}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Comparison */}
        <section className="px-6 max-w-5xl mx-auto mb-20">
          <div className="text-center mb-8">
            <p
              className={`text-xs font-semibold uppercase tracking-widest mb-2 ${dark ? 'text-blue-400' : 'text-blue-600'}`}
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
                  className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-blue-400' : 'text-blue-600'}`}
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
        <section className="px-6 max-w-2xl mx-auto">
          <div className={`relative p-10 rounded-3xl border text-center overflow-hidden ${card}`}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-96 h-48 rounded-full"
                style={{
                  background: 'radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)',
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
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-400 transition-colors shadow-lg shadow-blue-500/20"
              >
                Start a Project <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
