'use client'

import { useSession, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

// Drop this near the top of app/layout.tsx's <body>, above {children}, so
// it's visible on every single page while impersonating — that's the
// whole point, since it's easy to forget you're signed in as someone else
// partway through debugging their account.
//
// Detects an active impersonated session via `session.actor`, which Clerk
// exposes directly on the Session object without needing a custom JWT
// template. NOTE: the exact shape of reading this has shifted across
// Clerk SDK versions in the past — if this doesn't show up on a session
// you started via /api/admin/impersonate, check Clerk's current docs for
// whichever @clerk/nextjs version is actually installed (look for
// `session.actor` or `sessionClaims.act`).
export default function ImpersonationBanner() {
  const { session } = useSession()
  const { signOut } = useClerk()
  const router = useRouter()

  const actorId = (session as any)?.actor?.sub
  if (!actorId) return null

  const handleStop = async () => {
    // There's no "return to your own admin session" — Clerk's
    // impersonation model replaces the session rather than layering on
    // top of it. This just signs out of the impersonated session; you'll
    // need to sign back in as yourself afterward.
    await signOut()
    router.push('/sign-in')
  }

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 text-black text-xs font-semibold px-4 py-2">
      <span>Viewing as another user — impersonation session active</span>
      <button onClick={handleStop} className="underline">
        Stop impersonating
      </button>
    </div>
  )
}
