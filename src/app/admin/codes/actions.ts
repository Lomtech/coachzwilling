'use server'

import { randomInt } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { serviceClient } from '@/lib/supabase/service'

// Ohne verwechselbare Zeichen (kein 0/O/1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function genCode(): string {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `DEEPLING-${block()}-${block()}`
}

/**
 * Erzeugt einen neuen Freischalt-Code (einmal einlösbar, schaltet die
 * Vollanalyse gratis frei). Optionales Label = welcher Klient. Admin-gated.
 */
export async function createUnlockCode(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const label = String(formData.get('label') ?? '').trim() || null
  const supa = serviceClient()

  // Bei (sehr seltener) Code-Kollision neu würfeln.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode()
    const { error } = await (supa as any)
      .from('unlock_codes')
      .insert({ code, label, created_by: admin.id })
    if (!error) {
      revalidatePath('/admin/codes')
      return
    }
    if ((error as { code?: string }).code !== '23505') {
      throw new Error(error.message ?? 'Code konnte nicht erstellt werden')
    }
  }
  throw new Error('Konnte keinen eindeutigen Code erzeugen — bitte erneut versuchen.')
}

/** Code (de)aktivieren — deaktivierte Codes lassen sich nicht mehr einlösen. */
export async function setUnlockCodeActive(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!id) return
  const supa = serviceClient()
  await (supa as any).from('unlock_codes').update({ active }).eq('id', id)
  revalidatePath('/admin/codes')
}
