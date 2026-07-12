import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — the 'exports' Storage bucket is private by design,
// so files can only ever be served through this route, never a direct
// public Storage URL. Access control lives here, not in bucket permissions.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CONTENT_TYPES: Record<string, string> = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
}

// GET /api/exports/[id]/download — streams the file back with
// Content-Disposition: attachment. This is the piece that actually forces
// a real download regardless of where the file is physically stored —
// the browser sees the response coming from am-pli.com itself, not a
// third-party Storage domain, so the attachment header is honored.
//
// Next.js 15+ (this project is on 16.2.9) made `params` a Promise in route
// handlers — it must be awaited, not read synchronously off the object.
// Reading params.id directly here was the bug: it came through undefined,
// so the Supabase lookup below never matched a row and fell through to
// our own 404 response.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: row, error } = await supabaseAdmin
    .from('project_exports')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Export not found' }, { status: 404 })
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('exports')
    .download(row.storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': CONTENT_TYPES[row.format] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${row.file_name}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
