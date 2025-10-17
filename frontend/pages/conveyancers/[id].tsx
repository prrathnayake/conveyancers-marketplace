import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'

import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'

type ConveyancerProfile = {
  id: string
  userId: number
  fullName: string
  firmName: string
  bio: string
  state: string
  suburb: string
  website: string
  remoteFriendly: boolean
  turnaround: string
  responseTime: string
  specialties: string[]
  verified: boolean
  rating: number
  reviewCount: number
  contactPhone: string | null
  hasContactAccess: boolean
  jurisdictionRestricted: boolean
}

type ConveyancerProfilePageProps = {
  profile: ConveyancerProfile
  viewer: SessionUser | null
}

const renderStars = (rating: number): string => {
  const rounded = Math.round(rating)
  return '★'.repeat(rounded).padEnd(5, '☆')
}

const ConveyancerProfilePage = ({ profile, viewer }: ConveyancerProfilePageProps): JSX.Element => {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'starting' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const allowedRoles: SessionUser['role'][] = ['buyer', 'seller', 'admin']
  const canViewerStartChat = Boolean(
    viewer && viewer.id !== profile.userId && allowedRoles.includes(viewer.role),
  )

  const handleStartChat = async () => {
    if (!viewer) {
      await router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    if (!canViewerStartChat) {
      setStatus('error')
      setError(
        viewer.id === profile.userId
          ? 'You already manage this conveyancer profile.'
          : 'Secure chat is available to buyers, sellers, and admins only.',
      )
      return
    }
    setStatus('starting')
    setError(null)
    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: profile.userId }),
      })
      if (!response.ok) {
        const message =
          response.status === 403
            ? 'Secure chat is only available between conveyancers and verified clients.'
            : 'Unable to open conversation'
        throw new Error(message)
      }
      await router.push(`/chat?partnerId=${profile.userId}`)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unexpected error')
    }
  }

  return (
    <>
      <Head>
        <title>{profile.firmName} · Conveyancer profile</title>
        <meta
          name="description"
          content={`Review ${profile.firmName}'s verified experience, specialties, and response times before engaging securely.`}
        />
      </Head>
      <main className="page">
        <article className="profile-card" aria-labelledby="profile-heading">
          <header className="profile-card__header">
            <div>
              <p className="profile-card__badge">
                {profile.verified ? 'Verified conveyancer' : 'Awaiting ConveySafe verification'}
              </p>
              <h1 id="profile-heading">{profile.firmName}</h1>
              <p className="profile-card__lead">Led by {profile.fullName}</p>
              <p className="profile-card__location">
                {profile.suburb}, {profile.state}
              </p>
            </div>
            <div className="profile-card__rating" aria-label={`Rated ${profile.rating.toFixed(1)} out of 5`}>
              <span aria-hidden="true">{renderStars(profile.rating)}</span>
              <strong>{profile.rating.toFixed(1)}</strong>
              <span>{profile.reviewCount} review{profile.reviewCount === 1 ? '' : 's'}</span>
            </div>
          </header>
          <section className="profile-card__body">
            <div className="profile-card__primary">
              {profile.jurisdictionRestricted ? (
                <p className="profile-card__note" role="note">
                  This listing is hidden from buyers and sellers until ConveySafe verification is completed.
                </p>
              ) : null}
              <h2>About</h2>
              <p>{profile.bio || 'This conveyancer is finalising their compliance bio.'}</p>
              <h3>Specialties</h3>
              {profile.specialties.length > 0 ? (
                <ul className="profile-specialties">
                  {profile.specialties.map((specialty) => (
                    <li key={specialty}>{specialty}</li>
                  ))}
                </ul>
              ) : (
                <p className="profile-card__empty">No specialties listed yet.</p>
              )}
              <div className="profile-card__meta">
                <dl>
                  <div>
                    <dt>Average turnaround</dt>
                    <dd>{profile.turnaround || 'Within 3 business days'}</dd>
                  </div>
                  <div>
                    <dt>Typical response time</dt>
                    <dd>{profile.responseTime || 'Under 24 hours'}</dd>
                  </div>
                  <div>
                    <dt>Works remotely</dt>
                    <dd>{profile.remoteFriendly ? 'Yes' : 'By appointment'}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <aside className="profile-card__sidebar" aria-label="Engagement options">
              <div className="profile-contact">
                <h2>Engage securely</h2>
                <p>
                  Keep messages, invoices, and milestone approvals inside ConveySafe to protect both parties with escrow and audit
                  trails.
                </p>
                <button
                  type="button"
                  className="cta-primary"
                  onClick={() => void handleStartChat()}
                  disabled={status === 'starting'}
                >
                  {viewer
                    ? status === 'starting'
                      ? 'Opening chat…'
                      : canViewerStartChat
                        ? 'Start secure chat'
                        : 'Secure chat unavailable'
                    : 'Sign in to chat'}
                </button>
                {error ? (
                  <p className="profile-card__error" role="alert">
                    {error}
                  </p>
                ) : null}
                <dl className="profile-contact__details">
                  <div>
                    <dt>Phone</dt>
                    <dd>{profile.contactPhone ? profile.contactPhone : 'Shared once both parties are in secure chat.'}</dd>
                  </div>
                  {profile.website ? (
                    <div>
                      <dt>Website</dt>
                      <dd>
                        <a href={profile.website} target="_blank" rel="noreferrer">
                          {profile.website}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <p className="profile-card__note">
                  Contact details stay masked until you engage through escrow-protected chat, keeping the audit trail intact.
                </p>
                {viewer && !canViewerStartChat ? (
                  <p className="profile-card__note" role="note">
                    Only buyers, sellers, and admins can initiate secure chat with a conveyancer.
                  </p>
                ) : null}
              </div>
              <div className="profile-card__support">
                <h3>Need help?</h3>
                <p>
                  Our compliance team can assist with escrow releases, cancellations, and dispute mediation 7 days a week.
                </p>
                <Link href="/contact-us" className="cta-secondary">
                  Contact support
                </Link>
              </div>
            </aside>
          </section>
        </article>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<ConveyancerProfilePageProps> = async ({ req, res, params }) => {
  const { parseId, findConveyancerProfile, buildConveyancerProfile, isJurisdictionRestricted } = await import(
    '../api/profiles/[id]'
  )
  const viewer = getSessionFromRequest(req)
  const id = parseId(params?.id)

  if (!id) {
    res.statusCode = 404
    return { notFound: true }
  }

  const row = findConveyancerProfile(id)

  if (!row) {
    res.statusCode = 404
    return { notFound: true }
  }

  const restricted = isJurisdictionRestricted(row)
  const canBypassRestriction = Boolean(viewer && (viewer.role === 'admin' || viewer.id === row.id))
  if (restricted && !canBypassRestriction) {
    res.statusCode = 404
    return { notFound: true }
  }

  const profile = buildConveyancerProfile(row, viewer)
  return { props: { profile, viewer } }
}

export default ConveyancerProfilePage
