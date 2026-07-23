import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { isCurrentUserAdmin } from '@/lib/isAdmin'

// NOTE: `clerkClient` is called as a function here (`await clerkClient()`)
// per the current Clerk Next.js SDK — this changed across SDK versions,
// so if this doesn't match what's actually installed, check Clerk's docs
// for the version in package.json and adjust this one call accordingly.
// Everything downstream of getting the client instance is stable.
export async function POST(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    const { data: users } = await client.users.getUserList({
      emailAddress: [email.trim()],
    })

    const match = users[0]
    if (!match) {
      return NextResponse.json({ error: 'No user found with that email' }, { status: 404 })
    }

    return NextResponse.json({
      userId: match.id,
      email: match.emailAddresses?.[0]?.emailAddress || email.trim(),
      firstName: match.firstName || null,
      lastName: match.lastName || null,
    })
  } catch (err: any) {
    console.error('Admin user lookup failed:', err)
    return NextResponse.json({ error: 'Lookup failed — see server logs' }, { status: 500 })
  }
}
