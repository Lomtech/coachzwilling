import 'server-only'
import { createClient as createSupabase } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service-Role-Client — bypassed RLS. NUR in Server-Routen verwenden, NIE im Client.
let _service: ReturnType<typeof createSupabase<Database>> | null = null

export function serviceClient() {
  if (!_service) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_URL fehlt')
    }
    _service = createSupabase<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _service
}
