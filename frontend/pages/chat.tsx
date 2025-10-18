import Head from 'next/head'
import { useRouter } from 'next/router'
import type { GetServerSideProps } from 'next'
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionUser } from '../lib/session'
import { getSessionFromRequest } from '../lib/session'
import { SENSITIVE_RISK_THRESHOLD } from '../lib/ml/sensitive'

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

type Invoice = {
  id: number
  conversationId: number
  creatorId: number
  recipientId: number
  amountCents: number
  currency: string
  description: string
  status: string
  serviceFeeCents: number
  escrowCents: number
  refundedCents: number
  createdAt: string
  acceptedAt: string | null
  releasedAt: string | null
  cancelledAt: string | null
}

type CallSession = {
  id: number
  conversationId: number
  type: 'voice' | 'video'
  status: string
  joinUrl: string
  accessToken: string
  createdBy: number
  createdAt: string
}

type MessageResponse = {
  conversationId: number
  messages: Message[]
  hasMore: boolean
  nextCursor: number | null
  invoices: Invoice[]
}

const ChatPage = ({ user }: ChatProps): JSX.Element => {
  const router = useRouter()
  const [partners, setPartners] = useState<Partner[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [callSessions, setCallSessions] = useState<CallSession[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending'>('idle')
  const [policyWarning, setPolicyWarning] = useState<string | null>(null)
  const [mlAssessment, setMlAssessment] = useState<{ score: number; indicators: string[] } | null>(null)
  const [settings, setSettings] = useState<{ serviceFeeRate: number; escrowAccountName: string }>({
    serviceFeeRate: 0.05,
    escrowAccountName: 'ConveySafe Trust Account',
  })
  const [showInvoiceComposer, setShowInvoiceComposer] = useState(false)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDescription, setInvoiceDescription] = useState('')
  const [invoiceStatus, setInvoiceStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [pendingInvoiceId, setPendingInvoiceId] = useState<number | null>(null)
  const [invoiceActionError, setInvoiceActionError] = useState<{ id: number; message: string } | null>(null)
  const [callStatus, setCallStatus] = useState<'idle' | 'creating'>('idle')
  const [callError, setCallError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)

  const fetchPartners = useCallback(async (): Promise<Partner[]> => {
    const response = await fetch('/api/chat/partners')
    if (!response.ok) {
      return []
    }
    const payload = (await response.json()) as { partners: Partner[] }
    setPartners(payload.partners)
    return payload.partners
  }, [])

  useEffect(() => {
    const load = async () => {
      const partnersList = await fetchPartners()
      if (partnersList.length > 0) {
        setSelected((current) => current ?? partnersList[0].id)
      }
    }
    void load()
  }, [fetchPartners])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/platform/settings')
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as { settings?: Record<string, string> }
        const rate = Number(payload.settings?.serviceFeeRate ?? 0.05)
        setSettings({
          serviceFeeRate: Number.isFinite(rate) ? rate : 0.05,
          escrowAccountName: payload.settings?.escrowAccountName ?? 'ConveySafe Trust Account',
        })
      } catch (error) {
        console.error(error)
      }
    }
    void loadSettings()
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
        setInvoices(payload.invoices ?? [])
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
      setInvoices([])
      setHasMore(false)
      setCursor(null)
      setPolicyWarning(null)
      setMlAssessment(null)
      setShowInvoiceComposer(false)
      setInvoiceActionError(null)
      setPendingInvoiceId(null)
      setCallSessions([])
      setCallError(null)
      return
    }
    const controller = new AbortController()
    void loadConversation({ signal: controller.signal })
    return () => controller.abort()
  }, [loadConversation, selected])

  const loadCallSessions = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (!selected) {
        return null
      }
      try {
        setCallError(null)
        const params = new URLSearchParams({ partnerId: selected.toString() })
        const response = await fetch(`/api/chat/calls?${params.toString()}`, { signal })
        if (!response.ok) {
          throw new Error('failed_to_fetch_calls')
        }
        const payload = (await response.json()) as { callSessions: CallSession[] }
        setCallSessions(payload.callSessions)
        return payload
      } catch (error) {
        if (signal?.aborted) {
          return null
        }
        console.error(error)
        setCallError('Unable to load call history right now.')
        return null
      }
    },
    [selected]
  )

  useEffect(() => {
    if (!selected) {
      return
    }
    const controller = new AbortController()
    void loadCallSessions({ signal: controller.signal })
    return () => controller.abort()
  }, [loadCallSessions, selected])

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
      const payload = (await response.json()) as {
        policyWarning?: string
        mlRiskScore?: number
        mlIndicators?: string[]
      }
      setInput('')
      setPolicyWarning(payload.policyWarning ?? null)
      const mlScore = Number(payload.mlRiskScore ?? 0)
      if (Number.isFinite(mlScore) && mlScore >= SENSITIVE_RISK_THRESHOLD) {
        setMlAssessment({ score: mlScore, indicators: payload.mlIndicators ?? [] })
      } else {
        setMlAssessment(null)
      }
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
      setInvoices(payload.invoices ?? [])
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

  const handleScheduleCall = async (type: 'voice' | 'video') => {
    if (!selected || callStatus === 'creating') {
      return
    }
    setCallStatus('creating')
    setCallError(null)
    try {
      const response = await fetch('/api/chat/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: selected, type }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { callSession?: CallSession; error?: string }
        | null
      if (!response.ok || !payload?.callSession) {
        throw new Error(payload?.error ?? 'Unable to create call session')
      }
      setCallSessions((prev) => {
        const filtered = prev.filter((session) => session.id !== payload.callSession?.id)
        return [payload.callSession as CallSession, ...filtered]
      })
    } catch (error) {
      console.error(error)
      setCallError(error instanceof Error ? error.message : 'Unable to create call session')
    } finally {
      setCallStatus('idle')
    }
  }

  const partner = partners.find((item) => item.id === selected) ?? null

  const threadItems = useMemo(() => {
    const mappedMessages = messages.map((message) => ({
      kind: 'message' as const,
      id: `message-${message.id}`,
      createdAt: message.createdAt,
      message,
    }))
    const mappedInvoices = invoices.map((invoice) => ({
      kind: 'invoice' as const,
      id: `invoice-${invoice.id}`,
      createdAt: invoice.createdAt,
      invoice,
    }))
    return [...mappedMessages, ...mappedInvoices].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return aTime - bTime
    })
  }, [invoices, messages])

  const formatCurrency = useCallback((amountCents: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountCents / 100)
    } catch {
      return `$${(amountCents / 100).toFixed(2)}`
    }
  }, [])

  const formatDateTime = useCallback((value: string) => {
    try {
      return new Intl.DateTimeFormat('en-AU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    } catch {
      return value
    }
  }, [])

  const handleInvoiceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) {
      return
    }
    setInvoiceStatus('submitting')
    setInvoiceError(null)
    const amountValue = Number(invoiceAmount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setInvoiceError('Enter a valid amount greater than zero')
      setInvoiceStatus('error')
      return
    }
    try {
      const response = await fetch('/api/chat/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: selected, amount: amountValue, description: invoiceDescription }),
      })
      if (!response.ok) {
        throw new Error('Unable to create invoice')
      }
      setInvoiceStatus('idle')
      setInvoiceAmount('')
      setInvoiceDescription('')
      setShowInvoiceComposer(false)
      await loadConversation({ silent: true })
      await fetchPartners()
    } catch (error) {
      console.error(error)
      setInvoiceStatus('error')
      setInvoiceError(error instanceof Error ? error.message : 'Unexpected error')
    }
  }

  const handleInvoiceAction = async (invoiceId: number, action: 'accept' | 'cancel' | 'release') => {
    setPendingInvoiceId(invoiceId)
    setInvoiceActionError(null)
    try {
      const response = await fetch('/api/chat/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, action }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Unable to update invoice')
      }
      await loadConversation({ silent: true })
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Unable to update invoice'
      setInvoiceActionError({ id: invoiceId, message })
    } finally {
      setPendingInvoiceId(null)
    }
  }

  useEffect(() => {
    if (!router.isReady) {
      return
    }
    const partnerParam = router.query.partnerId
    const partnerId = Array.isArray(partnerParam) ? Number(partnerParam[0]) : Number(partnerParam)
    if (!partnerParam || Number.isNaN(partnerId)) {
      return
    }
    const ensureConversation = async () => {
      try {
        await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partnerId }),
        })
      } catch (error) {
        console.error(error)
      } finally {
        await fetchPartners()
        setSelected(partnerId)
      }
    }
    void ensureConversation()
  }, [fetchPartners, router.isReady, router.query.partnerId])

  const renderInvoiceStatus = (invoice: Invoice): string => {
    switch (invoice.status) {
      case 'sent':
        return 'Awaiting acceptance'
      case 'accepted':
        return `Funds held in ${settings.escrowAccountName}`
      case 'released':
        return 'Funds released to conveyancer'
      case 'cancelled':
        return invoice.refundedCents > 0 ? 'Cancelled – refund initiated' : 'Cancelled'
      default:
        return invoice.status
    }
  }

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
                    {user.role === 'conveyancer' || user.role === 'admin' ? (
                      <button
                        type="button"
                        className="cta-secondary"
                        onClick={() => setShowInvoiceComposer((prev) => !prev)}
                      >
                        {showInvoiceComposer ? 'Close invoice' : 'Issue invoice'}
                      </button>
                    ) : null}
                  </div>
                </header>
                <section className="chat-call-panel" aria-label="Voice and video calls">
                  <div className="chat-call-panel__actions">
                    <button
                      type="button"
                      className="cta-secondary"
                      onClick={() => void handleScheduleCall('voice')}
                      disabled={callStatus === 'creating'}
                    >
                      {callStatus === 'creating' ? 'Scheduling…' : 'Start voice call'}
                    </button>
                    <button
                      type="button"
                      className="cta-secondary"
                      onClick={() => void handleScheduleCall('video')}
                      disabled={callStatus === 'creating'}
                    >
                      {callStatus === 'creating' ? 'Scheduling…' : 'Start video call'}
                    </button>
                  </div>
                  <p className="chat-call-panel__hint">
                    Each call issues a secure join link and short-lived access token for every participant.
                  </p>
                  {callError ? (
                    <p className="chat-call-panel__error" role="alert">
                      {callError}
                    </p>
                  ) : null}
                  {callSessions.length ? (
                    <ul className="chat-call-panel__list">
                      {callSessions.map((session) => (
                        <li key={session.id} className="chat-call-panel__item">
                          <div className="chat-call-panel__header">
                            <strong>{session.type === 'voice' ? 'Voice call' : 'Video call'}</strong>
                            <span className="chat-call-panel__status">{session.status}</span>
                          </div>
                          <p className="chat-call-panel__meta">Issued {formatDateTime(session.createdAt)}</p>
                          <p className="chat-call-panel__meta">
                            Join:{' '}
                            <a href={session.joinUrl} target="_blank" rel="noreferrer">
                              {session.joinUrl}
                            </a>
                          </p>
                          <p className="chat-call-panel__meta">
                            Access token: <code>{session.accessToken}</code>
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="chat-call-panel__empty">
                      No calls scheduled yet. Launch a voice or video session to collaborate instantly.
                    </p>
                  )}
                </section>
                {policyWarning ? (
                  <div className="chat-policy-banner" role="status">
                    <strong>ConveySafe reminder:</strong> {policyWarning}
                  </div>
                ) : null}
                {mlAssessment ? (
                  <div className="chat-ml-banner" role="status">
                    <strong>Machine learning alert:</strong>{' '}
                    Risk score {Math.round(Math.min(Math.max(mlAssessment.score, 0), 1) * 100)}% for sensitive content.
                    {mlAssessment.indicators.length ? (
                      <ul>
                        {mlAssessment.indicators.map((indicator, index) => (
                          <li key={`${indicator}-${index}`}>{indicator}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {showInvoiceComposer ? (
                  <form className="chat-invoice-composer" onSubmit={handleInvoiceSubmit}>
                    <div className="chat-invoice-composer__row">
                      <label htmlFor="invoice-amount">Amount (AUD)</label>
                      <input
                        id="invoice-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={invoiceAmount}
                        onChange={(event) => setInvoiceAmount(event.target.value)}
                        required
                      />
                    </div>
                    <div className="chat-invoice-composer__row">
                      <label htmlFor="invoice-description">Summary</label>
                      <textarea
                        id="invoice-description"
                        rows={2}
                        value={invoiceDescription}
                        onChange={(event) => setInvoiceDescription(event.target.value)}
                        placeholder="e.g. Contract review and settlement prep"
                      />
                    </div>
                    <p className="chat-invoice-composer__meta">
                      Platform service fee of {(settings.serviceFeeRate * 100).toFixed(1)}% is withheld on acceptance.
                    </p>
                    <div className="chat-invoice-composer__actions">
                      <button type="submit" className="cta-primary" disabled={invoiceStatus === 'submitting'}>
                        {invoiceStatus === 'submitting' ? 'Creating…' : 'Send invoice'}
                      </button>
                      {invoiceStatus === 'error' && invoiceError ? (
                        <span className="chat-invoice-composer__error">{invoiceError}</span>
                      ) : null}
                    </div>
                  </form>
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
                  {threadItems.map((item) => {
                    if (item.kind === 'message') {
                      const message = item.message
                      return (
                        <article
                          key={item.id}
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
                      )
                    }
                    const invoice = item.invoice
                    const isCreator = invoice.creatorId === user.id
                    const isRecipient = invoice.recipientId === user.id
                    const canAccept = invoice.status === 'sent' && isRecipient
                    const canCancel = (invoice.status === 'sent' || invoice.status === 'accepted') && (isCreator || isRecipient || user.role === 'admin')
                    const canRelease = invoice.status === 'accepted' && (isCreator || user.role === 'admin')
                    return (
                      <article key={item.id} className="chat-invoice" aria-live="polite">
                        <header className="chat-invoice__header">
                          <div>
                            <h3>Invoice {invoice.id}</h3>
                            <p>{invoice.description || 'Matter invoice'}</p>
                          </div>
                          <div className="chat-invoice__figure">
                            <strong>{formatCurrency(invoice.amountCents, invoice.currency)}</strong>
                            <span>{renderInvoiceStatus(invoice)}</span>
                          </div>
                        </header>
                        <dl className="chat-invoice__details">
                          <div>
                            <dt>Issued</dt>
                            <dd>{new Date(invoice.createdAt).toLocaleString()}</dd>
                          </div>
                          {invoice.serviceFeeCents > 0 ? (
                            <div>
                              <dt>Service fee</dt>
                              <dd>{formatCurrency(invoice.serviceFeeCents, invoice.currency)}</dd>
                            </div>
                          ) : null}
                          {invoice.escrowCents > 0 ? (
                            <div>
                              <dt>Escrow hold</dt>
                              <dd>{formatCurrency(invoice.escrowCents, invoice.currency)}</dd>
                            </div>
                          ) : null}
                          {invoice.refundedCents > 0 ? (
                            <div>
                              <dt>Refunded</dt>
                              <dd>{formatCurrency(invoice.refundedCents, invoice.currency)}</dd>
                            </div>
                          ) : null}
                        </dl>
                        <div className="chat-invoice__actions">
                          {canAccept ? (
                            <button
                              type="button"
                              className="cta-primary"
                              onClick={() => void handleInvoiceAction(invoice.id, 'accept')}
                              disabled={pendingInvoiceId === invoice.id}
                            >
                              {pendingInvoiceId === invoice.id ? 'Accepting…' : 'Accept & hold funds'}
                            </button>
                          ) : null}
                          {canRelease ? (
                            <button
                              type="button"
                              className="cta-secondary"
                              onClick={() => void handleInvoiceAction(invoice.id, 'release')}
                              disabled={pendingInvoiceId === invoice.id}
                            >
                              {pendingInvoiceId === invoice.id ? 'Releasing…' : 'Release funds'}
                            </button>
                          ) : null}
                          {canCancel ? (
                            <button
                              type="button"
                              className="cta-secondary"
                              onClick={() => void handleInvoiceAction(invoice.id, 'cancel')}
                              disabled={pendingInvoiceId === invoice.id}
                            >
                              {pendingInvoiceId === invoice.id ? 'Updating…' : 'Cancel invoice'}
                            </button>
                          ) : null}
                        </div>
                        {invoiceActionError?.id === invoice.id ? (
                          <p className="chat-invoice__error" role="alert">
                            {invoiceActionError.message}
                          </p>
                        ) : null}
                      </article>
                    )
                  })}
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
