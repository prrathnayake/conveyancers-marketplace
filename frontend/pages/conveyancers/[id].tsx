import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'

import type { SessionUser } from '../../lib/session'
import { getSessionFromRequest } from '../../lib/session'
import { listConveyancerReviews } from '../../lib/reviews'
import { usePerspective } from '../../context/PerspectiveContext'

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
  profileImage: string | null
  jobHistory: Array<{
    matterType: string
    completedAt: string
    location: string
    summary: string
    clients: string
  }>
  documentBadges: Array<{
    label: string
    status: 'valid' | 'expiring' | 'expired'
    reference: string
    lastVerified: string
    expiresAt: string | null
  }>
}

type ConveyancerReview = {
  id: number
  reviewerName: string
  rating: number
  comment: string
  createdAt: string
}

type ConveyancerProfilePageProps = {
  profile: ConveyancerProfile
  viewer: SessionUser | null
  reviews: ConveyancerReview[]
}

const renderStars = (rating: number): string => {
  const rounded = Math.round(rating)
  return '★'.repeat(rounded).padEnd(5, '☆')
}

const formatDateOnly = (value: string | null | undefined): string => {
  if (!value) {
    return '—'
  }
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toLocaleDateString()
  } catch {
    return value
  }
}

const formatBadgeStatus = (status: ConveyancerProfile['documentBadges'][number]['status']): string => {
  if (status === 'valid') return 'Valid'
  if (status === 'expiring') return 'Expiring soon'
  return 'Expired'
}

