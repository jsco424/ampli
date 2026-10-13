'use client'

import { useState, useEffect, useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_KIT,
  FONT_PAIRINGS,
  deriveKitFromColor,
  kitTokens,
  normalizeHex,
  resolveBrandKit,
  validateKit,
  type BrandKit,
  type FontPairingKey,
  type KitTokens,
} from '@/lib/brandKit'
import {
  CheckCircle,
  Palette,
  Building2,
  Info,
  Type,
  Image as ImageIcon,
  Wand2,
} from 'lucide-react'

type RoleKey = 'deep' | 'brand' | 'highlight' | 'surface'
type SlideKey = 'finding' | 'stats' | 'recs'

const ROLE_COPY: Record<RoleKey, { label: string; where: string }> = {
  deep: {
    label: 'Deep',
    where: 'The dark side panel, slide titles, tag chips, and the main chart series.',
  },
  brand: {
    label: 'Brand',
    where: 'The middle card on stat and recommendation slides, and your second chart color.',
  },
  highlight: {
    label: 'Highlight',
    where: 'The big numbers on dark panels and the text inside tag chips.',
  },
  surface: {
    label: 'Surface',
    where: 'The slide background behind charts and cards.',
  },
}

const LOGO_POSITIONS = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
]

// One unit of the 960 by 540 reference slide, expressed against the preview's
// own width so the preview scales with its container.
const px = (n: number) => `${(n / 9.6).toFixed(3)}cqw`

// ── hex field ───────────────────────────────────────────────────────────────

function HexField({
  value,
  onCommit,
  className,
}: {
  value: string
  onCommit: (hex: string) => void
  className: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input
      value={text}
      maxLength={7}
      onChange={(e) => {
        setText(e.target.value)
        const hex = normalizeHex(e.target.value)
        if (hex) onCommit(hex)
      }}
      onBlur={() => setText(value)}
      className={className}
      aria-label="Hex color"
      spellCheck={false}
    />
  )
}

// ── live slide preview ──────────────────────────────────────────────────────

