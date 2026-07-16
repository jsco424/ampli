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
const BUSINESS_CREDIT_LIMIT = 20000

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
    return { allowed: false, creditsUsed: 0, creditsLimit: FREE_CREDIT_LIMIT, isPaid: false }
  }

  const isPaid = has({ plan: BUSINESS_PLAN_SLUG })
  const creditsLimit = isPaid ? BUSINESS_CREDIT_LIMIT : FREE_CREDIT_LIMIT

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // token_usage_log doesn't store user_id directly — join through projects.
  const { data: userProjects } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('user_id', userId)

  const projectIds = (userProjects || []).map((p) => p.id)
  if (projectIds.length === 0) {
    return { allowed: true, creditsUsed: 0, creditsLimit, isPaid }
  }

  const { data: usageRows } = await supabaseAdmin
    .from('token_usage_log')
    .select('cost_usd')
    .in('project_id', projectIds)
    .gte('created_at', monthStart.toISOString())

  const totalCostUsd = (usageRows || []).reduce((sum, row) => sum + Number(row.cost_usd), 0)
  const creditsUsed = Math.round(totalCostUsd * CREDITS_PER_DOLLAR)

  return {
    allowed: creditsUsed < creditsLimit,
    creditsUsed,
    creditsLimit,
    isPaid,
  }
}
