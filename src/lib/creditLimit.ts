import { auth, currentUser } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { resolveBillingContext } from './seatResolution'

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
// Also the single gate for seat management — see seats/route.ts — which is
// what lets an active seat-holder be treated as 'business' tier below
// without ever needing to look up the owner's plan at request time.
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
  // NEW — whether this account is an active seat under someone else's
  // Business account, as opposed to being its own owner (whether by
  // personally paying, or being manually comped for Enterprise). Needed
  // so a "Manage Team" nav link can be shown only to actual owners, not
  // to seat-holders who share the same tier but shouldn't get seat
  // management powers over an account they don't own.
  isSeatHolder: boolean
}

// Computes actual measured usage across an arbitrary set of user_ids this
// calendar month — extracted so both the self-check below and a pooled
// team of seat-holders can share the same calculation without duplicating
// it. A single-user check is just this called with a one-element array.
export async function getCreditsUsedForUsers(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // token_usage_log doesn't store user_id directly — join through projects.
  const { data: userProjects } = await supabaseAdmin
    .from('projects')
    .select('id')
    .in('user_id', userIds)

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

// Kept for any existing caller checking a single specific user (e.g. the
// admin dashboard looking up one person) — thin wrapper around the pooled
// version above with a one-element array. NOTE: this deliberately shows
// only that one person's own usage, not their whole team's pooled total —
// if the admin dashboard ever needs to show a seat-holder's real
// team-wide figure, it should call resolveBillingContext() + this
// function together, the same way checkCreditLimit() does below.
export async function getCreditsUsedForUser(userId: string): Promise<number> {
  return getCreditsUsedForUsers([userId])
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
      isSeatHolder: false,
    }
  }

  // Resolves seat membership — most users are their own owner
  // (poolUserIds = [userId], isSeatHolder = false), unchanged from before
  // this feature existed. A seat-holder invited under someone else's
  // Business account instead pools usage with their whole team.
  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress || null
  const { ownerId, poolUserIds, isSeatHolder } = await resolveBillingContext(userId, email)

  // Checked highest tier first — someone on Business also technically
  // could pass a Starter check if Clerk plans are hierarchical, but
  // checking in priority order avoids ever relying on that assumption.
  //
  // A seat-holder is deterministically 'business' tier with no further
  // lookup needed — the ONLY way to become an active seat is if the owner
  // passed the has({plan: 'business'}) check at invite time (see
  // seats/route.ts's POST handler), so there's no need to call Clerk's
  // still-Beta cross-user billing-subscription API here to confirm it
  // again. KNOWN SIMPLIFICATION: if the owner later downgrades or cancels,
  // existing seats aren't automatically revoked — this treats that as an
  // acceptable gap for now rather than building revocation-on-downgrade
  // logic before there's a real case that needs it, same posture as this
  // app's other deliberate early-stage simplifications.
  const isBusiness = isSeatHolder || has({ plan: BUSINESS_PLAN_SLUG })
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

  // Manual override, set via the internal admin dashboard — read from the
  // OWNER's row, not the current request's own user_settings, since this
  // is a company-level override (a comped Enterprise seat allotment or a
  // billing dispute resolution) that should apply the same way whether
  // the owner themselves or one of their seat-holders is the one asking.
  const { data: settingsRow } = await supabaseAdmin
    .from('user_settings')
    .select('credit_limit_override')
    .eq('user_id', ownerId)
    .single()
  const creditsLimit = settingsRow?.credit_limit_override ?? tierCreditsLimit

  // Pooled across the owner + every active seat-holder — a teammate's own
  // generated projects count toward the same shared limit, matching the
  // "credits are pooled per account" design decided when seat management
  // was first scoped.
  const creditsUsed = await getCreditsUsedForUsers(poolUserIds)

  return {
    allowed: creditsUsed < creditsLimit,
    creditsUsed,
    creditsLimit,
    isPaid,
    tier,
    isSeatHolder,
  }
}
