'use client'

import { useState, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { Search, ShieldAlert, Save, CheckCircle } from 'lucide-react'

interface FoundUser {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
}

interface AccountData {
  brand_name: string
  brand_primary_color: string
  brand_logo_url: string
  gamma_theme_id: string
  gamma_template_id: string
  credit_limit_override: number | null
}

const EMPTY_ACCOUNT: AccountData = {
  brand_name: '',
  brand_primary_color: '',
  brand_logo_url: '',
  gamma_theme_id: '',
  gamma_template_id: '',
  credit_limit_override: null,
}

export default function AdminPage() {
  const { dark } = useTheme()

  // This client-side check only decides whether to render the UI at all —
  // the real enforcement lives server-side in every /api/admin/* route via
  // isCurrentUserAdmin(). A non-admin who bypasses this check entirely
  // still can't do anything, since every API call re-checks independently.
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null)

  const [account, setAccount] = useState<AccountData>(EMPTY_ACCOUNT)
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null)
  const [loadingAccount, setLoadingAccount] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/check')
      .then((r) => r.json())
      .then((d) => setIsAdmin(!!d.isAdmin))
      .catch(() => setIsAdmin(false))
      .finally(() => setCheckingAccess(false))
  }, [])

  const loadAccount = async (userId: string) => {
    setLoadingAccount(true)
    try {
      const res = await fetch(`/api/admin/account?userId=${encodeURIComponent(userId)}`)
      const data = await res.json()
      setAccount({ ...EMPTY_ACCOUNT, ...data.settings })
      setCreditsUsed(data.creditsUsed ?? null)
    } finally {
      setLoadingAccount(false)
    }
  }

  const handleSearch = async () => {
    if (!email.trim()) return
    setSearching(true)
    setSearchError(null)
    setFoundUser(null)
    try {
      const res = await fetch('/api/admin/lookup-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setFoundUser(data)
      await loadAccount(data.userId)
    } catch (err: any) {
      setSearchError(err.message || 'Lookup failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSave = async () => {
    if (!foundUser) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: foundUser.userId, ...account }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setSearchError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-blue-400'
  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const subtler = dark ? 'text-zinc-500' : 'text-zinc-400'

  // Avoid flashing the search UI before the admin check resolves.
  if (checkingAccess) return null

  if (!isAdmin) {
    return (
      <div className={`min-h-screen ${base}`}>
        <Navbar />
        <main className="pt-24 px-6 max-w-md mx-auto text-center">
          <ShieldAlert size={32} className="mx-auto mb-4 text-red-400" />
          <h1 className="text-lg font-bold mb-2">Not authorized</h1>
          <p className={`text-sm ${subtle}`}>This page is restricted.</p>
        </main>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-24 px-6 max-w-2xl mx-auto pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Account Admin</h1>
          <p className={`text-sm ${subtle}`}>
            Internal only. Look up any account by email to fix billing, set a manual credit
            override, or set their Gamma theme/template IDs directly.
          </p>
        </div>

        <div className={`p-5 rounded-2xl border mb-4 ${card}`}>
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="client@company.com"
              className={`flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${input}`}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors disabled:opacity-50 shrink-0"
            >
              <Search size={14} /> {searching ? 'Searching…' : 'Look Up'}
            </button>
          </div>
          {searchError && <p className="text-xs text-red-400 mt-2">{searchError}</p>}
        </div>

        {foundUser && (
          <div className={`p-5 rounded-2xl border mb-4 ${card}`}>
            <p className="text-sm font-semibold mb-1">
              {foundUser.firstName || ''} {foundUser.lastName || ''}
              {!foundUser.firstName && !foundUser.lastName && '(no name on file)'}
            </p>
            <p className={`text-xs mb-1 ${subtle}`}>{foundUser.email}</p>
            <p className={`text-[11px] font-mono ${subtler}`}>{foundUser.userId}</p>
            {creditsUsed !== null && (
              <p className={`text-xs mt-3 ${subtle}`}>
                <span className="font-semibold">{creditsUsed.toLocaleString()}</span> credits used
                this month
              </p>
            )}
          </div>
        )}

        {foundUser && !loadingAccount && (
          <div className={`p-5 rounded-2xl border space-y-4 ${card}`}>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${subtle}`}>
                Credit Limit Override
                <span className={`ml-1 font-normal ${subtler}`}>
                  (blank = use their normal plan limit)
                </span>
              </label>
              <input
                type="number"
                value={account.credit_limit_override ?? ''}
                onChange={(e) =>
                  setAccount({
                    ...account,
                    credit_limit_override: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="e.g. 60000"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${input}`}
              />
              <p className={`text-xs mt-1.5 ${subtler}`}>
                Use this for a comped Enterprise seat allotment (their negotiated headcount × the
                per-seat credit figure) or to resolve a billing dispute — overrides their Clerk
                plan's default limit entirely.
              </p>
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${subtle}`}>Gamma Theme ID</label>
              <input
                value={account.gamma_theme_id}
                onChange={(e) => setAccount({ ...account, gamma_theme_id: e.target.value })}
                placeholder="theme_xxxxxxxx"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${input}`}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${subtle}`}>
                Gamma Template ID
                <span className={`ml-1 font-normal ${subtler}`}>(optional)</span>
              </label>
              <input
                value={account.gamma_template_id}
                onChange={(e) => setAccount({ ...account, gamma_template_id: e.target.value })}
                placeholder="Leave blank unless they have a custom deck structure"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${input}`}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${subtle}`}>Brand Name</label>
              <input
                value={account.brand_name}
                onChange={(e) => setAccount({ ...account, brand_name: e.target.value })}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${input}`}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${subtle}`}>Brand Logo URL</label>
              <input
                value={account.brand_logo_url}
                onChange={(e) => setAccount({ ...account, brand_logo_url: e.target.value })}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${input}`}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-400 transition-colors disabled:opacity-50"
            >
              {saved ? (
                <>
                  <CheckCircle size={15} /> Saved
                </>
              ) : saving ? (
                'Saving…'
              ) : (
                <>
                  <Save size={15} /> Save Changes
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
