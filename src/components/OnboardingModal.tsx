'use client'

import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useBrand } from '@/hooks/useBrand'
import {
  Globe,
  UploadCloud,
  Sparkles,
  Presentation,
  Download,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  Zap,
} from 'lucide-react'

interface Props {
  onComplete: () => void
}

const STEPS = [
  {
    id: 'welcome',
    icon: Sparkles,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    title: 'Welcome to amp-li',
    subtitle: 'stories, not spreadsheets',
    description:
      "ampli transforms your raw data into compelling narratives tailored to the exact person you're pitching. Here's how to get the most out of it in a few steps.",
    visual: null,
  },
  {
    // New — explains what tier a new signup is actually on, since the app
    // previously dropped people straight into the product with zero
    // context on credits or what upgrading unlocks. Placed right after
    // Welcome, before the product walkthrough, so someone understands
    // their limits before they start using the thing that consumes them.
    id: 'plan',
    icon: Zap,
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/10',
    title: "You're on the Starter plan",
    subtitle: 'Your account',
    description:
      'Free gives you about 1,000 credits a month — roughly 1-2 full presentations, enough to see what ampli can do. Credits refresh automatically each month, and you can upgrade anytime for a lot more room plus access to Crowd Insights and User Behaviors.',
    tips: [
      '~1,000 credits/month ≈ 1-2 presentations',
      'Business unlocks ~20,000 credits/month (~30-40 presentations) plus industry benchmarking',
      'Find pricing anytime from the Pricing link in the navbar',
    ],
  },
  {
    id: 'research',
    icon: Globe,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    title: 'Research your target',
    subtitle: 'Step 1',
    description:
      "Before uploading data, research the company you're pitching. Paste any URL and ampli maps out what they do, their products, top competitors, and — most importantly — the audience map: who works there and exactly how to speak to each of them.",
    tips: [
      'Research multiple companies and save them all',
      'The audience map tells you what each role cares about',
      'Recent news is pulled automatically to inform your pitch angle',
    ],
  },
  {
    id: 'upload',
    icon: UploadCloud,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    title: 'Upload your data',
    subtitle: 'Step 2',
    description:
      "Drop in any CSV or Excel file. Use the Customize Your Analysis field to brief ampli like you're briefing an analyst — tell it who you're pitching, what to focus on, and what angle to lead with.",
    tips: [
      'The more specific your prompt, the better the narrative',
      'Select a target company and audience to auto-tailor the output',
      'Opt in to Crowd Insights to contribute anonymized data to industry benchmarks',
    ],
  },
  {
    id: 'generate',
    icon: Sparkles,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    title: 'Generate your story',
    subtitle: 'Step 3',
    description:
      'ampli produces a full narrative, key insight cards, and branded charts — all framed for your target audience. Not happy with the angle? Hit Regenerate with a new prompt and the AI reframes everything instantly.',
    tips: [
      'Narrative tab — the written story',
      'Visuals tab — charts with hero stats and takeaways',
      'CRM Notes — log pitch feedback and next steps',
    ],
  },
  {
    id: 'present',
    icon: Presentation,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    title: 'Present or export',
    subtitle: 'Step 4',
    description:
      'Hit Pitch Mode for a full-screen presentation built for screen sharing — branded with your colors and logo. Or export selected slides as a PDF to leave behind after the meeting.',
    tips: [
      'Pitch Mode hides all ampli UI — clients see only your story',
      'Edit hero stats and takeaways directly in pitch mode',
      'Set your brand colors and logo in Brand Settings first',
    ],
  },
]

export default function OnboardingModal({ onComplete }: Props) {
  const { dark } = useTheme()
  const { brand } = useBrand()
  const [step, setStep] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0
  const Icon = current.icon

  const go = (dir: 'next' | 'prev') => {
    if (animating) return
    setDirection(dir === 'next' ? 'forward' : 'back')
    setAnimating(true)
    setTimeout(() => {
      setStep((s) => (dir === 'next' ? s + 1 : s - 1))
      setAnimating(false)
    }, 200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className={`relative w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden
        ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}
      >
        {/* Top accent */}
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
          }}
        />

        {/* Skip button */}
        <button
          onClick={onComplete}
          className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors z-10
            ${dark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
        >
          <X size={15} />
        </button>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 pt-5 pb-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                background: i === step ? brand.primaryColor : dark ? '#3f3f46' : '#e4e4e7',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div
          className={`px-8 py-6 transition-all duration-200
          ${
            animating
              ? direction === 'forward'
                ? 'opacity-0 translate-x-4'
                : 'opacity-0 -translate-x-4'
              : 'opacity-100 translate-x-0'
          }`}
          style={{
            transform: animating
              ? `translateX(${direction === 'forward' ? '16px' : '-16px'})`
              : 'translateX(0)',
          }}
        >
          {/* Icon */}
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 ${current.bg}`}
          >
            <Icon size={24} className={current.color} />
          </div>

          {/* Text */}
          <div className="text-center mb-6">
            {current.subtitle && (
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${current.color}`}>
                {current.subtitle}
              </p>
            )}
            <h2 className="text-2xl font-bold mb-3">{current.title}</h2>
            <p className={`text-sm leading-relaxed ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {current.description}
            </p>
          </div>

          {/* Tips */}
          {current.tips && (
            <div className={`rounded-2xl p-4 space-y-2 ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
              {current.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: brand.primaryColor }}
                  >
                    <Check size={9} className="text-white" />
                  </div>
                  <p
                    className={`text-xs leading-relaxed ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}
                  >
                    {tip}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-8 pb-6 pt-2`}>
          <button
            onClick={() => go('prev')}
            disabled={isFirst}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-0
              ${dark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <ArrowLeft size={14} /> Back
          </button>

          {isLast ? (
            <button
              onClick={onComplete}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
              style={{ background: brand.primaryColor }}
            >
              <Sparkles size={14} /> Get Started
            </button>
          ) : (
            <button
              onClick={() => go('next')}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
              style={{ background: brand.primaryColor }}
            >
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
