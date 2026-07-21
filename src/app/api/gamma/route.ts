import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatForGamma } from '@/lib/gammaFormatter'
import type { AnalysisHandoff } from '@/lib/analysisTypes'

// This route polls Gamma for up to 2 minutes (POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS
// below), then downloads and re-hosts the resulting file — comfortably past
// Vercel's default timeout, and past the 60s used for generate/route.ts too.
// IMPORTANT: 300s is only actually honored on Vercel Pro (or with Fluid
// Compute enabled) — Hobby plan hard-caps maxDuration at 60s regardless of
// what's set here, which would mean any export that takes Gamma longer than
// 60s to generate will still time out on Hobby no matter what this value is.
// Worth confirming which plan this project is on.
export const maxDuration = 300

// Service-role client, not anon. Same fix as generate/route.ts: server-side
// routes have no window.Clerk to attach a session via the accessToken
// callback in src/lib/supabase.ts, so an anon client here has zero auth
// token. Under RLS, that meant the project lookup below silently came back
// empty — not an error, just no visible row — which this route's own
// `if (error || !project)` check correctly treated as "not found" and
// returned a 404 for. Same underlying bug as the chart-generation issue,
// just surfacing as an explicit 404 here instead of a silent no-op, because
// this route happens to check for a missing row where generate/route.ts's
// .update() call didn't.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

// ── Closest-theme color matching (Tier 2 fallback) ──────────────────────
// Gamma's themes API returns colorKeywords as words ("blue", "gradient"),
// not hex codes — there's no way to search by hex directly. This converts
// a hex color to a basic hue name via HSL, then looks for a standard theme
// whose colorKeywords includes that word. Approximate by nature — this is
// explicitly the fallback tier, not the exact-match path (that's a custom
// theme set up in Brand Settings, checked first in the route handler).

function hexToColorName(hex: string): string | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2

  if (max - min < 0.08) {
    if (lightness > 0.9) return 'white'
    if (lightness < 0.15) return 'black'
    return 'gray'
  }

  let hue = 0
  const delta = max - min
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue = Math.round(hue * 60)
  if (hue < 0) hue += 360

  if (hue < 15 || hue >= 345) return 'red'
  if (hue < 45) return 'orange'
  if (hue < 70) return 'yellow'
  if (hue < 150) return 'green'
  if (hue < 195) return 'teal'
  if (hue < 255) return lightness < 0.35 ? 'navy' : 'blue'
  if (hue < 290) return 'purple'
  return 'pink'
}

async function findClosestThemeByColor(hex: string, apiKey: string): Promise<string | null> {
  const colorName = hexToColorName(hex)
  if (!colorName) return null

  try {
    const res = await fetch(`${GAMMA_API_BASE}/themes?type=standard&limit=50`, {
      headers: { 'X-API-KEY': apiKey },
    })
    if (!res.ok) return null
    const data = await res.json()
    const match = (data.data || []).find((theme: any) =>
      (theme.colorKeywords || []).includes(colorName)
    )
    return match?.id || null
  } catch (err) {
    console.error('Theme color matching failed, falling back to tone-based theme:', err)
    return null
  }
}

