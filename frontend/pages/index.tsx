import Head from 'next/head'
import Link from 'next/link'
import type { FC, ReactElement } from 'react'
import { useMemo, useState } from 'react'
import type { GetServerSideProps } from 'next'

import styles from '../styles/home.module.css'

const personaCopy = {
  buyer: {
    label: 'I’m buying',
    headline: 'Remove the stress from settlement',
    benefits: [
      'Track every milestone, deposit, and ConveySafe badge from one dashboard.',
      'Know exactly who to call with real-time messaging, policy reminders, and locked-in audit trails.',
      'Escrow protects your funds until each ConveySafe milestone is satisfied.',
    ],
  },
  seller: {
    label: 'I’m selling',
    headline: 'Close faster with proactive support',
    benefits: [
      'Automated reminders keep your buyer, lender, and conveyancer aligned inside the compliance guardrails.',
      'Digitally collect, sign, and lodge documents with ConveySafe evidence logging.',
      'Performance insights surface experts who specialise in complex titles with verified insurance.',
    ],
  },
  conveyancer: {
    label: 'I’m a conveyancer',
    headline: 'Grow a reputation for trusted settlements',
    benefits: [
      'ConveySafe verification boosts your discoverability and showcases compliant licensing.',
      'Built-in client onboarding, IDV hand-offs, and loyalty pricing reduce admin overhead.',
      'Milestone-based billing flows into escrow with instant audit-grade statements.',
    ],
  },
} as const

type PersonaKey = keyof typeof personaCopy

const stats = [
  { label: 'ConveySafe badges issued', value: '1.9k', detail: 'licence and PI insurance checks verified on-platform' },
  { label: 'Milestones tracked', value: '12.4k', detail: 'escrow events completed without dispute' },
  { label: 'Audit events captured', value: '86k', detail: 'messages and documents stored with legal-grade evidence' },
  { label: 'Client satisfaction', value: '4.9/5', detail: 'post-settlement CSAT across all states' },
]

const features = [
  {
    title: 'ConveySafe compliance lock-in',
    description:
      'Licence registries, PI insurance evidence, and badge issuance keep every practitioner verifiably compliant and on-platform.',
  },
  {
    title: 'Escrow controls with loyalty pricing',
    description:
      'Milestone holds release through ConveySafe SecurePay with automated fee reductions for high performing conveyancers.',
  },
  {
    title: 'Document room with smart workflows',
    description:
      'Secure uploads, virus scanning, and templated task lists make it simple to collaborate with brokers, strata, and councils.',
  },
  {
    title: 'Real-time collaboration & evidence',
    description:
      'Live chat keeps contact details private, flags off-platform attempts, and maintains a defensible audit trail for every settlement.',
  },
]

const workflow = [
  {
    step: '01',
    title: 'Match with the right conveyancer',
    copy:
      'Search by state, speciality, property type, or response time. Our ranking blends compliance signals with real client feedback.',
  },
  {
    step: '02',
    title: 'Collaborate and approve milestones',
    copy:
      'Share documents, assign tasks, and approve releases from anywhere. Everything is logged automatically for audit-readiness.',
  },
  {
    step: '03',
    title: 'Settle with confidence',
    copy:
      'Trust the escrow engine, dispute guardrails, and automatic settlement statements when the job is done.',
  },
]

const testimonials = [
  {
    quote:
      '“We reduced settlement delays by 42% because everyone can see what’s next. Clients love the visibility and instant updates.”',
    name: 'Mia Chen',
    role: 'Director, Harbourline Conveyancing (NSW)',
  },
  {
    quote:
      '“The escrow timeline and milestone billing are brilliant. Zero disputes in the last 90 days and reconciliations are effortless.”',
    name: 'Lachlan Reid',
    role: 'Principal Solicitor, Reid Property Law (VIC)',
  },
]

const resources = [
  {
    title: 'Launch checklist: digitising conveyancing in Australia',
    description: '20-point plan that aligns ARNECC guidelines with client experience wins.',
    href: '/docs/DEPLOY.pdf',
  },
  {
    title: 'Escrow dispute playbook',
    description: 'Templates for communicating milestone adjustments with buyers and sellers.',
    href: '/docs/compliance.pdf',
  },
  {
    title: 'Operational metrics dashboard template',
    description: 'Monitor turnaround times, licence renewals, and CSAT in a single view.',
    href: '/docs/metrics.pdf',
  },
]

const faqs = [
  {
    question: 'How is access to sensitive data controlled?',
    answer:
      'Role-based access control enforces the least-privilege principle across buyer, seller, conveyancer, and admin personas. Every API call requires signed headers and is logged for audit readiness.',
  },
  {
    question: 'Can we trace settlement activity end-to-end?',
    answer:
      'Yes. Each milestone, payment change, and document event is tagged with request identifiers that correlate with backend audit logs so issues can be replayed safely.',
  },
  {
    question: 'What happens if a downstream service fails?',
    answer:
      'Automatic exception handling returns structured errors to the client while preserving observability context. Operators receive actionable signals without exposing stack traces.',
  },
]

