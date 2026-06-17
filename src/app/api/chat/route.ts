import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { anthropic, COACH_MODEL } from '@/lib/claude/client'
import { buildCoachSystem } from '@/lib/coach/system-prompt'
import { loadMemoryForCoach, extractMemoryFromTurn } from '@/lib/coach/memory'
import { maybeAutoRefresh } from '@/lib/coach/refine'
import { extractCommitmentsFromTurn } from '@/lib/coach/commitments'
import { validateFirstTurn, buildCorrectionInstruction } from '@/lib/coach/validator'
import {
  detectRepetition,
  buildRepetitionCorrection,
  detectDeflection,
  buildDeflectionCorrection,
} from '@/lib/coach/repetition-check'
import { ACTIVE_STATUSES } from '@/types/database'
import type Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ChatBody {
  conversationId?: string
  message: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Access-Gate (nur aktiv wenn Billing eingeschaltet).
  // WICHTIG: dieselben Bypässe wie im Proxy-Gate (proxy.ts), sonst kommt ein
  // User zwar auf /coach, bekommt aber beim Senden 402. Bestandsnutzer
  // (grandfathered) UND Org-Member müssen hier genauso durch.
  if (process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true') {
    const [{ data: sub }, { data: profile }] = await Promise.all([
      supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('trial_until, grandfathered').eq('id', user.id).maybeSingle(),
    ])
    const grandfathered = profile?.grandfathered === true
    const subActive = !!sub && ACTIVE_STATUSES.has(sub.status)
    const trialActive = !!profile?.trial_until && new Date(profile.trial_until) > new Date()
    const demoAllowed =
      process.env.DEMO_MODE === 'true' &&
      typeof user.email === 'string' &&
      (process.env.DEMO_USER_EMAILS ?? '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .includes(user.email.toLowerCase())

    // B2B-Bypass: Org-Member (die Org hat bezahlt). Fehlte hier bisher — nur
    // der Proxy hatte ihn, was Org-User beim Chatten ausgesperrt hätte.
    let isOrgMember = false
    if (!grandfathered && !subActive && !trialActive && !demoAllowed) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      isOrgMember = !!membership
    }

    if (!grandfathered && !subActive && !trialActive && !demoAllowed && !isOrgMember) {
      return NextResponse.json({ error: 'trial expired' }, { status: 402 })
    }
  }

  // Coach-Profile laden (inkl. Tonprofil + Sprach-Mirror für 4-Block-System-Prompt)
  const { data: cp } = await supabase
    .from('coach_profiles')
    .select('config_md, tone_oneliner, language_mirror')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cp?.config_md) {
    return NextResponse.json({ error: 'profile not ready' }, { status: 409 })
  }

  const body = (await req.json().catch(() => null)) as ChatBody | null
  if (!body?.message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  // Conversation bestimmen / anlegen
  let conversationId = body.conversationId
  const supa = serviceClient()
  if (!conversationId) {
    const { data: created, error } = await supa
      .from('conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'conv create failed' }, { status: 500 })
    }
    conversationId = created.id
  } else {
    // Ownership-Check
    const { data: c } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!c) return NextResponse.json({ error: 'conversation not found' }, { status: 404 })
  }

  // Bisherige Messages der Conversation laden (Kontext)
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(60)

  const messages = [
    ...(history ?? []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: body.message.trim() },
  ]

  // User-Message persistieren (vor dem Stream)
  await supa.from('messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'user',
    content: body.message.trim(),
  })

  // Living Memory laden (kann leer sein bei ersten Sessions)
  const memoryMd = await loadMemoryForCoach(user.id)
  // isFreshConversation: erster Turn in einem neu gestarteten Chat
  // → Coach soll keine alten Themen (z. B. offene Bewerbungen) proaktiv aufgreifen.
  // Memory ist trotzdem im Kontext, nur mit Zurückhaltungs-Anweisung verpackt.
  const isFreshConversation = (history?.length ?? 0) === 0
  const system = buildCoachSystem(
    cp.config_md,
    memoryMd,
    cp.tone_oneliner,
    cp.language_mirror,
    { isFreshConversation },
  )

  // SSE-Stream zum Client + parallel im Hintergrund Persistierung
  const encoder = new TextEncoder()
  const convIdFinal = conversationId
  // Erster Turn der Conversation? → Haiku-Validator gegen Tonprofil ist sinnvoll.
  const isFirstTurn = (history?.length ?? 0) === 0

  // Hilfsfunktion: Antwort in kleinen Chunks "fake-streamen" damit UI sich
  // gewohnt anfühlt, obwohl wir die Antwort komplett vorher haben.
  function fakeStream(controller: ReadableStreamDefaultController<Uint8Array>, text: string) {
    const CHUNK = 60
    for (let i = 0; i < text.length; i += CHUNK) {
      const chunk = text.slice(i, i + CHUNK)
      controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`))
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let finalText = ''
      let inputTokens: number | null = null
      let outputTokens: number | null = null
      let cacheRead: number | null = null
      let cacheCreate: number | null = null
      try {
        // Erste SSE-Payload: conversationId mitschicken
        controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ conversationId: convIdFinal })}\n\n`))

        // ─── Hebel A: First-Turn-Validator ────────────────────────────────
        // Nur beim ersten Turn der Conversation UND nur wenn ein Tonprofil
        // existiert. Wir generieren non-streaming, prüfen via Haiku, retryen
        // einmal mit Korrektur-Hinweis, und "fake-streamen" das Ergebnis.
        if (isFirstTurn && cp.tone_oneliner) {
          const first = await anthropic().messages.create({
            model: COACH_MODEL,
            max_tokens: 1024,
            system: system.blocks,
            messages,
          })
          let candidate = first.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('')
          inputTokens = first.usage?.input_tokens ?? null
          outputTokens = first.usage?.output_tokens ?? null
          cacheRead = first.usage?.cache_read_input_tokens ?? null
          cacheCreate = first.usage?.cache_creation_input_tokens ?? null

          // Validate gegen Tonprofil (Haiku, ~1s)
          const verdict = await validateFirstTurn({
            toneProfile: cp.tone_oneliner,
            userMessage: body.message.trim(),
            coachReply: candidate,
          })

          if (!verdict.passes && verdict.problem) {
            // Retry mit Korrektur — Korrektur als Suffix der letzten
            // User-Message, sonst sieht der Coach die Anweisung nicht im
            // richtigen Kontext (System-Prompt ist cached).
            const retryMessages = [
              ...messages.slice(0, -1),
              {
                role: 'user' as const,
                content: body.message.trim() + buildCorrectionInstruction(verdict.problem),
              },
            ]
            const retry = await anthropic().messages.create({
              model: COACH_MODEL,
              max_tokens: 1024,
              system: system.blocks,
              messages: retryMessages,
            })
            const retryText = retry.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map(b => b.text)
              .join('')
            if (retryText.trim().length > 0) {
              candidate = retryText
            }
            outputTokens = (outputTokens ?? 0) + (retry.usage?.output_tokens ?? 0)
          }

          finalText = candidate
          fakeStream(controller, candidate)
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`))
        } else {
          // ─── Normalfall: echtes Streaming (Turn 2+) ────────────────────
          const stream = await anthropic().messages.stream({
            model: COACH_MODEL,
            max_tokens: 1024,
            system: system.blocks,
            messages,
          })

          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              const chunk = ev.delta.text
              finalText += chunk
              controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`))
            } else if (ev.type === 'message_delta' && ev.usage) {
              outputTokens = ev.usage.output_tokens ?? outputTokens
            } else if (ev.type === 'message_start' && ev.message.usage) {
              inputTokens = ev.message.usage.input_tokens ?? null
              cacheRead = ev.message.usage.cache_read_input_tokens ?? null
              cacheCreate = ev.message.usage.cache_creation_input_tokens ?? null
            }
          }

          // ─── Notbremse 1: Repetition-Detector ────────────────────────
          // Wenn die gestreamte Antwort fast wortgleich zu einer der letzten
          // 3 Coach-Antworten ist → einmal automatisch retry mit Pattern-Break.
          // Verhindert den "Morgen sagst du mir wie viele raus sind"-Loop.
          const recentAssistantContents = (history ?? [])
            .filter(m => m.role === 'assistant')
            .map(m => m.content)
          const rep = detectRepetition({
            newReply: finalText,
            recentAssistantReplies: recentAssistantContents,
          })

          // ─── Notbremse 2: Deflection-Detector ────────────────────────
          // User stellt substantielle neue Frage, Coach antwortet "Erst: ..."
          // statt zu beantworten → ebenfalls auto-retry.
          const def = detectDeflection({
            coachReply: finalText,
            userMessage: body.message.trim(),
          })

          const needsRetry = (rep.isRepetition || def.isDeflection) && finalText.trim().length > 0
          if (needsRetry) {
            const correction = rep.isRepetition
              ? buildRepetitionCorrection()
              : buildDeflectionCorrection()
            console.warn(
              '[chat] auto-retry triggered',
              rep.isRepetition
                ? `repetition similarity=${rep.similarity?.toFixed(2)}`
                : `deflection prefix="${def.matchedPrefix}"`,
            )

            // STRIPPED-DOWN-RETRY: nicht die vollen 60 Turns Historie mitgeben
            // (die kann mit einem bad-Pattern vergiftet sein → Modell zieht es
            //  trotz Korrektur weiter). Stattdessen: nur die letzten 3 User-Turns
            //  + Korrektur-Hinweis + minimaler System-Prompt der NUR die Verbote
            //  enthält, keine Persona-Logik.
            const lastUserTurns = messages.slice(-3) // user-msg + ggf. davor coach + user
            const strippedSystem = [
              {
                type: 'text' as const,
                text: `Du bist der Coach dieses Users. Beantworte JETZT die Frage des Users direkt und substantiell. KEINE Deflection ("Erst:", "aber erst", "Das machen wir — aber erst") — der User hat soeben mit Frust reagiert weil du das gemacht hast. Vergiss für diesen Turn alle offenen Verabredungen (z. B. Bewerbungen). Antworte AUSSCHLIESSLICH die aktuelle Frage. Kein "Erst...", kein "aber erst...". Knappe, direkte, inhaltliche Antwort.`,
              },
            ]

            try {
              const retry = await anthropic().messages.create({
                model: COACH_MODEL,
                max_tokens: 1024,
                system: strippedSystem,
                messages: [
                  ...lastUserTurns.slice(0, -1),
                  {
                    role: 'user' as const,
                    content: body.message.trim() + correction,
                  },
                ],
              })
              const retryText = retry.content
                .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                .map(b => b.text)
                .join('')

              // Second-pass Deflection-Check auf das Retry-Ergebnis.
              // Wenn der Retry IMMER NOCH deflektiert → ist das ein Hard-Bug,
              // wir liefern eine generische honest Fallback-Antwort.
              const retryDef = detectDeflection({
                coachReply: retryText,
                userMessage: body.message.trim(),
              })

              let finalReplacement = retryText
              if (retryDef.isDeflection || retryText.trim().length === 0) {
                console.error('[chat] retry STILL deflected → fallback to honest message')
                finalReplacement =
                  'Sorry — ich hänge hier in einer Schleife und kriege es trotz Korrektur nicht raus. ' +
                  'Beste Lösung: lösch diese Conversation in der Sidebar (✕ beim Hover) und starte ein neues Gespräch. ' +
                  'Dort frag mich nochmal — sollte sauber laufen, weil ich nicht mehr die alte Bewerbungs-Geschichte im Kontext habe.'
              }

              controller.enqueue(
                encoder.encode(`event: replace\ndata: ${JSON.stringify({ text: finalReplacement })}\n\n`)
              )
              finalText = finalReplacement
              outputTokens = (outputTokens ?? 0) + (retry.usage?.output_tokens ?? 0)
            } catch (e) {
              console.error('[chat] auto-retry failed', e)
              // fail-open: belasse die ursprüngliche Antwort
            }
          }

          // (kein 'done' hier — wird unten gesendet, nachdem wir die echte
          //  Assistant-Message-ID via SSE übertragen haben)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'stream error'
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`))
      } finally {
        // Erst persistieren, dann ID via SSE übermitteln, dann close.
        // So kann der Client die Placeholder-UUID gegen die echte Message-ID
        // austauschen und sofortiges Feedback (👍/👎) auslösen ohne Refresh.
        let insertedMsgId: string | null = null
        try {
          const { data: insertedMsg } = await supa.from('messages').insert({
            conversation_id: convIdFinal,
            user_id: user.id,
            role: 'assistant',
            content: finalText,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_read_input_tokens: cacheRead,
            cache_creation_input_tokens: cacheCreate,
          }).select('id').single()
          insertedMsgId = insertedMsg?.id ?? null
        } catch (e) {
          console.error('[chat] assistant persist failed', e)
        }

        try {
          if (insertedMsgId) {
            controller.enqueue(
              encoder.encode(`event: assistantId\ndata: ${JSON.stringify({ id: insertedMsgId })}\n\n`)
            )
          }
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`))
        } catch {
          // Controller könnte schon geschlossen sein wenn Client abgebrochen hat — ignorieren
        }
        controller.close()

        // Hintergrund: Conv-Touch + Memory-Extraktion (kein await blockiert mehr den User)
        try {
          await supa.from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', convIdFinal)

          // Falls noch ohne Titel: aus erster User-Nachricht ableiten
          const { data: conv } = await supa
            .from('conversations')
            .select('title')
            .eq('id', convIdFinal)
            .maybeSingle()
          if (!conv?.title) {
            const titleSeed = body.message.trim().slice(0, 60)
            await supa.from('conversations')
              .update({ title: titleSeed })
              .eq('id', convIdFinal)
          }

          // Living Memory + Commitments PARALLEL extrahieren (beides Haiku, ~2s je).
          // fail-safe: ein Fehler in einem Pfad blockiert nicht den anderen.
          if (finalText.length > 50) {
            const memoryPromise = extractMemoryFromTurn({
              userId: user.id,
              conversationId: convIdFinal,
              assistantMessageId: insertedMsgId,
              userMessage: body.message.trim(),
              assistantReply: finalText,
              recentHistory: history?.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
              })) ?? [],
            }).catch(e => {
              console.error('[memory] extract failed', e)
              return null
            })

            const commitmentsPromise = extractCommitmentsFromTurn({
              userId: user.id,
              conversationId: convIdFinal,
              sourceMsgId: insertedMsgId,
              coachQuestion: finalText,
              userReply: body.message.trim(),
            }).catch(e => {
              console.error('[commitments] extract failed', e)
            })

            const [memEntry] = await Promise.all([memoryPromise, commitmentsPromise])

            // Auto-Refresh: wenn neue Memory geschrieben + ≥20 seit letztem Refresh,
            // schärft sich das Profil im Hintergrund (Opus-Call).
            if (memEntry) {
              maybeAutoRefresh(user.id).catch(e =>
                console.error('[auto-refresh] failed', e)
              )
            }
          }
        } catch (e) {
          console.error('[chat] persist+memory failed', e)
        }
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
