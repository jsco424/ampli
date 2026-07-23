'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  CheckCircle,
  Palette,
  Building2,
  Info,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Image,
  Star,
} from 'lucide-react'

interface BrandSettings {
  brand_name: string
  brand_primary_color: string
  brand_logo_url: string
  gamma_theme_id: string
  gamma_template_id: string
}

interface GammaTheme {
  id: string
  name: string
  type: 'standard' | 'custom'
  // Optional — a deck-matched custom theme (created via Gamma's upload-and-
  // match feature) may not come back with these populated the way a
  // manually-tagged standard theme does. Every usage below guards against
  // undefined rather than assuming these are always arrays.
  colorKeywords?: string[]
  toneKeywords?: string[]
}

const DEFAULT_SETTINGS: BrandSettings = {
  brand_name: '',
  brand_primary_color: '#3b82f6',
  brand_logo_url: '',
  gamma_theme_id: '',
  gamma_template_id: '',
}

const COLOR_PRESETS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#0f172a',
  '#1a1a1a',
]

// James's curated 5-10 Business-tier themeIds go here once he's picked them
// in Gamma. Everyone (Free/Pro/Business/Enterprise) already has the full
// open picker below regardless — this is purely an additional "Recommended"
// shortlist surfaced above it for Business-tier accounts specifically.
// Empty for now; the Recommended section simply doesn't render until this
// has entries.
const BUSINESS_CURATED_THEME_IDS: string[] = [
  // 'theme_xxxxxxxx',
]

function swatchColorFromKeywords(keywords: string[] | undefined | null): string {
  const k = (keywords || []).map((w) => w.toLowerCase())
  if (k.some((w) => ['dark', 'black', 'carbon', 'onyx', 'night'].includes(w))) return '#1a1a2e'
  if (k.some((w) => ['navy', 'indigo', 'blue', 'royal blue'].includes(w))) return '#1e3a5f'
  if (k.some((w) => ['purple', 'violet', 'lavender'].includes(w))) return '#4c1d95'
  if (k.some((w) => ['green', 'emerald', 'lime'].includes(w))) return '#064e3b'
  if (k.some((w) => ['gold', 'champagne', 'amber', 'yellow'].includes(w))) return '#78350f'
  if (k.some((w) => ['pink', 'fuchsia', 'rose'].includes(w))) return '#831843'
  if (k.some((w) => ['orange', 'coral', 'peach'].includes(w))) return '#7c2d12'
  if (k.some((w) => ['white', 'light', 'cream', 'ivory', 'snow'].includes(w))) return '#e2e8f0'
  if (k.some((w) => ['gray', 'grey', 'slate', 'ash'].includes(w))) return '#334155'
  return '#3b82f6'
}

function swatchTextColor(bg: string): string {
  const lightBgs = ['#e2e8f0']
  return lightBgs.includes(bg) ? '#1a1a1a' : '#ffffff'
}

