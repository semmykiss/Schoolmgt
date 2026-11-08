import { NextResponse } from 'next/server'
import { openApiDoc } from '@/lib/openapi'

export async function GET() {
  return NextResponse.json(openApiDoc)
}
