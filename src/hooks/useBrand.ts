'use client'

import { useEffect, useMemo, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_KIT,
  kitTokens,
  resolveBrandKit,
  type BrandKit,
  type BrandRow,
  type KitTokens,
} from '@/lib/brandKit'

// Shape the Pitch Mode editor, onboarding and the PDF export already read.
// Kept exactly so nothing that consumes useBrand() today needs to change
// while Story Mode layouts are moved over to the kit.
//
//   primaryColor    the emphasis color (the kit's Highlight, lime by default)
//   secondaryColor  the structural dark (the kit's Deep, navy by default)
//
// Those two match what the old hook returned for a default account, so
// existing slides look the same until their layouts are rebuilt on `kit`
// and `tokens` below.
export interface BrandSettings {
  primaryColor: string
  secondaryColor: string
  presets: string[]
  logoUrl: string | null
  logoPosition: string
}

// Brand settings now come from one place: the brand_settings row, saved by
// Settings > Brand. Before the kit existed, Settings wrote to user_settings
// and this hook read brand_settings, which nothing wrote to, so colors saved
// in Settings never reached slides. See 002_brand_settings_kit.sql.
export function useBrand() {
  const { user } = useUser()
  const [row, setRow] = useState<BrandRow | null>(null)
  const [legacyPresets, setLegacyPresets] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('brand_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRow(data as BrandRow)
          setLegacyPresets(Array.isArray((data as any).presets) ? (data as any).presets : null)
        }
        setLoading(false)
      })
  }, [user])

  const kit: BrandKit = useMemo(() => resolveBrandKit(row), [row])
  const tokens: KitTokens = useMemo(() => kitTokens(kit), [kit])

  const brand: BrandSettings = useMemo(
    () => ({
      primaryColor: kit.highlight,
      secondaryColor: kit.deep,
      presets: legacyPresets || [kit.highlight, kit.deep, kit.brand, tokens.series[2], kit.surface],
      logoUrl: kit.logoUrl,
      logoPosition: kit.logoPosition,
    }),
    [kit, tokens, legacyPresets]
  )

  return { brand, kit, tokens, loading }
}

export { DEFAULT_KIT }
