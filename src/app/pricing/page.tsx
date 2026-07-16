'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { Check, Minus, Plus, Sparkles, Building2, Zap } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import { CheckoutButton } from '@clerk/nextjs/experimental'

// The Business plan's Clerk Plan ID — used for checkout only (CheckoutButton's
// planId prop needs the raw ID). Authorization checks elsewhere (creditLimit.ts,
// crowd/page.tsx) use the plan's SLUG instead — a different identifier for a
// different Clerk API. Don't mix these up; that was a real bug once already.
const BUSINESS_PLAN_ID = 'cplan_3GYI2J5bxqMj8uYihRR9WUsJbRs'

// ── Enterprise seat pricing ──────────────────────────────────────────────
// Blocks of 10 seats at $999/block. Within a block, seats beyond the block's
// first 10 cost $79 each — but hitting an exact multiple of 10 resets to a
// clean full-block price rather than accumulating per-seat overage.
// e.g. 10 seats = $999. 15 seats = $999 + 5x$79 = $1,394. 20 seats = $1,998
// flat (not $999 + 10x$79). 25 seats = $1,998 + 5x$79 = $2,393.
const ENTERPRISE_BLOCK_PRICE = 999
const ENTERPRISE_BLOCK_SIZE = 10
const ENTERPRISE_EXTRA_SEAT_PRICE = 79
const MIN_ENTERPRISE_SEATS = 10
const MAX_ENTERPRISE_SEATS = 200

function calculateEnterprisePrice(seats: number): number {
  const fullBlocks = Math.floor(seats / ENTERPRISE_BLOCK_SIZE)
  const remainder = seats % ENTERPRISE_BLOCK_SIZE
  return fullBlocks * ENTERPRISE_BLOCK_PRICE + remainder * ENTERPRISE_EXTRA_SEAT_PRICE
}

const BUSINESS_PRICE_PER_SEAT = 119

const FREE_FEATURES = [
  '~1,000 credits/month (roughly 1-2 full presentations)',
  'Full data analysis with formula verification',
  'Auto-generated visuals',
  'Export to PPTX or PDF via Gamma',
  'Standard Gamma themes',
]

const BUSINESS_FEATURES = [
  '~20,000 credits/month (roughly 30-40 presentations)',
  'Crowd-sourced industry benchmarking*',
  'User Behaviors — public interest tracking',
  'Custom brand color & theme matching',
  'Saved custom templates',
  'Export history & re-download anytime',
  'Priority processing',
]

const ENTERPRISE_FEATURES = [
  '~30,000 credits/seat/month (roughly 50-60 presentations per seat)',
  'Everything in Business, for your whole team',
  'Centralized billing across all seats',
  'Dedicated onboarding',
  'Custom template curation for your brand',
  'Priority support',
]

