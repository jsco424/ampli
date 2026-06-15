'use client'

import { useState, useRef } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useBrand } from '@/hooks/useBrand'
import ChartRenderer from '@/components/ChartRenderer'
import { X, Download, Loader2, Check } from 'lucide-react'

interface Props {
  project: any
  onClose: () => void
}

// Scale factor for thumbnails
const SCALE = 0.22
const SLIDE_W = 1200
const SLIDE_H = 675

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

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === allSlides.length) setSelected(new Set())
    else setSelected(new Set(allSlides.map((s) => s.id)))
  }

  // Render actual slide content for thumbnails and export
  const SlideContent = ({ slideId }: { slideId: string }) => {
    if (slideId === 'title')
      return (
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            textAlign: 'center',
            padding: '80px',
            position: 'relative',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            }}
          />
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
              opacity: 0.3,
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
            style={{
              fontSize: '56px',
              fontWeight: 900,
              color: brand.primaryColor,
              lineHeight: 1.1,
              marginBottom: '24px',
            }}
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

    if (slideId === 'insights')
      return (
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
            color: 'white',
            padding: '60px',
            fontFamily: 'Inter, sans-serif',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            }}
          />
          {brand.logoUrl && (
            <img
              src={brand.logoUrl}
              alt="Logo"
              style={{
                position: 'absolute',
                height: '28px',
                objectFit: 'contain',
                ...(brand.logoPosition === 'bottom-right'
                  ? { bottom: '20px', right: '24px' }
                  : brand.logoPosition === 'bottom-left'
                    ? { bottom: '20px', left: '24px' }
                    : brand.logoPosition === 'top-right'
                      ? { top: '20px', right: '24px' }
                      : { top: '20px', left: '24px' }),
              }}
            />
          )}
          <h2 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '32px' }}>Key Insights</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {(project.insights || []).slice(0, 6).map((insight: any, i: number) => (
              <div
                key={i}
                style={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: `${COLORS[i % COLORS.length]}15`,
                  border: `1px solid ${COLORS[i % COLORS.length]}30`,
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '2px',
                    opacity: 0.4,
                    marginBottom: '8px',
                  }}
                >
                  {insight.title}
                </div>
                <div
                  style={{
                    fontSize: '36px',
                    fontWeight: 900,
                    color: COLORS[i % COLORS.length],
                    marginBottom: '8px',
                  }}
                >
                  {insight.value}
                </div>
                <div style={{ fontSize: '13px', opacity: 0.6, lineHeight: 1.5 }}>
                  {insight.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )

    if (slideId.startsWith('chart-')) {
      const idx = parseInt(slideId.replace('chart-', ''))
      const chart = project.charts?.[idx]
      if (!chart) return null
      return (
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
            color: 'white',
            padding: '50px',
            fontFamily: 'Inter, sans-serif',
            display: 'flex',
            gap: '40px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            }}
          />
          {brand.logoUrl && (
            <img
              src={brand.logoUrl}
              alt="Logo"
              style={{
                position: 'absolute',
                height: '28px',
                objectFit: 'contain',
                ...(brand.logoPosition === 'bottom-right'
                  ? { bottom: '20px', right: '24px' }
                  : brand.logoPosition === 'bottom-left'
                    ? { bottom: '20px', left: '24px' }
                    : brand.logoPosition === 'top-right'
                      ? { top: '20px', right: '24px' }
                      : { top: '20px', left: '24px' }),
              }}
            />
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>
              {chart.title}
            </h2>
            <p style={{ fontSize: '13px', opacity: 0.4, marginBottom: '20px' }}>
              {chart.description}
            </p>
            <div style={{ flex: 1 }}>
              <ChartRenderer chart={chart} colors={COLORS} height={430} dark={true} />
            </div>
          </div>
          {(chart.hero_stat || chart.takeaway) && (
            <div
              style={{
                width: '280px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '16px',
                padding: '32px',
                background: `linear-gradient(135deg, ${brand.primaryColor}22, ${brand.primaryColor}44)`,
                border: `1px solid ${brand.primaryColor}44`,
              }}
            >
              {chart.hero_stat && (
                <div
                  style={{
                    fontSize: '64px',
                    fontWeight: 900,
                    color: brand.primaryColor,
                    lineHeight: 1,
                    textAlign: 'center',
                    marginBottom: '16px',
                  }}
                >
                  {chart.hero_stat}
                </div>
              )}
              {chart.takeaway && (
                <p
                  style={{
                    fontSize: '16px',
                    textAlign: 'center',
                    opacity: 0.9,
                    lineHeight: 1.5,
                    color: chart.takeaway_color || '#ffffff',
                  }}
                >
                  {chart.takeaway}
                </p>
              )}
            </div>
          )}
        </div>
      )
    }

    if (slideId === 'recommendations') {
      const recs = project.recommendations || []
      const heroRec = recs[0]
      return (
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
            color: 'white',
            display: 'flex',
            fontFamily: 'Inter, sans-serif',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            }}
          />
          <div
            style={{
              width: '280px',
              padding: '48px 32px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              background: 'linear-gradient(180deg, #0f0f12 0%, #1a1a1f 100%)',
              borderRight: `3px solid ${brand.primaryColor}`,
            }}
          >
            <div>
              <h2
                style={{ fontSize: '32px', fontWeight: 900, lineHeight: 1.2, marginBottom: '24px' }}
              >
                Key
                <br />
                <span style={{ color: brand.primaryColor }}>Recommendations</span>
              </h2>
              <p style={{ fontSize: '12px', opacity: 0.4, lineHeight: 1.6 }}>
                {(project.narrative || '').slice(0, 160)}...
              </p>
            </div>
            {heroRec && (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: `${brand.primaryColor}22`,
                  border: `1px solid ${brand.primaryColor}33`,
                }}
              >
                <div
                  style={{
                    fontSize: '36px',
                    fontWeight: 900,
                    color: brand.primaryColor,
                    marginBottom: '4px',
                  }}
                >
                  {heroRec.stat}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.6 }}>{heroRec.stat_label}</div>
              </div>
            )}
          </div>
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              padding: '32px',
            }}
          >
            {recs.slice(0, 4).map((rec: any, i: number) => (
              <div
                key={i}
                style={{
                  padding: '20px',
                  borderRadius: '16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '12px',
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
                        color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {rec.number || String(i + 1).padStart(2, '0')}
                    </div>
                    <h3 style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.3 }}>
                      {rec.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: '11px', opacity: 0.5, lineHeight: 1.5 }}>
                    {rec.description}
                  </p>
                </div>
                {rec.stat && (
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '22px', fontWeight: 900, color: brand.primaryColor }}>
                      {rec.stat}
                    </span>
                    <span style={{ fontSize: '11px', opacity: 0.4 }}>{rec.stat_label}</span>
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
          bgcolor: '#09090b',
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

  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative w-full max-w-3xl rounded-2xl border shadow-2xl ${card} ${dark ? 'text-white' : 'text-zinc-900'}`}
      >
        {/* Header */}
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

        {/* Thumbnail grid */}
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
                {/* Slide thumbnail */}
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

                {/* Selection overlay */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                    <Check size={12} className="text-white" />
                  </div>
                )}

                {/* Label */}
                <div
                  className={`px-3 py-2 text-xs font-medium text-left border-t
                  ${dark ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-100 bg-zinc-50'}`}
                >
                  {slide.label}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
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
