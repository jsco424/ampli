'use client'

import { X, Shield, ShieldCheck, ShieldAlert, Database, ClipboardList } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  onClose: () => void
}

const layers = [
  {
    number: '01',
    icon: ShieldAlert,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Pre-Upload Scan',
    subtitle: 'Client-side, before anything leaves your device',
    description:
      'The moment you select a file, ampli scans it locally in your browser — before a single byte is sent anywhere. It checks for emails, phone numbers, SSNs, credit card patterns, and sensitive column headers like "first_name" or "account_number". If high-risk data is detected, crowd opt-in is automatically blocked.',
    badge: 'Layer 1',
  },
  {
    number: '02',
    icon: Shield,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    title: 'AI Scrubbing',
    subtitle: 'Server-side, before anything touches the shared pool',
    description:
      'Even if something slips past the pattern scan, a dedicated AI pass strips any remaining PII, removes brand names, company names, and product identifiers, and generalizes specific figures into ranges. Nothing enters the crowd pool until it has passed this second review.',
    badge: 'Layer 2',
  },
  {
    number: '03',
    icon: Database,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    title: 'Aggregates Only',
    subtitle: 'What actually gets stored in the shared pool',
    description:
      'Your raw data is never stored in the crowd pool. Only AI-generated meta-insights are saved — statistical patterns like "retail datasets in this pool show an average conversion rate of 3.2%." No individual record, row, or identifying detail ever exists in the shared layer.',
    badge: 'Layer 3',
  },
  {
    number: '04',
    icon: ClipboardList,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    title: 'Audit Log',
    subtitle: 'Full traceability and control',
    description:
      'Every opt-in contribution is logged with a timestamp. You can review what was contributed at any time and request removal. ampli retains the ability to purge any entry from the shared pool on demand — giving you full control even after contribution.',
    badge: 'Layer 4',
  },
]

export default function PrivacyModal({ onClose }: Props) {
  const { dark } = useTheme()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className={`relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl
        ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>

        {/* Header */}
        <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b z-10
          ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-blue-500" />
            <h2 className="font-bold text-base">4-Layer Privacy Protection</h2>
          </div>
          <button onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
            <X size={16} />
          </button>
        </div>

        {/* Intro */}
        <div className="px-6 pt-5 pb-3">
          <p className={`text-sm leading-relaxed ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            When you opt in to Crowd-Sourced Insights, your data passes through four independent privacy layers before anything reaches the shared pool. Here's exactly what happens at each stage.
          </p>
        </div>

        {/* Layers */}
        <div className="px-6 pb-6 space-y-4">
          {layers.map((layer, i) => {
            const Icon = layer.icon
            return (
              <div key={i} className={`p-4 rounded-2xl border ${layer.bg} ${layer.border}`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${layer.bg} shrink-0`}>
                    <Icon size={16} className={layer.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${layer.bg} ${layer.color}`}>
                        {layer.badge}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm mt-1">{layer.title}</h3>
                    <p className={`text-xs mb-2 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>{layer.subtitle}</p>
                    <p className={`text-xs leading-relaxed ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {layer.description}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Footer note */}
          <div className={`p-4 rounded-xl text-xs leading-relaxed ${dark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-50 text-zinc-500'}`}>
            <span className="font-semibold">Bottom line:</span> ampli can never expose your proprietary data, brand names, or customer information through the crowd pool — by design, not just by policy.
          </div>
        </div>
      </div>
    </div>
  )
}