export default function PricingPage() {
  const { dark } = useTheme()
  const { isSignedIn } = useUser()
  const [enterpriseSeats, setEnterpriseSeats] = useState(10)
  const [justUpgraded, setJustUpgraded] = useState(false)

  const enterprisePrice = useMemo(
    () => calculateEnterprisePrice(enterpriseSeats),
    [enterpriseSeats]
  )
  const enterprisePerSeat = useMemo(
    () => Math.round((enterprisePrice / enterpriseSeats) * 100) / 100,
    [enterprisePrice, enterpriseSeats]
  )

  const adjustSeats = (delta: number) => {
    setEnterpriseSeats((s) =>
      Math.min(MAX_ENTERPRISE_SEATS, Math.max(MIN_ENTERPRISE_SEATS, s + delta))
    )
  }

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const cardHighlight = dark
    ? 'bg-[#111118] border-blue-500/50 ring-1 ring-blue-500/30'
    : 'bg-white border-blue-400 ring-1 ring-blue-400/30'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const divider = dark ? 'border-white/[0.06]' : 'border-zinc-100'

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />

      <main className="pt-24 px-6 max-w-6xl mx-auto pb-24">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Simple pricing, built to scale with your team
          </h1>
          <p className={`text-sm sm:text-base ${muted}`}>
            Start free, upgrade when you're ready for unlimited presentations and full access to
            Crowd Insights and User Behaviors.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Free */}
          <div className={`p-7 rounded-3xl border ${card}`}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-zinc-400" />
              <p className="font-semibold text-sm">Free</p>
            </div>
            <p className={`text-xs mb-5 ${muted}`}>Try it out, no card required</p>
            <div className="mb-6">
              <span className="text-4xl font-black">$0</span>
              <span className={`text-sm ml-1 ${muted}`}>/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className={dark ? 'text-zinc-300' : 'text-zinc-700'}>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/sign-up"
              className={`block text-center py-3 rounded-xl border text-sm font-semibold transition-colors ${
                dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Sign up free
            </Link>
            <p className={`text-[11px] mt-3 text-center ${muted}`}>
              Once your monthly credits run out, upgrade anytime or wait for next month's refresh.
            </p>
          </div>

          {/* Business */}
          <div className={`p-7 rounded-3xl border relative ${cardHighlight}`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500 text-white text-[11px] font-semibold">
              Most Popular
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-blue-400" />
              <p className="font-semibold text-sm">Business</p>
            </div>
            <p className={`text-xs mb-5 ${muted}`}>
              For small businesses, individual analysts, and account managers
            </p>
            <div className="mb-6">
              <span className="text-4xl font-black">${BUSINESS_PRICE_PER_SEAT}</span>
              <span className={`text-sm ml-1 ${muted}`}>/seat/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {BUSINESS_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className={dark ? 'text-zinc-300' : 'text-zinc-700'}>{f}</span>
                </li>
              ))}
            </ul>
            {justUpgraded ? (
              <div
                className={`p-4 rounded-xl text-center text-sm font-medium ${dark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}
              >
                🎉 Welcome to Business! Your limit is now 20,000 credits/month, and Crowd Insights +
                User Behaviors are unlocked.
              </div>
            ) : !isSignedIn ? (
              <Link
                href="/sign-up"
                className="block text-center py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-colors"
              >
                Sign Up to Start with Business
              </Link>
            ) : (
              <CheckoutButton
                planId={BUSINESS_PLAN_ID}
                planPeriod="month"
                onSubscriptionComplete={() => setJustUpgraded(true)}
              >
                <button className="w-full text-center py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-colors">
                  Upgrade to Business
                </button>
              </CheckoutButton>
            )}
            <p className={`text-[11px] mt-3 text-center ${muted}`}>
              *Crowd Insights unlocks once you contribute at least one dataset — same requirement on
              every plan.
            </p>
          </div>

          {/* Enterprise */}
          <div className={`p-7 rounded-3xl border ${card}`}>
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={16} className="text-purple-400" />
              <p className="font-semibold text-sm">Enterprise</p>
            </div>
            <p className={`text-xs mb-5 ${muted}`}>For sales and agency teams at scale</p>

            <div className="mb-5">
              <span className="text-4xl font-black">${enterprisePrice.toLocaleString()}</span>
              <span className={`text-sm ml-1 ${muted}`}>/month</span>
            </div>

            <div
              className={`p-4 rounded-2xl border mb-6 ${dark ? 'bg-white/[0.03] border-white/10' : 'bg-zinc-50 border-zinc-200'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-medium ${muted}`}>Seats</span>
                <span className={`text-[11px] ${muted}`}>
                  ${enterprisePerSeat.toFixed(2)}/seat effective
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustSeats(-1)}
                  disabled={enterpriseSeats <= MIN_ENTERPRISE_SEATS}
                  className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-30 ${dark ? 'border-white/15 hover:bg-white/5' : 'border-zinc-300 hover:bg-zinc-100'}`}
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  value={enterpriseSeats}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v))
                      setEnterpriseSeats(
                        Math.min(MAX_ENTERPRISE_SEATS, Math.max(MIN_ENTERPRISE_SEATS, v))
                      )
                  }}
                  className={`flex-1 h-9 text-center text-lg font-bold bg-transparent outline-none border rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${dark ? 'border-white/15' : 'border-zinc-300'}`}
                />
                <button
                  onClick={() => adjustSeats(1)}
                  disabled={enterpriseSeats >= MAX_ENTERPRISE_SEATS}
                  className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-30 ${dark ? 'border-white/15 hover:bg-white/5' : 'border-zinc-300 hover:bg-zinc-100'}`}
                >
                  <Plus size={13} />
                </button>
              </div>
              <p className={`text-[10px] mt-3 leading-relaxed ${muted}`}>
                $999 per block of 10 seats. Extra seats within a block are $79 each — hitting the
                next multiple of 10 resets to a clean block price. Minimum {MIN_ENTERPRISE_SEATS}{' '}
                seats.
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {ENTERPRISE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className={dark ? 'text-zinc-300' : 'text-zinc-700'}>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href="mailto:sales@am-pli.com"
              className={`block text-center py-3 rounded-xl border text-sm font-semibold transition-colors ${
                dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Contact sales
            </a>
          </div>
        </div>

        <div className={`mt-14 pt-10 border-t ${divider}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-4 text-center ${muted}`}>
            Enterprise pricing examples
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {[10, 15, 20, 25].map((seats) => (
              <button
                key={seats}
                onClick={() => setEnterpriseSeats(seats)}
                className={`p-4 rounded-xl border text-center transition-colors ${card} hover:border-blue-500/40`}
              >
                <p className={`text-xs mb-1 ${muted}`}>{seats} seats</p>
                <p className="text-lg font-bold">
                  ${calculateEnterprisePrice(seats).toLocaleString()}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Feature comparison grid */}
        <div className={`mt-14 pt-10 border-t ${divider}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-6 text-center ${muted}`}>
            Compare plans in detail
          </p>
          <div className={`rounded-2xl border overflow-hidden ${card}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className={dark ? 'bg-white/[0.03]' : 'bg-zinc-50'}>
                    <th className="text-left px-5 py-4 font-semibold">Feature</th>
                    <th className="text-center px-5 py-4 font-semibold">Free</th>
                    <th className="text-center px-5 py-4 font-semibold text-blue-500">Business</th>
                    <th className="text-center px-5 py-4 font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      feature: 'Credits per month',
                      free: '~1,000',
                      paid: '~20,000',
                      ent: '~30,000/seat',
                    },
                    {
                      feature: '≈ Presentations per month',
                      free: '1-2',
                      paid: '30-40',
                      ent: '50-60/seat',
                    },
                    { feature: 'Formula-verified analysis', free: true, paid: true, ent: true },
                    { feature: 'Auto-generated visuals', free: true, paid: true, ent: true },
                    { feature: 'Export to PPTX / PDF', free: true, paid: true, ent: true },
                    { feature: 'Export history', free: false, paid: true, ent: true },
                    { feature: 'Crowd Insights benchmarking*', free: false, paid: true, ent: true },
                    { feature: 'User Behaviors tracking', free: false, paid: true, ent: true },
                    { feature: 'Custom brand color & theme', free: false, paid: true, ent: true },
                    { feature: 'Saved custom templates', free: false, paid: true, ent: true },
                    { feature: 'Priority processing', free: false, paid: true, ent: true },
                    { feature: 'Centralized team billing', free: false, paid: false, ent: true },
                    { feature: 'Dedicated onboarding', free: false, paid: false, ent: true },
                    { feature: 'Priority support', free: false, paid: false, ent: true },
                  ].map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-t ${divider} ${i % 2 === 1 ? (dark ? 'bg-white/[0.015]' : 'bg-zinc-50/50') : ''}`}
                    >
                      <td className={`px-5 py-3.5 ${dark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        {row.feature}
                      </td>
                      {[row.free, row.paid, row.ent].map((val, ci) => (
                        <td key={ci} className="text-center px-5 py-3.5">
                          {typeof val === 'boolean' ? (
                            val ? (
                              <Check size={16} className="text-emerald-500 mx-auto" />
                            ) : (
                              <Minus size={14} className={`mx-auto ${muted}`} />
                            )
                          ) : (
                            <span className={dark ? 'text-zinc-300' : 'text-zinc-700'}>{val}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className={`text-[11px] text-center mt-3 ${muted}`}>
            *Requires contributing at least one dataset to unlock, same as on every plan.
          </p>
        </div>
      </main>
    </div>
  )
}
