'use client'

import { useEffect, useState } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { CreditCard, Zap, HelpCircle, ExternalLink, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface AccountStatus {
  allowed: boolean
  creditsUsed: number
  creditsLimit: number
  isPaid: boolean
  tier: 'free' | 'starter' | 'business'
}

export default function AccountPage() {
  const { user, isLoaded } = useUser()
  const { openUserProfile } = useClerk()
  const { dark } = useTheme()
  const router = useRouter()

  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  useEffect(() => {
    if (!user) return
    fetch('/api/account-status')
      .then((res) => res.json())
      .then((data) => {
        setStatus(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user])

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  if (!isLoaded || !user) return null

  const usagePct = status ? Math.min(100, (status.creditsUsed / status.creditsLimit) * 100) : 0
  const isNearLimit = usagePct >= 80

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-24 px-6 max-w-2xl mx-auto pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Account & Billing</h1>
          <p className={`text-sm ${muted}`}>Your plan, usage, and payment settings</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current plan */}
            <div className={`p-6 rounded-2xl border ${card}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles
                    size={16}
                    className={status?.isPaid ? 'text-blue-400' : 'text-zinc-400'}
                  />
                  <p className="font-semibold">Current Plan</p>
                </div>
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    status?.tier === 'business'
                      ? 'bg-blue-500/15 text-blue-400'
                      : status?.tier === 'starter'
                        ? 'bg-amber-500/15 text-amber-400'
                        : dark
                          ? 'bg-white/10 text-white/60'
                          : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {status?.tier === 'business'
                    ? 'Business'
                    : status?.tier === 'starter'
                      ? 'Pro'
                      : 'Starter'}
                </span>
              </div>

              {status?.tier !== 'business' && (
                <Link
                  href="/pricing"
                  className="block text-center py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-colors"
                >
                  {status?.tier === 'starter' ? 'Upgrade to Business' : 'View Plans'}
                </Link>
              )}
            </div>

            {/* Credit usage */}
            <div className={`p-6 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-4">
                <Zap size={16} className="text-amber-400" />
                <p className="font-semibold">Credits This Month</p>
              </div>
              {status && (
                <>
                  <div className="flex items-end justify-between mb-2">
                    <span className="text-2xl font-black">
                      {status.creditsUsed.toLocaleString()}
                    </span>
                    <span className={`text-sm ${muted}`}>
                      of {status.creditsLimit.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className={`h-2 rounded-full overflow-hidden mb-3 ${dark ? 'bg-white/5' : 'bg-zinc-100'}`}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        isNearLimit ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  <p className={`text-xs ${muted}`}>
                    Resets at the start of each calendar month.
                    {isNearLimit && !status.isPaid && (
                      <>
                        {' '}
                        Getting close to your limit —{' '}
                        <Link href="/pricing" className="text-blue-400 hover:underline">
                          upgrade for more room
                        </Link>
                        .
                      </>
                    )}
                  </p>
                </>
              )}
            </div>

            {/* Payment management — deliberately links into Clerk's own
                built-in billing UI (payment method, invoices, cancel)
                rather than rebuilding that here. Uses openUserProfile(),
                a stable core Clerk API, not one of the newer experimental
                billing components — safer bet after the earlier build
                issue with CheckoutButton's import path. */}
            <div className={`p-6 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={16} className="text-emerald-400" />
                <p className="font-semibold">Payment & Subscription</p>
              </div>
              <p className={`text-sm mb-4 ${muted}`}>
                Update your payment method, view invoices, or cancel your subscription.
              </p>
              <button
                onClick={() => openUserProfile()}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                Manage Billing <ExternalLink size={13} />
              </button>
            </div>

            {/* Help */}
            <div className={`p-6 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle size={16} className="text-purple-400" />
                <p className="font-semibold">Need Help?</p>
              </div>
              <p className={`text-sm mb-4 ${muted}`}>
                Questions about your plan, a billing issue, or how something works — reach out any
                time.
              </p>
              <a
                href="mailto:support@am-pli.com"
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                Contact Support
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
