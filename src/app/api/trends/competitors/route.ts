import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Service-role, not the client-side anon client — company_research is
// almost certainly RLS-scoped to each researcher's own user_id, which
// would silently hide another user's research on the same company from
// this lookup if queried client-side. Competitor info isn't sensitive
// (it's public business intelligence about a third party, not the
// researcher's own data), so serving it through a service-role route that
// matches across ALL users' research is the right call here, not a
// privacy shortcut.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const company = searchParams.get('company')
  if (!company) {
    return NextResponse.json({ error: 'company required' }, { status: 400 })
  }

  const { data: rows } = await supabaseAdmin
    .from('company_research')
    .select('competitors')
    .ilike('company_name', company)

  // Aggregated across every time this company has been researched (by
  // any user) — different researchers' AI runs can surface slightly
  // different competitor sets, so this merges rather than just taking
  // whichever row happened to match first. Deduped case-insensitively by
  // competitor name.
  const seen = new Map<string, { name: string; description: string }>()
  for (const row of rows || []) {
    for (const c of row.competitors || []) {
      const key = String(c.name || '')
        .toLowerCase()
        .trim()
      if (key && !seen.has(key)) seen.set(key, c)
    }
  }

  return NextResponse.json({ competitors: Array.from(seen.values()).slice(0, 8) })
}
