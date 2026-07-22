// Auto-discovery of new trend topics from Google Trends' daily trending
// searches. This is what makes User Behaviors dynamic instead of a fixed
// topic list — candidate terms are classified using simple keyword-overlap
// matching, deliberately not an AI call, to keep this a free,
// unlimited-frequency step (same reasoning as the existing free
// Wikipedia/YouTube sources, and consistent with conserving Anthropic
// spend during pre-revenue testing).
//
// Categories are not a fixed enum — CATEGORY_KEYWORDS below is a broad,
// expandable taxonomy (17 buckets as of this writing) rather than the
// original 6. A new category only ever appears on the dashboard once a
// real trending term matches it here — there is no separate "enable this
// category" switch anywhere else in the app (see trends/page.tsx, which
// builds its tab list purely from what's currently active in trend_topics).
// Expanding coverage further just means adding another entry to this map.
//
// A brand new term is added only if it clears the classification threshold
// against some category's keyword set. A term that matches a topic that's
// already tracked but currently retired (inactive — see pruneTopics.ts) is
// reactivated instead of re-classified from scratch, reusing its existing
// category/wikipedia_article/etc. rather than re-guessing them. This is
// what lets a topic genuinely come and go over time rather than a retired
// topic being gone for good the moment it goes cold.

import { createClient } from '@supabase/supabase-js'
import { fetchGoogleTrendsDaily } from './sources/googleTrends'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Keyword sets per category — deliberately loose rather than an exhaustive
// taxonomy, and deliberately broad rather than the original 6. Tune these
// based on what actually gets missed or wrongly matched once real trending
// terms start flowing through. Plain Record<string, string[]> — adding a
// new category is just adding a new key here, no type changes needed
// anywhere else in the codebase.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  auto: [
    'car',
    'truck',
    'suv',
    'vehicle',
    'ev',
    'electric vehicle',
    'tesla',
    'ford',
    'toyota',
    'honda',
    'chevrolet',
    'dealership',
    'auto',
    'motorcycle',
    'garage',
  ],
  education: [
    'college',
    'university',
    'school',
    'student',
    'fafsa',
    'tuition',
    'scholarship',
    'degree',
    'sat',
    'act exam',
    'classroom',
    'teacher',
    'curriculum',
  ],
  home: [
    'home',
    'house',
    'mortgage',
    'rent',
    'apartment',
    'real estate',
    'renovation',
    'housing',
    'landlord',
    'lease',
    'property',
  ],
  finance: [
    'savings',
    'ira',
    'stock',
    'invest',
    'credit card',
    'bank',
    'tax',
    'mortgage rate',
    'interest rate',
    'crypto',
    'economy',
    'inflation',
    'recession',
    'budget',
    '401k',
  ],
  travel: [
    'flight',
    'airline',
    'hotel',
    'vacation',
    'travel',
    'trip',
    'airport',
    'cruise',
    'passport',
    'resort',
    'itinerary',
    'tsa',
  ],
  tech: [
    'ai',
    'iphone',
    'app',
    'software',
    'chip',
    'startup',
    'tech',
    'computer',
    'smartphone',
    'google',
    'microsoft',
    'apple',
    'cybersecurity',
    'gadget',
    'robot',
  ],
  pets: [
    'dog',
    'cat',
    'puppy',
    'kitten',
    'pet',
    'vet',
    'veterinarian',
    'animal shelter',
    'pet food',
    'aquarium',
  ],
  fitness_wellness: [
    'gym',
    'workout',
    'fitness',
    'yoga',
    'diet',
    'protein',
    'running',
    'marathon',
    'wellness',
    'meditation',
    'supplement',
    'weight loss',
  ],
  beauty: [
    'makeup',
    'skincare',
    'beauty',
    'cosmetic',
    'haircare',
    'perfume',
    'nail',
    'sephora',
    'skin routine',
  ],
  food_dining: [
    'recipe',
    'restaurant',
    'cooking',
    'food',
    'chef',
    'menu',
    'diner',
    'cuisine',
    'coffee',
    'grocery',
    'meal',
  ],
  parenting: [
    'baby',
    'parenting',
    'toddler',
    'newborn',
    'daycare',
    'stroller',
    'pregnancy',
    'kids toys',
  ],
  sports: [
    'nfl',
    'nba',
    'mlb',
    'nhl',
    'soccer',
    'football',
    'basketball',
    'baseball',
    'olympics',
    'championship',
    'tournament',
    'coach',
  ],
  gaming: [
    'video game',
    'gaming',
    'playstation',
    'xbox',
    'nintendo',
    'esports',
    'steam',
    'twitch',
    'game release',
  ],
  fashion: [
    'fashion',
    'clothing',
    'outfit',
    'sneaker',
    'designer',
    'runway',
    'apparel',
    'style trend',
  ],
  home_improvement: [
    'diy',
    'home improvement',
    'remodel',
    'contractor',
    'hardware store',
    'garden',
    'landscaping',
    'paint',
  ],
  entertainment: [
    'movie',
    'tv show',
    'streaming',
    'netflix',
    'concert',
    'celebrity',
    'box office',
    'album release',
  ],
  outdoors: ['hiking', 'camping', 'national park', 'fishing', 'hunting', 'backpacking', 'trail'],
}

