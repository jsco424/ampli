import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns every distinct company_name that has been through the home
// dashboard's research step at least once, across all researchers —
// same scope as /api/trends/competitors' aggregation. Used to filter the
// Companies roster down to only companies that can actually show
// competitor data, rather than including every on-demand-tracked company
// regardless of whether research ever happened for it.
//
// NOTE: this is scoped to "has anyone researched this company," not
// "did the current signed-in user/account specifically research it" —
// company_research has no account-level grouping key today (unlike
// Company Benchmarks' company_key), so a stricter per-account filter
// isn't buildable without a schema change. Flagged explicitly in case
// that distinction matters going forward.
export async function GET() {
  const { data } = await supabaseAdmin.from('company_research').select('company_name')

  const names = Array.from(
    new Set(
      (data || []).map((r: any) => (r.company_name || '').toLowerCase().trim()).filter(Boolean)
    )
  )

  return NextResponse.json({ names })
}
