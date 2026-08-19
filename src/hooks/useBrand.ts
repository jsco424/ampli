'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { supabase } from '@/lib/supabase'

export interface BrandSettings {
  primaryColor: string
  secondaryColor: string
  presets: string[]
  logoUrl: string | null
  logoPosition: string
}

// Defaults for a brand-new account with no brand_settings row yet — these
// are just the starting point, never a ceiling. Every value here is fully
// overridable per account from Settings > Brand, and everything that reads
// useBrand() (the pitch editor, onboarding, exports) picks up whatever the
// account has actually set, live.
//
// primaryColor/secondaryColor set to the reference deck's real two core
// colors (lime green, navy). Genuinely only an approximation of that deck's
// actual three-role system — navy plays a structural panel/background role
// there, not just a second accent — but that's the best fit within today's
// two-color model; a real third "panel" role would need a schema change,
// not just new default values.
const DEFAULTS: BrandSettings = {
  primaryColor: '#D3F4A3',
  secondaryColor: '#242F35',
  presets: ['#D3F4A3', '#242F35', '#475F5F', '#f59e0b', '#ef4444'],
  logoUrl: null,
  logoPosition: 'bottom-right',
}

export function useBrand() {
  const { user } = useUser()
  const [brand, setBrand] = useState<BrandSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('brand_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setBrand({
            primaryColor: data.primary_color || DEFAULTS.primaryColor,
            secondaryColor: data.secondary_color || DEFAULTS.secondaryColor,
            presets: data.presets || DEFAULTS.presets,
            logoUrl: data.logo_url || null,
            logoPosition: data.logo_position || DEFAULTS.logoPosition,
          })
        }
        setLoading(false)
      })
  }, [user])

  return { brand, loading }
}
