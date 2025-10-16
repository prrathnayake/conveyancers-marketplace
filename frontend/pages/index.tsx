import Head from 'next/head'
import Link from 'next/link'
import type { FC, ReactElement } from 'react'
import { useMemo, useState } from 'react'

const personaCopy = {
  buyer: {
    label: 'I’m buying',
    headline: 'Remove the stress from settlement',
    benefits: [
      'Track every milestone, deposit, and insurance check from one dashboard.',
      'Know exactly who to call with real-time messaging and smart nudges.',
      'Escrow protects your funds until each condition is ticked off.',
    ],
  },
  seller: {
    label: 'I’m selling',
    headline: 'Close faster with proactive support',
    benefits: [
      'Automated reminders keep your buyer, lender, and conveyancer aligned.',
      'Digitally collect, sign, and lodge documents without chasing email threads.',
      'Performance insights surface experts who specialise in complex titles.',
    ],
  },
  conveyancer: {
    label: 'I’m a conveyancer',
    headline: 'Grow a reputation for trusted settlements',
    benefits: [
      'Verified profile boosts your discoverability across every Australian state.',
      'Built-in client onboarding and IDV hand-offs save hours each week.',
      'Milestone-based billing drops straight into your existing trust workflow.',
    ],
  },
} as const

type PersonaKey = keyof typeof personaCopy

const stats = [
  { label: 'Verified experts', value: '280+', detail: 'licenced conveyancers and solicitors onboarded' },
  { label: 'Milestones tracked', value: '12.4k', detail: 'escrow events completed without dispute' },
  { label: 'Avg. response time', value: '1h 52m', detail: 'service-level backed messaging SLA' },
  { label: 'Client satisfaction', value: '4.9/5', detail: 'post-settlement CSAT across all states' },
]

