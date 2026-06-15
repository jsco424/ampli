'use client'

import { ShieldCheck, ShieldAlert, AlertTriangle, Shield } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import type { PIIScanResult } from '@/lib/piiScanner'

interface Props {
  result: PIIScanResult
}

const LEVELS = [
  { key: 'none', label: 'Clean', color: 'bg-emerald-400', width: 'w-1/4' },
  { key: 'low', label: 'Low', color: 'bg-yellow-400', width: 'w-2/4' },
  { key: 'medium', label: 'Medium', color: 'bg-amber-400', width: 'w-3/4' },
  { key: 'high', label: 'Sensitive', color: 'bg-red-400', width: 'w-full' },
]

const LEVEL_INDEX: Record<string, number> = {
  none: 0, low: 1, medium: 2, high: 3,
}

const CONFIG = {
  none: {
    icon: ShieldCheck,
    iconColor: 'text-emerald-400',
    label: 'No sensitive data detected',
    sub: 'This file looks clean and is eligible for crowd opt-in.',
  },
  low: {
    icon: Shield,
    iconColor: 'text-yellow-400',
    label: 'Low sensitivity',
    sub: 'Minor patterns detected — likely dates or ZIP codes. Safe to proceed.',
  },
  medium: {
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    label: 'Moderate sensitivity',
    sub: 'Some sensitive patterns found. AI scrubbing will remove them before crowd contribution.',
  },
  high: {
    icon: ShieldAlert,
    iconColor: 'text-red-400',
    label: 'Sensitive data detected',
    sub: 'PII found in this file. Crowd opt-in has been disabled to protect privacy.',
  },
}

export default function PIIMeter({ result }: Props) {
  const { dark } = useTheme()
  const idx = LEVEL_INDEX[result.riskLevel]
  const cfg = CONFIG[result.riskLevel]
  const Icon = cfg.icon
  const level = LEVELS[idx]

  return (
    <div className={`p-4 rounded-xl border ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={cfg.iconColor} />
        <div className="flex-1">
          <p className="text-sm font-semibold">{cfg.label}</p>
          <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>{cfg.sub}</p>
        </div>
      </div>

      {/* Strength Bar */}
      <div className={`relative h-2 rounded-full overflow-hidden ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
        {/* Segment markers */}
        <div className="absolute inset-0 flex">
          {LEVELS.map((l, i) => (
            <div key={l.key} className="flex-1 relative">
              {i > 0 && (
                <div className={`absolute left-0 top-0 bottom-0 w-px ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />
              )}
            </div>
          ))}
        </div>
        {/* Fill */}
        <div className={`absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500 ${level.color} ${level.width}`} />
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1.5">
        {LEVELS.map((l, i) => (
          <span key={l.key} className={`text-xs transition-colors ${
            i === idx
              ? level.color.replace('bg-', 'text-')
              : dark ? 'text-zinc-600' : 'text-zinc-300'
          }`}>
            {l.label}
          </span>
        ))}
      </div>

      {/* Findings */}
      {result.findings.length > 0 && (
        <div className={`mt-3 pt-3 border-t space-y-1 ${dark ? 'border-zinc-800' : 'border-zinc-100'}`}>
          {result.findings.map((f, i) => (
            <p key={i} className={`text-xs flex items-center gap-1.5 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              <span className={`w-1 h-1 rounded-full inline-block ${level.color}`} />
              {f}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}