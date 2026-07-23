import { NextResponse } from 'next/server'
import { isCurrentUserAdmin } from '@/lib/isAdmin'

export async function GET() {
  return NextResponse.json({ isAdmin: await isCurrentUserAdmin() })
}