const CLASSIFICATION_THRESHOLD = 1 // at least one keyword hit

function classify(term: string): string | null {
  const lower = term.toLowerCase()
  let bestCategory: string | null = null
  let bestScore = 0
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }
  return bestScore >= CLASSIFICATION_THRESHOLD ? bestCategory : null
}

export interface DiscoveryResult {
  scanned: number
  classified: number
  added: string[]
  reactivated: string[]
}

// Run once per daily refresh, before the normal per-topic signal fetch —
// so anything newly discovered or reactivated today gets its first signal
// reading in the same run.
export async function discoverNewTopics(): Promise<DiscoveryResult> {
  const candidates = await fetchGoogleTrendsDaily()
  const added: string[] = []
  const reactivated: string[] = []

  // Pulled regardless of active status, unlike before — a retired topic
  // still exists in trend_topics with active=false, and needs to be found
  // here so it can be brought back rather than treated as unknown.
  const { data: existing } = await supabaseAdmin.from('trend_topics').select('topic, active')
  const existingByKey = new Map<string, { exactTopic: string; active: boolean }>()
  for (const row of (existing || []) as any[]) {
    existingByKey.set(row.topic.toLowerCase(), { exactTopic: row.topic, active: row.active })
  }

  let classified = 0
  for (const candidate of candidates) {
    const key = candidate.term.toLowerCase()
    const match = existingByKey.get(key)

    if (match) {
      if (match.active) continue // already tracked and live, nothing to do
      // Previously retired, trending again — reactivate rather than
      // re-classify or re-guess its wikipedia_article/youtube_query.
      await supabaseAdmin
        .from('trend_topics')
        .update({ active: true, discovered_at: new Date().toISOString() })
        .eq('topic', match.exactTopic)
      reactivated.push(match.exactTopic)
      continue
    }

    const category = classify(candidate.term)
    if (!category) continue
    classified++

    const wikipediaArticle = candidate.term.trim().replace(/\s+/g, '_')
    await supabaseAdmin.from('trend_topics').upsert(
      {
        topic: candidate.term,
        category,
        wikipedia_article: wikipediaArticle,
        youtube_query: candidate.term,
        reddit_subreddits: null,
        reddit_query: null,
        active: true,
        topic_origin: 'discovered',
        discovered_at: new Date().toISOString(),
      },
      { onConflict: 'topic' }
    )
    added.push(candidate.term)
  }

  return { scanned: candidates.length, classified, added, reactivated }
}
