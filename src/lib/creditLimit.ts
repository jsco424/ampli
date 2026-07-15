import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Converts real measured Anthropic cost into the "credits" unit shown on
// the pricing page. Derived from the same numbers already public there:
// ~600 credits per presentation, at a working COGS estimate of ~$0.56/deck
// (from the pricing strategy analysis) — so 1 credit ≈ $0.000933.
// This keeps "1,000 credits ≈ 1-2 presentations" mathematically true
// against real measured usage, not just a marketing estimate.
//
// KNOWN SIMPLIFICATION: this only counts Anthropic token cost from
// token_usage_log, not Gamma export credits (tracked separately in
// project_exports.gamma_credits_used, in Gamma's own credit units, not
// USD). Anthropic cost is the primary driver and the one directly tied to
// starting a new analysis, so it's the right thing to gate on for now —
// a more precise blended figure (folding in Gamma cost too) can be added
// later without changing this function's shape.
const CREDITS_PER_DOLLAR = 600 / 0.56

// Interim, blanket limit — applies to EVERY account right now, regardless
// of plan, since there's no plan concept wired up in the app yet (pending
// the Clerk Billing integration). This is intentional: until real billing
// can tell a Paid/Enterprise account apart from a Free one, capping
// everyone at the Free-tier number is the safe default — nobody can rack
// up unlimited usage on a $0 account in the meantime. Once Clerk Billing
// plans exist, this function is the natural place to branch: look up the
// user's actual plan first, then apply FREE_CREDIT_LIMIT, PAID_CREDIT_LIMIT,
// or the per-seat Enterprise limit accordingly, instead of this single
// hardcoded number.
const FREE_CREDIT_LIMIT = 1000

export interface CreditLimitResult {
  allowed: boolean
  creditsUsed: number
  creditsLimit: number
}

// Sums this user's real Anthropic cost across ALL their projects for the
// current calendar month, converts to credits, and checks against the
// (currently blanket) limit. Call this before starting any new analysis.
export async function checkCreditLimit(userId: string): Promise<CreditLimitResult> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // token_usage_log doesn't store user_id directly — join through projects,
  // same pattern noted in the token_usage_log migration's own comment.
  const { data: userProjects } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('user_id', userId)

  const projectIds = (userProjects || []).map((p) => p.id)
  if (projectIds.length === 0) {
    return { allowed: true, creditsUsed: 0, creditsLimit: FREE_CREDIT_LIMIT }
  }

  const { data: usageRows } = await supabaseAdmin
    .from('token_usage_log')
    .select('cost_usd')
    .in('project_id', projectIds)
    .gte('created_at', monthStart.toISOString())

  const totalCostUsd = (usageRows || []).reduce((sum, row) => sum + Number(row.cost_usd), 0)
  const creditsUsed = Math.round(totalCostUsd * CREDITS_PER_DOLLAR)

  return {
    allowed: creditsUsed < FREE_CREDIT_LIMIT,
    creditsUsed,
    creditsLimit: FREE_CREDIT_LIMIT,
  }
}
