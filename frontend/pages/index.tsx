import Head from 'next/head'
import Link from 'next/link'
import type { FC, ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { GetServerSideProps } from 'next'

import styles from '../styles/home.module.css'
import type {
  CtaContent,
  FaqItem,
  HeroContent,
  HomepageCopy,
  PersonaContent,
  ResourceLink,
  WorkflowStep,
} from '../lib/homepage'
import useScrollReveal from '../hooks/useScrollReveal'

export type MarketplaceStat = {
  label: string
  value: string
  detail: string
}

type FeatureCard = {
  title: string
  description: string
}

type ProductReview = {
  id: number
  reviewerName: string
  rating: number
  comment: string
  createdAt: string
}

type HomeProps = {
  metaDescription: string
  hero: HeroContent
  personas: PersonaContent[]
  stats: MarketplaceStat[]
  features: FeatureCard[]
  workflow: WorkflowStep[]
  resources: ResourceLink[]
  faqs: FaqItem[]
  copy: HomepageCopy
  cta: CtaContent
  productReviews: ProductReview[]
  productReviewCount: number
  productReviewAverage: number
}

const renderStats = (stats: MarketplaceStat[]) =>
  stats.map((stat) => (
    <div key={stat.label} className={styles.stat}>
      <dt className={styles.statLabel}>{stat.label}</dt>
      <dd className={styles.statValue}>{stat.value}</dd>
      <p className={styles.statDetail}>{stat.detail}</p>
    </div>
  ))

const renderWorkflow = (workflow: WorkflowStep[]) =>
  workflow.map((item, index) => (
    <li key={`${item.step}-${index}`}>
      <span className={styles.workflowStep}>{item.step}</span>
      <div>
        <h3>{item.title}</h3>
        <p>{item.copy}</p>
      </div>
    </li>
  ))

const renderResources = (resources: ResourceLink[]) =>
  resources.map((resource, index) => (
    <li key={`${resource.title}-${index}`} className={styles.resourceCard}>
      <h3>{resource.title}</h3>
      <p>{resource.description}</p>
      <a className={`cta-link ${styles.heroLink}`} href={resource.href} target="_blank" rel="noreferrer">
        Download the resource
      </a>
    </li>
  ))

const renderFaqs = (faqs: FaqItem[]) =>
  faqs.map((item, index) => (
    <div key={`${item.question}-${index}`}>
      <dt>{item.question}</dt>
      <dd>{item.answer}</dd>
    </div>
  ))

const isInternalLink = (href: string): boolean => href.startsWith('/') || href.startsWith('#')

const renderCtaLink = (
  cta: { href: string; label: string },
  className: string,
  variant: 'primary' | 'secondary' | 'link' = 'primary',
) => {
  const baseClass =
    variant === 'primary' ? 'cta-primary' : variant === 'secondary' ? 'cta-secondary' : 'cta-link'
  const composedClass = `${baseClass} ${className}`.trim()
  if (isInternalLink(cta.href)) {
    return (
      <Link href={cta.href} className={composedClass}>
        {cta.label}
      </Link>
    )
  }
  return (
    <a href={cta.href} className={composedClass}>
      {cta.label}
    </a>
  )
}

const renderStars = (rating: number): string => {
  const bounded = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(bounded).padEnd(5, '☆')
}

const formatReviewDate = (value: string): string => {
  if (!value) {
    return ''
  }
  try {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    }
  } catch (error) {
    console.warn('Failed to format review date', error)
  }
  return value
}

