'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { UserPlus, X, Users, Info } from 'lucide-react'

interface Seat {
  id: string
  email: string
  status: 'invited' | 'active'
  invited_at: string
  activated_at: string | null
}

export default function SeatsPage() {
  const { user } = useUser()
  const { dark } = useTheme()
  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSeats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seats')
      const data = await res.json()
      setSeats(data.seats || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadSeats()
  }, [user])

  const handleAdd = async () => {
    if (!email.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add seat')
      setEmail('')
      await loadSeats()
    } catch (err: any) {
      setError(err.message || 'Failed to add seat')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (seatId: string) => {
    await fetch('/api/seats', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatId }),
    })
    await loadSeats()
  }

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-blue-400'
  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const subtler = dark ? 'text-zinc-500' : 'text-zinc-400'

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-24 px-6 max-w-2xl mx-auto pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Team Seats</h1>
          <p className={`text-sm ${subtle}`}>
            Add teammates by email — once they sign up or sign in with that email, they'll share
            your plan and credit pool automatically, no separate subscription needed.
          </p>
        </div>

        <div
          className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border mb-4 ${dark ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}
        >
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p
            className={`text-xs leading-relaxed ${dark ? 'text-blue-200/70' : 'text-blue-900/70'}`}
          >
            This is a Business-tier feature. Everyone you add draws from the same shared credit pool
            as your own account — their usage counts toward your monthly limit, same as if you'd
            generated it yourself.
          </p>
        </div>

        <div className={`p-5 rounded-2xl border mb-4 ${card}`}>
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="teammate@yourcompany.com"
              className={`flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${input}`}
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors disabled:opacity-50 shrink-0"
            >
              <UserPlus size={14} /> {adding ? 'Adding…' : 'Add Seat'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>

        <div className={`p-5 rounded-2xl border ${card}`}>
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} className="text-blue-400" />
            <p className="font-semibold text-sm">Your Team ({seats.length})</p>
          </div>

          {loading ? (
            <p className={`text-xs ${subtle}`}>Loading…</p>
          ) : seats.length === 0 ? (
            <p className={`text-xs ${subtle}`}>No teammates added yet.</p>
          ) : (
            <div className="space-y-2">
              {seats.map((seat) => (
                <div
                  key={seat.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${dark ? 'border-zinc-800' : 'border-zinc-100'}`}
                >
                  <div>
                    <p className="text-sm font-medium">{seat.email}</p>
                    <p className={`text-[11px] ${subtler}`}>
                      {seat.status === 'active' ? 'Active' : 'Invited — waiting for first sign-in'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(seat.id)}
                    className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-zinc-100 text-zinc-400'}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
