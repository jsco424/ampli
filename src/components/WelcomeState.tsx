'use client'

import { useTheme } from '@/hooks/useTheme'
import { UploadCloud, Globe, Sparkles, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const STEPS = [
  {
    number: '01',
    icon: Globe,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    title: 'Research your target',
    description: 'Enter any company URL to get an instant breakdown of what they do, who works there, and how to speak to each audience.',
    action: { label: 'Research a company', href: '#research' },
  },
  {
    number: '02',
    icon: UploadCloud,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    title: 'Upload your data',
    description: 'Drop in a CSV or Excel file. ampli reads it, identifies the story inside, and tailors the narrative to your target audience.',
    action: { label: 'Create first project', href: '/projects/new' },
  },
  {
    number: '03',
    icon: Sparkles,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    title: 'Generate your story',
    description: 'Get a full AI narrative, key insights, and visual charts — all framed for the right person at the right company.',
    action: null,
  },
]

export default function WelcomeState({ firstName }: { firstName?: string }) {
  const { dark } = useTheme()

  return (
    <div className="mb-10">
      {/* Hero */}
      <div className={`p-8 rounded-3xl border mb-6 text-center ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles size={24} className="text-blue-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">
          Welcome to amp-li{firstName ? `, ${firstName}` : ''}
        </h2>
        <p className={`text-sm leading-relaxed max-w-md mx-auto mb-6 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          ampli turns your raw data into compelling narratives tailored to the exact person you're pitching. Here's how to get started in three steps.
        </p>
        <Link href="/projects/new"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors">
          <UploadCloud size={15} />
          Create your first project
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <div key={i} className={`p-5 rounded-2xl border relative overflow-hidden
              ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>

              {/* Step number watermark */}
              <span className={`absolute top-3 right-4 text-5xl font-black pointer-events-none select-none
                ${dark ? 'text-zinc-800' : 'text-zinc-100'}`}>
                {step.number}
              </span>

              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${step.bg}`}>
                <Icon size={16} className={step.color} />
              </div>
              <h3 className="font-semibold text-sm mb-2">{step.title}</h3>
              <p className={`text-xs leading-relaxed mb-4 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {step.description}
              </p>
              {step.action && (
                <Link href={step.action.href}
                  className={`inline-flex items-center gap-1 text-xs font-medium ${step.color} hover:underline`}>
                  {step.action.label} <ArrowRight size={11} />
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}