import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { anthropic, COACH_MODEL } from '@/lib/claude/client'
import { buildCoachSystem } from '@/lib/coach/system-prompt'
import { loadMemoryForCoach, extractMemoryFromTurn } from '@/lib/coach/memory'
import { maybeAutoRefresh } from '@/lib/coach/refine'
import { validateFirstTurn, buildCorrectionInstruction } from '@/lib/coach/validator'
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

  // Access-Gate (nur aktiv wenn Billing eingeschaltet)
  if (process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true') {
    const [{ data: sub }, { data: profile }] = await Promise.all([
      supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('trial_until').eq('id', user.id).maybeSingle(),
    ])
    const subActive = !!sub && ACTIVE_STATUSES.has(sub.status)
    const trialActive = !!profile?.trial_until && new Date(profile.trial_until) > new Date()
    const demoAllowed =
      process.env.DEMO_MODE === 'true' &&
      typeof user.email === 'string' &&
      (process.env.DEMO_USER_EMAILS ?? '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .includes(user.email.toLowerCase())
    if (!subActive && !trialActive && !demoAllowed) {
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
  const system = buildCoachSystem(cp.config_md, memoryMd, cp.tone_oneliner, cp.language_mirror)

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

          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`))
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'stream error'
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`))
      } finally {
        controller.close()

        // Hintergrund: Assistant-Message + Conv-Touch persistieren + Memory extrahieren
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

          // Living Memory: nach jedem Coach-Turn extrahieren (Haiku, async, fail-safe)
          if (finalText.length > 50) {
            const memEntry = await extractMemoryFromTurn({
              userId: user.id,
              conversationId: convIdFinal,
              assistantMessageId: insertedMsg?.id ?? null,
              userMessage: body.message.trim(),
              assistantReply: finalText,
              recentHistory: history?.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
              })) ?? [],
            })

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
