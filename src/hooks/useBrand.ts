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

const DEFAULTS: BrandSettings = {
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
  presets: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'],
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