const ConveyancerProfilePage = ({ profile, viewer, reviews: initialReviews }: ConveyancerProfilePageProps): JSX.Element => {
  const router = useRouter()
  const { perspective } = usePerspective()
  const [status, setStatus] = useState<'idle' | 'starting' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [averageRating, setAverageRating] = useState<number>(profile.rating)
  const [reviewCount, setReviewCount] = useState<number>(profile.reviewCount)
  const [reviews, setReviews] = useState<ConveyancerReview[]>(initialReviews)
  const [reviewsLoading, setReviewsLoading] = useState<boolean>(false)
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  const [allReviewsLoaded, setAllReviewsLoaded] = useState<boolean>(reviewCount <= initialReviews.length)
  const [reviewSubmitStatus, setReviewSubmitStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error' | 'unauthorized' | 'not_allowed' | 'duplicate'
  >('idle')
  const [reviewForm, setReviewForm] = useState<{ reviewerName: string; rating: number; comment: string }>(() => ({
    reviewerName: viewer?.fullName ?? '',
    rating: 5,
    comment: '',
  }))

  const allowedRoles: SessionUser['role'][] = ['buyer', 'seller', 'admin']
  const canViewerStartChat = Boolean(
    viewer && viewer.id !== profile.userId && allowedRoles.includes(viewer.role),
  )
  const canViewerReview = Boolean(viewer && (viewer.role === 'buyer' || viewer.role === 'seller'))

  const fetchReviews = async (limit?: number) => {
    const query = limit ? `&limit=${limit}` : ''
    const response = await fetch(`/api/reviews?conveyancerId=${profile.userId}${query}`)
    if (!response.ok) {
      throw new Error('fetch_failed')
    }
    const data = (await response.json()) as { reviews: ConveyancerReview[] }
    setReviews(data.reviews)
    if (typeof limit === 'number') {
      setAllReviewsLoaded(reviewCount <= data.reviews.length)
    } else {
      setAllReviewsLoaded(data.reviews.length >= reviewCount)
    }
    return data
  }

  const handleLoadAllReviews = async () => {
    setReviewsLoading(true)
    setReviewsError(null)
    try {
      await fetchReviews()
    } catch (loadError) {
      console.error(loadError)
      setReviewsError('Unable to load additional reviews right now. Please try again shortly.')
    } finally {
      setReviewsLoading(false)
    }
  }

  const handleShowLatestReviews = async () => {
    setReviewsLoading(true)
    setReviewsError(null)
    try {
      await fetchReviews(5)
    } catch (loadError) {
      console.error(loadError)
      setReviewsError('Unable to refresh recent reviews right now.')
    } finally {
      setReviewsLoading(false)
    }
  }

  const handleSubmitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setReviewSubmitStatus('submitting')
    setReviewsError(null)
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conveyancerId: profile.userId,
          reviewerName: reviewForm.reviewerName.trim() ? reviewForm.reviewerName : undefined,
          rating: reviewForm.rating,
          comment: reviewForm.comment,
        }),
      })
      if (response.status === 401) {
        setReviewSubmitStatus('unauthorized')
        return
      }
      if (response.status === 403) {
        setReviewSubmitStatus('not_allowed')
        return
      }
      if (response.status === 409) {
        setReviewSubmitStatus('duplicate')
        return
      }
      if (!response.ok) {
        throw new Error('submit_failed')
      }

      const nextCount = reviewCount + 1
      const nextAverage = ((averageRating * reviewCount) + reviewForm.rating) / nextCount
      setReviewCount(nextCount)
      setAverageRating(Number.isFinite(nextAverage) ? nextAverage : reviewForm.rating)
      await fetchReviews(allReviewsLoaded ? undefined : 5)
      setReviewForm({ reviewerName: viewer?.fullName ?? '', rating: 5, comment: '' })
      setReviewSubmitStatus('success')
    } catch (submitError) {
      console.error(submitError)
      setReviewSubmitStatus('error')
    }
  }

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
        body: JSON.stringify({ partnerId: profile.userId, perspective }),
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
          <div className="profile-card__identity">
            <p className="profile-card__badge">
              {profile.verified ? 'Verified conveyancer' : 'Awaiting ConveySafe verification'}
            </p>
            <h1 id="profile-heading">{profile.firmName}</h1>
            <p className="profile-card__lead">Led by {profile.fullName}</p>
            <p className="profile-card__location">
              {profile.suburb}, {profile.state}
            </p>
          </div>
          {profile.profileImage ? (
            <div className="profile-card__photo">
              <img src={profile.profileImage} alt={`${profile.firmName} profile`} />
            </div>
          ) : null}
          <div className="profile-card__rating" aria-label={`Rated ${averageRating.toFixed(1)} out of 5`}>
            <span aria-hidden="true">{renderStars(averageRating)}</span>
            <strong>{averageRating.toFixed(1)}</strong>
            <span>{reviewCount} review{reviewCount === 1 ? '' : 's'}</span>
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
              <section aria-label="Client reviews" className="profile-reviews">
                <div className="profile-reviews__header">
                  <h3>Recent client reviews</h3>
                  <div className="profile-reviews__summary" aria-live="polite">
                    <span className="profile-reviews__rating" aria-label={`Rated ${averageRating.toFixed(1)} out of 5`}>
                      <span aria-hidden="true">{renderStars(averageRating)}</span>
                      <strong>{averageRating.toFixed(1)}</strong>
                    </span>
                    <span className="profile-reviews__count">
                      {reviewCount} review{reviewCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                {reviewsError ? (
                  <p className="profile-reviews__error" role="alert">
                    {reviewsError}
                  </p>
                ) : null}
                {reviews.length > 0 ? (
                  <ul className="profile-reviews__list">
                    {reviews.map((review) => (
                      <li key={review.id} className="profile-review">
                        <header className="profile-review__header">
                          <span className="profile-review__rating" aria-label={`${review.rating} out of 5`}>
                            <span aria-hidden="true">{renderStars(review.rating)}</span>
                          </span>
                          <time className="profile-review__date" dateTime={review.createdAt}>
                            {formatDateOnly(review.createdAt)}
                          </time>
                        </header>
                        <p className="profile-review__comment">{review.comment}</p>
                        <footer className="profile-review__footer">— {review.reviewerName}</footer>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="profile-card__empty">No client reviews have been published yet.</p>
                )}
                <div className="profile-reviews__actions">
                  {reviewCount > reviews.length ? (
                    <button
                      type="button"
                      className="profile-reviews__toggle"
                      onClick={() => void handleLoadAllReviews()}
                      disabled={reviewsLoading}
                    >
                      {reviewsLoading ? 'Loading reviews…' : `View all ${reviewCount} reviews`}
                    </button>
                  ) : null}
                  {allReviewsLoaded && reviewCount > 5 ? (
                    <button
                      type="button"
                      className="profile-reviews__toggle"
                      onClick={() => void handleShowLatestReviews()}
                      disabled={reviewsLoading}
                    >
                      {reviewsLoading ? 'Refreshing…' : 'Show latest 5'}
                    </button>
                  ) : null}
                </div>
                {canViewerReview ? (
                  <form className="profile-review-form" onSubmit={handleSubmitReview}>
                    <h4>Share your experience</h4>
                    <label className="profile-review-form__label" htmlFor="profile-review-name">
                      Display name (optional)
                    </label>
                    <input
                      id="profile-review-name"
                      className="input"
                      value={reviewForm.reviewerName}
                      onChange={(event) => {
                        setReviewForm((current) => ({ ...current, reviewerName: event.target.value }))
                        setReviewSubmitStatus('idle')
                      }}
                      placeholder={viewer?.fullName ?? 'Your name'}
                    />
                    <label className="profile-review-form__label" htmlFor="profile-review-rating">
                      Rating
                    </label>
                    <select
                      id="profile-review-rating"
                      className="input"
                      value={reviewForm.rating}
                      onChange={(event) => {
                        setReviewForm((current) => ({ ...current, rating: Number(event.target.value) }))
                        setReviewSubmitStatus('idle')
                      }}
                    >
                      {[5, 4, 3, 2, 1].map((value) => (
                        <option key={value} value={value}>
                          {value} — {value === 1 ? 'Poor' : value === 5 ? 'Excellent' : 'Good'}
                        </option>
                      ))}
                    </select>
                    <label className="profile-review-form__label" htmlFor="profile-review-comment">
                      Feedback
                    </label>
                    <textarea
                      id="profile-review-comment"
                      className="input input--multiline"
                      rows={4}
                      value={reviewForm.comment}
                      onChange={(event) => {
                        setReviewForm((current) => ({ ...current, comment: event.target.value }))
                        setReviewSubmitStatus('idle')
                      }}
                      placeholder="Describe how this conveyancer supported your settlement."
                    />
                    <div className="profile-review-form__actions">
                      <button type="submit" className="cta-secondary" disabled={reviewSubmitStatus === 'submitting'}>
                        {reviewSubmitStatus === 'submitting' ? 'Submitting…' : 'Submit review'}
                      </button>
                      {reviewSubmitStatus === 'success' ? (
                        <p className="status status--success">Thank you! Your review has been published.</p>
                      ) : null}
                      {reviewSubmitStatus === 'error' ? (
                        <p className="status status--error">We could not submit your review. Please try again.</p>
                      ) : null}
                      {reviewSubmitStatus === 'unauthorized' ? (
                        <p className="status status--error">Sign in to publish your review.</p>
                      ) : null}
                      {reviewSubmitStatus === 'not_allowed' ? (
                        <p className="status status--error">
                          Reviews are available once your engagement is completed or cancelled.
                        </p>
                      ) : null}
                      {reviewSubmitStatus === 'duplicate' ? (
                        <p className="status status--error">A review for your latest job is already recorded.</p>
                      ) : null}
                    </div>
                  </form>
                ) : (
                  <p className="profile-card__note" role="note">
                    Only buyers and sellers can publish reviews once their job has been completed or cancelled.
                  </p>
                )}
              </section>
              <section aria-label="Recent matters" className="profile-history">
                <h3>Recent matters delivered</h3>
                {profile.jobHistory.length > 0 ? (
                  <ul>
                    {profile.jobHistory.map((item, index) => (
                      <li key={`${item.matterType}-${item.completedAt}-${index}`} className="profile-history__item">
                        <header className="profile-history__header">
                          <h4>{item.matterType}</h4>
                          <span>
                            {formatDateOnly(item.completedAt)} · {item.location}
                          </span>
                        </header>
                        <p>{item.summary}</p>
                        <p className="profile-history__clients">Clients: {item.clients}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="profile-card__empty">No matters published yet.</p>
                )}
              </section>
              <section aria-label="Compliance badges" className="profile-badges">
                <h3>Document badges</h3>
                {profile.documentBadges.length > 0 ? (
                  <ul>
                    {profile.documentBadges.map((badge) => (
                      <li key={badge.reference} className={`profile-badge profile-badge--${badge.status}`}>
                        <div>
                          <h4>{badge.label}</h4>
                          <p className="profile-badge__reference">Reference: {badge.reference}</p>
                        </div>
                        <dl>
                          <div>
                            <dt>Status</dt>
                            <dd>{formatBadgeStatus(badge.status)}</dd>
                          </div>
                          <div>
                            <dt>Last verified</dt>
                            <dd>{formatDateOnly(badge.lastVerified)}</dd>
                          </div>
                          <div>
                            <dt>Expires</dt>
                            <dd>{formatDateOnly(badge.expiresAt)}</dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="profile-card__empty">No document evidence submitted yet.</p>
                )}
              </section>
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
  const {
    parseId,
    findConveyancerProfile,
    buildConveyancerProfile,
    isJurisdictionRestricted,
    getConveyancerJobHistory,
    getConveyancerDocumentBadges,
  } = await import(
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

  const history = getConveyancerJobHistory(id)
  const badges = getConveyancerDocumentBadges(id)
  const profile = buildConveyancerProfile(row, viewer, history, badges)
  const reviews = listConveyancerReviews(id, { limit: 5 })
  return { props: { profile, viewer, reviews } }
}

export default ConveyancerProfilePage
