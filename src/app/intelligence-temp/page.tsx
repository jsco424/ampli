'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// The hub itself has no standalone content to show — it just routes into
// the default section. Each section (User Behavior, Crowd Insights, and
// eventually Company Benchmarks) keeps its own existing page and URL;
// IntelligenceSubNav is what ties them together into one cohesive
// experience once you're inside.
export default function IntelligenceHubPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/trends')
  }, [router])

  return null
}
