'use client'

import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useBrand } from '@/hooks/useBrand'
import ChartRenderer from '@/components/ChartRenderer'
import { X, Download, Loader2, Check } from 'lucide-react'

interface Props {
  project: any
  onClose: () => void
}

const SCALE = 0.22
const SLIDE_W = 1200
const SLIDE_H = 675

type Box = { x: number; y: number; w: number; h: number }
type LayoutPreset = 'split-right' | 'split-left' | 'full-bleed' | 'top-bottom'

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
      // Mirrors the same fix in pitch/page.tsx — the chart used to render at
      // full height right up to the hero card's bottom edge, guaranteeing the
      // last x-axis label(s) collided with it. Shrinking chart height so it
      // ends above the hero's vertical range fixes that.
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
    case 'split-right':
    default:
      return {
        chart: { x: padX, y: padY, w: width - padX * 2 - heroW - gap, h: height - padY - 24 },
        hero: { x: width - padX - heroW, y: padY, w: heroW, h: height - padY - 24 },
      }
  }
}

function applyTextStyle(base: React.CSSProperties, ts?: any): React.CSSProperties {
  if (!ts) return base
  return {
    ...base,
    ...(ts.bold && { fontWeight: 900 }),
    ...(ts.italic && { fontStyle: 'italic' }),
    ...(ts.sizePx && { fontSize: `${ts.sizePx}px` }),
    ...(ts.color && { color: ts.color }),
  }
}

function logoStyle(position?: string): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', height: '28px', objectFit: 'contain' }
  switch (position) {
    case 'bottom-left':
      return { ...base, bottom: 20, left: 24 }
    case 'top-right':
      return { ...base, top: 20, right: 24 }
    case 'top-left':
      return { ...base, top: 20, left: 24 }
    default:
      return { ...base, bottom: 20, right: 24 }
  }
}

