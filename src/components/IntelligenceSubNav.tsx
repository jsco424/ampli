'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/hooks/useTheme'
import { TrendingUp, Building2, Users } from 'lucide-react'

// Shared tab bar rendered at the top of every Intelligence Hub section
// (User Behavior, Company Benchmarks, Crowd Insights). Each section keeps
// its own existing URL (/trends, /crowd, etc.) rather than being physically
// relocated under /intelligence — this component is what gives the
// cohesive "hub" feel without the risk of moving large, already-working
// page files and hunting down every internal link to their old URLs.
const SECTIONS = [
  { label: 'User Behavior', href: '/trends', icon: TrendingUp, active: true },
  {
    label: 'Company Benchmarks',
    href: '/intelligence/company-benchmarks',
    icon: Building2,
    active: false,
  },
  { label: 'Crowd Insights', href: '/crowd', icon: Users, active: true },
]

export default function IntelligenceSubNav() {
  const pathname = usePathname()
  const { dark } = useTheme()

  return (
    <div className="max-w-5xl mx-auto px-6 pt-20 pb-2">
      <div
        className={`flex items-center gap-1 p-1 rounded-xl w-fit ${dark ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}
      >
        {SECTIONS.map((section) => {
          const isCurrent = pathname === section.href
          const Icon = section.icon
          const content = (
            <span
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !section.active
                  ? dark
                    ? 'text-white/15 cursor-not-allowed'
                    : 'text-zinc-300 cursor-not-allowed'
                  : isCurrent
                    ? dark
                      ? 'bg-white/10 text-white'
                      : 'bg-zinc-900 text-white'
                    : dark
                      ? 'text-white/45 hover:text-white/80 hover:bg-white/5'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/70'
              }`}
            >
              <Icon size={13} />
              {section.label}
              {!section.active && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full ${dark ? 'bg-white/10' : 'bg-zinc-200'}`}
                >
                  Soon
                </span>
              )}
            </span>
          )
          return section.active ? (
            <Link key={section.href} href={section.href}>
              {content}
            </Link>
          ) : (
            <span key={section.href} title="Coming soon">
              {content}
            </span>
          )
        })}
      </div>
    </div>
  )
}
