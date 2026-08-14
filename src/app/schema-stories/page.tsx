'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { Plus, Trash2, Sparkles, Copy, Check, Database, X } from 'lucide-react'

interface ColumnInput {
  id: string
  name: string
  type: string
  description: string
}

interface TableInput {
  id: string
  name: string
  notes: string
  columns: ColumnInput[]
}

interface Story {
  title: string
  description: string
  sql: string
}

const DIALECTS: { value: string; label: string }[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlserver', label: 'SQL Server (T-SQL)' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'bigquery', label: 'BigQuery' },
]

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function newColumn(): ColumnInput {
  return { id: newId(), name: '', type: '', description: '' }
}

function newTable(): TableInput {
  return { id: newId(), name: '', notes: '', columns: [newColumn()] }
}

function CopyButton({ text, dark }: { text: string; dark: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
        dark
          ? 'border-white/10 text-white/60 hover:bg-white/5'
          : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
      }`}
    >
      {copied ? <Check size={12} className="text-[#5DCAA5]" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy SQL'}
    </button>
  )
}

export default function SchemaStoriesPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [tables, setTables] = useState<TableInput[]>([newTable()])
  const [dialect, setDialect] = useState('postgres')
  const [stories, setStories] = useState<Story[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-[#080C14]'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const inputCls = dark
    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500'
    : 'bg-[#EAEFF1] border-zinc-200 text-zinc-900 placeholder-zinc-400'

  if (!isLoaded || !user) return null

  const updateTable = (id: string, patch: Partial<TableInput>) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const updateColumn = (tableId: string, colId: string, patch: Partial<ColumnInput>) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id !== tableId
          ? t
          : { ...t, columns: t.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)) }
      )
    )
  }

  const addColumn = (tableId: string) => {
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, columns: [...t.columns, newColumn()] } : t))
    )
  }

  const removeColumn = (tableId: string, colId: string) => {
    setTables((prev) =>
      prev.map((t) =>
        t.id !== tableId ? t : { ...t, columns: t.columns.filter((c) => c.id !== colId) }
      )
    )
  }

  const addTable = () => setTables((prev) => [...prev, newTable()])
  const removeTable = (id: string) => setTables((prev) => prev.filter((t) => t.id !== id))

  const findStories = async () => {
    setLoading(true)
    setError(null)
    setStories(null)
    try {
      const res = await fetch('/api/schema-stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables, dialect }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.message || json.error || 'Something went wrong.')
        return
      }
      setStories(json.stories || [])
    } catch {
      setError('Something went wrong reaching the server.')
    } finally {
      setLoading(false)
    }
  }

  const hasAnyColumn = tables.some((t) => t.name.trim() && t.columns.some((c) => c.name.trim()))

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-20 px-6 max-w-4xl mx-auto pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Schema Stories</h1>
          <p className={`text-sm leading-relaxed ${muted}`}>
            Describe your own internal tables, ampli will propose the most interesting stories they
            could tell and write polished SQL for each, ready to run on your own database. Nothing
            here connects to your database directly, you run the SQL yourself.
          </p>
        </div>

        {/* Dialect */}
        <div
          className={`p-4 rounded-2xl border mb-4 flex items-center justify-between gap-4 ${card}`}
        >
          <div className="flex items-center gap-2">
            <Database size={15} className="text-[#5DCAA5]" />
            <span className="text-sm font-medium">SQL dialect</span>
          </div>
          <select
            value={dialect}
            onChange={(e) => setDialect(e.target.value)}
            className={`text-sm px-3 py-1.5 rounded-lg border outline-none ${inputCls}`}
          >
            {DIALECTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table editor */}
        <div className="space-y-4">
          {tables.map((table) => (
            <div key={table.id} className={`p-5 rounded-2xl border ${card}`}>
              <div className="flex items-start gap-3 mb-3">
                <input
                  value={table.name}
                  onChange={(e) => updateTable(table.id, { name: e.target.value })}
                  placeholder="Table name, e.g. orders"
                  className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border outline-none ${inputCls}`}
                />
                {tables.length > 1 && (
                  <button
                    onClick={() => removeTable(table.id)}
                    title="Remove table"
                    className={`p-2 rounded-lg transition-colors ${dark ? 'text-white/30 hover:text-red-400 hover:bg-white/5' : 'text-zinc-300 hover:text-red-400 hover:bg-zinc-50'}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              <div className="space-y-2 mb-3">
                {table.columns.map((col) => (
                  <div key={col.id} className="flex items-center gap-2">
                    <input
                      value={col.name}
                      onChange={(e) => updateColumn(table.id, col.id, { name: e.target.value })}
                      placeholder="Column name"
                      className={`w-[26%] text-xs px-2.5 py-2 rounded-lg border outline-none ${inputCls}`}
                    />
                    <input
                      value={col.type}
                      onChange={(e) => updateColumn(table.id, col.id, { type: e.target.value })}
                      placeholder="Type, e.g. timestamp"
                      className={`w-[20%] text-xs px-2.5 py-2 rounded-lg border outline-none ${inputCls}`}
                    />
                    <input
                      value={col.description}
                      onChange={(e) =>
                        updateColumn(table.id, col.id, { description: e.target.value })
                      }
                      placeholder="What it means (optional, but helps a lot)"
                      className={`flex-1 text-xs px-2.5 py-2 rounded-lg border outline-none ${inputCls}`}
                    />
                    {table.columns.length > 1 && (
                      <button
                        onClick={() => removeColumn(table.id, col.id)}
                        title="Remove column"
                        className={`p-1.5 rounded-lg shrink-0 transition-colors ${dark ? 'text-white/25 hover:text-red-400 hover:bg-white/5' : 'text-zinc-300 hover:text-red-400 hover:bg-zinc-50'}`}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => addColumn(table.id)}
                className={`flex items-center gap-1.5 text-xs font-medium mb-3 ${dark ? 'text-white/50 hover:text-white/80' : 'text-zinc-500 hover:text-zinc-800'}`}
              >
                <Plus size={13} /> Add column
              </button>

              <textarea
                value={table.notes}
                onChange={(e) => updateTable(table.id, { notes: e.target.value })}
                placeholder="Anything else worth knowing about this table (optional): how it relates to other tables, quirks, what a row represents..."
                rows={2}
                className={`w-full text-xs px-3 py-2 rounded-lg border outline-none resize-none ${inputCls}`}
              />
            </div>
          ))}
        </div>

        <button
          onClick={addTable}
          className={`flex items-center gap-1.5 text-sm font-medium mt-4 px-4 py-2 rounded-xl border transition-colors ${dark ? 'border-white/10 text-white/70 hover:bg-white/5' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
        >
          <Plus size={14} /> Add table
        </button>

        {/* Submit */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={findStories}
            disabled={!hasAnyColumn || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#080C14] text-white text-sm font-semibold hover:bg-[#0F1420] transition-colors disabled:opacity-40"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {loading ? 'Finding stories...' : 'Find Stories'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Results */}
        {stories && stories.length > 0 && (
          <div className="mt-10 space-y-4">
            <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
              {stories.length} stor{stories.length !== 1 ? 'ies' : 'y'} found
            </p>
            {stories.map((s, i) => (
              <div key={i} className={`p-5 rounded-2xl border ${card}`}>
                <p className="font-semibold text-sm mb-1">{s.title}</p>
                <p className={`text-xs leading-relaxed mb-3 ${muted}`}>{s.description}</p>
                <div
                  className={`rounded-xl overflow-hidden border ${dark ? 'border-white/10' : 'border-zinc-200'}`}
                >
                  <div
                    className={`flex items-center justify-between px-3 py-2 border-b ${dark ? 'bg-white/[0.03] border-white/10' : 'bg-zinc-50 border-zinc-200'}`}
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                      {DIALECTS.find((d) => d.value === dialect)?.label}
                    </span>
                    <CopyButton text={s.sql} dark={dark} />
                  </div>
                  <pre
                    className={`p-4 text-xs overflow-x-auto ${dark ? 'bg-[#0a0a0f] text-zinc-300' : 'bg-white text-zinc-700'}`}
                  >
                    <code>{s.sql}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
