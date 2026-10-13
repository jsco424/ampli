import type { CSSProperties, ReactNode } from 'react'
import { FONT_PAIRINGS, type BrandKit, type KitTokens } from '@/lib/brandKit'
import type { StorySlide } from '@/lib/storyModel'
import { StoryChartSvg } from '@/components/story/StoryCharts'

// One Story Mode slide at its native 960 by 540. Callers scale it with a CSS
// transform. Everything is inline styles, so the same markup renders in the
// editor, the present view, and the image and PDF exports.

export const SLIDE_W = 960
export const SLIDE_H = 540

const LOGO_POS: Record<string, CSSProperties> = {
  'bottom-right': { right: 18, bottom: 14 },
  'bottom-left': { left: 18, bottom: 14 },
  'top-right': { right: 18, top: 14 },
  'top-left': { left: 18, top: 14 },
}

function Chip({ text, T }: { text: string; T: KitTokens }) {
  if (!text) return null
  return (
    <div
      style={{
        display: 'inline-block',
        background: T.deep,
        color: T.highlight,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        padding: '5px 10px',
        borderRadius: 3,
      }}
    >
      {text}
    </div>
  )
}

const titleSize = (s: string, base: number) =>
  s.length > 95 ? base - 8 : s.length > 62 ? base - 4 : base
const statSize = (s: string) =>
  s.length > 11 ? 44 : s.length > 8 ? 56 : s.length > 6 ? 72 : s.length > 4 ? 88 : 104

function ChartPanels({ slide, T }: { slide: StorySlide; T: KitTokens }) {
  const f = slide.fields
  return (
    <>
      <div
        style={{
          width: 600,
          flexShrink: 0,
          boxSizing: 'border-box',
          background: T.surface,
          color: T.deep,
          padding: '40px 44px',
        }}
      >
        <Chip text={f.tag} T={T} />
        <div
          style={{
            marginTop: 16,
            fontSize: titleSize(f.title || '', 31),
            lineHeight: 1.15,
            fontWeight: 700,
          }}
        >
          {f.title}
        </div>
        {f.subtitle ? (
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              lineHeight: 1.5,
              color: T.mutedOnSurface,
              maxHeight: 40,
              overflow: 'hidden',
            }}
          >
            {f.subtitle}
          </div>
        ) : null}
        <div style={{ margin: '18px 0 10px', height: 1, background: T.hairline }} />
        {slide.chart && <StoryChartSvg chart={slide.chart} T={T} />}
        {slide.table && <TableBody slide={slide} T={T} />}
      </div>
      <div
        style={{
          flexGrow: 1,
          boxSizing: 'border-box',
          background: T.deep,
          color: '#FFFFFF',
          padding: '44px 40px 48px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {slide.table ? (
          <>
            <div
              style={{
                marginTop: 'auto',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: T.mutedOnDeep,
              }}
            >
              {f.statLabel}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 24,
                lineHeight: 1.35,
                fontWeight: 700,
                color: T.highlight,
              }}
            >
              {f.sentence}
            </div>
            {slide.table.footnote ? (
              <div style={{ marginTop: 18, fontSize: 12, lineHeight: 1.5, color: T.mutedOnDeep }}>
                {slide.table.footnote}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div
              style={{
                marginTop: 'auto',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: T.mutedOnDeep,
              }}
            >
              {f.statLabel}
            </div>
            <div
              style={{
                marginTop: f.statLabel ? 6 : 0,
                fontSize: statSize(f.stat || ''),
                lineHeight: 1,
                fontWeight: 800,
                color: T.highlight,
              }}
            >
              {f.stat}
            </div>
            {f.sentence ? (
              <div
                style={{
                  marginTop: 18,
                  fontSize: f.sentence.length > 150 ? 14 : 16,
                  lineHeight: 1.6,
                  color: '#E8EDEF',
                }}
              >
                {f.sentence}
              </div>
            ) : null}
            {f.takeaway ? (
              <>
                <div
                  style={{ margin: '22px 0 14px', height: 1, background: 'rgba(255,255,255,0.22)' }}
                />
                <div style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>{f.takeaway}</div>
              </>
            ) : null}
          </>
        )}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 24,
            fontSize: 11,
            lineHeight: 1.5,
            color: T.mutedOnDeep,
            paddingRight: 96,
          }}
        >
          {f.source}
        </div>
      </div>
    </>
  )
}

