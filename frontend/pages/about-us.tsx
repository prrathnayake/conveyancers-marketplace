import Head from 'next/head'
import type { GetServerSideProps } from 'next'

import type { ContentPage } from '../lib/cms'
import { isBuildPhase } from '../lib/ssr'

type AboutPageProps = {
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
      nodes.push(
        <h3 key={`h3-${i}`}>{line.slice(4)}</h3>
      )
      i += 1
      continue
    }
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={`h2-${i}`}>{line.slice(3)}</h2>
      )
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
        <ul key={`ul-${i}`}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
      )
      continue
    }
    nodes.push(
      <p key={`p-${i}`}>{line}</p>
    )
    i += 1
  }
  return nodes
}

const AboutUs = ({ content }: AboutPageProps): JSX.Element => {
  return (
    <>
      <Head>
        <title>{content.title}</title>
        <meta name="description" content={content.metaDescription} />
      </Head>
      <main className="page">
        <section className="page-section">
          <h1 className="page-section__title">{content.title}</h1>
        </section>
        <section className="page-section" aria-label="About Conveyancers Marketplace">
          <article className="card" role="article">
            {renderMarkdown(content.body)}
          </article>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<AboutPageProps> = async () => {
  const fallback: ContentPage = {
    slug: 'about-us',
    title: 'About Conveyancers Marketplace',
    body:
      '## About Conveyancers Marketplace\nWe connect licenced experts, buyers, and sellers with the ConveySafe assurance network.',
    metaDescription:
      'Learn about the Conveyancers Marketplace team and the ConveySafe network supporting compliant settlements.',
    updatedAt: new Date().toISOString(),
  }

  if (isBuildPhase()) {
    return { props: { content: fallback } }
  }

  try {
    const { getContentPage } = await import('../lib/cms')
    const page = getContentPage('about-us')
    return { props: { content: page ?? fallback } }
  } catch (error) {
    console.error('Failed to load about page content during SSR. Using fallback copy.', error)
    return { props: { content: fallback } }
  }
}

export default AboutUs
