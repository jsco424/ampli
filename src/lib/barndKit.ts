// Brand kit: the single place that turns whatever an account has saved into
// a complete, readable set of colors for Story Mode slides.
//
// Four roles, taken from the reference decks (Fetch case study and the
// am-pli template):
//   deep       structural dark: dark panels, titles on light slides
//   brand      mid tone: tone cards, secondary chart series, accents
//   highlight  emphasis: big numbers on dark panels, tag chips
//   surface    light neutral behind charts
//
// Accounts rarely have all four set. Every role can be derived from the
// others, so a user who picks a single color still gets a kit that passes
// contrast checks. Nothing here talks to the network or the database.

export type FontPairingKey = 'manrope' | 'lexend' | 'jakarta'

export const FONT_PAIRINGS: Record<
  FontPairingKey,
  { label: string; family: string; googleHref: string }
> = {
  manrope: {
    label: 'Manrope',
    family: "'Manrope', sans-serif",
    googleHref:
      'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
  },
  lexend: {
    label: 'Lexend',
    family: "'Lexend', sans-serif",
    googleHref: 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap',
  },
  jakarta: {
    label: 'Plus Jakarta Sans',
    family: "'Plus Jakarta Sans', sans-serif",
    googleHref:
      'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  },
}

export interface BrandKit {
  name: string
  logoUrl: string | null
  logoPosition: string
  deep: string
  brand: string
  highlight: string
  surface: string
  fontPairing: FontPairingKey
}

// The am-pli template palette. Used for any account with nothing saved.
export const DEFAULT_KIT: BrandKit = {
  name: '',
  logoUrl: null,
  logoPosition: 'bottom-right',
  deep: '#242F35',
  brand: '#475F5F',
  highlight: '#D3F4A3',
  surface: '#F7F4F5',
  fontPairing: 'manrope',
}

// The accent that Settings used to save for accounts that never changed it.
// Treated as "not set" so those accounts get the default kit instead of a
// mint brand color they never chose.
export const LEGACY_DEFAULT_ACCENT = '#5DCAA5'

// ── color math ──────────────────────────────────────────────────────────────

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase()
  }
  return null
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) || '#000000'
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return ('#' + c(r) + c(g) + c(b)).toUpperCase()
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG contrast ratio, 1 to 21.
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a)
  const [br, bg, bb] = toRgb(b)
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

function toHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = toRgb(hex)
  const r = r0 / 255
  const g = g0 / 255
  const b = b0 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

// Pick whichever of white or the deep color reads better on a background.
export function textOn(bg: string, deep: string = DEFAULT_KIT.deep): string {
  return contrastRatio('#FFFFFF', bg) >= contrastRatio(deep, bg) ? '#FFFFFF' : deep
}

// ── deriving missing roles ──────────────────────────────────────────────────

function deriveDeep(seed: string): string {
  const [h, s] = toHsl(seed)
  return fromHsl(h, Math.min(s, 0.3), 0.17)
}

function deriveBrandFromDeep(deep: string): string {
  const [h, s, l] = toHsl(deep)
  return fromHsl(h, Math.min(s + 0.05, 0.35), Math.min(l + 0.16, 0.4))
}

function deriveHighlight(seed: string): string {
  const [h, s, l] = toHsl(seed)
  if (l >= 0.7) return normalizeHex(seed) as string
  return fromHsl(h, Math.max(Math.min(s, 0.85), 0.55), 0.82)
}

function deriveSurface(deep: string): string {
  const [h] = toHsl(deep)
  return fromHsl(h, 0.1, 0.965)
}

// Build a full kit from a single color. Used by the "start from one color"
// control in Settings and as the fallback for partially filled accounts.
export function deriveKitFromColor(seedInput: string): BrandKit {
  const seed = normalizeHex(seedInput)
  if (!seed) return { ...DEFAULT_KIT }
  const deep = deriveDeep(seed)
  return {
    ...DEFAULT_KIT,
    deep,
    brand: deriveBrandFromDeep(deep),
    highlight: deriveHighlight(seed),
    surface: deriveSurface(deep),
  }
}

// What a brand_settings row may contain. Every field is optional because
// accounts created before the kit existed only have the legacy columns.
export interface BrandRow {
  brand_name?: string | null
  logo_url?: string | null
  logo_position?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  deep_color?: string | null
  brand_color?: string | null
  highlight_color?: string | null
  surface_color?: string | null
  font_pairing?: string | null
}