function TableBody({ slide, T }: { slide: StorySlide; T: KitTokens }) {
  const t = slide.table!
  const rows = t.rows.slice(0, 8)
  const small = t.headers.length > 4 || rows.length > 6
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: small ? 12 : 13.5 }}>
      <thead>
        <tr>
          {t.headers.map((h, i) => (
            <th
              key={i}
              style={{
                textAlign: i === 0 ? 'left' : 'right',
                fontSize: 10.5,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: T.mutedOnSurface,
                padding: '0 8px 8px',
                borderBottom: `1.5px solid ${T.deep}`,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td
                key={ci}
                style={{
                  textAlign: ci === 0 ? 'left' : 'right',
                  padding: small ? '7px 8px' : '9px 8px',
                  fontWeight: ci === 0 ? 700 : 500,
                  borderBottom: `1px solid ${T.hairline}`,
                  color: T.deep,
                }}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Card({
  T,
  tone,
  children,
  height,
}: {
  T: KitTokens
  tone: 'deep' | 'brand' | 'white'
  children: ReactNode
  height: number
}) {
  const bg = tone === 'deep' ? T.deep : tone === 'brand' ? T.brand : '#FFFFFF'
  const fg = tone === 'deep' ? '#FFFFFF' : tone === 'brand' ? T.textOnBrand : T.deep
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        boxSizing: 'border-box',
        height,
        background: bg,
        color: fg,
        border: tone === 'white' ? `1px solid ${T.hairline}` : undefined,
        borderRadius: 6,
        padding: 26,
        boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  )
}

function Frame({ slide, T, children }: { slide: StorySlide; T: KitTokens; children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        background: T.surface,
        color: T.deep,
        padding: '44px 48px',
      }}
    >
      <Chip text={slide.fields.tag} T={T} />
      <div
        style={{
          marginTop: 14,
          fontSize: titleSize(slide.fields.title || '', 38),
          lineHeight: 1.12,
          fontWeight: 700,
        }}
      >
        {slide.fields.title}
      </div>
      <div style={{ marginTop: 16, height: 1, background: T.hairline }} />
      {children}
      <div
        style={{
          position: 'absolute',
          left: 48,
          bottom: 22,
          fontSize: 11,
          color: T.mutedOnSurface,
          maxWidth: 640,
        }}
      >
        {slide.fields.source}
      </div>
    </div>
  )
}

function StatsSlide({ slide, T }: { slide: StorySlide; T: KitTokens }) {
  const f = slide.fields
  const tones: ('deep' | 'brand' | 'white')[] = ['deep', 'brand', 'white']
  const n = slide.count || 0
  return (
    <Frame slide={slide} T={T}>
      <div style={{ display: 'flex', gap: 24, marginTop: 36 }}>
        {Array.from({ length: n }).map((_, i) => {
          const tone = tones[i]
          const label = f[`card${i}.label`] || ''
          const value = f[`card${i}.value`] || ''
          const text = f[`card${i}.text`] || ''
          const muted =
            tone === 'deep' ? T.mutedOnDeep : tone === 'brand' ? T.textOnBrand : T.mutedOnSurface
          const num = tone === 'deep' ? T.highlight : tone === 'brand' ? T.textOnBrand : T.deep
          return (
            <Card key={i} T={T} tone={tone} height={290}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: muted,
                  opacity: tone === 'brand' ? 0.85 : 1,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: value.length > 7 ? 48 : 62,
                  lineHeight: 1,
                  fontWeight: 800,
                  color: num,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  marginTop: 'auto',
                  fontSize: text.length > 110 ? 13 : 14,
                  lineHeight: 1.5,
                }}
              >
                {text}
              </div>
            </Card>
          )
        })}
      </div>
    </Frame>
  )
}

function RecsSlide({ slide, T }: { slide: StorySlide; T: KitTokens }) {
  const f = slide.fields
  const tones: ('deep' | 'brand' | 'white')[] = ['deep', 'brand', 'white']
  const n = slide.count || 0
  return (
    <Frame slide={slide} T={T}>
      <div style={{ display: 'flex', gap: 24, marginTop: 26 }}>
        {Array.from({ length: n }).map((_, i) => {
          const tone = tones[i]
          const badgeBg = tone === 'white' ? T.deep : T.highlight
          const badgeFg = tone === 'white' ? T.highlight : T.deep
          const evMuted =
            tone === 'deep' ? T.highlight : tone === 'brand' ? T.textOnBrand : T.mutedOnSurface
          const text = f[`rec${i}.text`] || ''
          return (
            <Card key={i} T={T} tone={tone} height={300}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: badgeBg,
                  color: badgeFg,
                  fontSize: 16,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i + 1}
              </div>
              <div style={{ marginTop: 16, fontSize: 18, lineHeight: 1.25, fontWeight: 700 }}>
                {f[`rec${i}.title`]}
              </div>
              <div
                style={{ marginTop: 10, fontSize: text.length > 150 ? 12 : 13, lineHeight: 1.55 }}
              >
                {text}
              </div>
              {f[`rec${i}.evidence`] ? (
                <>
                  <div
                    style={{
                      marginTop: 'auto',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      color: evMuted,
                    }}
                  >
                    BASED ON
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>
                    {f[`rec${i}.evidence`]}
                  </div>
                </>
              ) : null}
            </Card>
          )
        })}
      </div>
    </Frame>
  )
}

