'use client'

import { useEffect, useState, useRef } from 'react'
import { FileDown, ChevronDown, FileText, Presentation } from 'lucide-react'

interface ExportRow {
  id: string
  format: 'pptx' | 'pdf'
  file_name: string
  created_at: string
}

// Small "N files" badge that expands into a download history for one
// project. Renders nothing until at least one export exists, so it never
// adds visual clutter to projects that haven't been exported yet.
//
// IMPORTANT: this is designed to sit INSIDE a Next.js <Link> that wraps
// the whole card (see projects/page.tsx and dashboard/page.tsx). Anchor
// tags can't nest inside anchors, so every clickable element here is a
// <button> using preventDefault/stopPropagation + window.location.href —
// same pattern the existing delete button already uses for the same reason.
export default function ExportsDropdown({ projectId, dark }: { projectId: string; dark: boolean }) {
  const [exports, setExports] = useState<ExportRow[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/exports?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setExports(d.exports || []))
      .catch(() => {})
  }, [projectId])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (exports.length === 0) return null

  const dropdownBg = dark ? 'bg-[#111118] border-white/[0.08]' : 'bg-white border-zinc-200'
  const rowHover = dark ? 'hover:bg-white/[0.04]' : 'hover:bg-zinc-50'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${
          dark
            ? 'border-white/[0.08] text-white/50 hover:bg-white/[0.04]'
            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
        }`}
      >
        <FileDown size={11} />
        {exports.length} file{exports.length !== 1 ? 's' : ''}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div
          className={`absolute right-0 top-full mt-1 rounded-xl border shadow-2xl z-20 overflow-hidden w-56 ${dropdownBg}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {exports.map((exp) => (
            <button
              key={exp.id}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                window.location.href = `/api/exports/${exp.id}/download`
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs transition-colors ${rowHover}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {exp.format === 'pptx' ? (
                  <Presentation size={12} className="text-blue-500 shrink-0" />
                ) : (
                  <FileText size={12} className="text-red-400 shrink-0" />
                )}
                <span className="truncate">
                  {exp.format.toUpperCase()} · {new Date(exp.created_at).toLocaleDateString()}
                </span>
              </span>
              <span className={`shrink-0 ${muted}`}>↓</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
