'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { supabase } from '@/lib/supabase'
import { useBrand } from '@/hooks/useBrand'
import { useTheme } from '@/hooks/useTheme'
import { FONT_PAIRINGS, type BrandKit, type FontPairingKey, type KitTokens } from '@/lib/brandKit'
import {
  applyEdits,
  buildStory,
  slideToCsv,
  slideToText,
  type StoryEdits,
  type StorySlide,
} from '@/lib/storyModel'
import { StorySlideView, SLIDE_W, SLIDE_H } from '@/components/story/StorySlideView'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileDown,
  ImageIcon,
  Palette,
  Play,
  RotateCcw,
  Table2,
  X,
} from 'lucide-react'

// Story Mode. Builds a branded story from the findings picked on the project
// page: title, summary, hero stats, evidence, next steps. Layouts are fixed
// on purpose so every slide looks finished. Text is editable, slides can be
// hidden or reordered, and each slide can be copied out as an image, as text,
// or as the data behind it. The whole story presents full screen or exports
// as a PDF.

const KIND_LABEL: Record<string, string> = {
  title: 'Title',
  summary: 'Summary',
  stats: 'Hero stats',
  chart: 'Chart',
  table: 'Table',
  recs: 'Next steps',
}

// ── export helpers ──────────────────────────────────────────────────────────

const fontCssCache: Partial<Record<FontPairingKey, Promise<string>>> = {}

// Slide exports are drawn inside an SVG image, which cannot see web fonts
// loaded from another site. This fetches the typeface once and inlines it as
// base64 so exported slides keep the brand font.
function getFontCss(key: FontPairingKey): Promise<string> {
  if (!fontCssCache[key]) {
    fontCssCache[key] = (async () => {
      try {
        const css = await (await fetch(FONT_PAIRINGS[key].googleHref)).text()
        const blocks = css
          .split(/\/\*\s*/)
          .slice(1)
          .map((b) => '/* ' + b)
          .filter((b) => /^\/\* latin \*\//.test(b))
        const out: string[] = []
        for (const b of blocks) {
          const m = b.match(/url\((https:[^)]+)\)/)
          if (!m) continue
          const blob = await (await fetch(m[1])).blob()
          const dataUrl: string = await new Promise((res) => {
            const r = new FileReader()
            r.onload = () => res(r.result as string)
            r.readAsDataURL(blob)
          })
          out.push(b.replace(m[1], dataUrl))
        }
        return out.join('\n')
      } catch {
        return ''
      }
    })()
  }
  return fontCssCache[key] as Promise<string>
}

async function captureSlide(
  slide: StorySlide,
  kit: BrandKit,
  T: KitTokens,
  as: 'png' | 'jpeg'
): Promise<Blob | string | null> {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    const css = await getFontCss(kit.fontPairing)
    flushSync(() => root.render(<StorySlideView slide={slide} kit={kit} T={T} />))
    if (css) {
      const style = document.createElement('style')
      style.textContent = css
      host.appendChild(style)
    }
    try {
      await (document as any).fonts?.ready
    } catch {}
    await new Promise((r) => setTimeout(r, 80))
    const domtoimage = (await import('dom-to-image-more')).default
    const opts = { width: SLIDE_W, height: SLIDE_H, bgcolor: T.surface, scale: 2 }
    if (as === 'png') return (await domtoimage.toBlob(host, opts)) as Blob | null
    return (await domtoimage.toJpeg(host, { ...opts, quality: 0.93 })) as string
  } finally {
    root.unmount()
    host.remove()
  }
}

