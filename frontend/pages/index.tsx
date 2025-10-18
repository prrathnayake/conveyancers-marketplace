import Head from 'next/head'
import Link from 'next/link'
import type { FC, ReactElement } from 'react'
import { useMemo, useState } from 'react'
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

export type MarketplaceStat = {
  label: string
  value: string
  detail: string
}

type FeatureCard = {
  title: string
  description: string
}

type Testimonial = {
  quote: string
  name: string
  role: string
}

type HomeProps = {
  metaDescription: string
  hero: HeroContent
  personas: PersonaContent[]
  stats: MarketplaceStat[]
  features: FeatureCard[]
  workflow: WorkflowStep[]
  testimonials: Testimonial[]
  resources: ResourceLink[]
  faqs: FaqItem[]
  copy: HomepageCopy
  cta: CtaContent
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

const renderTestimonials = (testimonials: Testimonial[]) =>
  testimonials.map((testimonial, index) => (
    <figure key={`${testimonial.name}-${index}`}>
      <blockquote>{testimonial.quote}</blockquote>
      <figcaption>
        <span>{testimonial.name}</span>
        <span>{testimonial.role}</span>
      </figcaption>
    </figure>
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

const Home: FC<HomeProps> = ({
  metaDescription,
  hero,
  copy,
  personas,
  stats,
  features,
  workflow,
  testimonials,
  resources,
  faqs,
  cta,
}): ReactElement => {
  const [personaKey, setPersonaKey] = useState<string>(personas[0]?.key ?? '')

  const personaDetails = useMemo(() => personas.find((entry) => entry.key === personaKey) ?? personas[0], [
    personas,
    personaKey,
  ])

  const availablePersonas = useMemo(() => personas.filter((entry) => entry.label && entry.headline), [personas])

  return (
    <>
      <Head>
        <title>Conveyancers Marketplace</title>
        <meta name="description" content={metaDescription} />
      </Head>
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="hero-heading">
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
                  className={`${styles.personaOption} ${personaKey === persona.key ? styles.personaOptionActive : ''}`}
                  onClick={() => setPersonaKey(persona.key)}
                >
                  {persona.label}
                </button>
              ))}
            </div>
          ) : null}
          {personaDetails ? (
            <>
              <h2 className={styles.personaHeadline}>{personaDetails.headline}</h2>
              <ul className={styles.personaBenefits}>
                {personaDetails.benefits.map((benefit, index) => (
                  <li key={`${personaDetails.key}-benefit-${index}`} className={styles.personaBenefit}>
                    {benefit}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className={styles.heroActions}>
            {renderCtaLink(hero.primaryCta, styles.heroPrimary)}
            {renderCtaLink(hero.secondaryCta, styles.heroSecondary, 'secondary')}
          </div>
          <dl className={styles.stats} aria-label="Marketplace performance stats">
            {renderStats(stats)}
          </dl>
        </section>

        <section className={styles.features} id="features" aria-label="Platform features">
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

        <section className={styles.workflow} id="workflow" aria-label="Settlement workflow">
          <div className={styles.workflowCopy}>
            <h2 className={styles.sectionHeading}>{copy.workflowHeading}</h2>
            <p>{copy.workflowDescription}</p>
            {renderCtaLink(copy.workflowCta, styles.heroLink, 'link')}
          </div>
          <ol className={styles.workflowSteps}>{renderWorkflow(workflow)}</ol>
        </section>

        <section className={styles.testimonials} aria-label="Customer testimonials">
          <h2 className={styles.sectionHeading}>{copy.testimonialsHeading}</h2>
          {copy.testimonialsDescription ? (
            <p className={styles.sectionDescription}>{copy.testimonialsDescription}</p>
          ) : null}
          <div className={styles.testimonialGrid}>{renderTestimonials(testimonials)}</div>
        </section>

        <section className={styles.resourcesSection} aria-label="Resources for conveyancing teams">
          <div>
            <h2 className={styles.sectionHeading}>{copy.resourcesHeading}</h2>
            <p className={styles.sectionDescription}>{copy.resourcesDescription}</p>
          </div>
          <ul className={styles.resourcesList}>{renderResources(resources)}</ul>
        </section>

        <section className={styles.faq} id="faq" aria-label="Security and workflow FAQs">
          <div>
            <h2 className={styles.sectionHeading}>{copy.faqHeading}</h2>
            <p className={styles.sectionDescription}>{copy.faqDescription}</p>
          </div>
          <dl>{renderFaqs(faqs)}</dl>
        </section>

        <section className={styles.ctaSection} aria-label="Call to action">
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
  const [{ getContentPage }, { getHomepageContent }, { listCatalogueEntries }, dbModule] = await Promise.all([
    import('../lib/cms'),
    import('../lib/homepage'),
    import('../lib/catalogue'),
    import('../lib/db'),
  ])

  const page = getContentPage('home')
  const homepage = getHomepageContent()
  const catalogue = listCatalogueEntries()
  const database = dbModule.default

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
  const ratingRow = database
    .prepare('SELECT AVG(rating) AS rating, COUNT(1) AS reviews FROM conveyancer_reviews')
    .get() as { rating?: number; reviews?: number }

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
      label: 'Client satisfaction',
      value: `${Number(ratingRow.rating ?? 0).toFixed(1)}/5`,
      detail: `${Number(ratingRow.reviews ?? 0).toLocaleString()} verified testimonials published.`,
    },
  ]

  const testimonialsQuery = database.prepare(
    `SELECT reviewer_name, rating, comment, created_at
       FROM conveyancer_reviews
   ORDER BY rating DESC, created_at DESC
      LIMIT 3`,
  )
  const testimonialsRows = testimonialsQuery.all() as Array<{
    reviewer_name: string
    rating: number
    comment: string
    created_at: string
  }>

  const testimonials: Testimonial[] = testimonialsRows.map((row) => ({
    quote: `“${row.comment.trim()}”`,
    name: row.reviewer_name,
    role: `${row.rating.toFixed(1)}/5 rating`,
  }))

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
      testimonials,
      resources: homepage.resources,
      faqs: homepage.faqs,
      cta: homepage.cta,
    },
  }
}