function KitPreview({
  kit,
  t,
  slide,
  focusRole,
}: {
  kit: BrandKit
  t: KitTokens
  slide: SlideKey
  focusRole: RoleKey | null
}) {
  const family = FONT_PAIRINGS[kit.fontPairing].family
  const ring = (role: RoleKey): React.CSSProperties =>
    focusRole === role ? { outline: '2px solid #5DCAA5', outlineOffset: 3 } : {}

  const chip = (text: string) => (
    <div
      style={{
        display: 'inline-block',
        background: t.deep,
        color: t.highlight,
        fontSize: px(11),
        fontWeight: 700,
        letterSpacing: '0.12em',
        padding: `${px(5)} ${px(10)}`,
        borderRadius: px(3),
        ...ring('highlight'),
      }}
    >
      {text}
    </div>
  )

  const surfaceStyle: React.CSSProperties = {
    background: t.surface,
    color: t.deep,
    ...ring('surface'),
  }

  let body: React.ReactNode = null

  if (slide === 'finding') {
    body = (
      <>
        <div
          style={{
            width: '62.5%',
            boxSizing: 'border-box',
            padding: `${px(40)} ${px(44)}`,
            ...surfaceStyle,
          }}
        >
          {chip('PROMOTION IMPACT')}
          <div style={{ marginTop: px(16), fontSize: px(31), lineHeight: 1.15, fontWeight: 700 }}>
            Conversion rose 25% while the promotion ran
          </div>
          <div style={{ marginTop: px(10), fontSize: px(13), color: t.mutedOnSurface }}>
            Monthly conversion rate, treatment against control.
          </div>
          <div style={{ margin: `${px(18)} 0 ${px(10)}`, height: 1, background: t.hairline }} />
          <svg viewBox="0 0 512 262" style={{ width: '100%', display: 'block' }} aria-hidden="true">
            <rect x="178" y="14" width="184" height="186" fill={t.deep} fillOpacity="0.08" />
            <text x="270" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill={t.deep}>
              Promotion
            </text>
            {[20, 65, 110, 155].map((y) => (
              <line key={y} x1="40" y1={y} x2="512" y2={y} stroke={t.gridline} />
            ))}
            <line x1="40" y1="200" x2="512" y2="200" stroke={t.axis} />
            {[
              ['4.5%', 24],
              ['4.0%', 69],
              ['3.5%', 114],
              ['3.0%', 159],
              ['2.5%', 204],
            ].map(([l, y]) => (
              <text
                key={l as string}
                x="32"
                y={y as number}
                textAnchor="end"
                fontSize="11"
                fill={t.mutedOnSurface}
              >
                {l}
              </text>
            ))}
            <polyline
              points="40,146 132,155 224,137 316,146 408,137 500,146"
              fill="none"
              stroke={t.pairMuted}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points="40,146 132,137 224,74 316,65 408,110 500,128"
              fill="none"
              stroke={t.series[0]}
              strokeWidth="3.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx="316" cy="65" r="5" fill={t.series[0]} />
            <text x="316" y="54" textAnchor="middle" fontSize="14" fontWeight="800" fill={t.deep}>
              4.0%
            </text>
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m, i) => (
              <text
                key={m}
                x={40 + i * 92}
                y="222"
                textAnchor="middle"
                fontSize="12"
                fill={t.mutedOnSurface}
              >
                {m}
              </text>
            ))}
          </svg>
        </div>
        <div
          style={{
            flex: 1,
            boxSizing: 'border-box',
            background: t.deep,
            color: '#FFFFFF',
            padding: `${px(44)} ${px(40)} ${px(36)}`,
            display: 'flex',
            flexDirection: 'column',
            ...ring('deep'),
          }}
        >
          <div
            style={{
              marginTop: 'auto',
              fontSize: px(11),
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: t.mutedOnDeep,
            }}
          >
            LIFT DURING PROMOTION
          </div>
          <div
            style={{
              marginTop: px(6),
              fontSize: px(104),
              lineHeight: 1,
              fontWeight: 800,
              color: t.highlight,
              ...ring('highlight'),
            }}
          >
            +25%
          </div>
          <div style={{ marginTop: px(18), fontSize: px(16), lineHeight: 1.6 }}>
            Treatment averaged 3.95% across March and April against 3.15% for control.
          </div>
          <div
            style={{
              margin: `${px(22)} 0 ${px(14)}`,
              height: 1,
              background: 'rgba(255,255,255,0.22)',
            }}
          />
          <div style={{ fontSize: px(14), lineHeight: 1.5, fontWeight: 600 }}>
            The lift did not hold. Plan a repeat or a retention follow up.
          </div>
          <div
            style={{
              marginTop: 'auto',
              paddingTop: px(24),
              fontSize: px(11),
              color: t.mutedOnDeep,
            }}
          >
            Source: your uploaded data
          </div>
        </div>
      </>
    )
  } else if (slide === 'stats') {
    const card = (
      bg: string,
      fg: string,
      muted: string,
      num: string,
      label: string,
      text: string,
      role: RoleKey | null,
      border?: string
    ) => (
      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          boxSizing: 'border-box',
          height: px(240),
          background: bg,
          color: fg,
          border: border ? `1px solid ${border}` : undefined,
          borderRadius: px(6),
          padding: px(26),
          boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
          display: 'flex',
          flexDirection: 'column',
          ...(role ? ring(role) : {}),
        }}
      >
        <div style={{ fontSize: px(11), fontWeight: 700, letterSpacing: '0.12em', color: muted }}>
          {label}
        </div>
        <div
          style={{
            marginTop: px(10),
            fontSize: px(62),
            lineHeight: 1,
            fontWeight: 800,
            color: num,
          }}
        >
          {text.split('|')[0]}
        </div>
        <div style={{ marginTop: 'auto', fontSize: px(14), lineHeight: 1.5 }}>
          {text.split('|')[1]}
        </div>
      </div>
    )
    body = (
      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: `${px(44)} ${px(48)}`,
          ...surfaceStyle,
        }}
      >
        {chip('AT A GLANCE')}
        <div style={{ marginTop: px(14), fontSize: px(38), lineHeight: 1.12, fontWeight: 700 }}>
          LinkedIn is the standout channel
        </div>
        <div style={{ marginTop: px(18), height: 1, background: t.hairline }} />
        <div style={{ display: 'flex', gap: px(24), marginTop: px(30) }}>
          {card(
            t.deep,
            '#FFFFFF',
            t.mutedOnDeep,
            t.highlight,
            'RETURN ON AD SPEND',
            '24.97x|The highest return of the four channels.',
            'deep'
          )}
          {card(
            t.brand,
            t.textOnBrand,
            t.textOnBrand,
            t.textOnBrand,
            'GAP TO DISPLAY',
            '6.4x|Display returns 3.88x over the same period.',
            'brand'
          )}
          {card(
            '#FFFFFF',
            t.deep,
            t.mutedOnSurface,
            t.deep,
            'LINKEDIN CONVERSION',
            '9.1%|Display converts at 1.0%.',
            null,
            t.hairline
          )}
        </div>
      </div>
    )
  } else {
    const rec = (
      bg: string,
      fg: string,
      badge: string,
      badgeFg: string,
      title: string,
      text: string,
      next: string,
      role: RoleKey | null,
      border?: string
    ) => (
      <div
        style={{
          flex: '1 1 0',
          minWidth: 0,
          boxSizing: 'border-box',
          height: px(296),
          background: bg,
          color: fg,
          border: border ? `1px solid ${border}` : undefined,
          borderRadius: px(6),
          padding: px(24),
          boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
          display: 'flex',
          flexDirection: 'column',
          ...(role ? ring(role) : {}),
        }}
      >
        <div style={{ width: px(36), height: px(36), borderRadius: px(6), background: badge }} />
        <div style={{ marginTop: px(16), fontSize: px(18), lineHeight: 1.25, fontWeight: 700 }}>
          {title}
        </div>
        <div style={{ marginTop: px(10), fontSize: px(13), lineHeight: 1.55 }}>{text}</div>
        <div
          style={{
            marginTop: 'auto',
            fontSize: px(11),
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: badgeFg,
          }}
        >
          NEXT
        </div>
        <div style={{ marginTop: px(4), fontSize: px(13), lineHeight: 1.45, fontWeight: 600 }}>
          {next}
        </div>
      </div>
    )
    body = (
      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: `${px(44)} ${px(48)}`,
          ...surfaceStyle,
        }}
      >
        {chip('NEXT STEPS')}
        <div style={{ marginTop: px(14), fontSize: px(38), lineHeight: 1.12, fontWeight: 700 }}>
          Recommendations
        </div>
        <div style={{ marginTop: px(14), height: 1, background: t.hairline }} />
        <div style={{ display: 'flex', gap: px(24), marginTop: px(28) }}>
          {rec(
            t.deep,
            '#FFFFFF',
            t.highlight,
            t.highlight,
            'Shift budget toward LinkedIn',
            'LinkedIn returns 24.97x against 3.88x for display.',
            'Move 10% of display spend next quarter.',
            'deep'
          )}
          {rec(
            t.brand,
            t.textOnBrand,
            t.highlight,
            t.textOnBrand,
            'Audit display targeting',
            'A 1.0% conversion rate points to audience quality.',
            'Pause the two weakest placements.',
            'brand'
          )}
          {rec(
            '#FFFFFF',
            t.deep,
            t.deep,
            t.mutedOnSurface,
            'Benchmark before you scale',
            'Your industry median shows what typical looks like.',
            'Review the benchmark slide first.',
            null,
            t.hairline
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ containerType: 'inline-size', width: '100%' }}>
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          display: 'flex',
          overflow: 'hidden',
          fontFamily: family,
          borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}
      >
        {body}
      </div>
    </div>
  )
}

