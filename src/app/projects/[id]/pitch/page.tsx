'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useBrand } from '@/hooks/useBrand'
import ChartRenderer from '@/components/ChartRenderer'
import {
  ChevronLeft,
  ChevronRight,
  X,
  Timer,
  Bold,
  Italic,
  Check,
  Edit3,
  Maximize,
  Minimize,
} from 'lucide-react'

type SlideLayout = 'split-right' | 'split-left' | 'full-bleed' | 'top-bottom' | 'stat-focus'

type Slide =
  | { type: 'title'; project: any }
  | { type: 'insights'; insights: any[] }
  | { type: 'chart'; chart: any; index: number }
  | { type: 'recommendations'; recommendations: any[]; narrative: string }

export default function PitchDeckPage() {
  const { id } = useParams()
  const router = useRouter()
  const { brand } = useBrand()
  const containerRef = useRef<HTMLDivElement>(null)

  const [project, setProject] = useState<any>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const [animating, setAnimating] = useState(false)
  const [visible, setVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [elapsed, setElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const timerRef = useRef<any>(null)

  const [editingChart, setEditingChart] = useState<number | null>(null)
  const [editHero, setEditHero] = useState('')
  const [editTakeaway, setEditTakeaway] = useState('')
  const [heroSize, setHeroSize] = useState<'text-4xl' | 'text-5xl' | 'text-6xl' | 'text-7xl'>(
    'text-6xl'
  )
  const [takeawayBold, setTakeawayBold] = useState(false)
  const [takeawayItalic, setTakeawayItalic] = useState(false)
  const [takeawaySize, setTakeawaySize] = useState<'text-lg' | 'text-xl' | 'text-2xl'>('text-xl')
  const [takeawayColor, setTakeawayColor] = useState('#ffffff')

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
        const s: Slide[] = [
          { type: 'title', project: data },
          { type: 'insights', insights: data.insights || [] },
          ...(data.charts || []).map((chart: any, i: number) => ({
            type: 'chart' as const,
            chart,
            index: i,
          })),
          {
            type: 'recommendations',
            recommendations: data.recommendations || [],
            narrative: data.narrative || '',
          },
        ]
        setSlides(s)
      })
  }, [id])

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } else clearInterval(timerRef.current)
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editingChart !== null) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go('next')
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go('prev')
      if (e.key === 'Escape' && !document.fullscreenElement) router.push(`/projects/${id}`)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [go, id, router, editingChart])

  const saveChartEdits = async (chartIndex: number) => {
    if (!project) return
    const updated = [...(project.charts || [])]
    updated[chartIndex] = {
      ...updated[chartIndex],
      hero_stat: editHero,
      takeaway: editTakeaway,
      hero_size: heroSize,
      takeaway_bold: takeawayBold,
      takeaway_italic: takeawayItalic,
      takeaway_size: takeawaySize,
      takeaway_color: takeawayColor,
    }
    await supabase.from('projects').update({ charts: updated }).eq('id', id)
    setProject((p: any) => ({ ...p, charts: updated }))
    setSlides((s) =>
      s.map((sl) =>
        sl.type === 'chart' && sl.index === chartIndex ? { ...sl, chart: updated[chartIndex] } : sl
      )
    )
    setEditingChart(null)
  }

  const startEditing = (chart: any, index: number) => {
    setEditHero(chart.hero_stat || '')
    setEditTakeaway(chart.takeaway || '')
    setHeroSize(chart.hero_size || 'text-6xl')
    setTakeawayBold(chart.takeaway_bold || false)
    setTakeawayItalic(chart.takeaway_italic || false)
    setTakeawaySize(chart.takeaway_size || 'text-xl')
    setTakeawayColor(chart.takeaway_color || '#ffffff')
    setEditingChart(index)
  }

  const COLORS = [
    brand.primaryColor,
    brand.secondaryColor,
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
  ]

  const HeroPanel = ({ chart }: { chart: any }) => (
    <div
      className="flex flex-col items-center justify-center rounded-2xl p-6 h-full"
      style={{
        background: `linear-gradient(135deg, ${brand.primaryColor}22, ${brand.primaryColor}44)`,
        border: `1px solid ${brand.primaryColor}44`,
      }}
    >
      {chart.hero_stat && (
        <div
          className={`font-black mb-3 leading-none text-center ${chart.hero_size || 'text-6xl'}`}
          style={{ color: brand.primaryColor }}
        >
          {chart.hero_stat}
        </div>
      )}
      {chart.takeaway && (
        <p
          className={`text-center leading-relaxed opacity-90
          ${chart.takeaway_size || 'text-lg'}
          ${chart.takeaway_bold ? 'font-bold' : 'font-medium'}
          ${chart.takeaway_italic ? 'italic' : ''}`}
          style={{ color: chart.takeaway_color || '#ffffff' }}
        >
          {chart.takeaway}
        </p>
      )}
    </div>
  )

  const EditPanel = ({ index }: { index: number }) => (
    <div className="space-y-3 p-4 rounded-2xl border border-white/10 bg-white/5 overflow-y-auto max-h-full">
      <p className="text-xs uppercase tracking-wider opacity-40">Edit Takeaway</p>
      <div>
        <label className="text-xs opacity-40 mb-1 block">Hero Number</label>
        <input
          value={editHero}
          onChange={(e) => setEditHero(e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xl font-black outline-none"
          placeholder="+48%"
        />
      </div>
      <div>
        <label className="text-xs opacity-40 mb-1 block">Hero Size</label>
        <div className="flex gap-1">
          {(['text-4xl', 'text-5xl', 'text-6xl', 'text-7xl'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setHeroSize(s)}
              className={`flex-1 py-1 rounded-lg text-xs border ${heroSize === s ? 'border-blue-500 bg-blue-500/20' : 'border-white/20'}`}
            >
              {s.replace('text-', '')}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs opacity-40 mb-1 block">Takeaway</label>
        <textarea
          value={editTakeaway}
          onChange={(e) => setEditTakeaway(e.target.value)}
          rows={3}
          className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm outline-none resize-none"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTakeawayBold(!takeawayBold)}
          className={`p-2 rounded-lg border ${takeawayBold ? 'border-blue-500 bg-blue-500/20' : 'border-white/20'}`}
        >
          <Bold size={12} />
        </button>
        <button
          onClick={() => setTakeawayItalic(!takeawayItalic)}
          className={`p-2 rounded-lg border ${takeawayItalic ? 'border-blue-500 bg-blue-500/20' : 'border-white/20'}`}
        >
          <Italic size={12} />
        </button>
        {(['text-lg', 'text-xl', 'text-2xl'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTakeawaySize(s)}
            className={`px-2 py-1 rounded-lg text-xs border ${takeawaySize === s ? 'border-blue-500 bg-blue-500/20' : 'border-white/20'}`}
          >
            {s === 'text-lg' ? 'S' : s === 'text-xl' ? 'M' : 'L'}
          </button>
        ))}
        <input
          type="color"
          value={takeawayColor}
          onChange={(e) => setTakeawayColor(e.target.value)}
          className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0.5"
        />
      </div>
      <button
        onClick={() => saveChartEdits(index)}
        className="w-full py-2 rounded-xl bg-blue-500 text-white text-sm font-medium flex items-center justify-center gap-2"
      >
        <Check size={13} /> Save
      </button>
    </div>
  )

  const renderChartSlide = (chart: any, index: number) => {
    const layout: SlideLayout = chart.layout || 'split-right'
    const isEditing = editingChart === index

    const editBtn = !isEditing && (
      <button
        onClick={() => startEditing(chart, index)}
        className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-white/10 hover:bg-white/20"
      >
        <Edit3 size={13} />
      </button>
    )

    const header = (
      <div className="mb-3 pr-10">
        <h2 className="text-xl font-bold leading-tight truncate">{chart.title}</h2>
        <p className="text-sm opacity-40 mt-1 truncate">{chart.description}</p>
      </div>
    )

    if (layout === 'split-right')
      return (
        <div className="flex h-full px-8 py-6 gap-5 relative group">
          {editBtn}
          <div className="flex-1 flex flex-col min-w-0">
            {header}
            <div className="flex-1">
              <ChartRenderer chart={chart} colors={COLORS} height={260} dark={true} />
            </div>
          </div>
          <div className="w-64 shrink-0 flex flex-col justify-center">
            {isEditing ? <EditPanel index={index} /> : <HeroPanel chart={chart} />}
          </div>
        </div>
      )

    if (layout === 'split-left')
      return (
        <div className="flex h-full px-8 py-6 gap-5 relative group">
          {editBtn}
          <div className="w-64 shrink-0 flex flex-col justify-center">
            {isEditing ? <EditPanel index={index} /> : <HeroPanel chart={chart} />}
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            {header}
            <div className="flex-1">
              <ChartRenderer chart={chart} colors={COLORS} height={260} dark={true} />
            </div>
          </div>
        </div>
      )

    if (layout === 'full-bleed')
      return (
        <div className="flex flex-col h-full px-8 py-6 relative group">
          {editBtn}
          {header}
          <div className="flex-1 relative">
            <ChartRenderer chart={chart} colors={COLORS} height={300} dark={true} />
            {!isEditing && (chart.hero_stat || chart.takeaway) && (
              <div
                className="absolute bottom-3 right-3 p-4 rounded-2xl max-w-xs"
                style={{ background: `${brand.primaryColor}ee` }}
              >
                {chart.hero_stat && (
                  <div className={`font-black leading-none mb-2 ${chart.hero_size || 'text-5xl'}`}>
                    {chart.hero_stat}
                  </div>
                )}
                {chart.takeaway && (
                  <p className={`opacity-90 ${chart.takeaway_size || 'text-sm'}`}>
                    {chart.takeaway}
                  </p>
                )}
              </div>
            )}
            {isEditing && (
              <div className="absolute bottom-3 right-3 w-68">
                <EditPanel index={index} />
              </div>
            )}
          </div>
        </div>
      )

    if (layout === 'top-bottom')
      return (
        <div className="flex flex-col h-full px-8 py-5 gap-3 relative group">
          {editBtn}
          {header}
          <div style={{ flex: '0 0 58%' }}>
            <ChartRenderer chart={chart} colors={COLORS} height={210} dark={true} />
          </div>
          <div className="flex-1 min-h-0">
            {isEditing ? (
              <EditPanel index={index} />
            ) : (
              <div
                className="flex items-center gap-5 h-full px-4 py-3 rounded-2xl"
                style={{
                  background: `linear-gradient(90deg, ${brand.primaryColor}22, ${brand.secondaryColor}22)`,
                  border: `1px solid ${brand.primaryColor}33`,
                }}
              >
                {chart.hero_stat && (
                  <div
                    className={`font-black shrink-0 ${chart.hero_size || 'text-4xl'}`}
                    style={{ color: brand.primaryColor }}
                  >
                    {chart.hero_stat}
                  </div>
                )}
                {chart.takeaway && (
                  <p
                    className={`opacity-80 text-sm leading-snug ${chart.takeaway_bold ? 'font-bold' : ''} ${chart.takeaway_italic ? 'italic' : ''}`}
                    style={{ color: chart.takeaway_color || '#ffffff' }}
                  >
                    {chart.takeaway}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )

    if (layout === 'stat-focus') {
      const topStats = chart.data?.slice(0, 3) || []
      return (
        <div className="flex flex-col h-full px-8 py-5 gap-3 relative group">
          {editBtn}
          {header}
          <div className="grid grid-cols-3 gap-3 shrink-0">
            {topStats.map((d: any, i: number) => (
              <div
                key={i}
                className="p-3 rounded-2xl text-center"
                style={{ background: `${COLORS[i]}22`, border: `1px solid ${COLORS[i]}44` }}
              >
                <div className="text-2xl font-black" style={{ color: COLORS[i] }}>
                  {d.value?.toLocaleString()}
                </div>
                <div className="text-xs opacity-50 mt-1 truncate">{d.name}</div>
              </div>
            ))}
          </div>
          <div className="flex-1">
            <ChartRenderer chart={chart} colors={COLORS} height={180} dark={true} />
          </div>
          {isEditing && (
            <div className="absolute bottom-4 right-4 w-64">
              <EditPanel index={index} />
            </div>
          )}
        </div>
      )
    }

    return null
  }

  const logoPos = brand.logoPosition || 'bottom-right'
  const logoCls =
    {
      'bottom-right': 'bottom-4 right-5',
      'bottom-left': 'bottom-4 left-5',
      'top-right': 'top-16 right-5',
      'top-left': 'top-16 left-5',
    }[logoPos] || 'bottom-4 right-5'

  const renderSlide = (slide: Slide) => {
    switch (slide.type) {
      case 'title':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center px-16">
            {brand.logoUrl && (
              <img src={brand.logoUrl} alt="Logo" className="h-12 object-contain mb-8" />
            )}
            <div className="text-xs font-semibold uppercase tracking-widest mb-4 opacity-30">
              {new Date(slide.project.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            <h1
              className="text-5xl font-black mb-6 leading-tight max-w-3xl"
              style={{ color: brand.primaryColor }}
            >
              {slide.project.pitch_title || slide.project.name}
            </h1>
            <div
              className="w-20 h-1 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
              }}
            />
          </div>
        )

      case 'insights':
        return (
          <div className="flex flex-col h-full px-8 py-6">
            <h2 className="text-2xl font-bold mb-5">Key Insights</h2>
            <div className="grid grid-cols-3 gap-3 flex-1">
              {slide.insights.slice(0, 6).map((insight: any, i: number) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl flex flex-col overflow-hidden"
                  style={{
                    background: `${COLORS[i % COLORS.length]}15`,
                    border: `1px solid ${COLORS[i % COLORS.length]}30`,
                  }}
                >
                  <div className="text-xs uppercase tracking-wider opacity-40 mb-2 truncate">
                    {insight.title}
                  </div>
                  <div
                    className="text-3xl font-black mb-2"
                    style={{ color: COLORS[i % COLORS.length] }}
                  >
                    {insight.value}
                  </div>
                  <div className="text-xs opacity-60 leading-relaxed line-clamp-3">
                    {insight.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 'chart':
        return renderChartSlide(slide.chart, slide.index)

      case 'recommendations':
        const recs = slide.recommendations
        const heroRec = recs[0]
        return (
          <div className="flex h-full overflow-hidden">
            {/* Left panel */}
            <div
              className="w-64 shrink-0 flex flex-col justify-between p-6 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #0f0f12 0%, #1a1a1f 100%)',
                borderRight: `3px solid ${brand.primaryColor}`,
              }}
            >
              <div className="min-h-0">
                <h2 className="font-black leading-tight mb-4" style={{ fontSize: '17px' }}>
                  Key <span style={{ color: brand.primaryColor }}>Recommendations</span>
                </h2>
                <p className="opacity-40 leading-relaxed text-xs line-clamp-5">
                  {slide.narrative.slice(0, 180)}
                </p>
              </div>
              {heroRec && (
                <div
                  className="p-3 rounded-2xl shrink-0"
                  style={{
                    background: `${brand.primaryColor}22`,
                    border: `1px solid ${brand.primaryColor}33`,
                  }}
                >
                  <div className="text-3xl font-black mb-1" style={{ color: brand.primaryColor }}>
                    {heroRec.stat}
                  </div>
                  <div className="text-xs opacity-60 truncate">{heroRec.stat_label}</div>
                </div>
              )}
            </div>

            {/* Right 2x2 grid */}
            <div className="flex-1 grid grid-cols-2 gap-3 p-5 min-w-0">
              {recs.slice(0, 4).map((rec: any, i: number) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl flex flex-col justify-between overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="min-h-0">
                    <div className="flex items-start gap-2 mb-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0 mt-0.5"
                        style={{ background: brand.primaryColor }}
                      >
                        {rec.number || String(i + 1).padStart(2, '0')}
                      </div>
                      <h3 className="font-bold text-sm leading-tight line-clamp-2">{rec.title}</h3>
                    </div>
                    <p className="text-xs opacity-50 leading-relaxed line-clamp-3">
                      {rec.description}
                    </p>
                  </div>
                  {rec.stat && (
                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-2 shrink-0">
                      <span className="text-xl font-black" style={{ color: brand.primaryColor }}>
                        {rec.stat}
                      </span>
                      <span className="text-xs opacity-40 truncate">{rec.stat_label}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
    }
  }

  if (!project || slides.length === 0)
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )

  const slide = slides[current]

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 text-white flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/projects/${id}`)}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
          <span className="text-sm font-medium opacity-40 truncate max-w-xs">
            {project.pitch_title || project.name}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTimerRunning(!timerRunning)}
              className={`p-2 rounded-xl transition-colors ${timerRunning ? 'bg-red-500/20 text-red-400' : 'hover:bg-white/10'}`}
            >
              <Timer size={15} />
            </button>
            <span className="text-sm font-mono w-12">{formatTime(elapsed)}</span>
            <button
              onClick={() => {
                setElapsed(0)
                setTimerRunning(false)
              }}
              className="text-xs opacity-30 hover:opacity-60 transition-opacity"
            >
              Reset
            </button>
          </div>
          <span className="text-sm opacity-30">
            {current + 1} / {slides.length}
          </span>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors opacity-50 hover:opacity-100"
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </div>

      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        <div
          className="relative w-full h-full max-w-6xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
          style={{ background: 'linear-gradient(145deg, #111113 0%, #1c1c1f 100%)' }}
        >
          {/* Brand accent line */}
          <div
            className="absolute top-0 left-0 right-0 h-0.5 z-10"
            style={{
              background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            }}
          />

          {/* Logo inside slide */}
          {brand.logoUrl && slide.type !== 'title' && (
            <img
              src={brand.logoUrl}
              alt="Logo"
              className={`absolute w-14 h-6 object-contain z-20 ${logoCls}`}
            />
          )}

          {/* Slide content */}
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
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 shrink-0">
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (i === current) return
                setDirection(i > current ? 'right' : 'left')
                setVisible(false)
                setTimeout(() => {
                  setCurrent(i)
                  setVisible(true)
                }, 300)
              }}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === current ? 20 : 7,
                height: 7,
                background: i === current ? brand.primaryColor : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => go('prev')}
            disabled={current === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-20 text-sm"
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
  )
}
