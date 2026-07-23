import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Converts real measured Anthropic cost into the "credits" unit shown on
// the pricing page. Derived from the same numbers already public there:
// ~600 credits per presentation, at a working COGS estimate of ~$0.56/deck
// (from the pricing strategy analysis) — so 1 credit ≈ $0.000933. Keeps
// "X credits ≈ Y presentations" mathematically true against real usage.
//
// KNOWN SIMPLIFICATION: only counts Anthropic token cost from
// token_usage_log, not Gamma export credits (tracked separately, in
// Gamma's own credit units, not USD). Anthropic cost is the primary driver
// tied to starting a new analysis, so it's the right thing to gate on for
// now — folding in Gamma cost too can be added later without changing
// this function's shape.
const CREDITS_PER_DOLLAR = 600 / 0.56

const FREE_CREDIT_LIMIT = 1000
const STARTER_CREDIT_LIMIT = 5000
const BUSINESS_CREDIT_LIMIT = 20000

// Same two-different-identifiers situation as Business — PLAN ID for
// checkout, PLAN SLUG for has() checks. Confirmed against Clerk's
// dashboard (Plans → Plan Key column): 'starter'.
const STARTER_PLAN_SLUG = 'starter'

// The Business plan's Clerk Plan ID and slug are two DIFFERENT identifiers
// used for two different Clerk APIs — mixing them up is exactly what broke
// the plan gate before this fix:
//   - PLAN ID (cplan_...) — used for checkout (CheckoutButton's planId prop)
//   - PLAN SLUG — used for has({ plan: ... }) authorization checks, per
//     every example in Clerk's own docs (e.g. has({ plan: 'bronze' }))
// Confirmed against Clerk's dashboard (Plans → Plan Key column): 'business'.
const BUSINESS_PLAN_SLUG = 'business'

export interface CreditLimitResult {
  allowed: boolean
  creditsUsed: number
  creditsLimit: number
  isPaid: boolean
  // NEW — which specific tier, since isPaid alone can no longer
  // distinguish Starter from Business now that there are two paid tiers.
  // NOTE: this only ever reflects the Clerk-plan-derived tier — there is
  // no 'enterprise' value here. Enterprise is sales-assisted, has no Clerk
  // plan of its own (confirmed against Clerk's actual Plans table), and is
  // handled via the credit_limit_override below instead, layered on top
  // of whatever Clerk tier the account happens to be manually assigned.
  tier: 'free' | 'starter' | 'business'
}

// Computes actual measured usage for ANY user_id this calendar month —
// extracted as its own export so the admin dashboard can show a target
// account's real usage without duplicating this logic. checkCreditLimit()
// below is just this plus the current request's own auth context.
export async function getCreditsUsedForUser(userId: string): Promise<number> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // token_usage_log doesn't store user_id directly — join through projects.
  const { data: userProjects } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('user_id', userId)

  const projectIds = (userProjects || []).map((p) => p.id)
  if (projectIds.length === 0) return 0

  const { data: usageRows } = await supabaseAdmin
    .from('token_usage_log')
    .select('cost_usd')
    .in('project_id', projectIds)
    .gte('created_at', monthStart.toISOString())

  const totalCostUsd = (usageRows || []).reduce((sum, row) => sum + Number(row.cost_usd), 0)
  return Math.round(totalCostUsd * CREDITS_PER_DOLLAR)
}

// Checks the CURRENT request's authenticated user (via Clerk's own
// server-side auth(), not anything passed in from the client) against
// their real usage this calendar month. Must be called from within a
// Next.js Route Handler or Server Component so auth() has request context
// to read from.
export async function checkCreditLimit(): Promise<CreditLimitResult> {
  const { userId, has } = await auth()

  if (!userId) {
    // Not signed in — treat as most restrictive, though routes calling
    // this should generally already require auth before reaching here.
    return {
      allowed: false,
      creditsUsed: 0,
      creditsLimit: FREE_CREDIT_LIMIT,
      isPaid: false,
      tier: 'free',
    }
  }

  // Checked highest tier first — someone on Business also technically
  // could pass a Starter check if Clerk plans are hierarchical, but
  // checking in priority order avoids ever relying on that assumption.
  const isBusiness = has({ plan: BUSINESS_PLAN_SLUG })
  const isStarter = !isBusiness && has({ plan: STARTER_PLAN_SLUG })
  const tier: 'free' | 'starter' | 'business' = isBusiness
    ? 'business'
    : isStarter
      ? 'starter'
      : 'free'
  const isPaid = tier !== 'free'
  const tierCreditsLimit =
    tier === 'business'
      ? BUSINESS_CREDIT_LIMIT
      : tier === 'starter'
        ? STARTER_CREDIT_LIMIT
        : FREE_CREDIT_LIMIT

  // Manual override, set via the internal admin dashboard — this is what
  // lets an Enterprise account (comped onto the 'business' Clerk plan,
  // since there's no 'enterprise' plan to assign) get a credit ceiling
  // that actually matches their negotiated seat count instead of being
  // silently capped at Business's flat 20,000. Also doubles as the lever
  // for resolving a one-off billing dispute without touching Clerk at all.
  // Checked AFTER computing the normal tier limit so `tier`/`isPaid` above
  // still reflect the account's real Clerk plan for display purposes —
  // only the numeric ceiling itself is ever swapped.
  const { data: settingsRow } = await supabaseAdmin
    .from('user_settings')
    .select('credit_limit_override')
    .eq('user_id', userId)
    .single()
  const creditsLimit = settingsRow?.credit_limit_override ?? tierCreditsLimit

  const creditsUsed = await getCreditsUsedForUser(userId)

  return {
    allowed: creditsUsed < creditsLimit,
    creditsUsed,
    creditsLimit,
    isPaid,
    tier,
  }
}
