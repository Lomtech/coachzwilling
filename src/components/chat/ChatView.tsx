'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSpeechInput } from './useSpeechInput'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  rating?: 1 | -1 | null
}

interface Props {
  conversationId: string | null
  initialMessages: Message[]
}

export function ChatView({ conversationId: convIdProp, initialMessages }: Props) {
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | null>(convIdProp)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // Speech-Input: getrennt halten von `input` damit interim-Hypothesen
  // den finalen Text nicht überschreiben können.
  const speechBaseRef = useRef<string>('')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  const speech = useSpeechInput({
    onTranscript: (text, isFinal) => {
      // Live-Hypothesen werden angehängt, finales Segment ersetzt die Hypothese
      // und wird zur neuen Basis.
      const sep = speechBaseRef.current && !speechBaseRef.current.endsWith(' ') ? ' ' : ''
      const next = speechBaseRef.current + sep + text
      setInput(next)
      if (isFinal) {
        speechBaseRef.current = next
      }
      // Auto-resize anstoßen
      requestAnimationFrame(() => {
        const ta = taRef.current
        if (ta) {
          ta.style.height = 'auto'
          ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
        }
      })
    },
  })

  function toggleSpeech() {
    if (speech.listening) {
      speech.stop()
    } else {
      // Aktuelles Input als Basis übernehmen, dann starten
      speechBaseRef.current = input
      speech.start()
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    setError(null)
    setInput('')
    autosize()

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const placeholder: Message = { id: crypto.randomUUID(), role: 'assistant', content: '' }
    setMessages(prev => [...prev, userMsg, placeholder])
    setStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: text }),
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `HTTP ${res.status}`)
      }
      await consumeSse(res.body, placeholder.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setMessages(prev => prev.filter(m => m.id !== placeholder.id))
    } finally {
      setStreaming(false)
    }
  }

  async function consumeSse(body: ReadableStream<Uint8Array>, placeholderId: string) {
    const reader = body.getReader()
    const dec = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })

      const events = buf.split('\n\n')
      buf = events.pop() ?? ''

      for (const ev of events) {
        const lines = ev.split('\n')
        let event = 'message'
        let data = ''
        for (const l of lines) {
          if (l.startsWith('event: ')) event = l.slice(7)
          else if (l.startsWith('data: ')) data += l.slice(6)
        }
        if (!data) continue
        try {
          const json = JSON.parse(data)
          if (event === 'meta' && json.conversationId) {
            if (!conversationId) {
              setConversationId(json.conversationId)
              // URL aktualisieren ohne Reload
              window.history.replaceState({}, '', `/coach?c=${json.conversationId}`)
            }
          } else if (event === 'delta' && typeof json.text === 'string') {
            setMessages(prev =>
              prev.map(m =>
                m.id === placeholderId ? { ...m, content: m.content + json.text } : m
              )
            )
          } else if (event === 'assistantId' && typeof json.id === 'string') {
            // Placeholder-UUID gegen echte DB-Message-ID austauschen,
            // damit Feedback (👍/👎) sofort funktioniert ohne Refresh.
            setMessages(prev =>
              prev.map(m => (m.id === placeholderId ? { ...m, id: json.id } : m))
            )
          } else if (event === 'error') {
            setError(json.message ?? 'Stream-Fehler')
          } else if (event === 'done') {
            // Sidebar nach erstem Message-Pair refreshen
            if (!convIdProp) router.refresh()
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      void send()
    }
  }

  function autosize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }

  return (
    <div className="flex flex-col h-dvh">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {messages.length === 0 && <EmptyState />}
          {messages.map(m => (
            <Bubble
              key={m.id}
              msg={m}
              onRate={async (rating) => {
                // Optimistic UI: sofort updaten, dann persistieren
                const previousRating = m.rating ?? null
                const newRating = previousRating === rating ? null : rating
                setMessages(prev =>
                  prev.map(x => (x.id === m.id ? { ...x, rating: newRating } : x))
                )
                try {
                  if (newRating === null) {
                    await fetch(`/api/feedback?messageId=${encodeURIComponent(m.id)}`, {
                      method: 'DELETE',
                    })
                  } else {
                    await fetch('/api/feedback', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ messageId: m.id, rating: newRating }),
                    })
                  }
                } catch {
                  // Rollback bei Netzwerkfehler
                  setMessages(prev =>
                    prev.map(x => (x.id === m.id ? { ...x, rating: previousRating } : x))
                  )
                }
              }}
            />
          ))}
          {streaming && messages.at(-1)?.role === 'assistant' && messages.at(-1)?.content === '' && (
            <div className="bubble bubble-assistant">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 pb-2 max-w-2xl w-full mx-auto text-sm text-[var(--color-danger)]">{error}</div>
      )}
      {speech.error && (
        <div className="px-4 pb-2 max-w-2xl w-full mx-auto">
          <div className="text-xs text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg px-3 py-2">
            {speech.error}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] safe-bottom">
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-2 flex items-end gap-2">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={e => { setInput(e.target.value); autosize() }}
            onKeyDown={onKey}
            placeholder={speech.listening ? 'Sprich jetzt …' : 'Schreibe oder sprich mit deinem Coach …'}
            disabled={streaming}
            className="!min-h-[48px] !py-3"
            style={{ resize: 'none' }}
          />
          {speech.supported ? (
            <button
              type="button"
              onClick={toggleSpeech}
              disabled={streaming}
              className={
                'btn ' +
                (speech.listening
                  ? 'bg-[var(--color-danger)] text-white hover:opacity-90 anim-pulse-soft'
                  : 'btn-ghost')
              }
              aria-label={speech.listening ? 'Spracheingabe stoppen' : 'Spracheingabe starten'}
              title={speech.listening ? 'Stoppen' : 'Mit dem Coach sprechen'}
            >
              {speech.listening ? '■' : '🎙'}
            </button>
          ) : speech.unsupportedReason ? (
            <button
              type="button"
              disabled
              className="btn btn-ghost opacity-40 cursor-not-allowed"
              aria-label="Spracheingabe nicht verfügbar"
              title={speech.unsupportedReason}
            >
              🎙
            </button>
          ) : null}
          <button
            type="button"
            onClick={send}
            disabled={streaming || !input.trim()}
            className="btn btn-primary"
            aria-label="Senden"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

function Bubble({ msg, onRate }: { msg: Message; onRate?: (rating: 1 | -1) => void }) {
  // Feedback nur für persistierte Assistant-Messages (UUID, nicht "streaming-…")
  const canRate = msg.role === 'assistant' && /^[0-9a-f]{8}-/i.test(msg.id) && !!onRate
  return (
    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      <div className={`bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-assistant prose-coach'}`}>
        {renderText(msg.content)}
      </div>
      {canRate && (
        <div className="mt-1 flex gap-1 opacity-60 hover:opacity-100 transition">
          <button
            type="button"
            onClick={() => onRate?.(1)}
            className={
              'text-xs px-2 py-0.5 rounded-md transition ' +
              (msg.rating === 1
                ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                : 'hover:bg-[var(--color-surface-2)] text-[var(--color-muted)]')
            }
            aria-label="Hilfreich"
            title="Hilfreich"
          >
            👍
          </button>
          <button
            type="button"
            onClick={() => onRate?.(-1)}
            className={
              'text-xs px-2 py-0.5 rounded-md transition ' +
              (msg.rating === -1
                ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
                : 'hover:bg-[var(--color-surface-2)] text-[var(--color-muted)]')
            }
            aria-label="Trifft nicht"
            title="Trifft nicht"
          >
            👎
          </button>
        </div>
      )}
    </div>
  )
}

function renderText(text: string): React.ReactNode {
  // Sehr leichte Markdown: nur **fett** und *kursiv* — bewusst klein gehalten
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index))
    const seg = m[0]
    if (seg.startsWith('**')) {
      parts.push(<strong key={key++}>{seg.slice(2, -2)}</strong>)
    } else {
      parts.push(<em key={key++}>{seg.slice(1, -1)}</em>)
    }
    lastIdx = m.index + seg.length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts
}

function EmptyState() {
  return (
    <div className="text-center py-10 text-[var(--color-ink-2)]">
      <div className="text-4xl mb-3">·</div>
      <div className="text-lg font-medium text-[var(--color-ink)] mb-2">Worum geht's heute?</div>
      <div className="text-sm">Schreib einfach drauf los. Dein Coach hört zu.</div>
    </div>
  )
}