export default function PDFExportModal({ project, onClose }: Props) {
  const { dark } = useTheme()
  const { brand } = useBrand()

  const COLORS = [
    brand.primaryColor,
    brand.secondaryColor,
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
  ]

  // ── Slide theme tokens (mirrors page.tsx T object) ────────────────────────
  const S = {
    bg: dark
      ? 'linear-gradient(135deg, #09090b 0%, #18181b 100%)'
      : 'linear-gradient(135deg, #f8f8fa 0%, #f0f0f5 100%)',
    textColor: dark ? '#ffffff' : '#0a0a0b',
    dimColor: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)',
    dimColor2: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    cardBg: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    cardBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    divider: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    heroBg: (p: string) =>
      dark ? `linear-gradient(135deg, ${p}22, ${p}44)` : `linear-gradient(135deg, ${p}18, ${p}30)`,
    heroBorder: (p: string) => `${p}44`,
    heroText: dark ? '#ffffff' : '#0a0a0b',
    noDataBorder: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
  }

  const SLIDE_BASE: React.CSSProperties = {
    width: SLIDE_W,
    height: SLIDE_H,
    background: S.bg,
    color: S.textColor,
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  }

  const ACCENT_BAR: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
  }

  // ── Slide renderers ───────────────────────────────────────────────────────

  const TitleSlide = () => (
    <div
      style={{
        ...SLIDE_BASE,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '80px',
      }}
    >
      <div style={ACCENT_BAR} />
      {brand.logoUrl && (
        <img
          src={brand.logoUrl}
          alt="Logo"
          style={{ height: '56px', objectFit: 'contain', marginBottom: '40px' }}
        />
      )}
      <div
        style={{
          fontSize: '12px',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          color: S.dimColor,
          marginBottom: '20px',
        }}
      >
        {new Date(project.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </div>
      <h1
        style={applyTextStyle(
          {
            fontSize: '56px',
            fontWeight: 900,
            color: brand.primaryColor,
            lineHeight: 1.1,
            marginBottom: '24px',
          },
          project.title_text_style
        )}
      >
        {project.pitch_title || project.name}
      </h1>
      <div
        style={{
          width: '80px',
          height: '4px',
          borderRadius: '4px',
          background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
        }}
      />
    </div>
  )

  const InsightsSlide = () => (
    <div style={{ ...SLIDE_BASE, padding: '60px' }}>
      <div style={ACCENT_BAR} />
      {brand.logoUrl && (
        <img src={brand.logoUrl} alt="Logo" style={logoStyle(brand.logoPosition)} />
      )}
      <h2 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '32px', color: S.textColor }}>
        Key Insights
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        {(project.insights || []).slice(0, 6).map((insight: any, i: number) => (
          <div
            key={i}
            style={{
              padding: '24px',
              borderRadius: '16px',
              background: `${brand.primaryColor}15`,
              border: `1px solid ${brand.primaryColor}30`,
            }}
          >
            <div
              style={applyTextStyle(
                {
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  color: S.dimColor,
                  marginBottom: '8px',
                },
                insight.title_text_style
              )}
            >
              {insight.title}
            </div>
            <div
              style={applyTextStyle(
                {
                  fontSize: '36px',
                  fontWeight: 900,
                  color: brand.primaryColor,
                  marginBottom: '8px',
                },
                insight.value_text_style
              )}
            >
              {insight.value}
            </div>
            <div
              style={applyTextStyle(
                { fontSize: '13px', color: S.dimColor2, lineHeight: 1.5 },
                insight.description_text_style
              )}
            >
              {insight.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const ChartSlide = ({ chart }: { chart: any }) => {
    const layout: LayoutPreset = chart.layout || 'split-right'
    // Use saved drag positions if valid — matches what the user sees in pitch mode.
    // Falls back to layout-preset computation only when no valid boxes are stored.
    const isValidBox = (b: any): b is Box =>
      b && typeof b.w === 'number' && typeof b.h === 'number' && b.w > 20 && b.h > 20
    const defaults = boxesForLayout(layout, SLIDE_W, SLIDE_H)
    const cb = isValidBox(chart.chart_box) ? chart.chart_box : defaults.chart
    const hb = isValidBox(chart.hero_box) ? chart.hero_box : defaults.hero
    const hasHero = chart.hero_stat || chart.takeaway
    const hasData = Array.isArray(chart?.data) && chart.data.length > 0

    return (
      <div style={{ ...SLIDE_BASE }}>
        <div style={ACCENT_BAR} />
        {brand.logoUrl && (
          <img src={brand.logoUrl} alt="Logo" style={logoStyle(brand.logoPosition)} />
        )}

        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            padding: '28px 48px 0',
            width: SLIDE_W - 96,
          }}
        >
          <div
            style={applyTextStyle(
              { fontSize: '22px', fontWeight: 700, marginBottom: '6px', color: S.textColor },
              chart.title_text_style
            )}
          >
            {chart.title}
          </div>
          <div
            style={applyTextStyle(
              { fontSize: '13px', color: S.dimColor },
              chart.description_text_style
            )}
          >
            {chart.description}
          </div>
        </div>

        <div style={{ position: 'absolute', left: cb.x, top: cb.y, width: cb.w, height: cb.h }}>
          {hasData ? (
            <ChartRenderer chart={chart} colors={COLORS} height={cb.h} dark={dark} />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: S.dimColor,
                fontSize: '14px',
                border: `1px dashed ${S.noDataBorder}`,
                borderRadius: '16px',
              }}
            >
              No data for this chart
            </div>
          )}
        </div>

        {hasHero && (
          <div
            style={{
              position: 'absolute',
              left: hb.x,
              top: hb.y,
              width: hb.w,
              height: hb.h,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '16px',
              padding: '28px',
              background: S.heroBg(brand.primaryColor),
            }}
          >
            {chart.hero_stat && (
              <div
                style={applyTextStyle(
                  {
                    fontSize: '64px',
                    fontWeight: 900,
                    color: brand.primaryColor,
                    lineHeight: 1,
                    textAlign: 'center',
                    marginBottom: '16px',
                  },
                  chart.hero_text_style
                )}
              >
                {chart.hero_stat}
              </div>
            )}
            {chart.takeaway && (
              <p
                style={applyTextStyle(
                  { fontSize: '16px', textAlign: 'center', lineHeight: 1.5, color: S.heroText },
                  chart.takeaway_text_style
                )}
              >
                {chart.takeaway}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  const RecommendationsSlide = () => {
    const recs = (project.recommendations || []).slice(0, 3)
    return (
      <div
        style={{
          ...SLIDE_BASE,
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 64px 40px',
        }}
      >
        <div style={ACCENT_BAR} />
        {brand.logoUrl && (
          <img src={brand.logoUrl} alt="Logo" style={logoStyle(brand.logoPosition)} />
        )}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2
            style={{ fontSize: '38px', fontWeight: 900, marginBottom: '10px', color: S.textColor }}
          >
            Key <span style={{ color: brand.primaryColor }}>Recommendations</span>
          </h2>
          {project.narrative && (
            <p
              style={applyTextStyle(
                {
                  fontSize: '14px',
                  color: S.dimColor,
                  maxWidth: '640px',
                  margin: '0 auto',
                  lineHeight: 1.5,
                },
                project.narrative_text_style
              )}
            >
              {project.narrative.slice(0, 140)}
            </p>
          )}
        </div>
        <div
          style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}
        >
          {recs.map((rec: any, i: number) => (
            <div
              key={i}
              style={{
                padding: '24px',
                borderRadius: '20px',
                background: S.cardBg,
                border: `1px solid ${S.cardBorder}`,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: brand.primaryColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 900,
                  color: '#ffffff',
                  marginBottom: '14px',
                }}
              >
                {rec.number || String(i + 1).padStart(2, '0')}
              </div>
              <div
                style={applyTextStyle(
                  {
                    fontSize: '15px',
                    fontWeight: 700,
                    lineHeight: 1.3,
                    marginBottom: '10px',
                    color: S.textColor,
                  },
                  rec.title_text_style
                )}
              >
                {rec.title}
              </div>
              <p
                style={applyTextStyle(
                  { fontSize: '12px', color: S.dimColor2, lineHeight: 1.6, flex: 1 },
                  rec.description_text_style
                )}
              >
                {rec.description}
              </p>
              {(rec.stat || rec.stat_label) && (
                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '14px',
                    borderTop: `1px solid ${S.divider}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span
                    style={applyTextStyle(
                      { fontSize: '26px', fontWeight: 900, color: brand.primaryColor },
                      rec.stat_text_style
                    )}
                  >
                    {rec.stat}
                  </span>
                  <span
                    style={applyTextStyle(
                      { fontSize: '11px', color: S.dimColor },
                      rec.stat_label_text_style
                    )}
                  >
                    {rec.stat_label}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const SlideContent = ({ slideId }: { slideId: string }) => {
    if (slideId === 'title') return <TitleSlide />
    if (slideId === 'insights') return <InsightsSlide />
    if (slideId === 'recommendations') return <RecommendationsSlide />
    if (slideId.startsWith('chart-')) {
      const idx = parseInt(slideId.replace('chart-', ''))
      const chart = project.charts?.[idx]
      return chart ? <ChartSlide chart={chart} /> : null
    }
    return null
  }

  // ── Slide list ────────────────────────────────────────────────────────────
  const allSlides = [
    { id: 'title', label: 'Cover' },
    { id: 'insights', label: 'Key Insights' },
    ...(project.charts || []).map((c: any, i: number) => ({
      id: `chart-${i}`,
      label: c.title || `Chart ${i + 1}`,
    })),
    { id: 'recommendations', label: 'Recommendations' },
  ]

  const [selected, setSelected] = useState<Set<string>>(new Set(allSlides.map((s) => s.id)))
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleAll = () =>
    selected.size === allSlides.length
      ? setSelected(new Set())
      : setSelected(new Set(allSlides.map((s) => s.id)))

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    try {
      const domtoimage = (await import('dom-to-image-more')).default
      const jsPDF = (await import('jspdf')).default
      const { createElement } = await import('react')
      const { createRoot } = await import('react-dom/client')

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_W, SLIDE_H] })
      const selectedSlides = allSlides.filter((s) => selected.has(s.id))
      let first = true

      for (const slide of selectedSlides) {
        setProgress(`Rendering "${slide.label}"...`)
        const container = document.createElement('div')
        container.style.cssText = `position:fixed;left:-9999px;top:0;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;`
        document.body.appendChild(container)
        const root = createRoot(container)
        await new Promise<void>((resolve) => {
          root.render(createElement(SlideContent, { slideId: slide.id }))
          setTimeout(resolve, 2500)
        })

        const dataUrl = await domtoimage.toJpeg(container, {
          width: SLIDE_W,
          height: SLIDE_H,
          quality: 1.0,
          bgcolor: dark ? '#09090b' : '#f8f8fa',
        })

        if (!first) pdf.addPage()
        pdf.addImage(dataUrl, 'JPEG', 0, 0, SLIDE_W, SLIDE_H)
        first = false
        root.unmount()
        document.body.removeChild(container)
      }

      setProgress('Downloading...')
      pdf.save(`${project.pitch_title || project.name}.pdf`)
      onClose()
    } catch (err) {
      console.error(err)
      setProgress('Export failed. Please try again.')
      setExporting(false)
    }
  }

  // ── Modal chrome ──────────────────────────────────────────────────────────
  const card = dark
    ? 'bg-zinc-900 border-zinc-800 text-white'
    : 'bg-white border-zinc-200 text-zinc-900'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-3xl rounded-2xl border shadow-2xl ${card}`}>
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${dark ? 'border-zinc-800' : 'border-zinc-100'}`}
        >
          <div className="flex items-center gap-2">
            <Download size={16} className="text-blue-500" />
            <h2 className="font-bold text-base">Export PDF</h2>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={toggleAll} className="text-xs text-blue-500 hover:underline">
              {selected.size === allSlides.length ? 'Deselect all' : 'Select all'}
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg ${dark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
          {allSlides.map((slide) => {
            const isSelected = selected.has(slide.id)
            return (
              <button
                key={slide.id}
                onClick={() => toggle(slide.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-all group
                  ${isSelected ? 'border-blue-500' : dark ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-200 hover:border-zinc-400'}`}
              >
                <div
                  style={{
                    width: '100%',
                    paddingBottom: `${(SLIDE_H / SLIDE_W) * 100}%`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: `${SLIDE_W}px`,
                      height: `${SLIDE_H}px`,
                      transform: `scale(${SCALE})`,
                      transformOrigin: 'top left',
                      pointerEvents: 'none',
                    }}
                  >
                    <SlideContent slideId={slide.id} />
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <div
                  className={`px-3 py-2 text-xs font-medium text-left border-t ${dark ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-100 bg-zinc-50'}`}
                >
                  {slide.label}
                </div>
              </button>
            )
          })}
        </div>

        <div className={`px-6 py-4 border-t ${dark ? 'border-zinc-800' : 'border-zinc-100'}`}>
          {exporting && (
            <p className={`text-xs mb-3 text-center ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {progress}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium ${dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'}`}
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={selected.size === 0 || exporting}
              className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> {progress || 'Exporting...'}
                </>
              ) : (
                <>
                  <Download size={14} /> Export {selected.size} Slide
                  {selected.size !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
