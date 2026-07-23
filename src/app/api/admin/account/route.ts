import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isCurrentUserAdmin } from '@/lib/isAdmin'
import { getCreditsUsedForUser } from '@/lib/creditLimit'

// Service-role client — this route writes to an arbitrary account's row on
// behalf of the admin, not the signed-in user's own row, so it necessarily
// bypasses RLS the same way every other system-level write in this app does.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Explicit allowlist of columns this route can touch — never spread an
// arbitrary request body straight into an upsert. Keeping this list short
// and intentional is what makes it safe for an admin-only route to accept
// a loosely-typed JSON body at all.
const EDITABLE_FIELDS = [
  'brand_name',
  'brand_primary_color',
  'brand_logo_url',
  'gamma_theme_id',
  'gamma_template_id',
  'credit_limit_override',
] as const

export async function GET(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select(
      'brand_name, brand_primary_color, brand_logo_url, gamma_theme_id, gamma_template_id, credit_limit_override'
    )
    .eq('user_id', userId)
    .single()

  const creditsUsed = await getCreditsUsedForUser(userId)

  return NextResponse.json({
    settings: settings || {},
    creditsUsed,
  })
}

export async function PATCH(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await req.json()
  const { userId } = body
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const update: Record<string, any> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  }
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = body[field]
  }

  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert(update, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
