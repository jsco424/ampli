'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

const TAG_COLORS = [
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-red-500/20 text-red-400 border-red-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
]

export function getTagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

// Normalize tag — makes "E-Commerce", "eCommerce", "e commerce" all become "ecommerce"
export function normalizeTag(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-') // spaces/underscores → hyphens
    .replace(/[^a-z0-9-]/g, '') // strip special chars
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-|-$/g, '') // trim leading/trailing hyphens
}

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  existingTags?: string[] // all tags across all projects for autocomplete
  placeholder?: string
  maxTags?: number
}

export default function TagInput({
  tags,
  onChange,
  existingTags = [],
  placeholder = 'Add tag...',
  maxTags = 10,
}: Props) {
  const { dark } = useTheme()
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Suggestions: existing tags that match input and aren't already added
  const suggestions =
    input.length > 0
      ? existingTags
          .filter(
            (t) => t.includes(normalizeTag(input)) && !tags.includes(t) && t !== normalizeTag(input)
          )
          .slice(0, 6)
      : []

  useEffect(() => {
    setShowSuggestions(suggestions.length > 0 && focused)
  }, [suggestions.length, focused])

  // Close suggestions on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addTag = (value: string) => {
    const tag = normalizeTag(value)
    if (!tag || tags.includes(tag) || tags.length >= maxTags) return
    onChange([...tags, tag])
    setInput('')
    setShowSuggestions(false)
  }

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag))

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
    if (e.key === 'Escape') setShowSuggestions(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap gap-1.5 px-3 py-2 rounded-xl border min-h-10 cursor-text transition-colors
          ${
            focused
              ? 'border-blue-500 ring-2 ring-blue-500/20'
              : dark
                ? 'border-zinc-700 bg-zinc-800'
                : 'border-zinc-300 bg-white'
          }`}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${getTagColor(tag)}`}
          >
            {tag}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="hover:opacity-60 transition-opacity ml-0.5"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {tags.length < maxTags && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              setTimeout(() => {
                if (input.trim()) addTag(input)
              }, 150)
            }}
            placeholder={tags.length === 0 ? placeholder : ''}
            className={`flex-1 min-w-20 bg-transparent outline-none text-xs
              ${dark ? 'text-white placeholder-zinc-500' : 'text-zinc-900 placeholder-zinc-400'}`}
          />
        )}
      </div>

      {/* Autocomplete suggestions */}
      {showSuggestions && (
        <div
          className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl z-50 overflow-hidden
          ${dark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}
        >
          <p className={`px-3 pt-2 pb-1 text-xs ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Existing tags
          </p>
          {suggestions.map((tag) => (
            <button
              key={tag}
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(tag)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors
                ${dark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-50'}`}
            >
              <span className={`px-2 py-0.5 rounded-lg border font-medium ${getTagColor(tag)}`}>
                {tag}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
