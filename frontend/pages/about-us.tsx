import Head from 'next/head'

const AboutUs = (): JSX.Element => {
  return (
    <>
      <Head>
        <title>About us | Conveyancers Marketplace</title>
        <meta
          name="description"
          content="Learn about the mission, values, and team behind Conveyancers Marketplace and the ConveySafe assurance network."
        />
      </Head>
      <main className="page">
        <section className="page-section">
          <h1 className="page-section__title">About us</h1>
          <p className="page-section__lead">
            Conveyancers Marketplace is built by a multidisciplinary team of conveyancers, technologists, and settlement
            specialists who believe every property transaction should feel transparent, secure, and collaborative.
          </p>
        </section>
        <section className="page-section info-grid">
          <article className="card" role="article">
            <h2>Our mission</h2>
            <p>
              We created the ConveySafe assurance network to remove friction from settlements. By combining licensing checks,
              escrow controls, and collaborative workspaces, we empower practitioners and clients to move faster without
              sacrificing compliance.
            </p>
          </article>
          <article className="card" role="article">
            <h2>How we work</h2>
            <p>
              From discovery workshops with developers to live support for conveyancing firms, our team co-designs workflows that
              align with regulatory obligations and the realities of property deals across Australia.
            </p>
          </article>
          <article className="card" role="article">
            <h2>Where we operate</h2>
            <p>
              With hubs in Sydney and Melbourne—and practitioners across every state—we support buyers, sellers, lenders, and
              conveyancers collaborating on both residential and commercial matters.
            </p>
          </article>
          <article className="card" role="article">
            <h2>Join the team</h2>
            <p>
              We are always looking for specialists in settlement operations, customer success, and product engineering. If you
              want to help digitise every milestone, we would love to hear from you.
            </p>
            <a href="mailto:careers@conveyancers.market" className="cta-secondary">
              View open roles
            </a>
          </article>
        </section>
      </main>
    </>
  )
}

export default AboutUs
