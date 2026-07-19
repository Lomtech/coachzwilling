'use client'

import { useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { createUnlockCode } from './actions'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-primary shrink-0">
      {pending ? 'Erzeuge …' : 'Code erzeugen'}
    </button>
  )
}

export function CreateCodeForm() {
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form
      ref={ref}
      action={async (fd) => { await createUnlockCode(fd); ref.current?.reset() }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex-1 min-w-[220px]">
        <label className="block text-xs text-[var(--color-muted)] mb-1">
          Für welchen Klienten? (optional — nur zur Nachverfolgung)
        </label>
        <input name="label" type="text" placeholder="z.B. Max Mustermann · Firma XY" autoComplete="off" />
      </div>
      <SubmitBtn />
    </form>
  )
}
