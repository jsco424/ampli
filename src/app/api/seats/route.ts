import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Kept in sync with creditLimit.ts's own constant of the same name.
const BUSINESS_PLAN_SLUG = 'business'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: seats } = await supabaseAdmin
    .from('company_seats')
    .select('id, email, status, invited_at, activated_at')
    .eq('owner_user_id', userId)
    .order('invited_at', { ascending: false })

  return NextResponse.json({ seats: seats || [] })
}

export async function POST(req: Request) {
  const { userId, has } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // Only Business-tier owners can add seats — this is deliberately the
  // ONLY gate anywhere in the seat system. It's also what lets
  // checkCreditLimit() treat every resolved seat-holder as business tier
  // without a second lookup: the only way to ever become an active seat
  // is if the owner passed this exact check at invite time.
  if (!has({ plan: BUSINESS_PLAN_SLUG })) {
    return NextResponse.json({ error: 'Seats are a Business-tier feature' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('company_seats').insert({
    owner_user_id: userId,
    email: email.trim().toLowerCase(),
    status: 'invited',
  })

  if (error) {
    // Postgres unique_violation — reads clearly as "already on the list"
    // rather than a generic 500.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That email is already on your seat list' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { seatId } = await req.json()
  if (!seatId) return NextResponse.json({ error: 'seatId required' }, { status: 400 })

  // Scoped to owner_user_id = userId — this alone is what prevents anyone
  // from removing a seat they don't own, no separate admin check needed.
  const { error } = await supabaseAdmin
    .from('company_seats')
    .delete()
    .eq('id', seatId)
    .eq('owner_user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
