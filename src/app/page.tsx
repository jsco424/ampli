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
  FileText,
  Check,
  Shield,
  TrendingUp,
  Play,
  UploadCloud,
  Target,
  Presentation,
} from 'lucide-react'
import IntelligencePreview from '@/components/IntelligencePreview'

const NAV_LINKS = [
  { label: 'Product', href: '#product', type: 'anchor' as const },
  { label: 'Stack', href: '#stack', type: 'anchor' as const },
  { label: 'Pricing', href: '/pricing', type: 'route' as const },
]

// Grouped by function, not a flat list — mirrors how the actual pipeline
// uses each one, so the section reads as an honest architecture summary
// rather than a logo wall. Text-based wordmarks by design, not a
// compromise for missing SVGs — restrained monochrome badges fit the
// darker, quieter section better than a row of colorful third-party logos
// would.
const STACK = [
  {
    group: 'Analysis',
    items: [
      { name: 'Anthropic', role: 'Runs the verified analysis behind every finding' },
      { name: 'PapaParse', role: 'Reads your CSV or Excel file the moment it lands' },
    ],
  },
  {
    group: 'Data',
    items: [
      { name: 'Supabase', role: 'Stores every project, chart, and export' },
      { name: 'Clerk', role: 'Handles sign in and team access' },
    ],
  },
  {
    group: 'Output',
    items: [
      { name: 'Gamma', role: 'Builds the branded presentation you export' },
      { name: 'Vercel', role: 'Hosts ampli itself, end to end' },
    ],
  },
  {
    group: 'Billing',
    items: [{ name: 'Stripe', role: 'Handles every subscription, through Clerk Billing' }],
  },
]

const FEATURES = [
  {
    icon: Shield,
    title: 'Formula verified, not guessed',
    description:
      'Every hero number is checked against your raw data with a deterministic formula pass. See a Show the math breakdown on any finding, not just a model\u2019s word for it.',
    featured: true,
  },
  {
    icon: UploadCloud,
    title: 'Upload any dataset',
    description:
      'Drop in a CSV or Excel file. ampli reads the structure and gets to work in under a minute.',
  },
  {
    icon: Target,
    title: 'Audience aware framing',
    description:
      'Pick your audience, CMO, VP of Data, Director of Analytics, and ampli tailors which findings lead and how they\u2019re framed.',
  },
  {
    icon: BarChart2,
    title: 'Crowd Insights benchmarking',
    description:
      'See your numbers against anonymized, pooled results across your industry. Real aggregates, not estimates.',
  },
  {
    icon: TrendingUp,
    title: 'Real time public interest',
    description:
      'Pitching a specific company? ampli checks live interest signals for them and their competitors where it genuinely helps.',
  },
  {
    icon: Globe,
    title: 'Company intelligence',
    description:
      'Research any company URL for an instant breakdown of products, competitors, and an audience map.',
  },
  {
    icon: FileText,
    title: 'Your brand, every export',
    description:
      'Your colors and logo applied automatically, or pick from a full theme library. Every deck looks like your own.',
  },
  {
    icon: Presentation,
    title: 'Pitch mode or export',
    description:
      'Present full screen for a call, or export to PPTX and PDF with full history saved and re-downloadable anytime.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Research your target',
    description:
      'Paste a company URL for products, competitors, and a full audience map in seconds.',
  },
  {
    number: '02',
    title: 'Upload your data',
    description: 'Drop in a file, pick your audience, and brief ampli on your angle.',
  },
  {
    number: '03',
    title: 'Get a verified story',
    description:
      'Formula checked findings and industry benchmarks. Ask follow up questions to dig deeper.',
  },
  {
    number: '04',
    title: 'Present or export',
    description: 'Pitch Mode for a live call, or export to PPTX and PDF with history saved.',
  },
]

const STATS = [
  { value: '10\u00d7', label: 'faster than manual decks' },
  { value: '6+', label: 'charts per project' },
  { value: '100%', label: 'audience tailored output' },
  { value: '<30s', label: 'average generation time' },
]

