import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CreateOrgForm } from './CreateOrgForm'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function NewOrgPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/org/new')

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-2xl mx-auto px-5 py-5 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Neue Organisation
          </h1>
          <Link href="/org" className="btn btn-ghost text-sm">← Zurück</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8">
        <p className="text-sm text-[var(--color-ink-2)] mb-6">
          Du legst eine Organisation an und wirst automatisch Owner. Anschließend
          kannst du HR-Admins und Mitarbeitende per E-Mail einladen — sie sehen
          ihren eigenen Coach wie gewohnt, du siehst nur das anonyme HR-Dashboard.
        </p>
        <CreateOrgForm />
      </main>
    </div>
  )
}
