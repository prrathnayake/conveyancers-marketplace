import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { SessionUser } from '../lib/session'
import { getSessionFromRequest } from '../lib/session'

interface ChatProps {
  user: SessionUser
}

type Partner = {
  id: number
  fullName: string
  role: string
}

type Message = {
  id: number
  senderId: number
  body: string
  createdAt: string
  attachments: Array<{ id: number; filename: string; mimeType: string }>
}

type MessageResponse = {
  messages: Message[]
  hasMore: boolean
  nextCursor: number | null
}

const ChatPage = ({ user }: ChatProps): JSX.Element => {
  const [partners, setPartners] = useState<Partner[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending'>('idle')
  const [policyWarning, setPolicyWarning] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const loadPartners = async () => {
      const response = await fetch('/api/chat/partners', { signal: controller.signal })
      if (!response.ok) {
        return
      }
      const payload = (await response.json()) as { partners: Partner[] }
      setPartners(payload.partners)
      if (payload.partners.length > 0) {
        setSelected(payload.partners[0].id)
      }
    }
    void loadPartners()
    return () => controller.abort()
  }, [])

  const scrollToBottom = useCallback(() => {
    const container = threadRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [])

  const loadConversation = useCallback(
    async ({ signal, silent }: { signal?: AbortSignal; silent?: boolean } = {}) => {
      if (!selected) {
        return null
      }
      if (!silent) {
        setIsLoading(true)
      }
      try {
        const params = new URLSearchParams({ partnerId: selected.toString(), limit: '20' })
        const response = await fetch(`/api/chat/messages?${params.toString()}`, { signal })
        if (!response.ok) {
          throw new Error('failed_to_fetch_messages')
        }
        const payload = (await response.json()) as MessageResponse
        setMessages(payload.messages)
        setHasMore(payload.hasMore)
        setCursor(payload.nextCursor ?? null)
        if (!silent) {
          setIsLoading(false)
        }
        setTimeout(() => {
          if (!signal || !signal.aborted) {
            scrollToBottom()
          }
        }, 0)
        return payload
      } catch (error) {
        if (signal?.aborted) {
          return null
        }
        console.error(error)
        if (!silent) {
          setIsLoading(false)
        }
        return null
      }
    },
    [scrollToBottom, selected]
  )

  useEffect(() => {
    if (!selected) {
      setMessages([])
      setHasMore(false)
      setCursor(null)
      setPolicyWarning(null)
      return
    }
    const controller = new AbortController()
    void loadConversation({ signal: controller.signal })
    return () => controller.abort()
  }, [loadConversation, selected])

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !input.trim()) {
      return
    }
    setStatus('sending')
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: selected, body: input }),
      })
      if (!response.ok) {
        throw new Error('failed_to_send')
      }
      const payload = (await response.json()) as { policyWarning?: string }
      setInput('')
      setPolicyWarning(payload.policyWarning ?? null)
      await loadConversation({ silent: true })
    } catch (error) {
      console.error(error)
    } finally {
      setStatus('idle')
    }
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selected || !event.target.files?.length) {
      return
    }
    const file = event.target.files[0]
    const formData = new FormData()
    formData.append('partnerId', selected.toString())
    formData.append('file', file)
    await fetch('/api/chat/upload', {
      method: 'POST',
      body: formData,
    })
    await loadConversation({ silent: true })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleLoadOlder = async () => {
    if (!selected || !hasMore || isLoadingMore || !cursor) {
      return
    }
    const container = threadRef.current
    const previousHeight = container?.scrollHeight ?? 0
    setIsLoadingMore(true)
    try {
      const params = new URLSearchParams({
        partnerId: selected.toString(),
        limit: '20',
        before: cursor.toString(),
      })
      const response = await fetch(`/api/chat/messages?${params.toString()}`)
      if (!response.ok) {
        throw new Error('failed_to_load_more')
      }
      const payload = (await response.json()) as MessageResponse
      setMessages((prev) => [...payload.messages, ...prev])
      setHasMore(payload.hasMore)
      setCursor(payload.nextCursor ?? null)
      setTimeout(() => {
        if (container) {
          const newHeight = container.scrollHeight
          container.scrollTop = newHeight - previousHeight
        }
      }, 0)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const partner = partners.find((item) => item.id === selected) ?? null

  return (
    <>
      <Head>
        <title>Secure chat</title>
      </Head>
      <main className="page">
        <section className="chat-shell" aria-labelledby="chat-heading">
          <div className="chat-sidebar">
            <h1 id="chat-heading">Secure chat</h1>
            <p className="lead">Encrypted messaging keeps sensitive property data private.</p>
            <ul className="partner-list">
              {partners.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className={`partner-button ${selected === item.id ? 'partner-button--active' : ''}`}
                  >
                    <span className="partner-name">{item.fullName}</span>
                    <span className="partner-role">{item.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="chat-content">
            {partner ? (
              <>
                <header className="chat-header">
                  <div>
                    <h2>{partner.fullName}</h2>
                    <span className="chip">{partner.role}</span>
                  </div>
                  <div className="chat-tools">
                    <button type="button" className="cta-secondary" onClick={() => fileInputRef.current?.click()}>
                      Share file securely
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="sr-only"
                      onChange={handleFileUpload}
                    />
                  </div>
                </header>
                {policyWarning ? (
                  <div className="chat-policy-banner" role="status">
                    <strong>ConveySafe reminder:</strong> {policyWarning}
                  </div>
                ) : null}
                <div className="chat-thread" ref={threadRef}>
                  {hasMore ? (
                    <div className="chat-thread__loader">
                      <button
                        type="button"
                        onClick={handleLoadOlder}
                        className="cta-secondary"
                        disabled={isLoadingMore}
                      >
                        {isLoadingMore ? 'Loading history…' : 'Load earlier messages'}
                      </button>
                    </div>
                  ) : null}
                  {isLoading ? (
                    <div className="chat-thread__status" role="status">
                      Loading conversation…
                    </div>
                  ) : null}
                  {!isLoading && messages.length === 0 ? (
                    <div className="chat-thread__status" role="status">
                      No messages yet. Start the conversation with a secure note.
                    </div>
                  ) : null}
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`chat-message ${message.senderId === user.id ? 'chat-message--mine' : ''}`}
                    >
                      <div className="chat-meta">
                        <span>{message.senderId === user.id ? 'You' : partner.fullName}</span>
                        <time dateTime={message.createdAt}>
                          {new Date(message.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p>{message.body}</p>
                      {message.attachments.length ? (
                        <ul className="attachment-list">
                          {message.attachments.map((attachment) => (
                            <li key={attachment.id}>
                              <a href={`/api/chat/download?id=${attachment.id}`}>{attachment.filename}</a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
                <form className="chat-composer" onSubmit={handleSend}>
                  <label htmlFor="message" className="sr-only">
                    Message
                  </label>
                  <textarea
                    id="message"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    className="input input--multiline"
                    rows={3}
                    placeholder="Type your secure message"
                  />
                  <button type="submit" className="cta-primary" disabled={status === 'sending'}>
                    {status === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                </form>
              </>
            ) : (
              <div className="chat-placeholder">No partners available for your role yet.</div>
            )}
          </div>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<ChatProps> = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (!user) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }
  return { props: { user } }
}

export default ChatPage
