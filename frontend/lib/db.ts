import fs from 'fs'
import path from 'path'
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'

const connectionString =
  process.env.DB_URL || 'postgres://app:change-me@localhost:5432/convey'

const pool = new Pool({ connectionString })

const runBlocking = <T>(promise: Promise<T>): T => {
  const buffer = new SharedArrayBuffer(4)
  const view = new Int32Array(buffer)
  let result: T | undefined
  let error: unknown

  promise
    .then((value) => {
      result = value
      Atomics.store(view, 0, 1)
      Atomics.notify(view, 0, 1)
    })
    .catch((err) => {
      error = err
      Atomics.store(view, 0, 1)
      Atomics.notify(view, 0, 1)
    })

  while (Atomics.load(view, 0) === 0) {
    Atomics.wait(view, 0, 0, 1000)
  }

  if (error) {
    throw error
  }

  return result as T
}

const MIGRATIONS_TABLE = 'schema_migrations'
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

const readMigrations = (): Array<{ id: string; sql: string }> => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return []
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const id = file.replace(/\.sql$/, '')
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      return { id, sql }
    })
}

const runMigrations = async (): Promise<void> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    )
    await client.query('COMMIT')

    const migrations = readMigrations()

    for (const migration of migrations) {
      const { rows } = await client.query<{ exists: boolean }>(
        `SELECT TRUE AS exists FROM ${MIGRATIONS_TABLE} WHERE id = $1`,
        [migration.id]
      )
      if (rows.length > 0) {
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [migration.id])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    client.release()
  }
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