export default function BrandSettingsPage() {
  const { user } = useUser()
  const { dark } = useTheme()
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoPreviewError, setLogoPreviewError] = useState(false)
  const [themes, setThemes] = useState<GammaTheme[]>([])
  const [themesLoading, setThemesLoading] = useState(false)
  const [themesError, setThemesError] = useState<string | null>(null)
  const [themeSearch, setThemeSearch] = useState('')
  const [themeFilter, setThemeFilter] = useState<'all' | 'standard' | 'custom'>('all')

  // TODO: confirm the actual field name against account-status/route.ts's
  // real response — guessing `tier`/`plan` defensively for now. Gating a
  // whole section on an unconfirmed field name is exactly the kind of thing
  // that silently shows/hides for the wrong users, so don't ship this
  // without checking it against the real route.
  const [userTier, setUserTier] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    fetch('/api/account-status')
      .then((res) => res.json())
      .then((data) => setUserTier((data.tier || null)?.toLowerCase() || null))
      .catch(() => setUserTier(null))
  }, [user])

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_settings')
      .select('brand_name, brand_primary_color, brand_logo_url, gamma_theme_id, gamma_template_id')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettings({
            brand_name: data.brand_name || '',
            brand_primary_color: data.brand_primary_color || DEFAULT_SETTINGS.brand_primary_color,
            brand_logo_url: data.brand_logo_url || '',
            gamma_theme_id: data.gamma_theme_id || '',
            gamma_template_id: data.gamma_template_id || '',
          })
        }
      })
  }, [user])

  const fetchThemes = async () => {
    setThemesLoading(true)
    setThemesError(null)
    try {
      const res = await fetch('/api/gamma-themes')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load themes')
      setThemes(data.themes || [])
    } catch (err: any) {
      setThemesError(err.message || 'Failed to load themes')
    } finally {
      setThemesLoading(false)
    }
  }

  useEffect(() => {
    fetchThemes()
  }, [])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        brand_name: settings.brand_name.trim(),
        brand_primary_color: settings.brand_primary_color,
        brand_logo_url: settings.brand_logo_url.trim(),
        gamma_theme_id: settings.gamma_theme_id.trim(),
        gamma_template_id: settings.gamma_template_id.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  const selectedTheme = themes.find((t) => t.id === settings.gamma_theme_id)

  // Business-tier accounts (and above, so an Enterprise account still sees
  // it too) get this pinned "Recommended" strip above the full picker.
  // Everyone else's experience is completely unchanged — same full list,
  // same search, same filters, no gating on the browse-everything picker
  // itself, only on this additional shortlist.
  // checkCreditLimit() (the source of userTier, via account-status) only
  // ever returns 'free' | 'starter' | 'business' — Enterprise is
  // sales-assisted, not self-serve credit-metered, so it was never given
  // its own tier value here. That means a userTier === 'enterprise' check
  // can NEVER be true — this is confirmed against creditLimit.ts's actual
  // return type, not a guess. Business-tier gating below is real and
  // correct; there is currently no reliable signal to gate an
  // Enterprise-only section on, so the Custom Branding section further
  // down is shown to everyone instead of gated — see its own comment.
  const isBusinessTierOrAbove = userTier === 'business'
  const curatedThemes = themes.filter((t) => BUSINESS_CURATED_THEME_IDS.includes(t.id))
  const showRecommended = isBusinessTierOrAbove && curatedThemes.length > 0

  const filteredThemes = themes.filter((t) => {
    const matchesSearch =
      !themeSearch ||
      t.name.toLowerCase().includes(themeSearch.toLowerCase()) ||
      (t.toneKeywords || []).some((k) => k.toLowerCase().includes(themeSearch.toLowerCase())) ||
      (t.colorKeywords || []).some((k) => k.toLowerCase().includes(themeSearch.toLowerCase()))
    const matchesFilter = themeFilter === 'all' || t.type === themeFilter
    return matchesSearch && matchesFilter
  })

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-blue-500'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-blue-400'
  const subtle = dark ? 'text-zinc-400' : 'text-zinc-500'
  const subtler = dark ? 'text-zinc-500' : 'text-zinc-400'
  const section = dark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'

  const logoIsPublic =
    settings.brand_logo_url.startsWith('https://') && !settings.brand_logo_url.includes('localhost')

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-24 px-6 max-w-2xl mx-auto pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Brand Settings</h1>
          <p className={`text-sm ${subtle}`}>
            These appear on every presentation exported from ampli. Gamma handles layout and design
            — you control the identity.
          </p>
        </div>

        <div className="space-y-4">
          <div className={`p-5 rounded-2xl border ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={15} className="text-blue-400" />
              <p className="font-semibold text-sm">Brand Name</p>
            </div>
            <input
              value={settings.brand_name}
              onChange={(e) => setSettings({ ...settings, brand_name: e.target.value })}
              placeholder="Acme Corp"
              className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${input}`}
            />
            <p className={`text-xs mt-2 ${subtler}`}>
              Used to personalize slide titles and context in exported decks.
            </p>
          </div>

          <div className={`p-5 rounded-2xl border ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Palette size={15} className="text-blue-400" />
              <p className="font-semibold text-sm">Primary Color</p>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSettings({ ...settings, brand_primary_color: color })}
                  className="w-8 h-8 rounded-lg transition-transform hover:scale-110 border-2"
                  style={{
                    background: color,
                    borderColor: settings.brand_primary_color === color ? 'white' : 'transparent',
                    boxShadow:
                      settings.brand_primary_color === color ? `0 0 0 2px ${color}` : 'none',
                  }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.brand_primary_color}
                onChange={(e) => setSettings({ ...settings, brand_primary_color: e.target.value })}
                className="w-10 h-10 rounded-lg border-0 cursor-pointer bg-transparent p-0"
              />
              <input
                value={settings.brand_primary_color}
                onChange={(e) => setSettings({ ...settings, brand_primary_color: e.target.value })}
                onBlur={(e) => {
                  if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    setSettings({
                      ...settings,
                      brand_primary_color: DEFAULT_SETTINGS.brand_primary_color,
                    })
                  }
                }}
                placeholder="#3b82f6"
                maxLength={7}
                className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${input}`}
              />
              <div
                className="w-10 h-10 rounded-xl shrink-0"
                style={{ background: settings.brand_primary_color }}
              />
            </div>
            <p className={`text-xs mt-3 ${subtler}`}>
              Used as a color hint when no custom Gamma theme is set.
            </p>
          </div>

          <div className={`p-5 rounded-2xl border ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Image size={15} className="text-blue-400" />
              <p className="font-semibold text-sm">Logo URL</p>
            </div>
            <input
              value={settings.brand_logo_url}
              onChange={(e) => {
                setSettings({ ...settings, brand_logo_url: e.target.value })
                setLogoPreviewError(false)
              }}
              placeholder="https://yourcompany.com/logo.png"
              className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${input}`}
            />
            {settings.brand_logo_url && !logoIsPublic && (
              <div
                className={`flex items-start gap-2 mt-3 p-3 rounded-xl border ${dark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50 border-amber-200'}`}
              >
                <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">
                  Must be a public <strong>https://</strong> URL. Gamma's servers fetch this
                  directly.
                </p>
              </div>
            )}
            {settings.brand_logo_url && logoIsPublic && !logoPreviewError && (
              <div
                className={`mt-3 p-4 rounded-xl border flex items-center justify-center ${section}`}
              >
                <img
                  src={settings.brand_logo_url}
                  alt="Logo preview"
                  className="max-h-12 max-w-[200px] object-contain"
                  onError={() => setLogoPreviewError(true)}
                />
              </div>
            )}
            {logoPreviewError && (
              <p className="text-xs text-red-400 mt-2">
                Couldn't load logo — check it's publicly accessible.
              </p>
            )}
            <p className={`text-xs mt-3 ${subtler}`}>
              PNG or SVG with transparent background works best. Appears in the header of every
              exported slide.
            </p>
          </div>

          <div className={`p-5 rounded-2xl border ${card}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-blue-400" />
                <p className="font-semibold text-sm">Presentation Theme</p>
              </div>
              <button
                onClick={fetchThemes}
                disabled={themesLoading}
                className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                title="Refresh themes"
              >
                <RefreshCw size={13} className={themesLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            <p className={`text-xs mb-4 ${subtler}`}>
              Pick a Gamma theme for your exported decks. Create a custom theme in Gamma with your
              brand colors for best results.
            </p>

            {selectedTheme && (
              <div
                className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${dark ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}
              >
                <div
                  className="w-8 h-8 rounded-lg shrink-0"
                  style={{ background: swatchColorFromKeywords(selectedTheme.colorKeywords) }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{selectedTheme.name}</p>
                  <p className={`text-[11px] truncate ${subtler}`}>
                    {(selectedTheme.toneKeywords || []).slice(0, 4).join(', ')}
                  </p>
                </div>
                <CheckCircle2 size={15} className="text-blue-500 shrink-0" />
              </div>
            )}

            {showRecommended && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Star size={12} className="text-amber-400" />
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${subtle}`}>
                    Recommended for Business
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {curatedThemes.map((theme) => {
                    const isSelected = settings.gamma_theme_id === theme.id
                    const swatchBg = swatchColorFromKeywords(theme.colorKeywords)
                    const swatchText = swatchTextColor(swatchBg)
                    return (
                      <button
                        key={theme.id}
                        onClick={() => setSettings({ ...settings, gamma_theme_id: theme.id })}
                        className={`text-left rounded-xl border overflow-hidden transition-all hover:scale-[1.02] ${
                          isSelected
                            ? 'border-amber-400 ring-1 ring-amber-400'
                            : dark
                              ? 'border-zinc-700 hover:border-zinc-600'
                              : 'border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <div
                          className="h-10 w-full flex items-center justify-between px-2.5"
                          style={{ background: swatchBg }}
                        >
                          <span
                            className="text-[10px] font-bold tracking-wide"
                            style={{ color: swatchText }}
                          >
                            Aa
                          </span>
                          {isSelected && <CheckCircle2 size={13} className="text-amber-400" />}
                        </div>
                        <div className={`px-2.5 py-2 ${dark ? 'bg-zinc-800' : 'bg-white'}`}>
                          <p className="text-xs font-semibold truncate">{theme.name}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 mb-3">
              <input
                value={themeSearch}
                onChange={(e) => setThemeSearch(e.target.value)}
                placeholder="Search themes…"
                className={`flex-1 px-3 py-2 rounded-xl border text-xs outline-none transition-colors ${input}`}
              />
              <div
                className={`flex items-center rounded-xl border p-0.5 text-xs shrink-0 ${dark ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-200 bg-zinc-100'}`}
              >
                {(['all', 'standard', 'custom'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setThemeFilter(f)}
                    className={`px-2.5 py-1 rounded-lg transition-colors capitalize ${themeFilter === f ? (dark ? 'bg-zinc-700 text-white' : 'bg-white text-zinc-900 shadow-sm') : dark ? 'text-zinc-500' : 'text-zinc-400'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {themesLoading ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <RefreshCw size={14} className={`animate-spin ${subtle}`} />
                <span className={`text-xs ${subtle}`}>Loading themes from Gamma…</span>
              </div>
            ) : themesError ? (
              <div
                className={`p-4 rounded-xl text-xs text-center ${dark ? 'bg-red-950/20 text-red-400' : 'bg-red-50 text-red-500'}`}
              >
                {themesError}
                <button onClick={fetchThemes} className="block mx-auto mt-2 underline">
                  Try again
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
                {filteredThemes.map((theme) => {
                  const isSelected = settings.gamma_theme_id === theme.id
                  const swatchBg = swatchColorFromKeywords(theme.colorKeywords)
                  const swatchText = swatchTextColor(swatchBg)
                  return (
                    <button
                      key={theme.id}
                      onClick={() => setSettings({ ...settings, gamma_theme_id: theme.id })}
                      className={`text-left rounded-xl border overflow-hidden transition-all hover:scale-[1.02] ${
                        isSelected
                          ? 'border-blue-500 ring-1 ring-blue-500'
                          : dark
                            ? 'border-zinc-700 hover:border-zinc-600'
                            : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div
                        className="h-10 w-full flex items-center justify-between px-2.5 relative"
                        style={{ background: swatchBg }}
                      >
                        <span
                          className="text-[10px] font-bold tracking-wide"
                          style={{ color: swatchText }}
                        >
                          Aa
                        </span>
                        {isSelected && <CheckCircle2 size={13} className="text-blue-400" />}
                        {theme.type === 'custom' && (
                          <span className="absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded bg-black/30 text-white font-medium">
                            custom
                          </span>
                        )}
                      </div>
                      <div className={`px-2.5 py-2 ${dark ? 'bg-zinc-800' : 'bg-white'}`}>
                        <p className="text-xs font-semibold truncate">{theme.name}</p>
                        <p className={`text-[10px] truncate mt-0.5 ${subtler}`}>
                          {(theme.toneKeywords || []).slice(0, 3).join(', ')}
                        </p>
                      </div>
                    </button>
                  )
                })}
                {filteredThemes.length === 0 && (
                  <div className={`col-span-3 text-center py-6 text-xs ${subtle}`}>
                    No themes match "{themeSearch}"
                  </div>
                )}
              </div>
            )}

            {!settings.gamma_theme_id && !themesLoading && (
              <p className={`text-xs mt-3 ${subtler}`}>
                No theme selected — exports will try to match your Primary Color to a standard Gamma
                theme automatically, falling back to your tone setting if no close match is found.
              </p>
            )}
          </div>

          {/* Not tier-gated — there's no reliable way to detect an
              Enterprise account from userTier (see the comment above
              isBusinessTierOrAbove). Safe to leave open to everyone since
              this is a paste-in field with no default value and no effect
              unless someone actually has a real ID to enter; a Free/Pro
              user has nothing to gain by finding this. If a real
              Enterprise signal becomes available later (a Clerk plan
              slug, an account flag, whatever it turns out to be), gate
              this the same way the Business Recommended section above
              is gated. */}
          <div className={`p-5 rounded-2xl border ${card}`}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={15} className="text-amber-400" />
              <p className="font-semibold text-sm">Custom Branding</p>
            </div>
            <p className={`text-xs mb-4 ${subtler}`}>
              If your account rep gave you a Theme ID or Template ID (built from your own company
              deck), paste it here directly — no need to hunt for it in the picker above. This
              overrides whatever's selected there.
            </p>

            <label className={`block text-xs font-medium mb-1.5 ${subtle}`}>Custom Theme ID</label>
            <input
              value={settings.gamma_theme_id}
              onChange={(e) => setSettings({ ...settings, gamma_theme_id: e.target.value })}
              placeholder="theme_xxxxxxxx"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors mb-4 ${input}`}
            />

            <label className={`block text-xs font-medium mb-1.5 ${subtle}`}>
              Custom Template ID
              <span className={`font-normal ml-1 ${subtler}`}>(optional)</span>
            </label>
            <input
              value={settings.gamma_template_id}
              onChange={(e) => setSettings({ ...settings, gamma_template_id: e.target.value })}
              placeholder="Leave blank unless you have a custom deck structure"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${input}`}
            />
            <p className={`text-xs mt-2 ${subtler}`}>
              Setting this replaces the entire deck layout with your custom structure — the Theme ID
              above still controls its colors. Leave blank to use a normal generated layout with
              just the theme applied.
            </p>
          </div>

          <div className={`p-4 rounded-2xl border ${section}`}>
            <p className={`text-xs font-semibold mb-2 ${subtle}`}>
              What flows to your exported deck
            </p>
            <div className="space-y-1.5">
              {[
                { field: 'Logo', usage: 'Header of every slide' },
                { field: 'Theme', usage: 'Colors, fonts, and visual style' },
                { field: 'Brand name', usage: 'Title slide and contextual references' },
              ].map(({ field, usage }) => (
                <div key={field} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className={`font-medium w-24 shrink-0 ${subtle}`}>{field}</span>
                  <span className={subtler}>{usage}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-400 transition-colors disabled:opacity-50"
          >
            {saved ? (
              <>
                <CheckCircle size={15} /> Saved
              </>
            ) : saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
                Saving…
              </>
            ) : (
              'Save Brand Settings'
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
