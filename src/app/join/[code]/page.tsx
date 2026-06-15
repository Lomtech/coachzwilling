import { redirect } from 'next/navigation'

/**
 * /join/[code] — Vanity-Redirect für B2B-Activation-Codes.
 *
 * Beispiel: https://deepling.com/join/DEEPLING-ACME-7B3K
 *   → redirected zu /signup?code=DEEPLING-ACME-7B3K
 *
 * Sinn: Chefs verschicken einen kurzen, schön lesbaren Link an
 * ihre Mitarbeiter. Schöner als "/signup?code=...".
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const cleanCode = code.trim().toUpperCase().slice(0, 64)
  redirect(`/signup?code=${encodeURIComponent(cleanCode)}`)
}