const insertCustomerProfiles = async (client: PoolClient): Promise<void> => {
  const { rows } = await client.query<{ id: number; role: 'buyer' | 'seller' }>(
    `SELECT id, role FROM users WHERE role IN ('buyer','seller')`
  )

  for (const row of rows) {
    await client.query(
      `INSERT INTO customer_profiles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [row.id, row.role]
    )
  }
}

const insertConveyancerArtifacts = async (client: PoolClient): Promise<void> => {
  const { rows: conveyancers } = await client.query<{ user_id: number }>(
    'SELECT user_id FROM conveyancer_profiles'
  )
  if (conveyancers.length === 0) {
    return
  }

  const { rows: customers } = await client.query<{ id: number }>(
    `SELECT id FROM users WHERE role IN ('buyer','seller')`
  )

  const now = new Date()
  const iso = (offsetDays: number): string => {
    const copy = new Date(now.getTime())
    copy.setDate(copy.getDate() - offsetDays)
    return copy.toISOString()
  }

  const expires = (offsetDays: number): string => {
    const copy = new Date(now.getTime())
    copy.setDate(copy.getDate() + offsetDays)
    return copy.toISOString()
  }

  let customerCursor = 0

  for (const { user_id: conveyancerId } of conveyancers) {
    const historyCount = await client.query<{ total: number }>(
      'SELECT COUNT(1) AS total FROM conveyancer_job_history WHERE conveyancer_id = $1',
      [conveyancerId]
    )
    if (!toNumber(historyCount.rows[0]?.total)) {
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Residential purchase',
        iso(30),
        'Melbourne, VIC',
        'Coordinated contract exchange, finance approvals, and settlement scheduling.',
        'Buyer and lender',
      ])
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Off-the-plan apartment',
        iso(65),
        'Sydney, NSW',
        'Managed vendor variations, staged deposits, and bank readiness for settlement.',
        'Vendor and buyer',
      ])
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Commercial retail lease',
        iso(120),
        'Brisbane, QLD',
        'Negotiated fit-out clauses, insurance evidence, and milestone-based rent release.',
        'Lessor and lessee',
      ])
      await client.query(
        `INSERT INTO conveyancer_job_history (conveyancer_id, matter_type, completed_at, location, summary, clients)
         VALUES ($1, $2, $3, $4, $5, $6)`
      , [
        conveyancerId,
        'Strata title townhouse',
        iso(200),
        'Perth, WA',
        'Resolved outstanding encumbrances and coordinated digital signing ceremonies.',
        'Buyer, seller, and strata manager',
      ])
    }

    const badgeCount = await client.query<{ total: number }>(
      'SELECT COUNT(1) AS total FROM conveyancer_document_badges WHERE conveyancer_id = $1',
      [conveyancerId]
    )
    if (!toNumber(badgeCount.rows[0]?.total)) {
      await client.query(
        `INSERT INTO conveyancer_document_badges (conveyancer_id, label, status, reference, last_verified, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          conveyancerId,
          'Professional indemnity insurance',
          'valid',
          `PI-${conveyancerId}`,
          iso(14),
          expires(180),
        ]
      )
      await client.query(
        `INSERT INTO conveyancer_document_badges (conveyancer_id, label, status, reference, last_verified, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          conveyancerId,
          'National police check',
          'valid',
          `NPC-${conveyancerId}`,
          iso(30),
          expires(365),
        ]
      )
    }

    const reviewCount = await client.query<{ total: number }>(
      'SELECT COUNT(1) AS total FROM conveyancer_reviews WHERE conveyancer_id = $1',
      [conveyancerId]
    )
    if (!toNumber(reviewCount.rows[0]?.total)) {
      const jobRefOne = `JOB-${conveyancerId}-01`
      const jobRefTwo = `JOB-${conveyancerId}-02`
      await client.query(
        `INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment, job_reference)
         VALUES ($1, $2, $3, $4, $5)`
      , [
        conveyancerId,
        'Verified buyer',
        5,
        'Transparent milestones and proactive updates made the purchase straightforward.',
        jobRefOne,
      ])
      await client.query(
        `INSERT INTO conveyancer_reviews (conveyancer_id, reviewer_name, rating, comment, job_reference)
         VALUES ($1, $2, $3, $4, $5)`
      , [
        conveyancerId,
        'Settlement partner',
        4,
        'Responsive communication and strong compliance hygiene across every step.',
        jobRefTwo,
      ])

      if (customers.length > 0) {
        const firstCustomer = customers[customerCursor % customers.length]
        const secondCustomer = customers[(customerCursor + 1) % customers.length]
        customerCursor = (customerCursor + 2) % customers.length

        const firstExists = await client.query<{ total: number }>(
          'SELECT COUNT(1) AS total FROM customer_jobs WHERE customer_id = $1 AND conveyancer_id = $2',
          [firstCustomer.id, conveyancerId]
        )
        if (!toNumber(firstExists.rows[0]?.total)) {
          await client.query(
            `INSERT INTO customer_jobs (customer_id, conveyancer_id, status, reference, completed_at)
             VALUES ($1, $2, 'completed', $3, $4)`
          , [firstCustomer.id, conveyancerId, jobRefOne, iso(12)])
        }

        const secondExists = await client.query<{ total: number }>(
          'SELECT COUNT(1) AS total FROM customer_jobs WHERE customer_id = $1 AND conveyancer_id = $2',
          [secondCustomer.id, conveyancerId]
        )
        if (!toNumber(secondExists.rows[0]?.total)) {
          await client.query(
            `INSERT INTO customer_jobs (customer_id, conveyancer_id, status, reference, completed_at)
             VALUES ($1, $2, 'completed', $3, $4)`
          , [secondCustomer.id, conveyancerId, jobRefTwo, iso(18)])
        }
      }
    }
  }
}

const insertProductReviews = async (client: PoolClient): Promise<void> => {
  const { rows } = await client.query<{ total: number }>('SELECT COUNT(1) AS total FROM product_reviews')
  if (toNumber(rows[0]?.total)) {
    return
  }

  const now = new Date()
  const iso = (offsetDays: number): string => {
    const copy = new Date(now.getTime())
    copy.setDate(copy.getDate() - offsetDays)
    return copy.toISOString()
  }

  const inserts: Array<[string, number, string, string]> = [
    [
      'Harper • Buyer',
      5,
      'The Conveyancers Marketplace platform kept every milestone visible and approvals were effortless.',
      iso(4),
    ],
    [
      'Mason • Seller',
      4,
      'Escrow tracking and document badges gave us confidence while we negotiated tight deadlines.',
      iso(9),
    ],
    [
      'Avery • Conveyancer',
      5,
      'Secure messaging, quote management, and audit logs made collaboration with clients seamless.',
      iso(15),
    ],
    [
      'Jordan • Buyer',
      5,
      'Receiving automated alerts for every settlement step meant no surprises ahead of completion.',
      iso(21),
    ],
    [
      'Quinn • Lender partner',
      5,
      'Document verification and milestone controls reduced settlement risk across our loan book.',
      iso(32),
    ],
  ]

  for (const [reviewerName, rating, comment, createdAt] of inserts) {
    await client.query(
      `INSERT INTO product_reviews (reviewer_name, rating, comment, created_at)
       VALUES ($1, $2, $3, $4)`
    , [reviewerName, rating, comment, createdAt])
  }
}

const upsertContentPages = async (client: PoolClient): Promise<void> => {
  const entries = [
    {
      slug: 'about-us',
      title: 'About Conveyancers Marketplace',
      body:
        '## About us\nConveyancers Marketplace unites licenced professionals, buyers, sellers, and lenders in one settlement workspace.\n\n### Our mission\nDeliver compliant, collaborative settlements that keep every milestone visible.\n\n### How we work\nWe partner with firms across Australia to align regulatory guardrails with client experience.\n\n### Where we operate\nSydney and Melbourne hubs with practitioners servicing every state and territory.\n\n### Join the team\nContact careers@conveyancers.market to explore current opportunities.',
      metaDescription:
        'Discover the Conveyancers Marketplace team and how the ConveySafe assurance network supports compliant settlements.',
    },
    {
      slug: 'contact-us',
      title: 'Talk with the ConveySafe team',
      body:
        '## Contact us\nWe are available 7 days a week to help buyers, sellers, conveyancers, and partners.\n\n- **Email:** support@conveyancers.market\n- **Phone:** 1300 555 019 (8am – 8pm AEST)\n- **Compliance escalation:** compliance@conveysafe.au\n\nLooking for press enquiries? Reach out to press@conveyancers.market.',
      metaDescription:
        'Reach the ConveySafe operations and compliance teams for settlement assistance, partnership opportunities, or media enquiries.',
    },
    {
      slug: 'home',
      title: 'Conveyancers Marketplace',
      body: 'Homepage content is managed within the application.',
      metaDescription:
        'Conveyancers Marketplace connects buyers, sellers, and licenced professionals with ConveySafe compliance, escrow, and collaboration tools.',
    },
  ]

  for (const entry of entries) {
    await client.query(
      `INSERT INTO content_pages (slug, title, body, meta_description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         meta_description = EXCLUDED.meta_description,
         updated_at = CURRENT_TIMESTAMP`,
      [entry.slug, entry.title, entry.body, entry.metaDescription]
    )
  }
}

const upsertHomepageSections = async (client: PoolClient): Promise<void> => {
  const hero = {
    badge: 'ConveySafe assurance network',
    title: 'Settle property deals with clarity and control',
    subtitle:
      'Discover licenced conveyancers, orchestrate every milestone, and keep funds protected within the ConveySafe compliance perimeter.',
    primaryCta: { label: 'Browse verified conveyancers', href: '/search' },
    secondaryCta: { label: 'See how the workflow fits together', href: '#workflow' },
  }

  const personas = [
    {
      key: 'buyer',
      label: "I'm buying",
      headline: 'Remove the stress from settlement',
      benefits: [
        'Track every milestone, deposit, and ConveySafe badge from one dashboard.',
        'Know exactly who to call with real-time messaging, policy reminders, and locked-in audit trails.',
        'Escrow protects your funds until each ConveySafe milestone is satisfied.',
      ],
    },
    {
      key: 'seller',
      label: "I'm selling",
      headline: 'Close faster with proactive support',
      benefits: [
        'Automated reminders keep your buyer, lender, and conveyancer aligned inside the compliance guardrails.',
        'Digitally collect, sign, and lodge documents with ConveySafe evidence logging.',
        'Performance insights surface experts who specialise in complex titles with verified insurance.',
      ],
    },
    {
      key: 'conveyancer',
      label: "I'm a conveyancer",
      headline: 'Grow a reputation for trusted settlements',
      benefits: [
        'ConveySafe verification boosts your discoverability and showcases compliant licensing.',
        'Built-in client onboarding, IDV hand-offs, and loyalty pricing reduce admin overhead.',
        'Milestone-based billing flows into escrow with instant audit-grade statements.',
      ],
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

  const copy = {
    featuresHeading: 'Everything teams need to settle securely',
    featuresDescription:
      'Coordinate verified experts, compliance artefacts, and settlement workflows from one collaborative workspace.',
    workflowHeading: 'See the entire conveyancing journey end-to-end',
    workflowDescription:
      'Conveyancers Marketplace centralises every task, milestone, and approval so property teams stay coordinated from listing to settlement.',
    workflowCta: { label: 'Start by meeting your next conveyancer', href: '/search' },
    testimonialsHeading: 'Trusted by conveyancing teams nationwide',
    testimonialsDescription:
      'Real reviews from verified settlements highlight operational excellence across the ConveySafe network.',
    resourcesHeading: 'Guides for operational excellence',
    resourcesDescription:
      'Keep your team up to speed on compliance, stakeholder communication, and client reporting.',
    faqHeading: 'Frequently asked questions',
    faqDescription:
      'Everything you need to know about security logging, access controls, and settlement visibility.',
  }

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

  const cta = {
    title: 'Ready to modernise your conveyancing workflow?',
    copy:
      'Launch a branded client experience with escrow controls, ID verification, and automated reporting in under two weeks.',
    primaryCta: { label: 'Explore conveyancers', href: '/search' },
    secondaryCta: { label: 'Book a product tour', href: 'mailto:hello@conveymarket.au' },
  }

  const entries: Record<string, unknown> = {
    hero,
    personas,
    workflow,
    resources,
    faqs,
    copy,
    cta,
  }

  for (const [key, content] of Object.entries(entries)) {
    await client.query(
      `INSERT INTO homepage_sections (key, content, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         content = EXCLUDED.content,
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(content)]
    )
  }
}

