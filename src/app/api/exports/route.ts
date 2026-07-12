import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — reads project_exports directly, independent of
// any user-scoped RLS. Consistent with how this app's other API routes
// (e.g. /api/gamma) already trust a client-provided projectId.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/exports?projectId=... — lists all downloaded files for a
// project, newest first. Used by the ExportsDropdown component on the
// projects list and dashboard pages.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('project_exports')
    .select('id, format, file_name, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ exports: data || [] })
}