type HomeProps = {
  metaDescription: string
}

const Home: FC<HomeProps> = ({ metaDescription }): ReactElement => {
  const [persona, setPersona] = useState<PersonaKey>('buyer')

  const personaDetails = useMemo(() => personaCopy[persona], [persona])

  return (
    <>
      <Head>
        <title>Conveyancers Marketplace</title>
        <meta name="description" content={metaDescription} />
      </Head>
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.badge}>ConveySafe assurance network</div>
          <h1 id="hero-heading" className={styles.heroTitle}>
            Settle property deals with clarity and control
          </h1>
          <p className={styles.heroSubtitle}>
            Discover licenced conveyancers, orchestrate every milestone, and keep funds protected within the ConveySafe compliance perimeter.
          </p>
          <div className={styles.personaToggle} role="tablist" aria-label="Select your scenario">
            {(Object.keys(personaCopy) as PersonaKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={persona === key}
                className={`${styles.personaOption} ${persona === key ? styles.personaOptionActive : ''}`}
                onClick={() => setPersona(key)}
              >
                {personaCopy[key].label}
              </button>
            ))}
          </div>
          <h2 className={styles.personaHeadline}>{personaDetails.headline}</h2>
          <ul className={styles.personaBenefits}>
            {personaDetails.benefits.map((benefit) => (
              <li key={benefit} className={styles.personaBenefit}>
                {benefit}
              </li>
            ))}
          </ul>
          <div className={styles.heroActions}>
            <Link href="/search" className={`cta-primary ${styles.heroPrimary}`}>
              Browse verified conveyancers
            </Link>
            <a href="#workflow" className={`cta-secondary ${styles.heroSecondary}`}>
              See how the workflow fits together
            </a>
          </div>
          <dl className={styles.stats} aria-label="Marketplace performance stats">
            {stats.map((stat) => (
              <div key={stat.label} className={styles.stat}>
                <dt className={styles.statLabel}>{stat.label}</dt>
                <dd className={styles.statValue}>{stat.value}</dd>
                <p className={styles.statDetail}>{stat.detail}</p>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.features} id="features" aria-label="Platform features">
          <h2 className={styles.sectionHeading}>Everything teams need to settle securely</h2>
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
            <h2 className={styles.sectionHeading}>See the entire conveyancing journey end-to-end</h2>
            <p>
              Conveyancers Marketplace centralises every task, milestone, and approval so property teams stay coordinated from listing to settlement.
            </p>
            <Link href="/search" className={`cta-link ${styles.heroLink}`}>
              Start by meeting your next conveyancer
            </Link>
          </div>
          <ol className={styles.workflowSteps}>
            {workflow.map((item) => (
              <li key={item.step}>
                <span className={styles.workflowStep}>{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.testimonials} aria-label="Customer testimonials">
          <h2 className={styles.sectionHeading}>Trusted by conveyancing teams nationwide</h2>
          <div className={styles.testimonialGrid}>
            {testimonials.map((testimonial) => (
              <figure key={testimonial.name}>
                <blockquote>{testimonial.quote}</blockquote>
                <figcaption>
                  <span>{testimonial.name}</span>
                  <span>{testimonial.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className={styles.resourcesSection} aria-label="Resources for conveyancing teams">
          <div>
            <h2 className={styles.sectionHeading}>Guides for operational excellence</h2>
            <p>Keep your team up to speed on compliance, stakeholder communication, and client reporting.</p>
          </div>
          <ul className={styles.resourcesList}>
            {resources.map((resource) => (
              <li key={resource.title} className={styles.resourceCard}>
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
                <a className={`cta-link ${styles.heroLink}`} href={resource.href} target="_blank" rel="noreferrer">
                  Download the resource
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.faq} id="faq" aria-label="Security and workflow FAQs">
          <div>
            <h2 className={styles.sectionHeading}>Frequently asked questions</h2>
            <p>Everything you need to know about security logging, access controls, and settlement visibility.</p>
          </div>
          <dl>
            {faqs.map((item) => (
              <div key={item.question}>
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.ctaSection} aria-label="Call to action">
          <div>
            <h2 className={styles.sectionHeading}>Ready to modernise your conveyancing workflow?</h2>
            <p>
              Launch a branded client experience with escrow controls, ID verification, and automated reporting in under two weeks.
            </p>
          </div>
          <div className={styles.ctaButtons}>
            <Link href="/search" className={`cta-primary ${styles.heroPrimary}`}>
              Explore conveyancers
            </Link>
            <a href="mailto:hello@conveymarket.au" className={`cta-secondary ${styles.heroSecondary}`}>
              Book a product tour
            </a>
          </div>
        </section>
      </main>
    </>
  )
}

export default Home

export const getServerSideProps: GetServerSideProps<HomeProps> = async () => {
  const { getContentPage } = await import('../lib/cms')
  const page = getContentPage('home')

  return {
    props: {
      metaDescription:
        page?.metaDescription ??
        'Discover licenced conveyancers and manage every settlement milestone with ConveySafe compliance and escrow controls.',
    },
  }
}
