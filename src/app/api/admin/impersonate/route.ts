import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isCurrentUserAdmin } from '@/lib/isAdmin'

export async function POST(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { userId: adminUserId } = await auth()
  if (!adminUserId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { userId: targetUserId } = await req.json()
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.clerk.com/v1/actor_tokens', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: targetUserId,
        actor: { sub: adminUserId },
        // 10 minutes, same duration Clerk's own docs use as their example
        // — plenty of time to consume the token and land in the app,
        // short enough that a forgotten/unused token doesn't linger.
        expires_in_seconds: 600,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('Actor token creation failed:', res.status, errBody)
      return NextResponse.json(
        { error: `Failed to create impersonation session: ${errBody.slice(0, 300)}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    // `url` is a Clerk Frontend API URL. Visiting it signs OUT whoever is
    // currently signed in on that browser — including you, the admin —
    // and signs in as the target user instead. There is no automatic
    // "return to your own admin session" afterward; see
    // ImpersonationBanner.tsx's comment for what stopping actually does.
    //
    // A bare consume URL leaves Clerk with no way to know which domain to
    // bounce back to once the sign-in completes — on a development
    // instance especially, this shows Clerk's own "cannot redirect to
    // your application" placeholder instead of landing you back in the
    // app. Appending redirect_url fixes it, using the same domain
    // fallback chain already established elsewhere in this app (the
    // Crowd Insights opt-in fetch fix): explicit env var first, then
    // Vercel's auto-populated deployment URL, then localhost for actual
    // local dev only.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const consumeUrl = new URL(data.url)
    consumeUrl.searchParams.set('redirect_url', appUrl)

    return NextResponse.json({ url: consumeUrl.toString() })
  } catch (err: any) {
    console.error('Impersonation request failed:', err)
    return NextResponse.json({ error: 'Request failed — see server logs' }, { status: 500 })
  }
}
