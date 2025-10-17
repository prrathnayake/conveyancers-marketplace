import Head from 'next/head'
import Link from 'next/link'

const ContactUs = (): JSX.Element => {
  return (
    <>
      <Head>
        <title>Contact us | Conveyancers Marketplace</title>
        <meta
          name="description"
          content="Speak with the Conveyancers Marketplace team about partnerships, product questions, or platform support."
        />
      </Head>
      <main className="page">
        <section className="page-section">
          <h1 className="page-section__title">Contact us</h1>
          <p className="page-section__lead">
            Our team is ready to help—whether you are coordinating a development pipeline, looking for conveyancing partners, or
            need support with your existing workspace.
          </p>
        </section>
        <section className="page-section">
          <div className="info-grid">
            <div className="card" role="region" aria-labelledby="contact-sales">
              <h2 id="contact-sales">Talk to sales</h2>
              <p>
                Learn how Conveyancers Marketplace can streamline settlements for your organisation and explore pricing tailored
                to your portfolio.
              </p>
              <Link href="mailto:hello@conveyancers.market" className="cta-primary">
                Email sales
              </Link>
            </div>
            <div className="card" role="region" aria-labelledby="contact-support">
              <h2 id="contact-support">Customer support</h2>
              <p>
                Already working with us? Reach out to the support desk for onboarding guidance, workspace configuration, or
                urgent assistance.
              </p>
              <Link href="mailto:support@conveyancers.market" className="cta-secondary">
                Contact support
              </Link>
            </div>
            <div className="card" role="region" aria-labelledby="contact-media">
              <h2 id="contact-media">Media &amp; partnerships</h2>
              <p>
                For press enquiries, partnership opportunities, and speaking engagements, connect with our communications team.
              </p>
              <Link href="mailto:press@conveyancers.market" className="cta-secondary">
                Reach media team
              </Link>
            </div>
            <div className="card" role="region" aria-labelledby="contact-office">
              <h2 id="contact-office">Visit our offices</h2>
              <p>
                Level 8, 11 York Street, Sydney NSW 2000<br />
                Monday to Friday, 8:30am–5:30pm AEST
              </p>
              <Link
                href="https://maps.google.com/?q=Level+8,+11+York+Street,+Sydney+NSW+2000"
                className="cta-secondary"
                target="_blank"
                rel="noreferrer noopener"
              >
                View on maps
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

export default ContactUs
