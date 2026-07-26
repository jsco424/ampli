import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface BillingContext {
  // The account whose Clerk plan and credit_limit_override actually apply.
  // Equal to the signed-in user's own userId unless they're an active seat
  // under someone else.
  ownerId: string
  // Every userId whose usage counts toward the pooled credit total —
  // the owner plus every one of their active seats.
  poolUserIds: string[]
  isSeatHolder: boolean
}

// Activates a pending invite the first time that email is actually seen
// signing in — no Clerk webhook needed, just a lazy check on whatever
// request happens to call resolveBillingContext next. Safe to call every
// time: a no-op once already active, or if no invite exists for this email
// at all.
async function activatePendingInvite(userId: string, email: string | null) {
  if (!email) return
  await supabaseAdmin
    .from('company_seats')
    .update({ status: 'active', user_id: userId, activated_at: new Date().toISOString() })
    .eq('email', email.toLowerCase())
    .eq('status', 'invited')
}

// Resolves which account's plan and credit pool a signed-in user actually
// belongs to. Most users are their own owner. A seat-holder invited under
// someone else's company instead inherits that owner's tier and shares
// their credit pool — this is the actual mechanism behind "seat
// management": several separate Clerk logins counting as one paying
// account, not one login being shared across people.
export async function resolveBillingContext(
  userId: string,
  email: string | null
): Promise<BillingContext> {
  await activatePendingInvite(userId, email)

  const { data: seatRow } = await supabaseAdmin
    .from('company_seats')
    .select('owner_user_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  const ownerId = seatRow?.owner_user_id || userId

  const { data: activeSeats } = await supabaseAdmin
    .from('company_seats')
    .select('user_id')
    .eq('owner_user_id', ownerId)
    .eq('status', 'active')

  const poolUserIds = Array.from(
    new Set([ownerId, ...(activeSeats || []).map((s: any) => s.user_id).filter(Boolean)])
  )

  return { ownerId, poolUserIds, isSeatHolder: ownerId !== userId }
}
