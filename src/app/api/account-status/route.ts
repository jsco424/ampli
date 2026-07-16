import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { checkCreditLimit } from '@/lib/creditLimit'

// Read-only status check — used by the account/billing page to show current
// tier and credit usage. Doesn't block anything itself; checkCreditLimit()
// already does the actual enforcement inside analyze/route.ts. This route
// just surfaces the same numbers to the UI so someone can see where they
// stand without having to hit a limit first to find out.
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const status = await checkCreditLimit()
  return NextResponse.json(status)
}
