import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatForGamma } from '@/lib/gammaFormatter'
import type { AnalysisHandoff } from '@/lib/analysisTypes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Service-role client — needed to write to Storage and project_exports
// regardless of the requesting user's own RLS permissions, since this is
// a system-level write (re-hosting a file), not a user-scoped one.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GAMMA_API_BASE = 'https://public-api.gamma.app/v1.0'
const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 40

// Maps ampli tone → Gamma theme ID.
// Override any of these in .env.local if you want to swap themes later.
// Find available theme IDs: GET /v1.0/themes with your X-API-KEY header.
const TONE_THEME_MAP: Record<string, string> = {
  executive: process.env.GAMMA_THEME_EXECUTIVE || 'default-dark',
  analytical: process.env.GAMMA_THEME_ANALYTICAL || 'default-light',
  educational: process.env.GAMMA_THEME_EDUCATIONAL || 'gold-leaf',
} // ~2 minutes max

async function pollForCompletion(
  generationId: string,
  apiKey: string
): Promise<{ gammaUrl: string; exportUrl: string }> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
      headers: { 'X-API-KEY': apiKey },
    })

    if (!res.ok) throw new Error(`Gamma poll failed: ${res.status}`)

    const data = await res.json()

    if (data.status === 'completed') {
      if (!data.gammaUrl || !data.exportUrl) {
        throw new Error('Gamma returned completed status but missing URLs')
      }
      return { gammaUrl: data.gammaUrl, exportUrl: data.exportUrl }
    }

    if (data.status === 'failed') {
      throw new Error(`Gamma generation failed: ${JSON.stringify(data.error || {})}`)
    }

    // status is 'pending' or 'processing' — keep polling
  }

  throw new Error('Gamma generation timed out after 2 minutes')
}

// Downloads the file from Gamma's temporary exportUrl (expires in ~1 week)
// and re-hosts it in our own private Supabase Storage bucket, logging it to
// project_exports. This is what makes a "past downloads" list durable, and
// what lets the browser force a real download via our own
// /api/exports/[id]/download route instead of navigating to a cross-origin
// Gamma URL, which is what caused the "overtakes the site" behavior.
async function rehostExport(
  projectId: string,
  exportUrl: string,
  exportFormat: 'pptx' | 'pdf',
  fileBaseName: string
): Promise<{ exportId: string; downloadUrl: string }> {
  const fileRes = await fetch(exportUrl)
  if (!fileRes.ok) throw new Error(`Failed to fetch export from Gamma: ${fileRes.status}`)
  const arrayBuffer = await fileRes.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const fileName = `${fileBaseName}.${exportFormat}`
  const storagePath = `${projectId}/${Date.now()}-${fileName}`
  const contentType =
    exportFormat === 'pptx'
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'application/pdf'

  const { error: uploadError } = await supabaseAdmin.storage
    .from('exports')
    .upload(storagePath, buffer, { contentType, upsert: false })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  const { data: row, error: insertError } = await supabaseAdmin
    .from('project_exports')
    .insert({
      project_id: projectId,
      format: exportFormat,
      storage_path: storagePath,
      file_name: fileName,
      file_size_bytes: buffer.length,
    })
    .select('id')
    .single()

  if (insertError || !row) throw new Error(`Failed to log export: ${insertError?.message}`)

  return { exportId: row.id, downloadUrl: `/api/exports/${row.id}/download` }
}

