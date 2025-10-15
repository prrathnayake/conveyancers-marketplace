import Head from 'next/head'
import Link from 'next/link'
import type { FC, ReactElement } from 'react'

const Home: FC = (): ReactElement => {
  return (
    <>
      <Head>
        <title>Conveyancers Marketplace</title>
      </Head>
      <main style={{ padding: 24, maxWidth: 640 }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 16 }}>Conveyancers Marketplace (AU)</h1>
        <p style={{ marginBottom: 24 }}>
          Discover verified conveyancers, manage escrow milestone payments, and collaborate securely on property settlements.
        </p>
        <Link href="/search" style={{ color: '#2563eb', fontWeight: 600 }}>
          Browse conveyancers
        </Link>
      </main>
    </>
  )
}

export default Home