const features = [
  {
    title: 'Escrow controls that just work',
    description:
      'Hold, release, or refund milestone payments with an auditable trail that keeps buyers, sellers, and conveyancers aligned.',
  },
  {
    title: 'Identity and licence confidence',
    description:
      'ARNECC compliant checks, PI insurance reminders, and continuous licence monitoring mean you only work with verified pros.',
  },
  {
    title: 'Document room with smart workflows',
    description:
      'Secure uploads, virus scanning, and templated task lists make it simple to collaborate with brokers, strata, and councils.',
  },
  {
    title: 'Real-time collaboration',
    description:
      'Live chat, timeline views, and automated nudges keep the transaction moving. Integrates with email, Teams, and Slack.',
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

const Home: FC = (): ReactElement => {
  const [persona, setPersona] = useState<PersonaKey>('buyer')

  const personaDetails = useMemo(() => personaCopy[persona], [persona])

  return (
    <>
      <Head>
        <title>Conveyancers Marketplace</title>
      </Head>
      <main className="page">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="badge">AU verified network</div>
          <h1 id="hero-heading">Settle property deals with clarity and control</h1>
          <p className="hero-subtitle">
            Discover licenced conveyancers, orchestrate every milestone, and keep funds protected until both sides are satisfied.
          </p>
          <div className="persona-toggle" role="tablist" aria-label="Select your scenario">
            {(Object.keys(personaCopy) as PersonaKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={persona === key}
                className={`persona-option ${persona === key ? 'persona-option--active' : ''}`}
                onClick={() => setPersona(key)}
              >
                {personaCopy[key].label}
              </button>
            ))}
          </div>
          <h2 className="persona-headline">{personaDetails.headline}</h2>
          <ul className="persona-benefits">
            {personaDetails.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
          <div className="hero-actions">
            <Link href="/search" className="cta-primary">
              Browse verified conveyancers
            </Link>
            <a href="#workflow" className="cta-secondary">
              See how the workflow fits together
            </a>
          </div>
          <dl className="stats" aria-label="Marketplace performance stats">
            {stats.map((stat) => (
              <div key={stat.label} className="stat">
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
                <p>{stat.detail}</p>
              </div>
            ))}
          </dl>
        </section>

        <section className="features" aria-label="Platform features">
          <h2>Everything teams need to settle securely</h2>
          <div className="feature-grid">
            {features.map((feature) => (
              <article key={feature.title} className="feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow" id="workflow" aria-label="How the marketplace works">
          <div className="workflow-copy">
            <h2>Progress every transaction with confidence</h2>
            <p>
              The platform combines automated compliance, milestone-based escrow, and a collaborative workspace designed for
              Australian conveyancing teams.
            </p>
            <Link href="/search" className="cta-link">
              Start by meeting your next conveyancer
            </Link>
          </div>
          <ol className="workflow-steps">
            {workflow.map((item) => (
              <li key={item.title}>
                <span className="workflow-step">{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="testimonials" aria-label="Customer testimonials">
          <h2>Loved by conveyancing leaders nationwide</h2>
          <div className="testimonial-grid">
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

        <section className="resources" aria-label="Resources and guides">
          <div>
            <h2>Deep dives for ambitious teams</h2>
            <p>Step-by-step playbooks, compliance cheat-sheets, and analytics frameworks ready to download.</p>
          </div>
          <ul>
            {resources.map((resource) => (
              <li key={resource.title}>
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
                <a href={resource.href} className="cta-link">
                  Download guide
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="cta" aria-label="Call to action">
          <div>
            <h2>Ready to modernise your conveyancing workflow?</h2>
            <p>
              Launch a branded client experience with escrow controls, ID verification, and automated reporting in under two
              weeks.
            </p>
          </div>
          <div className="cta-buttons">
            <Link href="/search" className="cta-primary">
              Explore conveyancers
            </Link>
            <a href="mailto:hello@conveymarket.au" className="cta-secondary">
              Book a product tour
            </a>
          </div>
        </section>
      </main>
      <style jsx>{`
        .page {
          padding: 4rem 1.5rem 5rem;
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 4rem;
        }

        .hero {
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(59, 130, 246, 0.06));
          border: 1px solid rgba(37, 99, 235, 0.08);
          border-radius: 32px;
          padding: 3.5rem clamp(1.5rem, 3vw, 3.5rem);
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(37, 99, 235, 0.12);
          color: #1d4ed8;
          padding: 0.4rem 0.85rem;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 0.95rem;
        }

        h1 {
          margin: 1.5rem 0 1rem;
          font-size: clamp(2.5rem, 5vw, 3.5rem);
          line-height: 1.1;
          color: #0f172a;
        }

        .hero-subtitle {
          font-size: 1.1rem;
          max-width: 42rem;
          color: #1e293b;
        }

        .persona-toggle {
          margin: 2.5rem 0 1rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .persona-option {
          background: white;
          border: 1px solid rgba(148, 163, 184, 0.5);
          border-radius: 999px;
          padding: 0.6rem 1.4rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: #0f172a;
          transition: all 0.2s ease;
        }

        .persona-option:hover,
        .persona-option:focus-visible {
          border-color: rgba(37, 99, 235, 0.7);
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
        }

        .persona-option--active {
          background: #1d4ed8;
          color: white;
          border-color: transparent;
        }

        .persona-headline {
          font-size: 1.5rem;
          color: #0f172a;
          margin-top: 1.5rem;
        }

        .persona-benefits {
          margin: 1.5rem 0 2.5rem;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 0.8rem;
        }

        .persona-benefits li {
          position: relative;
          padding-left: 1.75rem;
          color: #1f2937;
          line-height: 1.5;
        }

        .persona-benefits li::before {
          content: '✔';
          position: absolute;
          left: 0;
          top: 0;
          color: #1d4ed8;
          font-weight: 700;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 2.5rem;
        }

        .cta-primary,
        .cta-secondary,
        .cta-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          font-weight: 600;
          border-radius: 999px;
          padding: 0.75rem 1.6rem;
          text-decoration: none;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .cta-primary {
          background: #1d4ed8;
          color: white;
          box-shadow: 0 18px 40px rgba(29, 78, 216, 0.25);
        }

        .cta-primary:hover,
        .cta-primary:focus-visible {
          transform: translateY(-1px);
          box-shadow: 0 20px 50px rgba(29, 78, 216, 0.35);
        }

        .cta-secondary {
          background: rgba(148, 163, 184, 0.15);
          color: #1d4ed8;
          border: 1px solid rgba(148, 163, 184, 0.3);
        }

        .cta-secondary:hover,
        .cta-secondary:focus-visible,
        .cta-link:hover,
        .cta-link:focus-visible {
          transform: translateY(-1px);
          box-shadow: 0 10px 30px rgba(37, 99, 235, 0.18);
          outline: none;
        }

        .cta-link {
          background: transparent;
          color: #1d4ed8;
          padding: 0.3rem 0;
        }

        .stats {
          margin: 0;
          padding: 2rem 0 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1.5rem;
        }

        .stat {
          background: white;
          border-radius: 20px;
          padding: 1.5rem;
          border: 1px solid rgba(148, 163, 184, 0.3);
        }

        .stat dt {
          font-size: 0.9rem;
          font-weight: 600;
          color: #64748b;
        }

        .stat dd {
          margin: 0.4rem 0;
          font-size: 1.9rem;
          font-weight: 700;
          color: #0f172a;
        }

        .stat p {
          margin: 0;
          color: #475569;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .features h2,
        .workflow h2,
        .testimonials h2,
        .resources h2,
        .cta h2 {
          font-size: clamp(2rem, 4vw, 2.75rem);
          color: #0f172a;
          margin-bottom: 1rem;
        }

        .features .feature-grid {
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .feature-card {
          background: white;
          border-radius: 20px;
          padding: 1.75rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.05);
        }

        .feature-card h3 {
          margin: 0 0 0.75rem;
          font-size: 1.25rem;
          color: #1d4ed8;
        }

        .feature-card p {
          margin: 0;
          color: #475569;
          line-height: 1.55;
        }

        .workflow {
          display: grid;
          gap: 2rem;
          background: white;
          border-radius: 32px;
          padding: clamp(2rem, 4vw, 3rem);
          border: 1px solid rgba(37, 99, 235, 0.1);
        }

        .workflow-copy p {
          color: #475569;
          line-height: 1.6;
          margin-bottom: 1.5rem;
        }

        .workflow-steps {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 1.25rem;
        }

        .workflow-steps li {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 1.25rem;
          align-items: start;
          padding: 1.25rem 1.5rem;
          border-radius: 24px;
          background: rgba(37, 99, 235, 0.04);
        }

        .workflow-step {
          font-weight: 700;
          font-size: 0.95rem;
          color: #1d4ed8;
          letter-spacing: 0.12em;
        }

        .workflow-steps h3 {
          margin: 0 0 0.4rem;
          font-size: 1.2rem;
          color: #0f172a;
        }

        .workflow-steps p {
          margin: 0;
          color: #475569;
          line-height: 1.55;
        }

        .testimonials {
          text-align: center;
        }

        .testimonial-grid {
          margin-top: 2rem;
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }

        .testimonial-grid figure {
          background: white;
          border-radius: 24px;
          padding: 2rem;
          border: 1px solid rgba(148, 163, 184, 0.3);
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        blockquote {
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.6;
          color: #1f2937;
        }

        figcaption {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.95rem;
          color: #475569;
        }

        figcaption span:first-of-type {
          font-weight: 600;
          color: #0f172a;
        }

        .resources {
          display: grid;
          gap: 2rem;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          align-items: start;
        }

        .resources ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 1.5rem;
        }

        .resources li {
          background: white;
          padding: 1.75rem;
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 18px 44px rgba(15, 23, 42, 0.05);
        }

        .resources h3 {
          margin: 0 0 0.6rem;
          color: #0f172a;
          font-size: 1.2rem;
        }

        .resources p {
          margin: 0 0 1rem;
          color: #475569;
          line-height: 1.55;
        }

        .cta {
          background: linear-gradient(120deg, rgba(29, 78, 216, 0.92), rgba(37, 99, 235, 0.85));
          border-radius: 32px;
          padding: clamp(2.5rem, 5vw, 3.5rem);
          color: white;
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          align-items: center;
        }

        .cta p {
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.9);
        }

        .cta-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .cta .cta-secondary {
          background: rgba(255, 255, 255, 0.12);
          color: white;
          border-color: rgba(255, 255, 255, 0.25);
        }

        @media (max-width: 720px) {
          .hero {
            padding: 2.5rem 1.25rem;
          }

          .hero-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .cta-buttons {
            width: 100%;
            flex-direction: column;
          }

          .cta-primary,
          .cta-secondary {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
      <style jsx global>{`
        body {
          background: #f8fafc;
          color: #0f172a;
          font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        a {
          text-decoration: none;
        }
      `}</style>
    </>
  )
}

export default Home
