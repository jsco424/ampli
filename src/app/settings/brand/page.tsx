'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import { Palette, Upload, X, Check, Image, Save, RefreshCw } from 'lucide-react'

const DEFAULT_PRESETS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
]

const LOGO_POSITIONS = [
  { key: 'top-left', label: 'Top Left' },
  { key: 'top-right', label: 'Top Right' },
  { key: 'bottom-left', label: 'Bottom Left' },
  { key: 'bottom-right', label: 'Bottom Right' },
]

type ActiveColor = 'primary' | 'secondary'

export default function BrandSettingsPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [primary, setPrimary] = useState('#3b82f6')
  const [secondary, setSecondary] = useState('#8b5cf6')
  const [active, setActive] = useState<ActiveColor>('primary')
  const [presets, setPresets] = useState<string[]>(DEFAULT_PRESETS)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoPosition, setLogoPosition] = useState('bottom-right')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  useEffect(() => {
    if (!user) return
    supabase
      .from('brand_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id)
          setPrimary(data.primary_color || '#3b82f6')
          setSecondary(data.secondary_color || '#8b5cf6')
          setPresets(data.presets?.length ? data.presets : DEFAULT_PRESETS)
          setLogoUrl(data.logo_url || null)
          setLogoPosition(data.logo_position || 'bottom-right')
        }
      })
  }, [user])

  const applyColor = (color: string) => {
    if (active === 'primary') setPrimary(color)
    else setSecondary(color)
  }

  const activeColor = active === 'primary' ? primary : secondary

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const payload = {
      user_id: user.id,
      primary_color: primary,
      secondary_color: secondary,
      presets,
      logo_url: logoUrl,
      logo_position: logoPosition,
      updated_at: new Date().toISOString(),
    }
    if (settingsId) {
      await supabase.from('brand_settings').update(payload).eq('id', settingsId)
    } else {
      const { data } = await supabase.from('brand_settings').insert(payload).select().single()
      if (data) setSettingsId(data.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    const localUrl = URL.createObjectURL(file)
    setLogoPreview(localUrl)
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${user.id}/logo.${ext}`
    const { error } = await supabase.storage
      .from('brand-assets')
      .upload(path, file, { upsert: true })
    console.log('Upload error:', error)
    console.log('Upload path:', path)
    if (!error) {
      const { data } = supabase.storage.from('brand-assets').getPublicUrl(path)
      setLogoUrl(data.publicUrl)
    }
    setLogoPreview(null)
    setUploading(false)
  }

  const displayLogo = logoPreview || logoUrl

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const inputCls = dark
    ? 'bg-zinc-800 border-zinc-700 text-white'
    : 'bg-white border-zinc-300 text-zinc-900'
  const lbl = dark ? 'text-zinc-400' : 'text-zinc-500'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      <main className="pt-20 px-6 max-w-3xl mx-auto pb-20">
        {/* Header */}
        <div className="mt-6 mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Brand Settings</h1>
            <p className={`text-sm ${lbl}`}>
              Set your brand colors and logo — applied across all visuals and pitch deck mode
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40"
          >
            {saved ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save size={14} /> Save Brand
              </>
            )}
          </button>
        </div>

        {/* Live Preview */}
        <div className={`p-6 rounded-2xl border mb-6 ${card}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-4 ${lbl}`}>
            Live Preview
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className={`p-4 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
              <p className={`text-xs mb-3 ${lbl}`}>Bar Chart</p>
              <div className="flex items-end gap-1.5 h-16">
                {[60, 85, 45, 95, 70].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm transition-all duration-300"
                    style={{ height: `${h}%`, background: i % 2 === 0 ? primary : secondary }}
                  />
                ))}
              </div>
            </div>
            <div
              className="p-4 rounded-xl border-2 transition-all duration-300"
              style={{ borderColor: primary, background: `${primary}15` }}
            >
              <p className={`text-xs mb-1 ${lbl}`}>Key Metric</p>
              <p
                className="text-2xl font-bold transition-all duration-300"
                style={{ color: primary }}
              >
                +24%
              </p>
              <p className={`text-xs ${lbl}`}>Revenue growth</p>
            </div>
            <div className="p-4 rounded-xl flex flex-col gap-2">
              <div
                className="px-3 py-2 rounded-lg text-white text-xs font-medium text-center transition-all duration-300"
                style={{ background: primary }}
              >
                Primary
              </div>
              <div
                className="px-3 py-2 rounded-lg text-white text-xs font-medium text-center transition-all duration-300"
                style={{ background: secondary }}
              >
                Secondary
              </div>
            </div>
          </div>

          {displayLogo && (
            <div className={`mt-4 pt-4 border-t ${dark ? 'border-zinc-800' : 'border-zinc-100'}`}>
              <p className={`text-xs mb-2 ${lbl}`}>Logo — {logoPosition.replace('-', ' ')}</p>
              <div className={`relative h-24 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                <img
                  src={displayLogo}
                  alt="Brand logo"
                  className={`absolute w-16 h-8 object-contain
                    ${
                      logoPosition === 'bottom-right'
                        ? 'bottom-2 right-2'
                        : logoPosition === 'bottom-left'
                          ? 'bottom-2 left-2'
                          : logoPosition === 'top-right'
                            ? 'top-2 right-2'
                            : 'top-2 left-2'
                    }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Colors */}
        <div className={`p-6 rounded-2xl border mb-6 ${card}`}>
          <div className="flex items-center gap-2 mb-5">
            <Palette size={16} className="text-blue-500" />
            <h2 className="font-semibold">Brand Colors</h2>
          </div>

          {/* Step 1 */}
          <p className={`text-xs font-medium mb-3 ${lbl}`}>Step 1 — Select which color to edit</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {(['primary', 'secondary'] as ActiveColor[]).map((type) => {
              const color = type === 'primary' ? primary : secondary
              const isActive = active === type
              return (
                <button
                  key={type}
                  onClick={() => setActive(type)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                    ${
                      isActive
                        ? 'border-blue-500'
                        : dark
                          ? 'border-zinc-700 hover:border-zinc-600'
                          : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg shrink-0"
                    style={{
                      background: color,
                      boxShadow: isActive ? `0 0 0 2px white, 0 0 0 4px ${color}` : 'none',
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium capitalize">{type}</p>
                    <p className={`text-xs font-mono ${lbl}`}>{color}</p>
                  </div>
                  {isActive && <div className="ml-auto w-2 h-2 rounded-full bg-blue-500" />}
                </button>
              )
            })}
          </div>

          {/* Step 2 */}
          <p className={`text-xs font-medium mb-3 ${lbl}`}>
            Step 2 — Choose color for{' '}
            <span className="font-semibold capitalize text-blue-500">{active}</span>
          </p>
          <div className="flex items-center gap-4 mb-5">
            <input
              type="color"
              value={activeColor}
              onChange={(e) => applyColor(e.target.value)}
              className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0.5 bg-transparent"
            />
            <div
              className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${inputCls}`}
            >
              <span className={`text-sm ${lbl}`}>#</span>
              <input
                value={activeColor.replace('#', '')}
                onChange={(e) => {
                  const val = e.target.value
                  if (/^[0-9A-Fa-f]{0,6}$/.test(val)) applyColor(`#${val}`)
                }}
                className="flex-1 bg-transparent outline-none text-sm font-mono"
                maxLength={6}
                placeholder="3b82f6"
              />
              <div className="w-6 h-6 rounded-md" style={{ background: activeColor }} />
            </div>
          </div>

          {/* Presets */}
          <p className={`text-xs font-medium mb-2 ${lbl}`}>Or pick a preset</p>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {presets.map((color, i) => (
              <div key={i} className="relative group">
                <button
                  onClick={() => applyColor(color)}
                  className={`w-9 h-9 rounded-xl transition-all border-2
                    ${activeColor === color ? 'scale-110 border-white' : 'border-transparent hover:scale-105'}`}
                  style={{ background: color }}
                  title={color}
                />
                <button
                  onClick={() => setPresets((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center z-10"
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
          {!presets.includes(activeColor) && (
            <button
              onClick={() =>
                setPresets((p) =>
                  p.length >= 8 ? [...p.slice(1), activeColor] : [...p, activeColor]
                )
              }
              className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors
                ${dark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-400' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-500'}`}
            >
              <div className="w-3 h-3 rounded-sm" style={{ background: activeColor }} />
              Save <span className="font-mono">{activeColor}</span> as preset
            </button>
          )}
        </div>

        {/* Logo */}
        <div className={`p-6 rounded-2xl border mb-6 ${card}`}>
          <div className="flex items-center gap-2 mb-5">
            <Image size={16} className="text-blue-500" />
            <h2 className="font-semibold">Brand Logo</h2>
          </div>

          {displayLogo ? (
            <div className="flex items-start gap-4 mb-5">
              <div className="relative">
                <img src={displayLogo} alt="Logo" className="h-12 object-contain rounded-lg" />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Logo uploaded</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                      ${dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => {
                      setLogoUrl(null)
                      setLogoPreview(null)
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer mb-5 transition-colors
                ${dark ? 'border-zinc-700 hover:border-zinc-600' : 'border-zinc-300 hover:border-zinc-400'}`}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Uploading...</span>
                </div>
              ) : (
                <>
                  <Upload size={24} className={`mx-auto mb-2 ${lbl}`} />
                  <p className="text-sm font-medium mb-1">Upload your logo</p>
                  <p className={`text-xs ${lbl}`}>PNG, JPG or SVG — recommended 200×80px</p>
                </>
              )}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg"
            onChange={handleLogoUpload}
            className="hidden"
          />

          <div>
            <p className={`text-xs font-medium mb-2 ${lbl}`}>Logo Position</p>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              {LOGO_POSITIONS.map((pos) => (
                <button
                  key={pos.key}
                  onClick={() => setLogoPosition(pos.key)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-all
                    ${
                      logoPosition === pos.key
                        ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                        : dark
                          ? 'border-zinc-700 hover:border-zinc-600'
                          : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saved ? (
            <>
              <Check size={15} /> Brand Settings Saved
            </>
          ) : saving ? (
            <>
              <RefreshCw size={15} className="animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save size={15} /> Save Brand Settings
            </>
          )}
        </button>
      </main>
    </div>
  )
}
