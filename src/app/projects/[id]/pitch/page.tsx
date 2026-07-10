'use client'

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useBrand } from '@/hooks/useBrand'
import { useTheme } from '@/hooks/useTheme'
import ChartRenderer from '@/components/ChartRenderer'
import type { AnalysisHandoff } from '@/lib/analysisTypes'
import {
  ChevronLeft,
  ChevronRight,
  X,
  Timer,
  Maximize,
  Minimize,
  RotateCcw,
  LayoutGrid,
  Bold,
  Italic,
  Plus,
  Minus,
  Sparkles,
  ArrowLeft,
  Download,
  FileDown,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number }
type LayoutPreset = 'split-right' | 'split-left' | 'full-bleed' | 'top-bottom'
type TextStyle = { bold?: boolean; italic?: boolean; sizePx?: number; color?: string }

type Slide =
  | { type: 'title'; project: any }
  | { type: 'insights'; insights: any[] }
  | { type: 'chart'; chart: any; index: number }
  | { type: 'table'; table: any; takeaway: string; index: number }
  | { type: 'recommendations'; recommendations: any[]; narrative: string }

type GenerationState = 'idle' | 'generating' | 'ready' | 'no_data'

const DEFAULT_SIZE_PX = 16
const MIN_SIZE_PX = 10
const MAX_SIZE_PX = 96
const POLL_INTERVAL_MS = 2500
const POLL_MAX_ATTEMPTS = 40

const GENERATION_STEPS = [
  'Reading confirmed analysis findings',
  'Mapping findings to slide structure',
  'Building chart data from verified metrics',
  'Writing narrative grounded in conversation',
  'Generating recommendations',
]