// ── page ────────────────────────────────────────────────────────────────────

export default function BrandSettingsPage() {
  const { user } = useUser()
  const { dark } = useTheme()

  const [kit, setKit] = useState<BrandKit>({ ...DEFAULT_KIT })
  const [seedColor, setSeedColor] = useState('#6B2D8B')
  const [slide, setSlide] = useState<SlideKey>('finding')
  const [focusRole, setFocusRole] = useState<RoleKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState(false)
  // Kept only so saving does not blank a value other code still reads.
  const [legacyGammaThemeId, setLegacyGammaThemeId] = useState('')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: row } = await supabase
        .from('brand_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      const { data: legacy } = await supabase
        .from('user_settings')
        .select('brand_name, brand_primary_color, brand_logo_url, gamma_theme_id')
        .eq('user_id', user.id)
        .maybeSingle()
      setLegacyGammaThemeId(legacy?.gamma_theme_id || '')
      if (row) {
        setKit(resolveBrandKit(row))
      } else if (legacy) {
        setKit(
          resolveBrandKit({
            brand_name: legacy.brand_name,
            logo_url: legacy.brand_logo_url,
            brand_color: legacy.brand_primary_color,
          })
        )
      }
    })()
  }, [user])

  const tokens = useMemo(() => kitTokens(kit), [kit])
  const warnings = useMemo(() => validateKit(kit), [kit])

  const setRole = (role: RoleKey, hex: string) => setKit((k) => ({ ...k, [role]: hex }))

  const buildFromSeed = () => {
    const derived = deriveKitFromColor(seedColor)
    setKit((k) => ({
      ...k,
      deep: derived.deep,
      brand: derived.brand,
      highlight: derived.highlight,
      surface: derived.surface,
    }))
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaveError(null)
    const now = new Date().toISOString()
    const { error } = await supabase.from('brand_settings').upsert(
      {
        user_id: user.id,
        brand_name: kit.name.trim(),
        logo_url: (kit.logoUrl || '').trim() || null,
        logo_position: kit.logoPosition,
        deep_color: kit.deep,
        brand_color: kit.brand,
        highlight_color: kit.highlight,
        surface_color: kit.surface,
        font_pairing: kit.fontPairing,
        // Legacy columns, kept in step so older readers see the same colors.
        primary_color: kit.highlight,
        secondary_color: kit.deep,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    )
    if (error) {
      setSaving(false)
      setSaveError('Could not save your brand kit. Please try again.')
      return
    }
    // Best effort: keep the old settings row in step for the admin account
    // lookup, which still reads it. A failure here does not affect slides.
    await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        brand_name: kit.name.trim(),
        brand_primary_color: kit.brand,
        brand_logo_url: (kit.logoUrl || '').trim(),
        gamma_theme_id: legacyGammaThemeId,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const base = dark ? 'bg-[#080C14] text-white' : 'bg-zinc-50 text-[#080C14]'
  const card = dark ? 'bg-[#080C14] border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-[#0F1420] border-zinc-700 text-white placeholder-zinc-500 focus:border-[#5DCAA5]'
    : 'bg-white border-zinc-300 text-[#080C14] placeholder-zinc-400 focus:border-[#5DCAA5]'
  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const subtler = dark ? 'text-zinc-500' : 'text-zinc-400'
  const section = dark ? 'bg-[#0F1420]/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'

  const logoIsPublic =
    !!kit.logoUrl && kit.logoUrl.startsWith('https://') && !kit.logoUrl.includes('localhost')

  const roles: RoleKey[] = ['deep', 'brand', 'highlight', 'surface']

  return (
    <div className={`min-h-screen ${base}`}>
      {/* Typefaces the preview and the slides can use. */}
      {Object.values(FONT_PAIRINGS).map((f) => (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link key={f.googleHref} rel="stylesheet" href={f.googleHref} />
      ))}
      <Navbar />
      <main className="pt-24 px-6 max-w-5xl mx-auto pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Brand Kit</h1>
          <p className={`text-sm ${subtle}`}>
            Pick your colors and typeface and see exactly how your slides will look before you save.
            Everything here applies to every Story Mode slide and PDF.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* Controls */}
          <div className="space-y-4">
            <div className={`p-5 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-1">
                <Wand2 size={15} className="text-[#5DCAA5]" />
                <p className="font-semibold text-sm">Start from one color</p>
              </div>
              <p className={`text-xs mb-3 ${subtler}`}>
                Pick your main brand color and we will build the rest, then you can adjust each one.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={normalizeHex(seedColor) || '#6B2D8B'}
                  onChange={(e) => setSeedColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border-0 cursor-pointer bg-transparent p-0"
                  aria-label="Main brand color"
                />
                <HexField
                  value={seedColor}
                  onCommit={setSeedColor}
                  className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${input}`}
                />
                <button
                  onClick={buildFromSeed}
                  className="px-3.5 py-2.5 rounded-xl bg-[#080C14] text-white text-xs font-semibold hover:bg-[#0F1420] transition-colors border border-zinc-700"
                >
                  Build kit
                </button>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-4">
                <Palette size={15} className="text-[#5DCAA5]" />
                <p className="font-semibold text-sm">Colors</p>
              </div>
              <div className="space-y-4">
                {roles.map((role) => (
                  <div
                    key={role}
                    onMouseEnter={() => setFocusRole(role)}
                    onMouseLeave={() => setFocusRole(null)}
                    onFocus={() => setFocusRole(role)}
                    onBlur={() => setFocusRole(null)}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={kit[role]}
                        onChange={(e) => setRole(role, e.target.value.toUpperCase())}
                        className="w-10 h-10 rounded-lg border-0 cursor-pointer bg-transparent p-0 shrink-0"
                        aria-label={`${ROLE_COPY[role].label} color`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{ROLE_COPY[role].label}</p>
                        <p className={`text-xs leading-snug ${subtler}`}>{ROLE_COPY[role].where}</p>
                      </div>
                      <HexField
                        value={kit[role]}
                        onCommit={(hex) => setRole(role, hex)}
                        className={`w-24 px-2.5 py-2 rounded-lg border text-xs font-mono outline-none transition-colors ${input}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {warnings.map((w, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 p-3 rounded-xl border ${
                        w.level === 'warn'
                          ? dark
                            ? 'bg-amber-950/20 border-amber-900/30'
                            : 'bg-amber-50 border-amber-200'
                          : section
                      }`}
                    >
                      <Info
                        size={13}
                        className={`shrink-0 mt-0.5 ${w.level === 'warn' ? 'text-amber-500' : subtle}`}
                      />
                      <p className={`text-xs ${w.level === 'warn' ? 'text-amber-500' : subtle}`}>
                        {w.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`p-5 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-3">
                <Type size={15} className="text-[#5DCAA5]" />
                <p className="font-semibold text-sm">Typeface</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FONT_PAIRINGS) as FontPairingKey[]).map((key) => {
                  const f = FONT_PAIRINGS[key]
                  const selected = kit.fontPairing === key
                  return (
                    <button
                      key={key}
                      onClick={() => setKit((k) => ({ ...k, fontPairing: key }))}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[#5DCAA5] ring-1 ring-[#5DCAA5]'
                          : dark
                            ? 'border-zinc-700 hover:border-zinc-600'
                            : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div
                        style={{ fontFamily: f.family }}
                        className="text-xl font-bold leading-none"
                      >
                        Aa
                      </div>
                      <div className={`text-[11px] mt-1.5 ${subtle}`}>{f.label}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={`p-5 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={15} className="text-[#5DCAA5]" />
                <p className="font-semibold text-sm">Brand name</p>
              </div>
              <input
                value={kit.name}
                onChange={(e) => setKit((k) => ({ ...k, name: e.target.value }))}
                placeholder="Acme Corp"
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${input}`}
              />
            </div>

            <div className={`p-5 rounded-2xl border ${card}`}>
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon size={15} className="text-[#5DCAA5]" />
                <p className="font-semibold text-sm">Logo</p>
              </div>
              <input
                value={kit.logoUrl || ''}
                onChange={(e) => {
                  setKit((k) => ({ ...k, logoUrl: e.target.value }))
                  setLogoError(false)
                }}
                placeholder="https://yourcompany.com/logo.png"
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${input}`}
              />
              {kit.logoUrl && !logoIsPublic && (
                <p className="text-xs text-amber-500 mt-2">
                  Use a public https:// address so the logo loads on every slide.
                </p>
              )}
              {logoIsPublic && !logoError && (
                <div
                  className={`mt-3 p-4 rounded-xl border flex items-center justify-center ${section}`}
                >
                  <img
                    src={kit.logoUrl as string}
                    alt="Logo preview"
                    className="max-h-12 max-w-full object-contain"
                    onError={() => setLogoError(true)}
                  />
                </div>
              )}
              {logoError && (
                <p className="text-xs text-red-400 mt-2">That image could not be loaded.</p>
              )}
              <label className={`block text-xs font-medium mt-3 mb-1.5 ${subtle}`}>
                Position on slides
              </label>
              <select
                value={kit.logoPosition}
                onChange={(e) => setKit((k) => ({ ...k, logoPosition: e.target.value }))}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${input}`}
              >
                {LOGO_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-24 self-start space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Live preview</p>
              <div
                className={`flex rounded-xl border p-0.5 ${dark ? 'border-zinc-700' : 'border-zinc-200'}`}
              >
                {(
                  [
                    ['finding', 'Chart slide'],
                    ['stats', 'Hero stats'],
                    ['recs', 'Recommendations'],
                  ] as [SlideKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSlide(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      slide === key ? 'bg-[#5DCAA5] text-[#080C14]' : subtle
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <KitPreview kit={kit} t={tokens} slide={slide} focusRole={focusRole} />

            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs ${subtler}`}>Chart colors</span>
              {tokens.series.map((c, i) => (
                <span
                  key={i}
                  className="w-6 h-6 rounded-md border border-black/10"
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <p className={`text-xs ${subtler}`}>
              Hover a color to outline where it appears. Sample numbers shown, your slides use your
              own data.
            </p>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#080C14] text-white font-semibold text-sm hover:bg-[#0F1420] transition-colors disabled:opacity-50 border border-zinc-700"
            >
              {saved ? (
                <>
                  <CheckCircle size={15} /> Saved
                </>
              ) : saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
                  Saving
                </>
              ) : (
                'Save brand kit'
              )}
            </button>
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
