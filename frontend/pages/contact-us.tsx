import Head from 'next/head'
import type { GetServerSideProps } from 'next'

import type { ContentPage } from '../lib/cms'
import { isBuildPhase } from '../lib/ssr'

type ContactPageProps = {
  content: ContentPage
}

const renderMarkdown = (body: string): JSX.Element[] => {
  const nodes: JSX.Element[] = []
  const lines = body.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? ''
    if (!line) {
      i += 1
      continue
    }
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={`h3-${i}`}>{line.slice(4)}</h3>)
      i += 1
      continue
    }
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={`h2-${i}`}>{line.slice(3)}</h2>)
      i += 1
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i]?.trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2))
        i += 1
      }
      nodes.push(
        <ul key={`ul-${i}`}>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )
      continue
    }
    nodes.push(<p key={`p-${i}`}>{line}</p>)
    i += 1
  }
  return nodes
}

const ContactUs = ({ content }: ContactPageProps): JSX.Element => {
  const nodes = renderMarkdown(content.body)
  const candidateLead = nodes[0]
  const lead = candidateLead && typeof candidateLead.type === 'string' && candidateLead.type === 'p' ? candidateLead : null
  const rest = lead ? nodes.slice(1) : nodes
  return (
    <>
      <Head>
        <title>{content.title}</title>
        <meta name="description" content={content.metaDescription} />
      </Head>
      <main className="page">
        <section className="page-section">
          <h1 className="page-section__title">{content.title}</h1>
          {lead}
        </section>
        <section className="page-section" aria-label="Contact information">
          <article className="card" role="article">
            {rest.length > 0 ? rest : null}
          </article>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<ContactPageProps> = async () => {
  const fallback: ContentPage = {
    slug: 'contact-us',
    title: 'Contact Conveyancers Marketplace',
    body:
      '## Contact Conveyancers Marketplace\nEmail support@conveyancers.market for help with your workspace.\n- Phone: 1300 555 019\n- Compliance: compliance@conveysafe.au',
    metaDescription:
      'Get in touch with the Conveyancers Marketplace team for support, partnerships, or compliance enquiries.',
    updatedAt: new Date().toISOString(),
  }

  if (isBuildPhase()) {
    return { props: { content: fallback } }
  }

  try {
    const { getContentPage } = await import('../lib/cms')
    const page = getContentPage('contact-us')
    return { props: { content: page ?? fallback } }
  } catch (error) {
    console.error('Failed to load contact page content during SSR. Using fallback copy.', error)
    return { props: { content: fallback } }
  }
}

export default ContactUs
