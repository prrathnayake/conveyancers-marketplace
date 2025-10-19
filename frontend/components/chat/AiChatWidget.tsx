import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import styles from './AiChatWidget.module.css'

type Persona = 'assistant' | 'cat'

type Message = {
  id: number
  role: 'assistant' | 'user' | 'system'
  content: string
  createdAt: string
}

type SessionPayload = {
  sessionId: string
  persona: Persona
  status: 'active' | 'escalated'
  summary: string
  messages: Message[]
}

type MessagePayload = SessionPayload

type EscalationResponse = {
  summary: string
}

const personaLabels: Record<Persona, string> = {
  assistant: 'AI assistant',
  cat: 'Conveyancing cat',
}

const storageKeyForPersona = (value: Persona): string => `ai-chat-session:${value}`

const formatTime = (value: string): string => {
  try {
    const date = new Date(value)
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    console.warn('Failed to format timestamp', error)
    return value
  }
}

const AiChatWidget = (): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false)
  const [persona, setPersona] = useState<Persona>('assistant')
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [escalatedSummary, setEscalatedSummary] = useState<string | null>(null)
  const [isEscalating, setIsEscalating] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const pendingPersonaRef = useRef<Persona>('assistant')
  const summaryLines = useMemo(
    () => (escalatedSummary ? escalatedSummary.split('\n').filter((line) => line.trim().length > 0) : []),
    [escalatedSummary],
  )

  const scrollToBottom = useCallback(() => {
    const container = scrollerRef.current
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  const activateSession = useCallback(
    async (activePersona: Persona): Promise<void> => {
      setIsLoading(true)
      setError('')
      try {
        let payload: SessionPayload | null = null

        if (typeof window !== 'undefined') {
          try {
            const storedSessionId = window.localStorage.getItem(storageKeyForPersona(activePersona))
            if (storedSessionId) {
              const response = await fetch(
                `/api/ai-chat/session?sessionId=${encodeURIComponent(storedSessionId)}`,
              )
              if (response.ok) {
                payload = (await response.json()) as SessionPayload
              } else if (response.status === 404) {
                window.localStorage.removeItem(storageKeyForPersona(activePersona))
              } else {
                throw new Error('session_fetch_failed')
              }
            }
          } catch (storageError) {
            console.warn('Failed to restore AI chat session id', storageError)
          }
        }

        if (!payload) {
          const response = await fetch('/api/ai-chat/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ persona: activePersona }),
          })
          if (!response.ok) {
            throw new Error('session_failed')
          }
          payload = (await response.json()) as SessionPayload
        }

        if (pendingPersonaRef.current === activePersona && payload) {
          if (payload.persona !== persona) {
            setPersona(payload.persona)
          }
          setSession(payload)
          setEscalatedSummary(payload.status === 'escalated' ? payload.summary : null)
          setTimeout(scrollToBottom, 120)
        }
      } catch (fetchError) {
        console.error('Unable to create or resume chat session', fetchError)
        if (pendingPersonaRef.current === activePersona) {
          setError('We could not initialise the assistant. Please try again in a moment.')
        }
      } finally {
        if (pendingPersonaRef.current === activePersona) {
          setIsLoading(false)
        }
      }
    },
    [persona, scrollToBottom],
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }
    pendingPersonaRef.current = persona
    void activateSession(persona)
  }, [activateSession, isOpen, persona])

  useEffect(() => {
    if (session) {
      scrollToBottom()
    }
  }, [session, scrollToBottom])

  useEffect(() => {
    if (typeof window === 'undefined' || !session) {
      return
    }
    try {
      window.localStorage.setItem(storageKeyForPersona(session.persona), session.sessionId)
    } catch (storageError) {
      console.warn('Failed to persist AI chat session id', storageError)
    }
  }, [session])

  const handleSend = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>): Promise<void> => {
      event?.preventDefault()
      if (!session || !input.trim()) {
        return
      }
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch('/api/ai-chat/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: session.sessionId, message: input }),
        })
        if (!response.ok) {
          throw new Error('message_failed')
        }
        const payload = (await response.json()) as MessagePayload
        setSession(payload)
        setEscalatedSummary(payload.status === 'escalated' ? payload.summary : null)
        setInput('')
        setTimeout(scrollToBottom, 120)
      } catch (sendError) {
        console.error('Failed to send chat message', sendError)
        setError('Message failed to send. Please try again.')
      } finally {
        setIsLoading(false)
      }
    },
    [input, session, scrollToBottom],
  )

  const handleEscalate = useCallback(async (): Promise<void> => {
    if (!session) {
      return
    }
    setIsEscalating(true)
    setError('')
    try {
      const response = await fetch('/api/ai-chat/escalate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: session.sessionId }),
      })
      if (!response.ok) {
        throw new Error('escalation_failed')
      }
      const payload = (await response.json()) as EscalationResponse
      setEscalatedSummary(payload.summary)
      setSession((previous) =>
        previous
          ? { ...previous, status: 'escalated', summary: payload.summary }
          : previous,
      )
    } catch (escalationError) {
      console.error('Failed to escalate chat session', escalationError)
      setError('Escalation failed. Please contact us directly if the issue persists.')
    } finally {
      setIsEscalating(false)
    }
  }, [session])

  const handleToggle = () => {
    setIsOpen((previous) => {
      const next = !previous
      if (!next) {
        setSession(null)
        setEscalatedSummary(null)
        setInput('')
        setError('')
      }
      return next
    })
  }

  const messages = useMemo(() => session?.messages ?? [], [session])

  const canSend = Boolean(input.trim()) && !isLoading

  return (
    <div className={styles.widget}>
      {isOpen ? (
        <div className={styles.panel}>
          <header className={styles.header}>
            <div className={styles.headerTitle}>
              <span>{personaLabels[persona]}</span>
              <button type="button" className={styles.closeButton} onClick={handleToggle} aria-label="Close chat">
                ×
              </button>
            </div>
            <div className={styles.personaTabs} role="tablist" aria-label="Assistant persona">
              {(Object.keys(personaLabels) as Persona[]).map((option) => {
                const isActive = option === persona
                return (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`${styles.personaTab} ${isActive ? styles.personaTabActive : ''}`.trim()}
                    onClick={() => setPersona(option)}
                    disabled={isLoading && pendingPersonaRef.current !== option}
                  >
                    {personaLabels[option]}
                  </button>
                )
              })}
            </div>
          </header>
          <div className={styles.history} ref={scrollerRef} aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={styles.message} data-role={message.role}>
                <div
                  className={`${styles.bubble} ${message.role === 'assistant' ? styles.assistantBubble : styles.userBubble}`.trim()}
                >
                  {message.content}
                </div>
                <span className={styles.timestamp}>{formatTime(message.createdAt)}</span>
              </div>
            ))}
            {messages.length === 0 ? (
              <div className={styles.message} data-role="assistant">
                <div className={`${styles.bubble} ${styles.assistantBubble}`.trim()}>
                  We are preparing your chat session.
                </div>
              </div>
            ) : null}
          </div>
          <footer className={styles.footer}>
            {error ? <span className={`${styles.statusMessage} ${styles.error}`}>{error}</span> : null}
            {escalatedSummary ? (
              <span className={styles.statusMessage}>
                Escalated to admin support. Summary queued for review:
                <br />
                {summaryLines.map((line, index) => (
                  <span key={`summary-${index}`}>
                    {line}
                    {index < summaryLines.length - 1 ? <br /> : null}
                  </span>
                ))}
              </span>
            ) : (
              <span className={styles.statusMessage}>
                Need more help? Escalate and our admin board will step in with full chat history.
              </span>
            )}
            <form className={styles.inputRow} onSubmit={handleSend}>
              <label htmlFor="ai-chat-input" className="visually-hidden">
                Ask a question
              </label>
              <textarea
                id="ai-chat-input"
                className={styles.textarea}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about pricing, timelines, or onboarding..."
                disabled={isLoading}
              />
              <button type="submit" className={styles.sendButton} disabled={!canSend}>
                Send
              </button>
            </form>
            <button type="button" className={styles.escalateButton} onClick={handleEscalate} disabled={!session || isEscalating}>
              {isEscalating ? 'Escalating…' : 'Escalate to admin team'}
            </button>
          </footer>
        </div>
      ) : null}
      <button type="button" className={styles.triggerButton} onClick={handleToggle} aria-expanded={isOpen}>
        {isOpen ? 'Hide assistant' : 'Chat with us'}
      </button>
    </div>
  )
}

export default AiChatWidget