const LAYOUT_OPTIONS: { key: LayoutPreset; label: string }[] = [
  { key: 'split-right', label: 'Split Right' },
  { key: 'split-left', label: 'Split Left' },
  { key: 'full-bleed', label: 'Full Bleed' },
  { key: 'top-bottom', label: 'Top / Bottom' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function LayoutIcon({ layout, active }: { layout: LayoutPreset; active?: boolean }) {
  const stroke = active ? '#3b82f6' : 'rgba(128,128,128,0.5)'
  const fill = active ? 'rgba(59,130,246,0.25)' : 'rgba(128,128,128,0.08)'
  if (layout === 'split-right')
    return (
      <svg width={28} height={20} viewBox="0 0 32 22">
        <rect
          x="1"
          y="1"
          width="20"
          height="20"
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <rect
          x="23"
          y="1"
          width="8"
          height="20"
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      </svg>
    )
  if (layout === 'split-left')
    return (
      <svg width={28} height={20} viewBox="0 0 32 22">
        <rect
          x="1"
          y="1"
          width="8"
          height="20"
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <rect
          x="11"
          y="1"
          width="20"
          height="20"
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      </svg>
    )
  if (layout === 'full-bleed')
    return (
      <svg width={28} height={20} viewBox="0 0 32 22">
        <rect
          x="1"
          y="1"
          width="30"
          height="20"
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <rect x="19" y="13" width="10" height="6" rx="1.5" fill={stroke} opacity="0.5" />
      </svg>
    )
  if (layout === 'top-bottom')
    return (
      <svg width={28} height={20} viewBox="0 0 32 22">
        <rect
          x="1"
          y="1"
          width="30"
          height="13"
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
        <rect
          x="1"
          y="16"
          width="30"
          height="5"
          rx="1.5"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      </svg>
    )
  return null
}

function boxesForLayout(
  layout: LayoutPreset,
  width: number,
  height: number
): { chart: Box; hero: Box } {
  const padX = 48,
    padY = 96,
    gap = 20,
    heroW = 256,
    takeawayStripH = 130
  switch (layout) {
    case 'split-left':
      return {
        hero: { x: padX, y: padY, w: heroW, h: height - padY - 24 },
        chart: {
          x: padX + heroW + gap,
          y: padY,
          w: width - padX * 2 - heroW - gap,
          h: height - padY - 24,
        },
      }
    case 'full-bleed': {
      const fbHeroW = 280,
        fbHeroH = 160,
        fbGap = 20
      return {
        chart: { x: padX, y: padY, w: width - padX * 2, h: height - padY - 24 - fbHeroH - fbGap },
        hero: { x: width - padX - fbHeroW, y: height - 24 - fbHeroH, w: fbHeroW, h: fbHeroH },
      }
    }
    case 'top-bottom':
      return {
        chart: {
          x: padX,
          y: padY,
          w: width - padX * 2,
          h: height - padY - takeawayStripH - gap - 16,
        },
        hero: { x: padX, y: height - takeawayStripH - 16, w: width - padX * 2, h: takeawayStripH },
      }
    default:
      return {
        chart: { x: padX, y: padY, w: width - padX * 2 - heroW - gap, h: height - padY - 24 },
        hero: { x: width - padX - heroW, y: padY, w: heroW, h: height - padY - 24 },
      }
  }
}

function slideCaption(slide: Slide): string {
  if (slide.type === 'title') return slide.project.pitch_title || slide.project.name || 'Title'
  if (slide.type === 'insights') return 'Key Insights'
  if (slide.type === 'chart') return slide.chart?.title || `Chart ${slide.index + 1}`
  if (slide.type === 'table') return slide.table?.title || `Table ${slide.index + 1}`
  if (slide.type === 'recommendations') return 'Recommendations'
  return ''
}

// ── SlideThumbnailPreview ──────────────────────────────────────────────────

function SlideThumbnailPreview({
  slide,
  brand,
  brandColors,
}: {
  slide: Slide
  brand: any
  brandColors: string[]
}) {
  const { dark } = useTheme()
  const slideBg = dark
    ? 'linear-gradient(145deg, #111113 0%, #1c1c1f 100%)'
    : 'linear-gradient(145deg, #ffffff 0%, #f5f5fa 100%)'
  const labelColor = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'

  function renderContent() {
    if (slide.type === 'title') {
      return (
        <div className="flex flex-col items-center justify-center h-full px-3 text-center">
          <div
            className="h-1.5 w-10 rounded-full mb-1.5"
            style={{
              background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            }}
          />
          <div
            className="text-[7px] font-bold leading-tight line-clamp-2"
            style={{ color: brand.primaryColor }}
          >
            {slide.project.pitch_title || slide.project.name || 'Pitch title'}
          </div>
        </div>
      )
    }
    if (slide.type === 'insights') {
      return (
        <div className="h-full p-2 flex flex-col">
          <div className="text-[6px] font-bold mb-1" style={{ color: labelColor }}>
            Key Insights
          </div>
          <div className="grid grid-cols-3 gap-0.5 flex-1">
            {Array.from({ length: Math.min(6, Math.max(slide.insights.length, 3)) }).map((_, i) => (
              <div
                key={i}
                className="rounded-sm"
                style={{
                  background: `${brand.primaryColor}20`,
                  border: `0.5px solid ${brand.primaryColor}40`,
                }}
              />
            ))}
          </div>
        </div>
      )
    }
    if (slide.type === 'chart') {
      return (
        <div className="h-full flex flex-col">
          {Array.isArray(slide.chart?.data) && slide.chart.data.length > 0 ? (
            <div
              className="relative w-full overflow-hidden rounded-lg"
              style={{ paddingBottom: '56.25%' }}
            >
              <div
                className="absolute top-0 left-0"
                style={{
                  width: 560,
                  height: 315,
                  transform: 'scale(0.25)',
                  transformOrigin: 'top left',
                }}
              >
                <ChartRenderer chart={slide.chart} colors={brandColors} height={315} dark={dark} />
              </div>
            </div>
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-[6px]"
              style={{ color: labelColor }}
            >
              No data
            </div>
          )}
        </div>
      )
    }
    if (slide.type === 'table') {
      return (
        <div className="h-full p-2 flex flex-col">
          <div className="text-[6px] font-bold mb-1" style={{ color: labelColor }}>
            {slide.table?.title || 'Data Table'}
          </div>
          <div className="flex-1 space-y-0.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-2 rounded-sm w-full"
                style={{
                  background:
                    i === 0
                      ? `${brand.primaryColor}40`
                      : dark
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(0,0,0,0.05)',
                }}
              />
            ))}
          </div>
        </div>
      )
    }
    if (slide.type === 'recommendations') {
      return (
        <div className="h-full p-2 flex flex-col">
          <div className="text-[6px] font-bold mb-1" style={{ color: labelColor }}>
            Recommendations
          </div>
          <div className="grid grid-cols-3 gap-0.5 flex-1">
            {(slide.recommendations.length ? slide.recommendations.slice(0, 3) : [0, 1, 2]).map(
              (_, i) => (
                <div
                  key={i}
                  className="rounded-sm"
                  style={{
                    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    border: `0.5px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                  }}
                />
              )
            )}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div
      className="relative w-full aspect-video rounded-lg overflow-hidden pointer-events-none"
      style={{ background: slideBg }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
        }}
      />
      {renderContent()}
    </div>
  )
}

// ── StyleToolbar ───────────────────────────────────────────────────────────

function StyleToolbar({
  style,
  onChange,
  brandColors,
}: {
  style: TextStyle
  onChange: (s: TextStyle) => void
  brandColors: string[]
}) {
  const { dark } = useTheme()
  const currentSize = style.sizePx ?? DEFAULT_SIZE_PX
  const press = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fn()
  }
  const toolbarCls = dark ? 'bg-zinc-900/95 border-white/10' : 'bg-white/95 border-black/10'
  const btnBase = dark
    ? 'border-white/10 opacity-60 hover:opacity-90'
    : 'border-black/10 opacity-60 hover:opacity-90'
  const btnActive = 'border-blue-500 bg-blue-500/20 text-blue-500'
  const divider = dark ? 'bg-white/10' : 'bg-black/10'
  return (
    <div
      data-no-drag="true"
      className={`absolute -top-11 left-0 z-50 flex items-center gap-1 p-1.5 rounded-xl border shadow-2xl whitespace-nowrap ${toolbarCls}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onMouseDown={press(() => onChange({ ...style, bold: !style.bold }))}
        className={`p-1.5 rounded-lg border ${style.bold ? btnActive : btnBase}`}
      >
        <Bold size={12} />
      </button>
      <button
        onMouseDown={press(() => onChange({ ...style, italic: !style.italic }))}
        className={`p-1.5 rounded-lg border ${style.italic ? btnActive : btnBase}`}
      >
        <Italic size={12} />
      </button>
      <div className={`w-px h-5 mx-0.5 ${divider}`} />
      <button
        onMouseDown={press(() =>
          onChange({ ...style, sizePx: Math.max(MIN_SIZE_PX, currentSize - 2) })
        )}
        className={`p-1.5 rounded-lg border ${btnBase}`}
      >
        <Minus size={11} />
      </button>
      <span className="text-[10px] font-mono opacity-60 w-7 text-center">{currentSize}</span>
      <button
        onMouseDown={press(() =>
          onChange({ ...style, sizePx: Math.min(MAX_SIZE_PX, currentSize + 2) })
        )}
        className={`p-1.5 rounded-lg border ${btnBase}`}
      >
        <Plus size={11} />
      </button>
      <div className={`w-px h-5 mx-0.5 ${divider}`} />
      {brandColors.map((c) => (
        <button
          key={c}
          onMouseDown={press(() => onChange({ ...style, color: c }))}
          className={`w-5 h-5 rounded-full border-2 ${style.color === c ? 'border-white' : 'border-transparent'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

// ── DraggableBox ───────────────────────────────────────────────────────────

function DraggableBox({
  box,
  onChange,
  onCommit,
  selected,
  onSelect,
  children,
}: {
  box: Box
  onChange: (b: Box) => void
  onCommit: (b: Box) => void
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  const dragRef = useRef<{
    mode: 'move' | 'resize'
    startX: number
    startY: number
    orig: Box
    moved: boolean
  } | null>(null)
  const currentBoxRef = useRef(box)
  useEffect(() => {
    currentBoxRef.current = box
  }, [box])
  const DRAG_THRESHOLD = 4

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: box, moved: false }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX,
      dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    d.moved = true
    if (d.mode === 'move') onChange({ ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy })
    else onChange({ ...d.orig, w: Math.max(80, d.orig.w + dx), h: Math.max(60, d.orig.h + dy) })
  }
  const onPointerUp = () => {
    const d = dragRef.current
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    if (d?.moved) onCommit(currentBoxRef.current)
    dragRef.current = null
  }

  return (
    <div
      className="absolute group/box"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        outline: selected ? '1.5px dashed rgba(59,130,246,0.7)' : 'none',
      }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('[data-no-drag]')) onSelect()
      }}
    >
      <div className="w-full h-full" style={{ cursor: selected ? 'move' : 'pointer' }}>
        {children}
      </div>
      {selected && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation()
            onPointerDown(e, 'resize')
          }}
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-sm bg-blue-500 border-2 border-white cursor-nwse-resize z-50"
        />
      )}
    </div>
  )
}

// ── EditableText ───────────────────────────────────────────────────────────

function EditableText({
  value,
  onCommit,
  placeholder,
  className,
  style,
  multiline,
  theme,
  textStyle,
  onStyleChange,
  brandColors,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  multiline?: boolean
  theme: 'dark' | 'light'
  textStyle?: TextStyle
  onStyleChange?: (s: TextStyle) => void
  brandColors?: string[]
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  useEffect(() => {
    setDraft(value)
  }, [value])
  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }
  const appliedStyle: React.CSSProperties = {
    ...style,
    fontWeight: textStyle?.bold ? 700 : style?.fontWeight,
    fontStyle: textStyle?.italic ? 'italic' : undefined,
    color: textStyle?.color || style?.color,
    fontSize: textStyle?.sizePx ? `${textStyle.sizePx}px` : style?.fontSize,
  }

  if (editing) {
    const inputCls = `${className} bg-transparent outline-none border-b-2 ${theme === 'dark' ? 'border-blue-400' : 'border-blue-500'} w-full resize-none`
    return (
      <div className="relative inline-block w-full">
        {onStyleChange && brandColors && (
          <StyleToolbar
            style={textStyle || {}}
            onChange={onStyleChange}
            brandColors={brandColors}
          />
        )}
        {multiline ? (
          <textarea
            ref={ref as any}
            data-no-drag="true"
            value={draft}
            className={inputCls}
            style={appliedStyle}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(value)
                setEditing(false)
              }
            }}
          />
        ) : (
          <input
            ref={ref as any}
            data-no-drag="true"
            value={draft}
            className={inputCls}
            style={appliedStyle}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                if (e.key === 'Escape') setDraft(value)
                commit()
              }
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      data-no-drag="true"
      onPointerUp={() => setEditing(true)}
      className={`${className} cursor-text rounded transition-colors hover:bg-blue-500/10 px-0.5 -mx-0.5`}
      style={appliedStyle}
    >
      {value || <span className="opacity-30">{placeholder}</span>}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PitchDeckPage() {
  const { id } = useParams()
  const router = useRouter()
  const { brand } = useBrand()
  const { dark } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const slideAreaRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollAttempts = useRef(0)

  const [project, setProject] = useState<any>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [genState, setGenState] = useState<GenerationState>('idle')
  const [genStep, setGenStep] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const [animating, setAnimating] = useState(false)
  const [visible, setVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const timerRef = useRef<any>(null)
  const [slideSize, setSlideSize] = useState({ width: 1000, height: 560 })
  const [gammaLoading, setGammaLoading] = useState(false)
  const [gammaError, setGammaError] = useState<string | null>(null)
  const [selectedBox, setSelectedBox] = useState<'chart' | 'hero' | null>(null)
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)

  const handleGammaExport = async (format: 'pptx' | 'pdf') => {
    if (!project) return
    setGammaLoading(true)
    setGammaError(null)
    try {
      const res = await fetch('/api/gamma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, exportFormat: format }),
      })
      const data = await res.json()
      if (!res.ok || !data.exportUrl) {
        throw new Error(data.error || 'Export failed')
      }
      // Trigger browser download — user never leaves ampli
      const a = document.createElement('a')
      a.href = data.exportUrl
      a.download = `${project.name || 'presentation'}.${format}`
      a.click()
    } catch (err: any) {
      setGammaError(err.message || 'Export failed — please try again')
    } finally {
      setGammaLoading(false)
    }
  }

  const BRAND_COLORS = [
    brand.primaryColor,
    brand.secondaryColor,
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
  ]

  const T = {
    pageBg: dark
      ? 'linear-gradient(135deg, #09090b 0%, #18181b 100%)'
      : 'linear-gradient(135deg, #e2e2ec 0%, #d6d6e4 100%)',
    slideBg: dark
      ? 'linear-gradient(145deg, #111113 0%, #1c1c1f 100%)'
      : 'linear-gradient(145deg, #ffffff 0%, #f5f5fa 100%)',
    slideBorder: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    textColor: dark ? '#ffffff' : '#0a0a0b',
    dimColor: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)',
    dimColor2: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    cardBg: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    cardBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    divider: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    chromeBorder: dark ? 'border-white/5' : 'border-black/5',
    text: dark ? 'text-white' : 'text-zinc-900',
    railBg: dark ? '' : 'bg-white/40',
    btnHover: dark ? 'hover:bg-white/10' : 'hover:bg-black/5',
    btnBorder: dark ? 'border-white/10' : 'border-black/10',
    timerActive: dark ? 'bg-red-500/20 text-red-400' : 'bg-red-500/15 text-red-600',
    dimOpacity: dark ? 'opacity-40' : 'opacity-50',
    slideTheme: dark ? ('dark' as const) : ('light' as const),
  }

  // Build slides — selection-aware when analysis_handoff.selectedFindings exists
  const buildSlides = (data: any): Slide[] => {
    const handoff = data.analysis_handoff
    const selections: any[] = handoff?.selectedFindings || []
    const titleSlide: Slide = { type: 'title', project: data }
    const recsSlide: Slide = {
      type: 'recommendations',
      recommendations: data.recommendations || [],
      narrative: data.narrative || '',
    }

    if (selections.length > 0) {
      const contentSlides: Slide[] = selections.map((sel: any, i: number) => {
        if (sel.type === 'table') {
          return { type: 'table' as const, table: sel.table, takeaway: sel.takeaway, index: i }
        }

        // Match generated chart by index — but always override hero_stat and
        // takeaway with the user-confirmed values from the selection. The AI
        // may have reworded or changed these; the user's explicit choices win.
        const generatedChart = data.charts?.[i]
        const chart = {
          // Chart type and data come from generation (AI filled in data points)
          type:
            generatedChart?.type ||
            (sel.chartType === 'grouped_bar' ? 'bar' : sel.chartType || 'bar'),
          data: generatedChart?.data?.length > 0 ? generatedChart.data : sel.chartData || [],
          stacked: generatedChart?.stacked || false,
          // Title and description from generation — AI writes these
          title: generatedChart?.title || sel.finding?.label || '',
          description: generatedChart?.description || sel.finding?.interpretation || '',
          // Hero stat and takeaway are USER-CONFIRMED — never use AI's version
          hero_stat: sel.heroStat,
          takeaway: sel.takeaway,
          layout: generatedChart?.layout || 'split-right',
          // Carry through any annotations or reference lines from generation
          annotations: generatedChart?.annotations,
          reference_line: generatedChart?.reference_line,
        }
        return { type: 'chart' as const, chart, index: i }
      })
      return [titleSlide, ...contentSlides, recsSlide]
    }

    // Legacy flow — no selections, use generic structure
    return [
      titleSlide,
      { type: 'insights', insights: data.insights || [] },
      ...(data.charts || []).map((chart: any, i: number) => ({
        type: 'chart' as const,
        chart,
        index: i,
      })),
      recsSlide,
    ]
  }

  const startPolling = useCallback((projectId: string) => {
    pollAttempts.current = 0
    if (pollRef.current) clearInterval(pollRef.current)
    let stepIdx = 0
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, GENERATION_STEPS.length - 1)
      setGenStep(stepIdx)
    }, 3500)
    pollRef.current = setInterval(async () => {
      pollAttempts.current += 1
      if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
        clearInterval(pollRef.current!)
        clearInterval(stepTimer)
        setGenError(
          'Slide generation is taking longer than expected. Please go back and try again.'
        )
        setGenState('no_data')
        return
      }
      const { data } = await supabase.from('projects').select('*').eq('id', projectId).single()
      if (data?.charts?.length > 0) {
        clearInterval(pollRef.current!)
        clearInterval(stepTimer)
        setProject(data)
        setSlides(buildSlides(data))
        setGenState('ready')
      }
    }, POLL_INTERVAL_MS)
    return () => {
      clearInterval(pollRef.current!)
      clearInterval(stepTimer)
    }
  }, [])

  const triggerGeneration = useCallback(
    async (data: any) => {
      setGenState('generating')
      setGenStep(0)
      const handoff: AnalysisHandoff | null = data.analysis_handoff || null
      try {
        await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: data.id,
            dataSummary: data.raw_data || null,
            rawSample: null,
            prompt: data.prompt || null,
            tone: data.tone || 'executive',
            projectName: data.name,
            targetCompany: data.target_company || null,
            targetAudience: null,
            optIn: data.opt_in_crowd || false,
            dataSourceType: data.data_source_type || null,
            confirmedAnalysis: handoff?.confirmedAnalysis || null,
            selectedFindings: handoff?.selectedFindings || null,
          }),
        })
        startPolling(data.id)
      } catch {
        setGenError('Failed to start slide generation. Please go back and try again.')
        setGenState('no_data')
      }
    },
    [startPolling]
  )

  useEffect(() => {
    if (!id) return
    supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return
        setProject(data)
        if (data.charts?.length > 0) {
          setSlides(buildSlides(data))
          setGenState('ready')
        } else if (data.analysis_handoff || data.raw_data) {
          triggerGeneration(data)
        } else {
          setGenState('no_data')
        }
      })
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [id])

  useLayoutEffect(() => {
    if (genState !== 'ready') return
    const el = slideAreaRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0)
        setSlideSize({ width: rect.width, height: rect.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [genState])

  useEffect(() => {
    if (timerRunning) timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    else clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [timerRunning])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const go = useCallback(
    (dir: 'prev' | 'next') => {
      if (animating) return
      const next = dir === 'next' ? current + 1 : current - 1
      if (next < 0 || next >= slides.length) return
      setSelectedBox(null)
      setShowLayoutPicker(false)
      setDirection(dir === 'next' ? 'right' : 'left')
      setAnimating(true)
      setVisible(false)
      setTimeout(() => {
        setCurrent(next)
        setVisible(true)
        setTimeout(() => setAnimating(false), 400)
      }, 300)
    },
    [animating, current, slides.length]
  )

  const goTo = useCallback(
    (i: number) => {
      if (i === current) return
      setSelectedBox(null)
      setShowLayoutPicker(false)
      setDirection(i > current ? 'right' : 'left')
      setVisible(false)
      setTimeout(() => {
        setCurrent(i)
        setVisible(true)
      }, 300)
    },
    [current]
  )

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go('next')
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go('prev')
      if (e.key === 'Escape' && !document.fullscreenElement) router.push(`/projects/${id}`)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [go, id, router])

  // ── Patch helpers ──────────────────────────────────────────────────────

  const updateChart = async (chartIndex: number, patch: any) => {
    if (!project) return
    const updated = [...(project.charts || [])]
    updated[chartIndex] = { ...updated[chartIndex], ...patch }
    setProject((p: any) => ({ ...p, charts: updated }))
    setSlides((s) =>
      s.map((sl) =>
        sl.type === 'chart' && sl.index === chartIndex ? { ...sl, chart: updated[chartIndex] } : sl
      )
    )
    await supabase.from('projects').update({ charts: updated }).eq('id', id)
  }
  const updateInsight = async (insightIndex: number, patch: any) => {
    if (!project) return
    const updated = [...(project.insights || [])]
    updated[insightIndex] = { ...updated[insightIndex], ...patch }
    setProject((p: any) => ({ ...p, insights: updated }))
    setSlides((s) => s.map((sl) => (sl.type === 'insights' ? { ...sl, insights: updated } : sl)))
    await supabase.from('projects').update({ insights: updated }).eq('id', id)
  }
  const updateRecommendation = async (recIndex: number, patch: any) => {
    if (!project) return
    const updated = [...(project.recommendations || [])]
    updated[recIndex] = { ...updated[recIndex], ...patch }
    setProject((p: any) => ({ ...p, recommendations: updated }))
    setSlides((s) =>
      s.map((sl) => (sl.type === 'recommendations' ? { ...sl, recommendations: updated } : sl))
    )
    await supabase.from('projects').update({ recommendations: updated }).eq('id', id)
  }
  const updateProjectField = async (field: string, value: any) => {
    if (!project) return
    setProject((p: any) => ({ ...p, [field]: value }))
    setSlides((s) =>
      s.map((sl) =>
        sl.type === 'title' ? { ...sl, project: { ...sl.project, [field]: value } } : sl
      )
    )
    await supabase
      .from('projects')
      .update({ [field]: value })
      .eq('id', id)
  }
  const applyLayout = (chartIndex: number, layout: LayoutPreset) => {
    const boxes = boxesForLayout(layout, slideSize.width, slideSize.height)
    updateChart(chartIndex, { layout, chart_box: boxes.chart, hero_box: boxes.hero })
    setShowLayoutPicker(false)
  }
  const resetBoxes = (chart: any, chartIndex: number) => {
    const layout: LayoutPreset = chart.layout || 'split-right'
    const boxes = boxesForLayout(layout, slideSize.width, slideSize.height)
    updateChart(chartIndex, { chart_box: boxes.chart, hero_box: boxes.hero })
  }

  // ── Slide renderers ────────────────────────────────────────────────────

  const HeroPanelContent = ({ chart, chartIndex }: { chart: any; chartIndex: number }) => (
    <div
      className="flex flex-col items-center justify-center rounded-2xl p-6 h-full w-full"
      style={{
        background: `linear-gradient(135deg, ${brand.primaryColor}${dark ? '22' : '18'}, ${brand.primaryColor}${dark ? '44' : '30'})`,
      }}
    >
      <EditableText
        value={chart.hero_stat || ''}
        onCommit={(v) => updateChart(chartIndex, { hero_stat: v })}
        placeholder="+0%"
        theme={T.slideTheme}
        className="font-black mb-3 leading-none text-center text-6xl"
        style={{ color: brand.primaryColor }}
        textStyle={chart.hero_text_style || {}}
        onStyleChange={(s) => updateChart(chartIndex, { hero_text_style: s })}
        brandColors={BRAND_COLORS}
      />
      <EditableText
        value={chart.takeaway || ''}
        onCommit={(v) => updateChart(chartIndex, { takeaway: v })}
        placeholder="Add a takeaway..."
        theme={T.slideTheme}
        multiline
        className="text-center leading-relaxed opacity-90 text-lg font-medium"
        style={{ color: dark ? '#ffffff' : '#0a0a0b' }}
        textStyle={chart.takeaway_text_style || {}}
        onStyleChange={(s) => updateChart(chartIndex, { takeaway_text_style: s })}
        brandColors={BRAND_COLORS}
      />
    </div>
  )

  const renderChartSlide = (chart: any, index: number) => {
    const layout: LayoutPreset = chart.layout || 'split-right'
    const defaults = boxesForLayout(layout, slideSize.width, slideSize.height)
    const isValidBox = (b: any): b is Box =>
      b && typeof b.w === 'number' && typeof b.h === 'number' && b.w > 20 && b.h > 20
    const liveChartBox = isValidBox(chart.chart_box) ? chart.chart_box : defaults.chart
    const liveHeroBox = isValidBox(chart.hero_box) ? chart.hero_box : defaults.hero
    const chartKey = `${index}-${layout}-${Math.round(slideSize.width)}x${Math.round(slideSize.height)}`
    const hasChartData = Array.isArray(chart?.data) && chart.data.length > 0

    return (
      <div
        className="absolute inset-0"
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest('[data-no-drag]')) {
            setSelectedBox(null)
            setShowLayoutPicker(false)
          }
        }}
      >
        <div className="absolute top-0 left-0 px-8 pt-6" style={{ width: slideSize.width - 64 }}>
          <EditableText
            value={chart.title || ''}
            onCommit={(v) => updateChart(index, { title: v })}
            placeholder="Chart title"
            theme={T.slideTheme}
            className="text-xl font-bold leading-tight"
            textStyle={chart.title_text_style || {}}
            onStyleChange={(s) => updateChart(index, { title_text_style: s })}
            brandColors={BRAND_COLORS}
          />
          <EditableText
            value={chart.description || ''}
            onCommit={(v) => updateChart(index, { description: v })}
            placeholder="Add a description..."
            theme={T.slideTheme}
            className="text-sm mt-1"
            style={{ color: T.dimColor }}
            textStyle={chart.description_text_style || {}}
            onStyleChange={(s) => updateChart(index, { description_text_style: s })}
            brandColors={BRAND_COLORS}
          />
        </div>

        {(selectedBox === 'chart' || selectedBox === 'hero') && (
          <div
            className={`absolute top-3 right-3 z-50 flex items-center gap-1.5 p-1.5 rounded-xl border shadow-2xl ${dark ? 'bg-zinc-900/95 border-white/10' : 'bg-white/95 border-black/10'}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowLayoutPicker(!showLayoutPicker)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${showLayoutPicker ? 'border-blue-500 bg-blue-500/20 text-blue-500' : `${T.btnBorder} ${T.dimOpacity} hover:opacity-100`}`}
            >
              <LayoutGrid size={12} /> Layout
            </button>
            <button
              onClick={() => resetBoxes(chart, index)}
              title="Reset position"
              className={`p-1.5 rounded-lg border transition-opacity ${T.btnBorder} ${T.dimOpacity} hover:opacity-90`}
            >
              <RotateCcw size={12} />
            </button>
            {showLayoutPicker && (
              <div
                className={`absolute top-full right-0 mt-1.5 p-2 rounded-xl border shadow-2xl grid grid-cols-2 gap-1.5 w-32 ${dark ? 'bg-zinc-900 border-white/10' : 'bg-white border-black/10'}`}
              >
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => applyLayout(index, opt.key)}
                    title={opt.label}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-colors ${layout === opt.key ? 'border-blue-500 bg-blue-500/15' : `${T.btnBorder} hover:border-blue-500/40`}`}
                  >
                    <LayoutIcon layout={opt.key} active={layout === opt.key} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <DraggableBox
          box={liveChartBox}
          onChange={(b) =>
            setSlides((s) =>
              s.map((sl) =>
                sl.type === 'chart' && sl.index === index
                  ? { ...sl, chart: { ...sl.chart, chart_box: b } }
                  : sl
              )
            )
          }
          onCommit={(b) => updateChart(index, { chart_box: b })}
          selected={selectedBox === 'chart'}
          onSelect={() => setSelectedBox('chart')}
        >
          {hasChartData ? (
            <ChartRenderer
              key={chartKey}
              chart={chart}
              colors={BRAND_COLORS}
              height={liveChartBox.h}
              dark={dark}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center rounded-2xl text-sm"
              style={{ border: `1px dashed ${T.divider}`, color: T.dimColor }}
            >
              No data for this chart
            </div>
          )}
        </DraggableBox>

        <DraggableBox
          box={liveHeroBox}
          onChange={(b) =>
            setSlides((s) =>
              s.map((sl) =>
                sl.type === 'chart' && sl.index === index
                  ? { ...sl, chart: { ...sl.chart, hero_box: b } }
                  : sl
              )
            )
          }
          onCommit={(b) => updateChart(index, { hero_box: b })}
          selected={selectedBox === 'hero'}
          onSelect={() => setSelectedBox('hero')}
        >
          <HeroPanelContent chart={chart} chartIndex={index} />
        </DraggableBox>
      </div>
    )
  }

  const renderTableSlide = (slide: Extract<Slide, { type: 'table' }>) => (
    <div className="flex flex-col h-full px-8 py-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold leading-tight">{slide.table?.title || 'Data Table'}</h2>
        {slide.table?.description && (
          <p className="text-sm mt-1" style={{ color: T.dimColor }}>
            {slide.table.description}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {(slide.table?.headers || []).map((h: string, i: number) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: T.dimColor, borderBottom: `1px solid ${T.divider}` }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(slide.table?.rows || []).map((row: any[], ri: number) => (
              <tr key={ri} style={{ borderBottom: `1px solid ${T.divider}` }}>
                {row.map((cell: any, ci: number) => (
                  <td
                    key={ci}
                    className="px-3 py-2.5"
                    style={{ color: ci === 0 ? T.textColor : T.dimColor2 }}
                  >
                    {typeof cell === 'object' && cell !== null ? cell.display : String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {slide.takeaway && (
        <div
          className="mt-4 pt-4 flex items-center gap-4"
          style={{ borderTop: `1px solid ${T.divider}` }}
        >
          <div
            className="w-1 h-10 rounded-full shrink-0"
            style={{ background: brand.primaryColor }}
          />
          <p className="text-sm font-medium leading-relaxed" style={{ color: T.dimColor2 }}>
            {slide.takeaway}
          </p>
        </div>
      )}
      {slide.table?.footnote && (
        <p className="text-[11px] mt-2" style={{ color: T.dimColor }}>
          {slide.table.footnote}
        </p>
      )}
    </div>
  )

  const renderSlide = (slide: Slide) => {
    if (slide.type === 'title') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center px-16">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt="Logo" className="h-12 object-contain mb-8" />
          )}
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: T.dimColor }}
          >
            {new Date(slide.project.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div data-no-drag="true" className="w-full max-w-3xl">
            <EditableText
              value={slide.project.pitch_title || slide.project.name || ''}
              onCommit={(v) => updateProjectField('pitch_title', v)}
              placeholder="Pitch title"
              theme={T.slideTheme}
              className="text-5xl font-black mb-6 leading-tight text-center"
              style={{ color: brand.primaryColor }}
              textStyle={project?.title_text_style || {}}
              onStyleChange={(s) => updateProjectField('title_text_style', s)}
              brandColors={BRAND_COLORS}
            />
          </div>
          <div
            className="w-20 h-1 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            }}
          />
        </div>
      )
    }

    if (slide.type === 'insights') {
      return (
        <div className="flex flex-col h-full px-8 py-6">
          <h2 className="text-2xl font-bold mb-5">Key Insights</h2>
          <div className="grid grid-cols-3 gap-3 flex-1">
            {slide.insights.slice(0, 6).map((insight: any, i: number) => (
              <div
                key={i}
                className="p-4 rounded-2xl flex flex-col overflow-hidden"
                style={{
                  background: `${brand.primaryColor}15`,
                  border: `1px solid ${brand.primaryColor}30`,
                }}
              >
                <EditableText
                  value={insight.title || ''}
                  onCommit={(v) => updateInsight(i, { title: v })}
                  placeholder="Metric name"
                  theme={T.slideTheme}
                  className="text-xs uppercase tracking-wider mb-2"
                  style={{ color: T.dimColor }}
                  textStyle={insight.title_text_style || {}}
                  onStyleChange={(s) => updateInsight(i, { title_text_style: s })}
                  brandColors={BRAND_COLORS}
                />
                <EditableText
                  value={insight.value || ''}
                  onCommit={(v) => updateInsight(i, { value: v })}
                  placeholder="0"
                  theme={T.slideTheme}
                  className="text-3xl font-black mb-2"
                  style={{ color: brand.primaryColor }}
                  textStyle={insight.value_text_style || {}}
                  onStyleChange={(s) => updateInsight(i, { value_text_style: s })}
                  brandColors={BRAND_COLORS}
                />
                <EditableText
                  value={insight.description || ''}
                  onCommit={(v) => updateInsight(i, { description: v })}
                  placeholder="Add a description..."
                  theme={T.slideTheme}
                  multiline
                  className="text-xs leading-relaxed"
                  style={{ color: T.dimColor2 }}
                  textStyle={insight.description_text_style || {}}
                  onStyleChange={(s) => updateInsight(i, { description_text_style: s })}
                  brandColors={BRAND_COLORS}
                />
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (slide.type === 'chart') return renderChartSlide(slide.chart, slide.index)

    if (slide.type === 'table') return renderTableSlide(slide)

    if (slide.type === 'recommendations') {
      const recs = (slide.recommendations || []).slice(0, 3)
      return (
        <div className="flex flex-col h-full px-10 py-8">
          <div className="text-center mb-8" data-no-drag="true">
            <h2 className="text-3xl font-black mb-2">
              Key <span style={{ color: brand.primaryColor }}>Recommendations</span>
            </h2>
            <EditableText
              value={slide.narrative ? slide.narrative.slice(0, 140) : ''}
              onCommit={() => {}}
              placeholder="Subheader summary..."
              theme={T.slideTheme}
              className="text-sm max-w-2xl mx-auto"
              style={{ color: T.dimColor }}
              textStyle={project?.narrative_text_style || {}}
              onStyleChange={(s) => updateProjectField('narrative_text_style', s)}
              brandColors={BRAND_COLORS}
            />
          </div>
          <div className="flex-1 grid grid-cols-3 gap-5">
            {recs.map((rec: any, i: number) => (
              <div
                key={i}
                className="p-5 rounded-2xl flex flex-col"
                style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}` }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white mb-3"
                  style={{ background: brand.primaryColor }}
                >
                  {rec.number || String(i + 1).padStart(2, '0')}
                </div>
                <EditableText
                  value={rec.title || ''}
                  onCommit={(v) => updateRecommendation(i, { title: v })}
                  placeholder="Recommendation headline"
                  theme={T.slideTheme}
                  className="font-bold text-base leading-tight mb-2"
                  textStyle={rec.title_text_style || {}}
                  onStyleChange={(s) => updateRecommendation(i, { title_text_style: s })}
                  brandColors={BRAND_COLORS}
                />
                <EditableText
                  value={rec.description || ''}
                  onCommit={(v) => updateRecommendation(i, { description: v })}
                  placeholder="Description..."
                  theme={T.slideTheme}
                  multiline
                  className="text-xs leading-relaxed flex-1"
                  style={{ color: T.dimColor2 }}
                  textStyle={rec.description_text_style || {}}
                  onStyleChange={(s) => updateRecommendation(i, { description_text_style: s })}
                  brandColors={BRAND_COLORS}
                />
                {(rec.stat || rec.stat_label) && (
                  <div
                    className="mt-4 pt-3 flex items-center gap-2"
                    style={{ borderTop: `1px solid ${T.divider}` }}
                  >
                    <EditableText
                      value={rec.stat || ''}
                      onCommit={(v) => updateRecommendation(i, { stat: v })}
                      placeholder="0%"
                      theme={T.slideTheme}
                      className="text-2xl font-black"
                      style={{ color: brand.primaryColor }}
                      textStyle={rec.stat_text_style || {}}
                      onStyleChange={(s) => updateRecommendation(i, { stat_text_style: s })}
                      brandColors={BRAND_COLORS}
                    />
                    <EditableText
                      value={rec.stat_label || ''}
                      onCommit={(v) => updateRecommendation(i, { stat_label: v })}
                      placeholder="label"
                      theme={T.slideTheme}
                      className="text-xs"
                      style={{ color: T.dimColor }}
                      textStyle={rec.stat_label_text_style || {}}
                      onStyleChange={(s) => updateRecommendation(i, { stat_label_text_style: s })}
                      brandColors={BRAND_COLORS}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  const logoPos = brand.logoPosition || 'bottom-right'
  const logoCls =
    (
      {
        'bottom-right': 'bottom-3 right-4',
        'bottom-left': 'bottom-3 left-4',
        'top-right': 'top-3 right-4',
        'top-left': 'top-3 left-4',
      } as any
    )[logoPos] || 'bottom-3 right-4'

  // ── Loading / error states ─────────────────────────────────────────────

  if (genState === 'idle' || (genState !== 'ready' && genState !== 'no_data')) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: T.pageBg }}
      >
        <div
          className={`w-full max-w-sm p-8 rounded-2xl border text-center ${dark ? 'bg-zinc-900 border-white/[0.08]' : 'bg-white border-zinc-200'}`}
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-5">
            <Sparkles size={22} className="text-blue-500" />
          </div>
          <h2 className={`text-lg font-bold mb-1 ${T.text}`}>Building your slides</h2>
          <p className={`text-sm mb-6 ${dark ? 'text-white/40' : 'text-zinc-500'}`}>
            Grounding the deck in your confirmed analysis findings
          </p>
          <div className="space-y-2.5 text-left mb-6">
            {GENERATION_STEPS.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${i <= genStep ? 'bg-blue-500' : dark ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                />
                <span
                  className={`text-xs transition-opacity ${i <= genStep ? (dark ? 'text-white/80' : 'text-zinc-700') : dark ? 'text-white/25' : 'text-zinc-400'}`}
                >
                  {step}
                </span>
                {i === genStep && (
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
              </div>
            ))}
          </div>
          <p className={`text-[11px] ${dark ? 'text-white/25' : 'text-zinc-400'}`}>
            Usually takes 20–40 seconds
          </p>
        </div>
      </div>
    )
  }

  if (genState === 'no_data') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: T.pageBg }}
      >
        <div
          className={`w-full max-w-sm p-8 rounded-2xl border text-center ${dark ? 'bg-zinc-900 border-white/[0.08]' : 'bg-white border-zinc-200'}`}
        >
          <h2 className={`text-lg font-bold mb-2 ${T.text}`}>Analysis required first</h2>
          <p className={`text-sm mb-6 ${dark ? 'text-white/40' : 'text-zinc-500'}`}>
            {genError ||
              'Complete and confirm your analysis before building slides — the deck is grounded in what you verified.'}
          </p>
          <button
            onClick={() => router.push(`/projects/${id}`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors"
          >
            <ArrowLeft size={14} /> Go to Analysis
          </button>
        </div>
      </div>
    )
  }

  // ── Full deck render ───────────────────────────────────────────────────

  const slide = slides[current]

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 flex flex-col overflow-hidden ${T.text}`}
      style={{ background: T.pageBg }}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-6 py-3 border-b shrink-0 z-20 ${T.chromeBorder} ${dark ? '' : 'bg-white/30 backdrop-blur-sm'}`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/projects/${id}`)}
            className={`p-2 rounded-xl transition-colors ${T.btnHover}`}
          >
            <X size={16} />
          </button>
          <span className={`text-sm font-medium truncate max-w-xs ${T.dimOpacity}`}>
            {project.pitch_title || project.name}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Gamma export buttons */}
          <div className="flex items-center gap-2">
            {gammaError && (
              <span className="text-[11px] text-red-400 max-w-[180px] truncate">{gammaError}</span>
            )}
            <button
              onClick={() => handleGammaExport('pptx')}
              disabled={gammaLoading}
              title="Download as PowerPoint via Gamma"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                dark
                  ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              } disabled:opacity-40`}
            >
              {gammaLoading ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileDown size={12} />
              )}
              {gammaLoading ? 'Generating…' : 'PPTX'}
            </button>
            <button
              onClick={() => handleGammaExport('pdf')}
              disabled={gammaLoading}
              title="Download as PDF via Gamma"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                dark
                  ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              } disabled:opacity-40`}
            >
              <Download size={12} />
              PDF
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTimerRunning(!timerRunning)}
              className={`p-2 rounded-xl transition-colors ${timerRunning ? T.timerActive : T.btnHover}`}
            >
              <Timer size={15} />
            </button>
            <span className="text-sm font-mono w-12">{formatTime(elapsed)}</span>
            <button
              onClick={() => {
                setElapsed(0)
                setTimerRunning(false)
              }}
              className={`text-xs transition-opacity ${T.dimOpacity} hover:opacity-80`}
            >
              Reset
            </button>
          </div>
          <span className={`text-sm ${T.dimOpacity}`}>
            {current + 1} / {slides.length}
          </span>
          <button
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl transition-colors ${T.dimOpacity} hover:opacity-100 ${T.btnHover}`}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Thumbnail rail */}
        <div
          className={`w-40 shrink-0 border-r overflow-y-auto px-2.5 py-3 space-y-3 ${T.chromeBorder} ${T.railBg} ${dark ? '' : 'backdrop-blur-sm'}`}
        >
          {slides.map((s, i) => (
            <button
              key={i}
              title={`${i + 1}. ${slideCaption(s)}`}
              onClick={() => goTo(i)}
              className="w-full text-left block group"
            >
              <div
                className="rounded-lg"
                style={{
                  outline:
                    i === current
                      ? `2px solid ${brand.primaryColor}`
                      : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                  outlineOffset: i === current ? '1px' : '0px',
                }}
              >
                <SlideThumbnailPreview slide={s} brand={brand} brandColors={BRAND_COLORS} />
              </div>
              <div
                className={`mt-1 text-[10px] truncate transition-opacity ${i === current ? 'opacity-90' : `${T.dimOpacity} group-hover:opacity-70`}`}
              >
                {i + 1} · {slideCaption(s)}
              </div>
            </button>
          ))}
        </div>

        {/* Slide + footer */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex items-center justify-center p-6 min-h-0">
            <div
              ref={slideAreaRef}
              className="relative w-full h-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: T.slideBg, border: `1px solid ${T.slideBorder}` }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-0.5 z-10"
                style={{
                  background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
                }}
              />
              <div
                className="absolute inset-0 transition-all duration-300"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible
                    ? 'translateX(0)'
                    : direction === 'right'
                      ? 'translateX(-30px)'
                      : 'translateX(30px)',
                }}
              >
                {renderSlide(slide)}
              </div>
              {brand.logoUrl && slide.type !== 'title' && (
                <img
                  src={brand.logoUrl}
                  alt="Logo"
                  className={`absolute w-12 h-5 object-contain z-[100] opacity-95 pointer-events-none drop-shadow-lg ${logoCls}`}
                />
              )}
            </div>
          </div>
          <div
            className={`flex items-center justify-end px-6 py-3 border-t shrink-0 ${T.chromeBorder} ${dark ? '' : 'bg-white/30 backdrop-blur-sm'}`}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => go('prev')}
                disabled={current === 0}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border transition-colors disabled:opacity-20 text-sm ${T.btnBorder} ${T.btnHover}`}
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <button
                onClick={() => go('next')}
                disabled={current === slides.length - 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-20"
                style={{ background: brand.primaryColor }}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