function SummarySlide({ slide, T }: { slide: StorySlide; T: KitTokens }) {
  const f = slide.fields
  const n = slide.count || 0
  return (
    <>
      <div
        style={{
          width: 600,
          flexShrink: 0,
          boxSizing: 'border-box',
          background: T.surface,
          color: T.deep,
          padding: '40px 44px',
        }}
      >
        <Chip text={f.tag} T={T} />
        <div style={{ marginTop: 16, fontSize: 31, lineHeight: 1.15, fontWeight: 700 }}>
          {f.title}
        </div>
        <div style={{ margin: '18px 0 6px', height: 1, background: T.hairline }} />
        {Array.from({ length: n }).map((_, i) => {
          const text = f[`point${i}`] || ''
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 16,
                padding: '16px 0',
                borderBottom: i < n - 1 ? `1px solid ${T.hairline}` : undefined,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: T.mutedOnSurface,
                  width: 22,
                  flexShrink: 0,
                  paddingTop: 3,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <div
                style={{
                  fontSize: text.length > 160 ? 15 : 17,
                  lineHeight: 1.5,
                  fontWeight: i === 0 ? 700 : 500,
                }}
              >
                {text}
              </div>
            </div>
          )
        })}
      </div>
      <div
        style={{
          flexGrow: 1,
          boxSizing: 'border-box',
          background: T.deep,
          color: '#fff',
          padding: '44px 40px 48px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {f.stat ? (
          <>
            <div
              style={{
                marginTop: 'auto',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: T.mutedOnDeep,
              }}
            >
              {f.statLabel}
            </div>
            <div
              style={{
                marginTop: f.statLabel ? 6 : 0,
                fontSize: statSize(f.stat),
                lineHeight: 1,
                fontWeight: 800,
                color: T.highlight,
              }}
            >
              {f.stat}
            </div>
            {f.sentence ? (
              <div style={{ marginTop: 18, fontSize: 16, lineHeight: 1.6, color: '#E8EDEF' }}>
                {f.sentence}
              </div>
            ) : null}
          </>
        ) : null}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 24,
            fontSize: 11,
            lineHeight: 1.5,
            color: T.mutedOnDeep,
            paddingRight: 96,
          }}
        >
          {f.source}
        </div>
      </div>
    </>
  )
}

function TitleSlide({ slide, T, kit }: { slide: StorySlide; T: KitTokens; kit: BrandKit }) {
  const f = slide.fields
  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        background: T.deep,
        color: '#fff',
        padding: '64px 72px 56px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          alignSelf: 'flex-start',
          background: T.highlight,
          color: T.deep,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.14em',
          padding: '6px 12px',
          borderRadius: 3,
        }}
      >
        {f.tag}
      </div>
      <div
        style={{
          marginTop: 'auto',
          fontSize: (f.title || '').length > 60 ? 50 : 62,
          lineHeight: 1.08,
          fontWeight: 800,
          maxWidth: 760,
        }}
      >
        {f.title}
      </div>
      <div style={{ marginTop: 22, width: 72, height: 4, background: T.highlight }} />
      {f.subtitle ? (
        <div style={{ marginTop: 22, fontSize: 22, color: '#E8EDEF', fontWeight: 500 }}>
          {f.subtitle}
        </div>
      ) : null}
      <div
        style={{ marginTop: 'auto', display: 'flex', gap: 28, fontSize: 13, color: T.mutedOnDeep }}
      >
        {kit.name ? <span style={{ fontWeight: 700, color: '#fff' }}>{kit.name}</span> : null}
        <span>{f.date}</span>
      </div>
    </div>
  )
}

export function StorySlideView({
  slide,
  kit,
  T,
}: {
  slide: StorySlide
  kit: BrandKit
  T: KitTokens
}) {
  const family = FONT_PAIRINGS[kit.fontPairing]?.family || FONT_PAIRINGS.manrope.family
  const logoPos = LOGO_POS[kit.logoPosition] || LOGO_POS['bottom-right']
  let body: ReactNode
  switch (slide.kind) {
    case 'title':
      body = <TitleSlide slide={slide} T={T} kit={kit} />
      break
    case 'summary':
      body = <SummarySlide slide={slide} T={T} />
      break
    case 'stats':
      body = <StatsSlide slide={slide} T={T} />
      break
    case 'recs':
      body = <RecsSlide slide={slide} T={T} />
      break
    default:
      body = <ChartPanels slide={slide} T={T} />
  }
  return (
    <div
      style={{
        position: 'relative',
        width: SLIDE_W,
        height: SLIDE_H,
        display: 'flex',
        overflow: 'hidden',
        fontFamily: family,
        background: T.surface,
      }}
    >
      {body}
      {kit.logoUrl ? (
        <div
          style={{
            position: 'absolute',
            ...logoPos,
            background: '#FFFFFF',
            borderRadius: 4,
            padding: '3px 7px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={kit.logoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ height: 22, maxWidth: 90, objectFit: 'contain', display: 'block' }}
          />
        </div>
      ) : null}
    </div>
  )
}
