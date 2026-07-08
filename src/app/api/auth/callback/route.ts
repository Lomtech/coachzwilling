import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  // Open-Redirect-Schutz (CWE-601): nur echte In-App-Pfade zulassen. Der Regex
  // verlangt führenden "/", dessen nächstes Zeichen weder "/" noch "\" ist —
  // blockt //evil.com, /\evil.com (WHATWG behandelt \ wie /), absolute URLs
  // und javascript:. Alle legitimen Aufrufer liefern relative Pfade.
  const rawNext = url.searchParams.get('next') ?? '/coach'
  const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : '/coach'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