export async function POST(req: Request) {
  const apiKey = process.env.GAMMA_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GAMMA_API_KEY not configured' }, { status: 500 })
  }

  const {
    projectId,
    exportFormat = 'pptx', // 'pptx' | 'pdf'
  }: {
    projectId: string
    exportFormat?: 'pptx' | 'pdf'
  } = await req.json()

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  // Fetch the full project — needs analysis_handoff and metadata
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Fetch user brand settings separately — brand belongs to the user,
  // not the project. Falls back gracefully if not set.
  const { data: brandSettings } = await supabase
    .from('user_settings')
    .select('brand_name, brand_primary_color, brand_logo_url')
    .eq('user_id', project.user_id)
    .single()

  const handoff: AnalysisHandoff | null = project.analysis_handoff || null

  if (!handoff?.confirmedAnalysis) {
    return NextResponse.json(
      { error: 'No confirmed analysis found — complete analysis before exporting' },
      { status: 400 }
    )
  }

  // Format the analysis into Gamma's expected markdown outline
  const formatted = formatForGamma({
    confirmedAnalysis: handoff.confirmedAnalysis,
    selectedFindings: handoff.selectedFindings || [],
    // This was missing entirely before — without it, gammaFormatter.ts
    // always fell through to its suggestedFollowUps fallback (the
    // analytical "ask me to..." follow-up questions from /api/analyze),
    // even on projects where real AI-generated recommendations existed
    // in the database the whole time.
    projectRecommendations: project.recommendations || [],
    projectName: project.name || project.pitch_title || 'Untitled',
    tone: project.tone || 'executive',
    targetCompany: project.target_company || null,
    targetAudience: project.target_audience || null,
    // Brand fields — stored in projects table or brand settings
    primaryColor: project.brand_primary_color || null,
    logoUrl: project.brand_logo_url || null,
  })

  // Resolve theme from tone — falls back to executive default if tone not set
  const themeId = TONE_THEME_MAP[project.tone || 'executive'] || 'default-dark'

  // Build the Gamma API request body
  const gammaBody: Record<string, any> = {
    inputText: formatted.inputText,
    title: formatted.title,
    textMode: 'preserve',
    format: 'presentation',
    cardSplit: 'inputTextBreaks',
    exportAs: exportFormat,
    themeId,
    textOptions: {
      amount: 'brief',
      tone: formatted.tone,
      audience: formatted.audience,
      language: 'en',
    },
    imageOptions: {
      source: 'themeAccent',
    },
    cardOptions: {
      dimensions: '16x9',
    },
    additionalInstructions: formatted.additionalInstructions,
    sharingOptions: {
      workspaceAccess: 'noAccess',
      externalAccess: 'noAccess',
    },
  }

  // Add logo to top-right header if available
  // Logo must be a publicly accessible URL — localhost won't work with Gamma's servers
  if (formatted.inputText && project.brand_logo_url) {
    const logoUrl: string = project.brand_logo_url
    const isPublic = logoUrl.startsWith('https://') && !logoUrl.includes('localhost')
    if (isPublic) {
      gammaBody.cardOptions.headerFooter = {
        topRight: {
          type: 'image',
          source: 'custom',
          src: logoUrl,
          size: 'sm',
        },
        bottomRight: {
          type: 'cardNumber',
        },
        // Don't show logo/page number on the title card
        hideFromFirstCard: false,
      }
    }
  }

  // Fire the generation request
  let generationId: string
  try {
    const res = await fetch(`${GAMMA_API_BASE}/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(gammaBody),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('Gamma generation request failed:', res.status, errBody)
      return NextResponse.json({ error: `Gamma API error: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    generationId = data.generationId

    if (!generationId) {
      throw new Error('Gamma did not return a generationId')
    }
  } catch (err: any) {
    console.error('Gamma generation error:', err)
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 })
  }

  // Poll until complete
  try {
    const { gammaUrl, exportUrl } = await pollForCompletion(generationId, apiKey)

    // Save the Gamma URL to the project for reference (view/edit in Gamma app)
    await supabase
      .from('projects')
      .update({ gamma_url: gammaUrl, gamma_export_url: exportUrl })
      .eq('id', projectId)

    // Re-host in our own Storage — see rehostExport() comment above for why
    const fileBaseName = (project.name || project.pitch_title || 'presentation')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
    const { exportId, downloadUrl } = await rehostExport(
      projectId,
      exportUrl,
      exportFormat,
      fileBaseName
    )

    return NextResponse.json({
      success: true,
      generationId,
      gammaUrl, // View/edit in Gamma app
      exportId, // project_exports row id
      downloadUrl, // our own route — forces a real download, never expires
      exportFormat,
    })
  } catch (err: any) {
    console.error('Gamma poll or rehost error:', err)
    return NextResponse.json({ error: err.message || 'Generation timed out' }, { status: 500 })
  }
}