export function resolveBrandKit(row: BrandRow | null | undefined): BrandKit {
  if (!row) return { ...DEFAULT_KIT }

  const explicitBrand = normalizeHex(row.brand_color)
  const brandSeed = explicitBrand && explicitBrand !== LEGACY_DEFAULT_ACCENT ? explicitBrand : null
  const seed = brandSeed || normalizeHex(row.highlight_color) || normalizeHex(row.primary_color)
  const seeded = seed ? deriveKitFromColor(seed) : DEFAULT_KIT

  const deep = normalizeHex(row.deep_color) || normalizeHex(row.secondary_color) || seeded.deep
  const highlight = normalizeHex(row.highlight_color) || seeded.highlight
  // Accounts still on the original navy keep the template's own mid tone and
  // surface exactly, rather than slightly shifted derived versions.
  const onDefaultDeep = deep === DEFAULT_KIT.deep
  const brand =
    brandSeed ||
    (onDefaultDeep
      ? DEFAULT_KIT.brand
      : normalizeHex(row.deep_color) || normalizeHex(row.secondary_color)
        ? deriveBrandFromDeep(deep)
        : seeded.brand)
  const surface =
    normalizeHex(row.surface_color) ||
    (onDefaultDeep ? DEFAULT_KIT.surface : seed ? deriveSurface(deep) : DEFAULT_KIT.surface)

  const pairing = (row.font_pairing || '') as FontPairingKey
  return {
    name: row.brand_name || '',
    logoUrl: row.logo_url || null,
    logoPosition: row.logo_position || DEFAULT_KIT.logoPosition,
    deep,
    brand,
    highlight,
    surface,
    fontPairing: pairing in FONT_PAIRINGS ? pairing : DEFAULT_KIT.fontPairing,
  }
}

// ── tokens slides actually use ──────────────────────────────────────────────

export interface KitTokens {
  deep: string
  brand: string
  highlight: string
  surface: string
  // text colors that are readable on the surface they sit on
  textOnSurface: string
  mutedOnSurface: string
  textOnDeep: string
  mutedOnDeep: string
  textOnBrand: string
  // lines
  hairline: string
  gridline: string
  axis: string
  // ordered categorical chart colors, first is the emphasis color
  series: string[]
  // control against treatment: muted first, strong second
  pairMuted: string
  pairStrong: string
  // highlight color darkened enough to be used as text or a line on surface
  highlightOnSurface: string
}

// Lighten or darken `color` toward white or black until it reaches `target`
// contrast against `against`, giving up after a bounded number of steps.
function nudgeForContrast(color: string, against: string, target: number): string {
  let out = color
  const lighter = relativeLuminance(against) < 0.4
  for (let i = 0; i < 20 && contrastRatio(out, against) < target; i++) {
    out = mix(out, lighter ? '#FFFFFF' : '#000000', 0.08)
  }
  return out
}

export function kitTokens(kit: BrandKit): KitTokens {
  const { deep, brand, highlight, surface } = kit

  // Second series must be visibly different from the first and still show
  // up against the surface.
  let seriesMid = brand
  if (contrastRatio(seriesMid, deep) < 1.8) {
    for (let i = 0; i < 12 && contrastRatio(seriesMid, deep) < 1.8; i++) {
      seriesMid = mix(seriesMid, '#FFFFFF', 0.1)
    }
  }
  seriesMid = nudgeForContrast(seriesMid, surface, 3)
  // after nudging for the surface, make sure it did not collapse onto deep
  if (contrastRatio(seriesMid, deep) < 1.5) seriesMid = mix(deep, '#FFFFFF', 0.45)

  const neutralMid = mix(deep, '#FFFFFF', 0.62)
  const neutralLight = mix(deep, '#FFFFFF', 0.86)
  const highlightOnSurface = nudgeForContrast(highlight, surface, 3)

  return {
    deep,
    brand,
    highlight,
    surface,
    textOnSurface: deep,
    mutedOnSurface: nudgeForContrast(mix(deep, surface, 0.28), surface, 4.5),
    textOnDeep: '#FFFFFF',
    mutedOnDeep: nudgeForContrast(mix('#FFFFFF', deep, 0.35), deep, 4.5),
    textOnBrand: textOn(brand, deep),
    hairline: mix(surface, deep, 0.22),
    gridline: mix(surface, deep, 0.1),
    axis: mix(surface, deep, 0.5),
    series: [deep, seriesMid, neutralMid, neutralLight, highlightOnSurface],
    pairMuted: neutralMid,
    pairStrong: deep,
    highlightOnSurface,
  }
}

// ── warnings shown in Settings ──────────────────────────────────────────────

export interface KitWarning {
  level: 'warn' | 'info'
  message: string
}

export function validateKit(kit: BrandKit): KitWarning[] {
  const out: KitWarning[] = []
  if (contrastRatio(kit.highlight, kit.deep) < 4.5) {
    out.push({
      level: 'warn',
      message:
        'Your Highlight color is hard to read on your Deep color. Big numbers on dark panels will be difficult to see. Try a lighter Highlight or a darker Deep.',
    })
  }
  if (contrastRatio(kit.deep, kit.surface) < 7) {
    out.push({
      level: 'warn',
      message:
        'Your Deep color is too light against your Surface color for slide titles. Try a darker Deep.',
    })
  }
  if (contrastRatio(kit.deep, kit.brand) < 1.4) {
    out.push({
      level: 'warn',
      message:
        'Deep and Brand look almost the same, so tone cards will not stand apart. Make Brand a little lighter.',
    })
  }
  if (contrastRatio('#FFFFFF', kit.brand) < 4.5 && contrastRatio(kit.deep, kit.brand) < 4.5) {
    out.push({
      level: 'info',
      message:
        'Text on your Brand color is borderline in both white and dark. Slides will pick the clearer of the two.',
    })
  }
  return out
}