async function pollForCompletion(
  generationId: string,
  apiKey: string
): Promise<{ gammaUrl: string; exportUrl: string; creditsDeducted: number | null }> {
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
      // credits.deducted — how many Gamma credits this specific generation
      // cost. Not guaranteed present on every API version/response, hence
      // the optional chaining and null fallback rather than assuming it.
      return {
        gammaUrl: data.gammaUrl,
        exportUrl: data.exportUrl,
        creditsDeducted: data.credits?.deducted ?? null,
      }
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
//
// Also logs creditsDeducted — since API calls are one of the few things
// that consume Gamma credits regardless of plan tier, this is what turns
// "I imagine we'll run out" into an actual, queryable usage ledger per
// export and per project, rather than a guess.
async function rehostExport(
  projectId: string,
  exportUrl: string,
  exportFormat: 'pptx' | 'pdf',
  fileBaseName: string,
  creditsDeducted: number | null
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
      gamma_credits_used: creditsDeducted,
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
  //
  // NOTE: this was previously fetched but never actually read anywhere
  // below — primaryColor/logoUrl were pulled from `project.*` instead,
  // which may not reflect what the user actually set in Brand Settings.
  // Now used directly, with project fields kept only as a fallback for
  // any older data that predates this fix.
  const { data: brandSettings } = await supabase
    .from('user_settings')
    .select('brand_name, brand_primary_color, brand_logo_url, gamma_theme_id, gamma_template_id')
    .eq('user_id', project.user_id)
    .single()

  const resolvedPrimaryColor =
    brandSettings?.brand_primary_color || project.brand_primary_color || null
  const resolvedLogoUrl = brandSettings?.brand_logo_url || project.brand_logo_url || null

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
    primaryColor: resolvedPrimaryColor,
    logoUrl: resolvedLogoUrl,
  })

  // Resolve theme — three-tier fallback:
  //   1. User's own custom Gamma theme (exact color match, set up once
  //      in Brand Settings) — the only path that guarantees pixel-exact
  //      brand color, since Gamma's generation API has no raw hex-code
  //      parameter, only themeId.
  //   2. Closest standard Gamma theme by color keyword — approximate,
  //      but works with zero setup for anyone who hasn't configured a
  //      custom theme yet.
  //   3. The original tone-based fallback, if the color-match lookup
  //      itself fails for any reason (network error, no themes matched).
  let themeId: string
  if (brandSettings?.gamma_theme_id) {
    themeId = brandSettings.gamma_theme_id
  } else {
    const matched = resolvedPrimaryColor
      ? await findClosestThemeByColor(resolvedPrimaryColor, apiKey)
      : null
    themeId = matched || TONE_THEME_MAP[project.tone || 'executive'] || 'default-dark'
  }

  // Template selection takes priority over theme-only generation — if the
  // client has picked a saved template (built manually via a "Request a
  // Custom Look" request), export through /generations/from-template
  // instead, which uses that template's exact layout/design rather than
  // letting Gamma build the layout automatically from a theme + outline.
  const selectedTemplateId = brandSettings?.gamma_template_id || null

  let gammaBody: Record<string, any>
  let generationEndpoint: string

  if (selectedTemplateId) {
    generationEndpoint = `${GAMMA_API_BASE}/generations/from-template`
    // from-template takes a `prompt` describing what to change, not the
    // same inputText/cardSplit/textOptions shape as a from-scratch
    // generation — the template's own structure and design are preserved
    // by default, so the prompt just needs to say what content goes in.
    const logoInstruction = resolvedLogoUrl
      ? ` Include the logo at ${resolvedLogoUrl} somewhere appropriate in the header if the template design allows for it.`
      : ''
    gammaBody = {
      gammaId: selectedTemplateId,
      prompt: `Replace the content in this template with the following, preserving the template's exact structure, layout, and design.${logoInstruction}\n\n${formatted.inputText}`,
      themeId,
      exportAs: exportFormat,
      sharingOptions: {
        workspaceAccess: 'noAccess',
        externalAccess: 'noAccess',
      },
    }
  } else {
    generationEndpoint = `${GAMMA_API_BASE}/generations`
    // Build the Gamma API request body
    gammaBody = {
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

    // Add logo to top-right header if available — only supported on the
    // from-scratch generation path, since from-template has no
    // cardOptions.headerFooter field in its schema.
    if (formatted.inputText && resolvedLogoUrl) {
      const logoUrl: string = resolvedLogoUrl
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
  }

  // Fire the generation request
  let generationId: string
  try {
    const res = await fetch(generationEndpoint, {
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
      // Previously only the status code reached the client ("Gamma API
      // error: 400") — the actual reason Gamma rejected the request only
      // existed in Vercel's logs, same class of problem as every other
      // "real error hidden behind a generic message" bug fixed this
      // session. Truncated to a reasonable length in case Gamma's error
      // body is unexpectedly large.
      return NextResponse.json(
        { error: `Gamma API error: ${res.status} — ${errBody.slice(0, 500)}` },
        { status: res.status }
      )
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
    const { gammaUrl, exportUrl, creditsDeducted } = await pollForCompletion(generationId, apiKey)

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
      fileBaseName,
      creditsDeducted
    )

    return NextResponse.json({
      success: true,
      generationId,
      gammaUrl, // View/edit in Gamma app
      exportId, // project_exports row id
      downloadUrl, // our own route — forces a real download, never expires
      exportFormat,
      creditsDeducted, // for visibility in logs/monitoring, not currently surfaced in the UI
    })
  } catch (err: any) {
    console.error('Gamma poll or rehost error:', err)
    return NextResponse.json({ error: err.message || 'Generation timed out' }, { status: 500 })
  }
}
