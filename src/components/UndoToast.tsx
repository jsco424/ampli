'use client'

import { useEffect, useState } from 'react'
import { Trash2, Undo2 } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  projectName: string
  onUndo: () => void
  onConfirm: () => void
}

const DURATION = 5000

export default function UndoToast({ projectName, onUndo, onConfirm }: Props) {
  const { dark } = useTheme()
  const [progress, setProgress] = useState(100)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Slide in
    const show = setTimeout(() => setVisible(true), 10)

    // Progress bar
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setProgress(remaining)
      if (remaining === 0) clearInterval(interval)
    }, 50)

    // Auto confirm after duration
    const confirm = setTimeout(() => {
      onConfirm()
    }, DURATION)

    return () => {
      clearTimeout(show)
      clearTimeout(confirm)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className={`relative overflow-hidden rounded-2xl border shadow-2xl min-w-72 max-w-sm
        ${dark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-red-400 transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-3 pt-4">
          <div className="p-2 rounded-xl bg-red-500/10 shrink-0">
            <Trash2 size={14} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">"{projectName}" deleted</p>
            <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Deleting in {Math.ceil(progress / 20)}s...
            </p>
          </div>
          <button
            onClick={onUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors shrink-0">
            <Undo2 size={12} />
            Undo
          </button>
        </div>
      </div>
    </div>
  )
}