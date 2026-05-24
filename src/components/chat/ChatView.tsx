'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSpeechInput } from './useSpeechInput'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
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
            <Bubble key={m.id} msg={m} />
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
        <div className="px-4 pb-2 max-w-2xl w-full mx-auto text-xs text-[var(--color-muted)]">{speech.error}</div>
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
          {speech.supported && (
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
          )}
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

function Bubble({ msg }: { msg: Message }) {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-assistant prose-coach'}`}>
        {renderText(msg.content)}
      </div>
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