const FOOTER_GROUPS: {
  heading: string
  items: { label: string; href: string; comingSoon?: boolean }[]
}[] = [
  {
    heading: 'Product',
    items: [
      { label: 'Product', href: '#product' },
      { label: 'Stack', href: '#stack' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    heading: 'Company',
    items: [
      { label: 'About', href: '/about', comingSoon: false },
      { label: 'Careers', href: '#', comingSoon: true },
      { label: 'Press', href: '#', comingSoon: true },
      { label: 'Contact', href: 'mailto:support@am-pli.com' },
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

export default function LandingPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (isLoaded && user) router.push('/dashboard')
  }, [isLoaded, user, router])

  const handleDemo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  if (!isLoaded || user) return null

  return (
    <div className="min-h-screen bg-white text-[#080C14] antialiased">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-8 border-b border-zinc-200 bg-white/90 backdrop-blur-xl">
        <Link href="/" className="flex flex-col leading-none">
          <span className="text-[17px] font-bold tracking-tight">
            <span className="text-[#5DCAA5]">a</span>
            <span className="text-zinc-700">mp</span>
            <span className="text-[#F4A7B9]">-</span>
            <span className="text-zinc-700">l</span>
            <span className="text-[#5DCAA5]">i</span>
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
              className="px-4 py-1.5 rounded-lg text-sm text-zinc-500 hover:text-[#080C14] hover:bg-[#EAEFF1] transition-all"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-zinc-500 hover:text-[#080C14] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#080C14] text-white text-sm font-semibold hover:bg-[#0F1420] transition-colors"
          >
            Request Demo <ArrowRight size={13} />
          </Link>
        </div>
      </nav>

      {/* ── Hero — full bleed green band, matching the About page's
          treatment, starting from the very top of the page behind the
          fixed Navbar. ──────────────────────────────────────────────── */}
      <section className="relative bg-[#5DCAA5] pt-32 pb-20 px-6 overflow-hidden">
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#080C14] text-white text-xs font-medium mb-8 tracking-wide">
            <Sparkles size={11} />
            Built for analysts who present, not just analyze
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-[68px] font-black tracking-tight leading-[1.05] mb-6 text-[#080C14]">
            Turn raw data into
            <br />
            <em className="not-italic font-black text-[#080C14] border-b-[6px] border-[#F4A7B9]">
              stories that sell.
            </em>
          </h1>

          <p className="text-lg sm:text-xl text-[#080C14]/70 max-w-xl mx-auto mb-10 leading-relaxed">
            ampli turns a spreadsheet into a verified, branded story built for the account and the
            decision maker in front of you.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#080C14] text-white font-semibold hover:bg-[#0F1420] transition-all text-sm shadow-lg shadow-black/10"
            >
              Request a Demo <ArrowRight size={15} />
            </Link>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[#080C14]/20 bg-white/40 text-[#080C14] hover:bg-white/70 transition-all text-sm font-medium"
            >
              <Play size={13} /> See how it works
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/40 rounded-2xl overflow-hidden shadow-xl shadow-black/5">
            {STATS.map((stat, i) => (
              <div key={i} className="bg-white px-6 py-5 text-center">
                <div className="text-3xl font-black text-[#080C14] mb-1">{stat.value}</div>
                <div className="text-xs text-zinc-400 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product preview ────────────────────────────────────────────── */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <div
          className="relative rounded-2xl border border-zinc-200 overflow-hidden bg-[#EAEFF1]"
          style={{ boxShadow: '0 40px 120px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02)' }}
        >
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-200 bg-white">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
            <div className="flex-1 mx-4 h-6 rounded-md bg-[#EAEFF1] flex items-center px-3">
              <span className="text-xs text-zinc-400">app.ampli.ai/projects/q4-analysis</span>
            </div>
          </div>

          <div className="p-6 bg-white">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="h-5 w-48 bg-[#EAEFF1] rounded-lg mb-2" />
                <div className="h-3 w-32 bg-[#EAEFF1] rounded-lg" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-24 bg-[#EAEFF1] rounded-lg border border-zinc-200" />
                <div className="h-8 w-24 bg-[#080C14] rounded-lg" />
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Revenue Growth', value: '+24%' },
                { label: 'Conversion Rate', value: '3.8%' },
                { label: 'Avg Deal Size', value: '$48K' },
                { label: 'Pipeline Velocity', value: '\u2191 18%' },
                { label: 'Win Rate', value: '62%' },
              ].map((card, i) => (
                <div key={i} className="p-3 rounded-xl border border-zinc-200 bg-[#EAEFF1]">
                  <div className="text-xs mb-2 text-zinc-400">{card.label}</div>
                  <div className="text-xl font-black text-[#080C14]">{card.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 p-4 rounded-xl border border-zinc-200 bg-[#EAEFF1]">
                <div className="h-3 w-32 bg-zinc-200 rounded mb-1" />
                <div className="h-2 w-48 bg-[#EAEFF1] rounded mb-4" />
                <div className="flex items-end gap-2 h-24">
                  {[65, 40, 80, 55, 90, 70, 85, 60].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-[#080C14]"
                      style={{ height: `${h}%`, opacity: i % 2 === 0 ? 1 : 0.35 }}
                    />
                  ))}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200 bg-[#EAEFF1] flex flex-col items-center justify-center text-center">
                <div className="text-4xl font-black text-[#080C14] mb-2">+24%</div>
                <div className="text-xs text-zinc-500 leading-snug">
                  Revenue growth driven by enterprise segment expansion
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
            How it works
          </p>
          <h2 className="text-4xl font-black tracking-tight mb-4 text-[#080C14]">
            From raw data to closed won in four steps
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {STEPS.map((step, i) => (
            <div key={i} className="relative pt-6 border-t-2 border-[#080C14]">
              <div className="text-xs font-bold text-zinc-300 mb-3 tracking-widest">
                {step.number}
              </div>
              <h3 className="font-bold text-sm mb-2 leading-snug text-[#080C14]">{step.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features — one restrained accent instead of nine colors ────── */}
      <section id="product" className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
            Features
          </p>
          <h2 className="text-4xl font-black tracking-tight mb-4 text-[#080C14]">
            Built for the people who present data
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div
                key={i}
                className={`p-6 rounded-2xl border transition-colors ${
                  f.featured
                    ? 'sm:col-span-2 bg-[#080C14] border-[#080C14] text-white'
                    : 'border-zinc-200 hover:border-zinc-300 text-[#080C14]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${
                    f.featured ? 'bg-white/10' : 'bg-[#EAEFF1]'
                  }`}
                >
                  <Icon size={16} className={f.featured ? 'text-[#F4A7B9]' : 'text-zinc-700'} />
                </div>
                <h3 className="font-bold text-sm mb-2">{f.title}</h3>
                <p
                  className={`text-xs leading-relaxed ${f.featured ? 'text-white/60' : 'text-zinc-500'}`}
                >
                  {f.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Intelligence preview ───────────────────────────────────────── */}
      <section className="px-6 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
            Intelligence
          </p>
          <h2 className="text-4xl font-black tracking-tight mb-4 text-[#080C14]">
            More than a deck builder
          </h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            Public interest signals, your own history, and pooled industry benchmarks. Click a tab
            to see what's inside.
          </p>
        </div>
        <IntelligencePreview dark={false} variant="marketing" />
      </section>

      {/* ── Stack — the signature section: dark, restrained, honest ────── */}
      <section id="stack" className="bg-[#080C14] text-white px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
              Under the hood
            </p>
            <h2 className="text-4xl font-black tracking-tight mb-4">
              Built on a stack that already earns trust
            </h2>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              No unlabeled black box. Here's exactly what powers each part of ampli.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 rounded-2xl overflow-hidden">
            {STACK.map((group) => (
              <div key={group.group} className="bg-[#080C14] p-6">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5DCAA5] mb-4">
                  {group.group}
                </p>
                <div className="space-y-4">
                  {group.items.map((item) => (
                    <div key={item.name}>
                      <p className="text-sm font-bold mb-1">{item.name}</p>
                      <p className="text-xs text-zinc-500 leading-relaxed">{item.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-12 rounded-3xl border border-zinc-200 bg-[#EAEFF1]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-zinc-500 text-xs font-semibold mb-6">
              <Sparkles size={11} /> Early access now open
            </div>
            <h2 className="text-4xl font-black tracking-tight mb-4 text-[#080C14]">
              Ready to stop building decks by hand?
            </h2>
            <p className="text-zinc-500 mb-8 leading-relaxed">
              Join analysts who use ampli to turn data into decisions faster.
            </p>

            {submitted ? (
              <div className="flex items-center justify-center gap-2 text-[#5DCAA5] font-semibold">
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
                  className="flex-1 px-4 py-3 rounded-xl bg-white border border-zinc-300 text-[#080C14] placeholder-zinc-400 text-sm outline-none focus:border-zinc-500 transition-colors"
                />
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-[#080C14] text-white font-semibold text-sm hover:bg-[#0F1420] transition-all whitespace-nowrap"
                >
                  Request Demo
                </button>
              </form>
            )}

            <p className="text-xs text-zinc-400 mt-4">No credit card required. Setup in minutes.</p>
          </div>
        </div>
      </section>

      {/* ── Footer — expanded, Company/Legal groups with real destinations
          where they exist and an honest Coming soon tag where they don't,
          matching the pattern all three references share. ─────────────── */}
      <footer className="border-t border-zinc-200 px-8 py-14">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex flex-col leading-none mb-3">
                <span className="text-base font-bold tracking-tight">
                  <span className="text-[#5DCAA5]">a</span>
                  <span className="text-zinc-500">mp</span>
                  <span className="text-[#F4A7B9]">-</span>
                  <span className="text-zinc-500">l</span>
                  <span className="text-[#5DCAA5]">i</span>
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">Stories, not spreadsheets.</p>
            </div>

            {FOOTER_GROUPS.map((group) => (
              <div key={group.heading}>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
                  {group.heading}
                </p>
                <div className="space-y-2">
                  {group.items.map((item) =>
                    item.comingSoon ? (
                      <p
                        key={item.label}
                        className="text-sm text-zinc-300 flex items-center gap-1.5"
                      >
                        {item.label}
                        <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#EAEFF1] text-zinc-400">
                          Soon
                        </span>
                      </p>
                    ) : (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="block text-sm text-zinc-500 hover:text-[#080C14] transition-colors"
                      >
                        {item.label}
                      </Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-zinc-400">{'\u00a9'} 2026 ampli. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