const Home: FC<HomeProps> = ({
  metaDescription,
  hero,
  copy,
  personas,
  stats,
  features,
  workflow,
  resources,
  faqs,
  cta,
  productReviews,
  productReviewCount,
  productReviewAverage,
}): ReactElement => {
  const [personaKey, setPersonaKey] = useState<string>(personas[0]?.key ?? '')

  const personaDetails = useMemo(() => personas.find((entry) => entry.key === personaKey) ?? personas[0], [
    personas,
    personaKey,
  ])

  const availablePersonas = useMemo(() => personas.filter((entry) => entry.label && entry.headline), [personas])

  const [reviews, setReviews] = useState<ProductReview[]>(productReviews)
  const [reviewStats, setReviewStats] = useState<{ average: number; count: number }>(() => ({
    average: productReviewAverage,
    count: productReviewCount,
  }))
  const [allReviewsLoaded, setAllReviewsLoaded] = useState<boolean>(productReviewCount <= productReviews.length)
  const [loadingReviews, setLoadingReviews] = useState<boolean>(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{ fullName: string; role: string } | null>(null)
  const [viewerChecked, setViewerChecked] = useState<boolean>(false)
  const [productForm, setProductForm] = useState<{ reviewerName: string; rating: number; comment: string }>(() => ({
    reviewerName: '',
    rating: 5,
    comment: '',
  }))
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'unauthorized'>('idle')
  const { register } = useScrollReveal()

  const applyReviewStats = (stats?: { average?: number; count?: number }) => {
    if (!stats) {
      return
    }
    setReviewStats({
      average: Number(stats.average ?? 0),
      count: Number(stats.count ?? 0),
    })
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/users/me')
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as { fullName: string; role: string }
        if (!cancelled) {
          setViewer({ fullName: data.fullName, role: data.role })
          setProductForm((current) =>
            current.reviewerName.trim().length > 0
              ? current
              : { ...current, reviewerName: data.fullName },
          )
        }
      } catch (error) {
        console.warn('Unable to resolve current user', error)
      } finally {
        if (!cancelled) {
          setViewerChecked(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchReviews = async (limit?: number) => {
    const query = typeof limit === 'number' ? `?limit=${limit}` : ''
    const response = await fetch(`/api/reviews/product${query}`)
    if (!response.ok) {
      throw new Error('fetch_failed')
    }
    const data = (await response.json()) as {
      reviews: ProductReview[]
      stats: { average?: number; count?: number }
    }
    setReviews(data.reviews)
    applyReviewStats(data.stats)
    return data
  }

  const handleLoadAllReviews = async () => {
    setLoadingReviews(true)
    setReviewError(null)
    try {
      const data = await fetchReviews()
      const totalCount = Number(data.stats?.count ?? data.reviews.length)
      setAllReviewsLoaded(data.reviews.length >= totalCount)
    } catch (error) {
      console.error(error)
      setReviewError('Unable to load additional reviews right now. Please try again shortly.')
    } finally {
      setLoadingReviews(false)
    }
  }

  const handleShowLatestReviews = async () => {
    setLoadingReviews(true)
    setReviewError(null)
    try {
      const data = await fetchReviews(5)
      const totalCount = Number(data.stats?.count ?? data.reviews.length)
      setAllReviewsLoaded(totalCount <= data.reviews.length)
    } catch (error) {
      console.error(error)
      setReviewError('Unable to refresh the latest reviews right now.')
    } finally {
      setLoadingReviews(false)
    }
  }

  const handleSubmitProductReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitStatus('submitting')
    setReviewError(null)
    try {
      const response = await fetch('/api/reviews/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: productForm.rating,
          comment: productForm.comment,
          reviewerName: productForm.reviewerName.trim() ? productForm.reviewerName : undefined,
        }),
      })
      if (response.status === 401 || response.status === 403) {
        setSubmitStatus('unauthorized')
        return
      }
      if (!response.ok) {
        throw new Error('submit_failed')
      }
      const data = (await response.json()) as {
        ok: boolean
        stats?: { average?: number; count?: number }
      }
      applyReviewStats(data.stats)
      await fetchReviews(allReviewsLoaded ? undefined : 5)
      setProductForm({
        reviewerName: viewer?.fullName ?? '',
        rating: 5,
        comment: '',
      })
      setSubmitStatus('success')
    } catch (error) {
      console.error(error)
      setSubmitStatus('error')
    }
  }

  return (
    <>
      <Head>
        <title>Conveyancers Marketplace</title>
        <meta name="description" content={metaDescription} />
      </Head>
      <main className={styles.page}>
        <section ref={register} className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroGrid}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>{hero.badge}</div>
              <h1 id="hero-heading" className={styles.heroTitle}>
                {hero.title}
              </h1>
              <p className={styles.heroSubtitle}>{hero.subtitle}</p>
              {availablePersonas.length > 0 ? (
                <div className={styles.personaToggle} role="tablist" aria-label="Select your scenario">
                  {availablePersonas.map((persona) => (
                    <button
                      key={persona.key}
                      type="button"
                      role="tab"
                      aria-selected={personaKey === persona.key}
                      className={`${styles.personaOption} ${
                        personaKey === persona.key ? styles.personaOptionActive : ''
                      }`}
                      onClick={() => setPersonaKey(persona.key)}
                    >
                      {persona.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {personaDetails ? (
                <div className={styles.personaPanel}>
                  <h2 className={styles.personaHeadline}>{personaDetails.headline}</h2>
                  <ul className={styles.personaBenefits}>
                    {personaDetails.benefits.map((benefit, index) => (
                      <li key={`${personaDetails.key}-benefit-${index}`} className={styles.personaBenefit}>
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className={styles.heroActions}>
                {renderCtaLink(hero.primaryCta, styles.heroPrimary)}
                {renderCtaLink(hero.secondaryCta, styles.heroSecondary, 'secondary')}
              </div>
            </div>
            <aside className={styles.heroHighlights} aria-label="Marketplace performance stats">
              <p className={styles.heroHighlightsHeading}>Live marketplace insights</p>
              <dl className={styles.stats} aria-label="Marketplace performance stats">{renderStats(stats)}</dl>
            </aside>
          </div>
        </section>

        <section ref={register} className={styles.features} id="features" aria-label="Platform features">
          <h2 className={styles.sectionHeading}>{copy.featuresHeading}</h2>
          {copy.featuresDescription ? (
            <p className={styles.sectionDescription}>{copy.featuresDescription}</p>
          ) : null}
          <div className={styles.featureGrid}>
            {features.map((feature) => (
              <article key={feature.title} className={styles.featureCard}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section ref={register} className={styles.workflow} id="workflow" aria-label="Settlement workflow">
          <div className={styles.workflowCopy}>
            <h2 className={styles.sectionHeading}>{copy.workflowHeading}</h2>
            <p>{copy.workflowDescription}</p>
            {renderCtaLink(copy.workflowCta, styles.heroLink, 'link')}
          </div>
          <ol className={styles.workflowSteps}>{renderWorkflow(workflow)}</ol>
        </section>

        <section ref={register} className={styles.reviewsSection} aria-label="Marketplace reviews">
          <div className={styles.reviewsHeader}>
            <div>
              <h2 className={styles.sectionHeading}>{copy.testimonialsHeading}</h2>
              {copy.testimonialsDescription ? (
                <p className={styles.sectionDescription}>{copy.testimonialsDescription}</p>
              ) : null}
            </div>
            <div className={styles.reviewsSummary} aria-live="polite">
              <span className={styles.reviewsAverage} aria-label={`Average rating ${reviewStats.average.toFixed(1)} out of 5`}>
                <span aria-hidden="true">{renderStars(reviewStats.average)}</span>
                <strong>{reviewStats.average.toFixed(1)}</strong>
              </span>
              <p>
                {reviewStats.count.toLocaleString()} review{reviewStats.count === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {reviewError ? (
            <p className={`status status--error ${styles.reviewStatus}`} role="alert">
              {reviewError}
            </p>
          ) : null}
          <div className={styles.reviewsGrid}>
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <article key={review.id} className={styles.reviewCard}>
                  <header className={styles.reviewCardHeader}>
                    <span className={styles.reviewRating} aria-label={`${review.rating} out of 5`}>
                      <span aria-hidden="true">{renderStars(review.rating)}</span>
                    </span>
                    <time className={styles.reviewDate} dateTime={review.createdAt}>
                      {formatReviewDate(review.createdAt)}
                    </time>
                  </header>
                  <p className={styles.reviewComment}>{review.comment}</p>
                  <footer className={styles.reviewFooter}>— {review.reviewerName}</footer>
                </article>
              ))
            ) : (
              <p className={styles.reviewEmpty}>No reviews have been published yet.</p>
            )}
          </div>
          <div className={styles.reviewActions}>
            {reviewStats.count > reviews.length ? (
              <button
                type="button"
                className={styles.reviewToggle}
                onClick={() => void handleLoadAllReviews()}
                disabled={loadingReviews}
              >
                {loadingReviews ? 'Loading reviews…' : `View all ${reviewStats.count.toLocaleString()} reviews`}
              </button>
            ) : null}
            {allReviewsLoaded && reviewStats.count > 5 ? (
              <button
                type="button"
                className={styles.reviewToggle}
                onClick={() => void handleShowLatestReviews()}
                disabled={loadingReviews}
              >
                {loadingReviews ? 'Refreshing…' : 'Show latest 5'}
              </button>
            ) : null}
          </div>
          <form className={styles.reviewForm} onSubmit={handleSubmitProductReview}>
            <h3>Share your marketplace experience</h3>
            <label className={styles.reviewLabel} htmlFor="product-review-name">
              Display name (optional)
            </label>
            <input
              id="product-review-name"
              className="input"
              value={productForm.reviewerName}
              onChange={(event) => {
                setProductForm((current) => ({ ...current, reviewerName: event.target.value }))
                setSubmitStatus('idle')
              }}
              placeholder={viewer?.fullName ?? 'Your name'}
            />
            <label className={styles.reviewLabel} htmlFor="product-review-rating">
              Rating
            </label>
            <select
              id="product-review-rating"
              className="input"
              value={productForm.rating}
              onChange={(event) => {
                setProductForm((current) => ({ ...current, rating: Number(event.target.value) }))
                setSubmitStatus('idle')
              }}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} — {value === 1 ? 'Poor' : value === 5 ? 'Excellent' : 'Good'}
                </option>
              ))}
            </select>
            <label className={styles.reviewLabel} htmlFor="product-review-comment">
              Feedback
            </label>
            <textarea
              id="product-review-comment"
              className="input input--multiline"
              rows={4}
              value={productForm.comment}
              onChange={(event) => {
                setProductForm((current) => ({ ...current, comment: event.target.value }))
                setSubmitStatus('idle')
              }}
              placeholder="Describe how Conveyancers Marketplace supported your settlement."
            />
            {viewerChecked && !viewer ? (
              <p className={styles.reviewHint}>
                <Link href="/login">Sign in</Link> to publish your review.
              </p>
            ) : null}
            <div className={styles.reviewFormActions}>
              <button type="submit" className="cta-primary" disabled={submitStatus === 'submitting'}>
                {submitStatus === 'submitting' ? 'Submitting…' : 'Submit review'}
              </button>
              {submitStatus === 'success' ? (
                <p className="status status--success">Thank you! Your review is live.</p>
              ) : null}
              {submitStatus === 'error' ? (
                <p className="status status--error">We could not submit your review. Please try again.</p>
              ) : null}
              {submitStatus === 'unauthorized' ? (
                <p className="status status--error">
                  Please <Link href="/login">sign in</Link> to publish your review.
                </p>
              ) : null}
            </div>
          </form>
        </section>

        <section ref={register} className={styles.resourcesSection} aria-label="Resources for conveyancing teams">
          <div>
            <h2 className={styles.sectionHeading}>{copy.resourcesHeading}</h2>
            <p className={styles.sectionDescription}>{copy.resourcesDescription}</p>
          </div>
          <ul className={styles.resourcesList}>{renderResources(resources)}</ul>
        </section>

        <section ref={register} className={styles.faq} id="faq" aria-label="Security and workflow FAQs">
          <div>
            <h2 className={styles.sectionHeading}>{copy.faqHeading}</h2>
            <p className={styles.sectionDescription}>{copy.faqDescription}</p>
          </div>
          <dl>{renderFaqs(faqs)}</dl>
        </section>

        <section ref={register} className={styles.ctaSection} aria-label="Call to action">
          <div>
            <h2 className={styles.sectionHeading}>{cta.title}</h2>
            <p>{cta.copy}</p>
          </div>
          <div className={styles.ctaButtons}>
            {renderCtaLink(cta.primaryCta, styles.heroPrimary)}
            {renderCtaLink(cta.secondaryCta, styles.heroSecondary, 'secondary')}
          </div>
        </section>
      </main>
    </>
  )
}

export default Home

export const getServerSideProps: GetServerSideProps<HomeProps> = async () => {
  const [
    { getContentPage },
    { getHomepageContent },
    { listCatalogueEntries },
    dbModule,
    reviewsModule,
  ] = await Promise.all([
    import('../lib/cms'),
    import('../lib/homepage'),
    import('../lib/catalogue'),
    import('../lib/db'),
    import('../lib/reviews'),
  ])

  const page = getContentPage('home')
  const homepage = getHomepageContent()
  const catalogue = listCatalogueEntries()
  const database = dbModule.default
  const { listProductReviews, getProductReviewStats } = reviewsModule

  const formatCount = (value: number): string => {
    if (value >= 1000) {
      const rounded = Math.round((value / 1000) * 10) / 10
      return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}k`
    }
    return value.toLocaleString()
  }

  const badgeCountRow = database
    .prepare('SELECT COUNT(1) AS total FROM conveyancer_document_badges')
    .get() as { total?: number }
  const historyCountRow = database
    .prepare('SELECT COUNT(1) AS total FROM conveyancer_job_history')
    .get() as { total?: number }
  const auditCountRow = database.prepare('SELECT COUNT(1) AS total FROM admin_audit_log').get() as { total?: number }
  const productStats = getProductReviewStats()
  const initialProductReviews = listProductReviews({ limit: 5 })

  const stats: MarketplaceStat[] = [
    {
      label: 'ConveySafe badges issued',
      value: formatCount(Number(badgeCountRow.total ?? 0)),
      detail: 'Compliance documents verified across active conveyancers.',
    },
    {
      label: 'Milestones tracked',
      value: formatCount(Number(historyCountRow.total ?? 0)),
      detail: 'Job history records maintained for audit readiness.',
    },
    {
      label: 'Audit events captured',
      value: formatCount(Number(auditCountRow.total ?? 0)),
      detail: 'Administrative changes logged for evidence.',
    },
    {
      label: 'Marketplace satisfaction',
      value: `${Number(productStats.average ?? 0).toFixed(1)}/5`,
      detail: `${Number(productStats.count ?? 0).toLocaleString()} verified product reviews published.`,
    },
  ]

  const features: FeatureCard[] = catalogue.slice(0, 4).map((entry) => ({
    title: entry.title,
    description: entry.summary || entry.previewMarkdown,
  }))

  const fallbackFeature: FeatureCard = {
    title: 'Build your first service entry',
    description: 'Populate the service catalogue to highlight key settlement workflows to marketplace visitors.',
  }

  const normalizedFeatures = features.length > 0 ? features : [fallbackFeature]

  return {
    props: {
      metaDescription:
        page?.metaDescription ??
        'Discover licenced conveyancers and manage every settlement milestone with ConveySafe compliance and escrow controls.',
      hero: homepage.hero,
      copy: homepage.copy,
      personas: homepage.personas,
      stats,
      features: normalizedFeatures,
      workflow: homepage.workflow,
      resources: homepage.resources,
      faqs: homepage.faqs,
      cta: homepage.cta,
      productReviews: initialProductReviews,
      productReviewCount: Number(productStats.count ?? 0),
      productReviewAverage: Number(productStats.average ?? 0),
    },
  }
}
