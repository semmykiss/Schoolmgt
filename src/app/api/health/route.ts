import { NextResponse } from 'next/server'

// Lightweight liveness probe (used by the Docker healthcheck).
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'schooldesk', time: new Date().toISOString() })
}