let transactionClient: PoolClient | null = null

const runInTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const seedArtifacts = async (): Promise<void> => {
  await runInTransaction(async (client) => {
    await insertCustomerProfiles(client)
    await insertConveyancerArtifacts(client)
    await insertProductReviews(client)
    await upsertContentPages(client)
    await upsertHomepageSections(client)
  })
}

let initPromise: Promise<void> | null = null

const ensureInitialized = (): Promise<void> => {
  if (!initPromise) {
    initPromise = (async () => {
      await runMigrations()
      await seedArtifacts()
    })()
  }
  return initPromise
}

const executeQuery = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient | Pool
): Promise<QueryResult<T>> => {
  const target = client ?? transactionClient ?? pool
  return target.query<T>(text, values)
}

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  client?: PoolClient
): Promise<QueryResult<T>> => {
  await ensureInitialized()
  return executeQuery<T>(text, values, client ?? undefined)
}

export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  await ensureInitialized()
  return runInTransaction(fn)
}

type PreparedMetadata = {
  text: string
  namedOrder: string[]
}

const prepareSql = (sql: string): PreparedMetadata => {
  const namedOrder: string[] = []
  const nameToIndex = new Map<string, number>()
  let index = 1

  const text = sql.replace(/(@[a-zA-Z_][a-zA-Z0-9_]*|\?)/g, (match) => {
    if (match === '?') {
      const placeholder = `$${index}`
      index += 1
      return placeholder
    }

    const name = match.slice(1)
    let placeholderIndex = nameToIndex.get(name)
    if (!placeholderIndex) {
      placeholderIndex = index
      nameToIndex.set(name, placeholderIndex)
      namedOrder.push(name)
      index += 1
    }
    return `$${placeholderIndex}`
  })

  return { text, namedOrder }
}

