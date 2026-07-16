'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart2,
  Sparkles,
  Globe,
  Users,
  FileText,
  ChevronRight,
  Check,
  Zap,
  Shield,
  TrendingUp,
  Play,
  UploadCloud,
  Target,
  Presentation,
  Download,
} from 'lucide-react'
import IntelligencePreview from '@/components/IntelligencePreview'

// Was a flat array of strings, with every item (including Pricing)
// rendered as a same-page anchor scroll: href={`#${label}`}. That's why
// Pricing looked unclickable — it was trying to scroll to a #pricing
// section that doesn't exist anywhere on this page. Now each item
// explicitly says whether it's a same-page anchor or a real route, so
// Pricing can correctly go to /pricing instead of nowhere.
//
// NOTE: 'Use Cases' and 'Blog' still point to anchors that don't exist on
// this page either (#use-cases, #blog) — same underlying bug, just not
// what was reported this time. Left as-is since only Pricing was raised,
// but worth fixing the same way whenever those sections get built.
const NAV_LINKS = [
  { label: 'Product', href: '#product', type: 'anchor' as const },
  { label: 'Use Cases', href: '#use-cases', type: 'anchor' as const },
  { label: 'Pricing', href: '/pricing', type: 'route' as const },
  { label: 'Blog', href: '#blog', type: 'anchor' as const },
]

const FEATURES = [
  {
    icon: UploadCloud,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    title: 'Upload any dataset',
    description:
      'Drop in a CSV or Excel file. ampli reads the structure, identifies the story inside, and gets to work instantly.',
  },
  {
    icon: Shield,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    title: 'Formula-verified, not guessed',
    description:
      'Every hero number is checked against the raw data with a deterministic formula pass — see a "Show the math" breakdown on any finding, not just an AI\'s word for it.',
  },
  {
    icon: Target,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    title: 'Audience-aware framing',
    description:
      'Select your target audience — CMO, VP of Data, Director of Analytics — and ampli tailors which findings it leads with and how it frames them, not just the prose around them.',
  },
  {
    icon: Sparkles,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    title: 'Dig deeper, conversationally',
    description:
      'Ask a follow-up question and get a real re-analysis, formula-verified the same as the original — not a canned response. Every thread stays selectable for your final deck.',
  },
  {
    icon: BarChart2,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    title: 'Crowd Insights benchmarking',
    description:
      'See how your numbers stack up against anonymized, pooled data across your industry — real aggregate benchmarks, not estimates.',
  },
  {
    icon: TrendingUp,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    title: 'Real-time public interest',
    description:
      'Pitching a specific company? ampli checks live public interest signals for them and their competitors, and weaves it in only where it genuinely strengthens your story.',
  },
  {
    icon: Globe,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    title: 'Company intelligence',
    description:
      'Research any company URL. Instant breakdown of products, competitors, and an audience map for every stakeholder.',
  },
  {
    icon: FileText,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    title: 'Your brand, every export',
    description:
      'Match your exact colors and logo automatically, or pick from a full theme library — every exported deck looks like it came from your own design team.',
  },
  {
    icon: Presentation,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    title: 'Pitch mode or export',
    description:
      'Full-screen presentation built for screen sharing, or export straight to PPTX/PDF with full history — every past export saved and re-downloadable anytime.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Research your target',
    description:
      'Paste any company URL. Get products, competitors, and a full audience map in seconds — plus real-time public interest signals for them and their competitors.',
  },
  {
    number: '02',
    title: 'Upload your data',
    description:
      'Drop in a CSV or Excel file, pick your target audience, and brief the AI on your angle and focus.',
  },
  {
    number: '03',
    title: 'Get a verified story',
    description:
      'Formula-checked findings, industry benchmarks from Crowd Insights, and audience-tailored framing. Ask follow-up questions to dig deeper — every answer stays verified.',
  },
  {
    number: '04',
    title: 'Present or export',
    description:
      'Hit Pitch Mode for a branded presentation, or export to PPTX/PDF with full history saved for every past deck.',
  },
]

const STATS = [
  { value: '10×', label: 'faster than manual decks' },
  { value: '6+', label: 'charts per project' },
  { value: '100%', label: 'audience-tailored output' },
  { value: '<30s', label: 'average generation time' },
]

const TESTIMONIALS = [
  {
    quote:
      'I used to spend half a day turning data into a deck. ampli does it in under a minute and the framing is actually better.',
    name: 'Sarah K.',
    role: 'Senior Insights Analyst, Fortune 500',
  },
  {
    quote:
      'The audience map feature is a game-changer. Every stakeholder gets a narrative built around what they actually care about.',
    name: 'Marcus T.',
    role: 'Director of Analytics, B2B SaaS',
  },
  {
    quote:
      "Finally, a tool that understands that data storytelling isn't just about charts — it's about who's in the room.",
    name: 'Priya M.',
    role: 'Head of Data & Insights, Agency',
  },
]