function download(name: string, data: Blob | string, type?: string) {
  const blob = typeof data === 'string' ? new Blob([data], { type: type || 'text/plain' }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const slug = (s: string) =>
  (s || 'story')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'story'

// ── scaled slide ────────────────────────────────────────────────────────────

function Scaled({ width, children }: { width: number; children: ReactNode }) {
  const scale = width / SLIDE_W
  return (
    <div
      style={{
        width,
        height: (width * SLIDE_H) / SLIDE_W,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}

const Thumb = memo(function Thumb({
  slide,
  kit,
  T,
}: {
  slide: StorySlide
  kit: BrandKit
  T: KitTokens
}) {
  return (
    <Scaled width={158}>
      <StorySlideView slide={slide} kit={kit} T={T} />
    </Scaled>
  )
})

// ── page ────────────────────────────────────────────────────────────────────

export default function StoryModePage() {
  const { id } = useParams() as { id: string }
  const { dark } = useTheme()
  const { kit, tokens: T } = useBrand()

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<StoryEdits>({})
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [selectedId, setSelectedId] = useState<string>('')
  const [presenting, setPresenting] = useState(false)
  const [presentIdx, setPresentIdx] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const editsRef = useRef<StoryEdits>({})
  const saveTimer = useRef<any>(null)
  const toastTimer = useRef<any>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const presentRef = useRef<HTMLDivElement>(null)
  const [stageW, setStageW] = useState(760)
  const [viewport, setViewport] = useState({ w: 1280, h: 720 })

  const say = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  // load
  useEffect(() => {
    if (!id) return
    supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setProject(data)
          const e = (
            data.story_edits && typeof data.story_edits === 'object' ? data.story_edits : {}
          ) as StoryEdits
          setEdits(e)
          editsRef.current = e
        }
        setLoading(false)
      })
  }, [id])

  const baseSlides = useMemo(() => buildStory(project), [project])
  const slides = useMemo(() => applyEdits(baseSlides, edits), [baseSlides, edits])
  const hidden = useMemo(() => new Set(edits.hidden || []), [edits.hidden])
  const visible = useMemo(() => slides.filter((s) => !hidden.has(s.id)), [slides, hidden])

  useEffect(() => {
    if (slides.length === 0) return
    if (!slides.some((s) => s.id === selectedId)) setSelectedId(slides[0].id)
  }, [slides, selectedId])

  const index = Math.max(
    0,
    slides.findIndex((s) => s.id === selectedId)
  )
  const slide = slides[index]

  // size the stage
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setStageW(Math.max(320, Math.min(r.width - 48, (r.height - 48) * (16 / 9))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading, slides.length])

  useEffect(() => {
    const on = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  // ── editing ───────────────────────────────────────────────────────────────
  const commit = useCallback(
    (fn: (e: StoryEdits) => StoryEdits) => {
      const next = fn(editsRef.current)
      editsRef.current = next
      setEdits(next)
      setSaveState('saving')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const { error } = await supabase
          .from('projects')
          .update({ story_edits: editsRef.current })
          .eq('id', id)
        setSaveState(error ? 'error' : 'saved')
      }, 700)
    },
    [id]
  )

  const setField = (slideId: string, key: string, value: string) =>
    commit((e) => ({
      ...e,
      fields: { ...e.fields, [slideId]: { ...(e.fields?.[slideId] || {}), [key]: value } },
    }))

  const resetSlide = (slideId: string) =>
    commit((e) => {
      const fields = { ...(e.fields || {}) }
      delete fields[slideId]
      return { ...e, fields }
    })

  const toggleHidden = (slideId: string) =>
    commit((e) => {
      const h = new Set(e.hidden || [])
      if (h.has(slideId)) h.delete(slideId)
      else h.add(slideId)
      return { ...e, hidden: Array.from(h) }
    })

  const move = (slideId: string, dir: -1 | 1) => {
    const ids = slides.map((s) => s.id)
    const i = ids.indexOf(slideId)
    const j = i + dir
    if (i < 1 || j < 1 || j >= ids.length) return // the title slide stays first
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    commit((e) => ({ ...e, order: ids }))
  }

  // ── slide actions ─────────────────────────────────────────────────────────
  const copyImage = async () => {
    if (!slide) return
    setBusy('image')
    try {
      const ClipboardItemCtor = (window as any).ClipboardItem
      if (ClipboardItemCtor && navigator.clipboard?.write) {
        const pending = captureSlide(slide, kit, T, 'png').then((b) => {
          if (!b) throw new Error('empty')
          return b as Blob
        })
        await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': pending })])
        say('Slide copied. Paste it into your deck.')
      } else {
        throw new Error('no clipboard')
      }
    } catch {
      try {
        const blob = (await captureSlide(slide, kit, T, 'png')) as Blob | null
        if (blob) {
          download(`${slug(project?.name)}_${slide.id}.png`, blob)
          say('Your browser blocked copying, so the slide downloaded as an image.')
        } else say('Could not create the image. Please try again.')
      } catch {
        say('Could not create the image. Please try again.')
      }
    } finally {
      setBusy(null)
    }
  }

  const copyText = async () => {
    if (!slide) return
    try {
      await navigator.clipboard.writeText(slideToText(slide))
      say('Slide text copied.')
    } catch {
      say('Your browser blocked copying text.')
    }
  }

  const csv = slide ? slideToCsv(slide) : null
  const downloadData = () => {
    if (!slide || !csv) return
    download(`${slug(project?.name)}_${slide.id}.csv`, csv, 'text/csv')
    say('Data downloaded.')
  }

  const exportPdf = async () => {
    if (visible.length === 0) return
    setBusy('pdf')
    try {
      const jsPDF = (await import('jspdf')).default
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_W, SLIDE_H] })
      for (let i = 0; i < visible.length; i++) {
        say(`Rendering slide ${i + 1} of ${visible.length}`)
        const dataUrl = (await captureSlide(visible[i], kit, T, 'jpeg')) as string
        if (i > 0) pdf.addPage()
        pdf.addImage(dataUrl, 'JPEG', 0, 0, SLIDE_W, SLIDE_H)
      }
      pdf.save(`${project?.pitch_title || project?.name || 'story'}.pdf`)
      say('PDF downloaded.')
    } catch (err) {
      console.error(err)
      say('PDF export failed. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  // ── present ───────────────────────────────────────────────────────────────
  const startPresent = () => {
    if (visible.length === 0) return
    const at = visible.findIndex((s) => s.id === selectedId)
    setPresentIdx(at >= 0 ? at : 0)
    setPresenting(true)
  }

  useEffect(() => {
    if (!presenting) return
    const el = presentRef.current
    try {
      el?.requestFullscreen?.()
    } catch {}
    const onFs = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false)
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown')
        setPresentIdx((i) => Math.min(i + 1, visible.length - 1))
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPresentIdx((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [presenting, visible.length])

  // arrow keys in the editor
  useEffect(() => {
    if (presenting) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowRight' && slides[index + 1]) setSelectedId(slides[index + 1].id)
      if (e.key === 'ArrowLeft' && slides[index - 1]) setSelectedId(slides[index - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, slides, index])

  // ── chrome ────────────────────────────────────────────────────────────────
  const bg = dark ? 'bg-[#0A0A0F] text-white' : 'bg-[#F8F8FA] text-[#080C14]'
  const bar = dark ? 'border-zinc-800 bg-[#0A0A0F]' : 'border-zinc-200 bg-white'
  const panel = dark ? 'border-zinc-800 bg-[#0F1420]' : 'border-zinc-200 bg-white'
  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const input = dark
    ? 'bg-[#0A0A0F] border-zinc-700 text-white focus:border-[#5DCAA5]'
    : 'bg-white border-zinc-300 text-[#080C14] focus:border-[#5DCAA5]'
  const ghost = dark
    ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
    : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'

  const fontLink = (
    // eslint-disable-next-line @next/next/no-page-custom-font
    <link rel="stylesheet" href={FONT_PAIRINGS[kit.fontPairing].googleHref} />
  )

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg}`}>
        <div className="w-6 h-6 border-2 border-[#5DCAA5] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!project || slides.length <= 1) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center ${bg}`}
      >
        <p className="text-lg font-semibold">Nothing to build a story from yet</p>
        <p className={`text-sm max-w-md ${subtle}`}>
          Run the analysis on your project, pick the findings you want, and choose Story Mode again.
        </p>
        <Link
          href={`/projects/${id}`}
          className="px-4 py-2.5 rounded-xl bg-[#080C14] text-white text-sm font-medium border border-zinc-700"
        >
          Back to project
        </Link>
      </div>
    )
  }

  const presentSlide = visible[presentIdx]
  const presentW = Math.min(viewport.w, viewport.h * (16 / 9))

  return (
    <div className={`h-screen flex flex-col ${bg}`}>
      {fontLink}

      {/* Top bar */}
      <div className={`h-14 shrink-0 flex items-center justify-between gap-4 px-4 border-b ${bar}`}>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/projects/${id}`}
            className={`flex items-center gap-1.5 text-sm ${subtle} hover:opacity-80`}
            title="Back to project"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline truncate max-w-[200px]">
              {project.name || 'Project'}
            </span>
          </Link>
          <span className={`h-5 w-px ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
          <span className="font-semibold text-sm">Story Mode</span>
          <span className={`text-xs ${saveState === 'error' ? 'text-red-400' : subtle}`}>
            {saveState === 'saving'
              ? 'Saving'
              : saveState === 'error'
                ? 'Not saved. Run the 003 migration.'
                : 'Saved'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/brand"
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${ghost}`}
          >
            <Palette size={12} />
            Brand
          </Link>
          <button
            onClick={exportPdf}
            disabled={busy !== null}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium disabled:opacity-40 ${ghost}`}
          >
            {busy === 'pdf' ? (
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileDown size={12} />
            )}
            Export PDF
          </button>
          <button
            onClick={startPresent}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#5DCAA5] text-[#080C14] text-xs font-semibold hover:opacity-90"
          >
            <Play size={12} />
            Present
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Filmstrip */}
        <div
          className={`hidden md:block w-[200px] shrink-0 overflow-y-auto border-r p-3 space-y-3 ${panel}`}
        >
          {slides.map((s, i) => {
            const on = s.id === selectedId
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`block w-full text-left rounded-lg p-1 transition-colors ${
                  on ? 'ring-2 ring-[#5DCAA5]' : dark ? 'hover:bg-zinc-800/60' : 'hover:bg-zinc-100'
                } ${hidden.has(s.id) ? 'opacity-40' : ''}`}
              >
                <div className="rounded overflow-hidden border border-black/10">
                  <Thumb slide={s} kit={kit} T={T} />
                </div>
                <div
                  className={`mt-1 px-0.5 flex items-center justify-between text-[11px] ${subtle}`}
                >
                  <span>
                    {i + 1}. {KIND_LABEL[s.kind]}
                  </span>
                  {hidden.has(s.id) && <EyeOff size={11} />}
                </div>
              </button>
            )
          })}
        </div>

        {/* Stage */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={stageRef} className="flex-1 min-h-0 flex items-center justify-center p-6">
            {slide && (
              <div
                className="shadow-2xl rounded-md overflow-hidden"
                style={{ opacity: hidden.has(slide.id) ? 0.45 : 1 }}
              >
                <Scaled width={stageW}>
                  <StorySlideView slide={slide} kit={kit} T={T} />
                </Scaled>
              </div>
            )}
          </div>

          <div
            className={`shrink-0 border-t px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${bar}`}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => slides[index - 1] && setSelectedId(slides[index - 1].id)}
                disabled={index === 0}
                className={`p-2 rounded-xl border disabled:opacity-30 ${ghost}`}
                aria-label="Previous slide"
              >
                <ChevronLeft size={15} />
              </button>
              <span className={`text-xs font-mono w-14 text-center ${subtle}`}>
                {index + 1} / {slides.length}
              </span>
              <button
                onClick={() => slides[index + 1] && setSelectedId(slides[index + 1].id)}
                disabled={index >= slides.length - 1}
                className={`p-2 rounded-xl border disabled:opacity-30 ${ghost}`}
                aria-label="Next slide"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyImage}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#080C14] text-white text-xs font-semibold border border-zinc-700 hover:bg-[#0F1420] disabled:opacity-40"
              >
                {busy === 'image' ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImageIcon size={13} />
                )}
                Copy as image
              </button>
              <button
                onClick={copyText}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium ${ghost}`}
              >
                <Copy size={12} />
                Copy text
              </button>
              <button
                onClick={downloadData}
                disabled={!csv}
                title={
                  csv
                    ? 'Download the numbers behind this slide'
                    : 'This slide has no data of its own'
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium disabled:opacity-30 ${ghost}`}
              >
                <Table2 size={12} />
                Data CSV
              </button>
            </div>
          </div>
        </div>

        {/* Editor */}
        {slide && (
          <div className={`hidden lg:flex w-[320px] shrink-0 flex-col border-l ${panel}`}>
            <div className="p-4 border-b border-inherit">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5DCAA5]">
                {KIND_LABEL[slide.kind]} slide
              </p>
              <p className={`text-xs mt-1 ${subtle}`}>
                {slide.chart
                  ? `Drawn as a ${{ line: 'line chart', bar: 'sorted bar chart', ranked: 'ranked bar chart', grouped: 'grouped bar chart', stacked: 'stacked bar chart', donut: 'donut chart', scatter: 'scatter plot' }[slide.chart.kind]} because of the shape of your data.`
                  : 'Edit any text. The layout stays fixed so the slide always looks finished.'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {slide.spec.map((f) => (
                <div key={f.key}>
                  <label className={`block text-[11px] font-semibold mb-1 ${subtle}`}>
                    {f.label}
                  </label>
                  {f.long ? (
                    <textarea
                      value={slide.fields[f.key] || ''}
                      onChange={(e) => setField(slide.id, f.key, e.target.value)}
                      rows={3}
                      className={`w-full px-3 py-2 rounded-lg border text-xs leading-relaxed outline-none resize-none ${input}`}
                    />
                  ) : (
                    <input
                      value={slide.fields[f.key] || ''}
                      onChange={(e) => setField(slide.id, f.key, e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${input}`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-inherit grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleHidden(slide.id)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium ${ghost}`}
              >
                {hidden.has(slide.id) ? <Eye size={12} /> : <EyeOff size={12} />}
                {hidden.has(slide.id) ? 'Show slide' : 'Hide slide'}
              </button>
              <button
                onClick={() => resetSlide(slide.id)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium ${ghost}`}
              >
                <RotateCcw size={12} />
                Reset text
              </button>
              <button
                onClick={() => move(slide.id, -1)}
                disabled={index <= 1}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium disabled:opacity-30 ${ghost}`}
              >
                <ChevronUp size={12} />
                Move earlier
              </button>
              <button
                onClick={() => move(slide.id, 1)}
                disabled={index === 0 || index >= slides.length - 1}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium disabled:opacity-30 ${ghost}`}
              >
                <ChevronDown size={12} />
                Move later
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-xl bg-[#080C14] text-white text-xs font-medium border border-zinc-700 shadow-xl">
          {toast}
        </div>
      )}

      {/* Present */}
      {presenting && presentSlide && (
        <div
          ref={presentRef}
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          style={{ cursor: 'none' }}
          onClick={() => setPresentIdx((i) => Math.min(i + 1, visible.length - 1))}
        >
          <Scaled width={presentW}>
            <StorySlideView slide={presentSlide} kit={kit} T={T} />
          </Scaled>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPresenting(false)
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20 opacity-0 hover:opacity-100 transition-opacity"
            style={{ cursor: 'pointer' }}
            aria-label="Exit presentation"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
