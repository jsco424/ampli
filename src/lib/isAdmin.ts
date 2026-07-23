import { currentUser } from '@clerk/nextjs/server'

// A hardcoded email allowlist, not a Clerk plan — this has nothing to do
// with customer tiers (Free/Starter/Business), it's just "is the signed-in
// person James." ADMIN_EMAILS supports a comma-separated list in case a
// co-founder or a second internal person ever needs access; today it's
// just one address.
//
// Fails CLOSED if the env var isn't set at all — an unconfigured allowlist
// means nobody gets in, not everybody.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// This is the REAL security boundary — every admin API route calls this
// itself, server-side, independently. The admin page's own client-side
// check (via /api/admin/check) is only there to avoid flashing the admin
// UI at a non-admin before redirecting; it is never the actual guard.
export async function isCurrentUserAdmin(): Promise<boolean> {
  if (ADMIN_EMAILS.length === 0) return false
  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase()
  return !!email && ADMIN_EMAILS.includes(email)
}
