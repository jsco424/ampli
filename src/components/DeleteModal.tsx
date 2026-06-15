'use client'

import { Trash2, X } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  projects: { id: string; name: string }[]
  onConfirm: (ids: string[]) => void
  onCancel: () => void
}

export default function DeleteModal({ projects, onConfirm, onCancel }: Props) {
  const { dark } = useTheme()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className={`relative w-full max-w-sm p-6 rounded-2xl border shadow-2xl
        ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500/10">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <h3 className="font-bold text-base">Delete {projects.length > 1 ? `${projects.length} Projects` : 'Project'}</h3>
          </div>
          <button onClick={onCancel}
            className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
            <X size={15} />
          </button>
        </div>

        <p className={`text-sm mb-5 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          {projects.length === 1
            ? `Are you sure you want to delete "${projects[0].name}"? You'll have 5 seconds to undo.`
            : `Are you sure you want to delete these ${projects.length} projects? You'll have 5 seconds to undo.`}
        </p>

        {/* Project list */}
        {projects.length > 1 && (
          <ul className={`mb-5 rounded-xl border divide-y text-sm
            ${dark ? 'border-zinc-800 divide-zinc-800' : 'border-zinc-100 divide-zinc-100'}`}>
            {projects.map(p => (
              <li key={p.id} className={`px-3 py-2 truncate ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {p.name}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-3">
          <button onClick={onCancel}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors
              ${dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'}`}>
            Cancel
          </button>
          <button onClick={() => onConfirm(projects.map(p => p.id))}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}