const normalizeParams = (meta: PreparedMetadata, args: unknown[]): unknown[] => {
  if (meta.namedOrder.length > 0) {
    const candidate = args[0]
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>
      return meta.namedOrder.map((key) => record[key])
    }
  }

  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0] as unknown[]
  }

  return args
}

class PreparedStatement {
  private readonly meta: PreparedMetadata

  constructor(sql: string) {
    this.meta = prepareSql(sql)
  }

  private execute(args: unknown[]): { result: QueryResult<any>; lastInsertId: number } {
    const params = normalizeParams(this.meta, args)
    const runner = async (): Promise<{ result: QueryResult<any>; lastInsertId: number }> => {
      await ensureInitialized()
      const client = transactionClient ?? (await pool.connect())
      let releaseClient = false
      if (!transactionClient) {
        releaseClient = true
      }
      try {
        const result = await client.query(this.meta.text, params)
        let lastInsertId = 0
        if (result.command === 'INSERT') {
          if (result.rows[0] && typeof result.rows[0] === 'object' && result.rows[0] !== null && 'id' in result.rows[0]) {
            lastInsertId = Number((result.rows[0] as Record<string, unknown>).id ?? 0)
          } else {
            try {
              const { rows } = await client.query<{ lastval: string | number }>('SELECT LASTVAL() AS lastval')
              const value = rows[0]?.lastval
              lastInsertId = typeof value === 'string' ? Number(value) : Number(value ?? 0)
            } catch {
              lastInsertId = 0
            }
          }
        }
        return { result, lastInsertId: Number.isNaN(lastInsertId) ? 0 : lastInsertId }
      } finally {
        if (releaseClient) {
          client.release()
        }
      }
    }

    return runBlocking(runner())
  }

  all<T = any>(...args: unknown[]): T[] {
    return this.execute(args).result.rows as T[]
  }

  get<T = any>(...args: unknown[]): T | undefined {
    const rows = this.execute(args).result.rows as T[]
    return rows[0]
  }

  run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
    const { result, lastInsertId } = this.execute(args)
    return { changes: result.rowCount ?? 0, lastInsertRowid: lastInsertId }
  }
}

export const prepare = (sql: string): PreparedStatement => {
  return new PreparedStatement(sql)
}

export const transaction = <Args extends unknown[], Return>(
  fn: (...args: Args) => Return
): ((...args: Args) => Return) => {
  return (...args: Args): Return => {
    return runBlocking(
      runInTransaction(async (client) => {
        const previous = transactionClient
        transactionClient = client
        try {
          const result = fn(...args)
          return result instanceof Promise ? await result : result
        } finally {
          transactionClient = previous
        }
      })
    )
  }
}

export const ensureSeedData = (): void => {
  runBlocking(ensureInitialized())
}

export const ensureSchema = (): void => {
  runBlocking(ensureInitialized())
}

export const getPool = async (): Promise<Pool> => {
  await ensureInitialized()
  return pool
}

runBlocking(ensureInitialized())

export default { query, prepare, transaction, withTransaction, ensureSchema, ensureSeedData, getPool }