export default function LandingPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Logged-in users skip the landing page entirely
  useEffect(() => {
    if (isLoaded && user) router.push('/dashboard')
  }, [isLoaded, user, router])

  const handleDemo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  // Avoid flashing the landing page before redirect resolves
  if (!isLoaded || user) return null

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-8 border-b border-zinc-200 bg-white/90 backdrop-blur-xl">
        <Link href="/" className="flex flex-col leading-none">
          <span className="text-[17px] font-bold tracking-tight">
            <span className="text-blue-600">a</span>
            <span className="text-zinc-700">mp</span>
            <span className="text-blue-500">-</span>
            <span className="text-zinc-700">l</span>
            <span className="text-blue-600">i</span>
          </span>
          <span className="text-[9px] tracking-widest font-medium uppercase text-zinc-400">
            stories, not spreadsheets
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="px-4 py-1.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/15"
          >
            Request Demo <ArrowRight size={13} />
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Radial glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(59,130,246,0.08) 0%, transparent 70%)',
          }}
        />

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-600 text-xs font-semibold mb-8 tracking-wide">
            <Zap size={11} />
            AI-powered data storytelling for analysts
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-6 text-zinc-900">
            Turn raw data into
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent">
              stories that sell.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-zinc-500 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
            Ampli transforms raw data into branded sales stories tailored to{' '}
            <span className="text-blue-600 font-medium">your target account</span> and{' '}
            <span className="text-blue-600 font-medium">the decision makers who matter most</span>.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 text-sm"
            >
              Request a Demo <ArrowRight size={15} />
            </Link>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50 transition-all text-sm font-medium"
            >
              <Play size={13} /> See how it works
            </a>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-200 rounded-2xl overflow-hidden border border-zinc-200">
            {STATS.map((stat, i) => (
              <div key={i} className="bg-white px-6 py-5 text-center">
                <div className="text-3xl font-black text-zinc-900 mb-1">{stat.value}</div>
                <div className="text-xs text-zinc-400 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product preview ────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <div
          className="relative rounded-2xl border border-zinc-200 overflow-hidden bg-zinc-50"
          style={{ boxShadow: '0 40px 120px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02)' }}
        >
          {/* Top accent */}
          <div className="h-0.5 w-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600" />

          {/* Fake browser chrome */}
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-200 bg-white">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
            <div className="flex-1 mx-4 h-6 rounded-md bg-zinc-100 flex items-center px-3">
              <span className="text-xs text-zinc-400">app.ampli.ai/projects/q4-analysis</span>
            </div>
          </div>

          {/* Mock dashboard */}
          <div className="p-6 bg-white">
            {/* Mock header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="h-5 w-48 bg-zinc-100 rounded-lg mb-2" />
                <div className="h-3 w-32 bg-zinc-50 rounded-lg" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-24 bg-zinc-50 rounded-lg border border-zinc-200" />
                <div className="h-8 w-24 bg-blue-50 rounded-lg border border-blue-200" />
              </div>
            </div>

            {/* Mock insight cards */}
            <div className="grid grid-cols-5 gap-3 mb-6">
              {[
                {
                  label: 'Revenue Growth',
                  value: '+24%',
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-50',
                  border: 'border-emerald-200',
                },
                {
                  label: 'Conversion Rate',
                  value: '3.8%',
                  color: 'text-blue-600',
                  bg: 'bg-blue-50',
                  border: 'border-blue-200',
                },
                {
                  label: 'Avg Deal Size',
                  value: '$48K',
                  color: 'text-purple-600',
                  bg: 'bg-purple-50',
                  border: 'border-purple-200',
                },
                {
                  label: 'Pipeline Velocity',
                  value: '↑ 18%',
                  color: 'text-amber-600',
                  bg: 'bg-amber-50',
                  border: 'border-amber-200',
                },
                {
                  label: 'Win Rate',
                  value: '62%',
                  color: 'text-cyan-600',
                  bg: 'bg-cyan-50',
                  border: 'border-cyan-200',
                },
              ].map((card, i) => (
                <div key={i} className={`p-3 rounded-xl border ${card.bg} ${card.border}`}>
                  <div className="text-xs mb-2 text-zinc-400">{card.label}</div>
                  <div className={`text-xl font-black ${card.color}`}>{card.value}</div>
                </div>
              ))}
            </div>

            {/* Mock charts row */}
            <div className="grid grid-cols-3 gap-3">
              {/* Bar chart mock */}
              <div className="col-span-2 p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                <div className="h-3 w-32 bg-zinc-200 rounded mb-1" />
                <div className="h-2 w-48 bg-zinc-100 rounded mb-4" />
                <div className="flex items-end gap-2 h-24">
                  {[65, 40, 80, 55, 90, 70, 85, 60].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm"
                      style={{
                        height: `${h}%`,
                        background: i % 2 === 0 ? 'rgba(37,99,235,0.7)' : 'rgba(139,92,246,0.45)',
                      }}
                    />
                  ))}
                </div>
              </div>
              {/* Hero stat mock */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 flex flex-col items-center justify-center text-center">
                <div className="text-4xl font-black text-blue-600 mb-2">+24%</div>
                <div className="text-xs text-zinc-500 leading-snug">
                  Revenue growth driven by enterprise segment expansion
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
            How it works
          </p>
          <h2 className="text-4xl font-black tracking-tight mb-4 text-zinc-900">
            From raw data to <span className="text-blue-600">closed-won</span> in 4 simple steps
          </h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            No templates. No PowerPoint. Just your data and a story worth telling.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-200 rounded-2xl overflow-hidden border border-zinc-200">
          {STEPS.map((step, i) => (
            <div key={i} className="bg-white p-6 relative">
              <div className="text-5xl font-black text-zinc-100 absolute top-4 right-4 leading-none select-none">
                {step.number}
              </div>
              <div className="text-xs font-bold text-blue-600 mb-3 tracking-widest uppercase">
                {step.number}
              </div>
              <h3 className="font-bold text-sm mb-2 leading-snug text-zinc-900">{step.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{step.description}</p>
              {i < STEPS.length - 1 && (
                <ChevronRight
                  size={14}
                  className="absolute top-1/2 -right-2 -translate-y-1/2 text-zinc-300 hidden lg:block z-10"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="product" className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
            Features
          </p>
          <h2 className="text-4xl font-black tracking-tight mb-4 text-zinc-900">
            Everything analysts need to <span className="text-blue-600">tell their story</span>
          </h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            Built for the people who live in data but present to people.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-200 rounded-2xl overflow-hidden border border-zinc-200">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={i} className="bg-white p-6 hover:bg-zinc-50 transition-colors group">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${f.bg} border ${f.border}`}
                >
                  <Icon size={16} className={f.color} />
                </div>
                <h3 className="font-bold text-sm mb-2 text-zinc-900">{f.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{f.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Intelligence preview ─────────────────────────────────────────────── */}
      <section className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
            Intelligence
          </p>
          <h2 className="text-4xl font-black tracking-tight mb-4 text-zinc-900">
            More than a deck builder —{' '}
            <span className="text-blue-600">a research layer built in</span>
          </h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            Public interest signals, your own performance history, and pooled industry benchmarks —
            all in one place. Click a tab below to see what's inside.
          </p>
        </div>
        <IntelligencePreview dark={false} variant="marketing" />
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────────
          Disabled for now — these were placeholder quotes from fictional
          people, never real customers. Re-enable once there are genuine
          testimonials to swap in: change `false &&` to `true &&` below,
          or just delete the wrapper entirely once real content replaces it. */}
      {false && (
        <section className="px-6 py-24 max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
              What analysts say
            </p>
            <h2 className="text-4xl font-black tracking-tight text-zinc-900">
              Where analysts become storytellers
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <div key={j} className="w-3 h-3 rounded-sm bg-blue-500" />
                  ))}
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed mb-5">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{t.name}</p>
                  <p className="text-xs text-zinc-400">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-2xl mx-auto text-center">
          <div className="relative p-12 rounded-3xl border border-zinc-200 bg-zinc-50 overflow-hidden">
            {/* Glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-96 h-48 rounded-full"
                style={{
                  background: 'radial-gradient(ellipse, rgba(59,130,246,0.1) 0%, transparent 70%)',
                }}
              />
            </div>

            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-600 text-xs font-semibold mb-6">
                <Sparkles size={11} /> Early access now open
              </div>
              <h2 className="text-4xl font-black tracking-tight mb-4 text-zinc-900">
                Ready to stop creating narratives manually?
              </h2>
              <p className="text-zinc-500 mb-8 leading-relaxed">
                Join analysts at leading companies who use ampli to turn data into decisions faster.
              </p>

              {submitted ? (
                <div className="flex items-center justify-center gap-2 text-emerald-600 font-semibold">
                  <Check size={18} /> We'll be in touch soon.
                </div>
              ) : (
                <form
                  onSubmit={handleDemo}
                  className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                >
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="your@company.com"
                    required
                    className="flex-1 px-4 py-3 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 whitespace-nowrap"
                  >
                    Request Demo
                  </button>
                </form>
              )}

              <p className="text-xs text-zinc-400 mt-4">
                No credit card required · Setup in minutes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-200 px-8 py-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight">
              <span className="text-blue-600">a</span>
              <span className="text-zinc-500">mp</span>
              <span className="text-blue-500">-</span>
              <span className="text-zinc-500">l</span>
              <span className="text-blue-600">i</span>
            </span>
            <span className="text-[9px] tracking-widest text-zinc-300 uppercase">
              stories, not spreadsheets
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-400">
            <a href="#" className="hover:text-zinc-600 transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-zinc-600 transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-zinc-600 transition-colors">
              Contact
            </a>
          </div>
          <p className="text-xs text-zinc-300">© 2026 ampli. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
