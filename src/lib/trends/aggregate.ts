import type { NormalizedSignal, TrendCategory } from './normalize'

export interface CompositeSignal {
  topic: string
  category: TrendCategory
  compositeScore: number
  deltaVsPrior: number | null
  sourceCount: number
  asOf: string
}

// Combines same-day signals for one topic across whichever sources
// contributed data (1-3 for Phase 1), using equal weights per source —
// per the roadmap decision to defer category-specific weighting until
// Tier 1.5 sources exist and there's an actual imbalance worth correcting.
export function computeComposite(signals: NormalizedSignal[]): CompositeSignal | null {
  if (signals.length === 0) return null
  const { topic, category, asOf } = signals[0]

  const compositeScore = Math.round(
    signals.reduce((sum, s) => sum + s.signalScore, 0) / signals.length
  )

  const deltasAvailable = signals.filter((s) => s.deltaVsPrior !== null)
  const deltaVsPrior =
    deltasAvailable.length > 0
      ? Math.round(
          (deltasAvailable.reduce((sum, s) => sum + (s.deltaVsPrior as number), 0) /
            deltasAvailable.length) *
            10
        ) / 10
      : null

  return {
    topic,
    category,
    compositeScore,
    deltaVsPrior,
    sourceCount: signals.length,
    asOf,
  }
}
