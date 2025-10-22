import db, { ensureSeedData } from './db'

const isDatabaseUnavailable = (error: unknown): boolean => {
  return error instanceof Error && error.message === 'database_unavailable'
}

export type HeroCallToAction = { label: string; href: string }

export type HeroContent = {
  badge: string
  title: string
  subtitle: string
  primaryCta: HeroCallToAction
  secondaryCta: HeroCallToAction
}

export type PersonaContent = {
  key: string
  label: string
  headline: string
  benefits: string[]
}

export type WorkflowStep = {
  step: string
  title: string
  copy: string
}

export type ResourceLink = {
  title: string
  description: string
  href: string
}

export type FaqItem = {
  question: string
  answer: string
}

export type HomepageCopy = {
  featuresHeading: string
  featuresDescription: string
  workflowHeading: string
  workflowDescription: string
  workflowCta: HeroCallToAction
  testimonialsHeading: string
  testimonialsDescription: string
  resourcesHeading: string
  resourcesDescription: string
  faqHeading: string
  faqDescription: string
}

export type CtaContent = {
  title: string
  copy: string
  primaryCta: HeroCallToAction
  secondaryCta: HeroCallToAction
}

export type HomepageContent = {
  hero: HeroContent
  personas: PersonaContent[]
  workflow: WorkflowStep[]
  resources: ResourceLink[]
  faqs: FaqItem[]
  copy: HomepageCopy
  cta: CtaContent
}

type SectionKey = keyof HomepageContent

type SectionRecord = {
  key: string
  content: string
}

const sectionDefaults: HomepageContent = {
  hero: {
    badge: '',
    title: '',
    subtitle: '',
    primaryCta: { label: '', href: '/' },
    secondaryCta: { label: '', href: '/' },
  },
  personas: [],
  workflow: [],
  resources: [],
  faqs: [],
  copy: {
    featuresHeading: '',
    featuresDescription: '',
    workflowHeading: '',
    workflowDescription: '',
    workflowCta: { label: '', href: '/' },
    testimonialsHeading: '',
    testimonialsDescription: '',
    resourcesHeading: '',
    resourcesDescription: '',
    faqHeading: '',
    faqDescription: '',
  },
  cta: {
    title: '',
    copy: '',
    primaryCta: { label: '', href: '/' },
    secondaryCta: { label: '', href: '/' },
  },
}

const parseSection = <T>(value: string | undefined, fallback: T): T => {
  if (!value) {
    return fallback
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed as T
  } catch (error) {
    console.warn('Failed to parse homepage section payload', { error })
    return fallback
  }
}

const readSection = <K extends SectionKey>(key: K): HomepageContent[K] => {
  ensureSeedData()
  try {
    const row = db
      .prepare('SELECT key, content FROM homepage_sections WHERE key = ? LIMIT 1')
      .get(key) as SectionRecord | undefined
    return parseSection(row?.content, sectionDefaults[key])
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return sectionDefaults[key]
    }
    throw error
  }
}

export const getHomepageContent = (): HomepageContent => {
  return {
    hero: readSection('hero'),
    personas: readSection('personas'),
    workflow: readSection('workflow'),
    resources: readSection('resources'),
    faqs: readSection('faqs'),
    copy: readSection('copy'),
    cta: readSection('cta'),
  }
}

type SectionValidators = {
  [K in SectionKey]: (value: unknown) => value is HomepageContent[K]
}

const isHeroContent = (value: unknown): value is HeroContent => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as HeroContent
  return (
    typeof payload.badge === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.subtitle === 'string' &&
    payload.primaryCta !== undefined &&
    payload.secondaryCta !== undefined &&
    typeof payload.primaryCta.label === 'string' &&
    typeof payload.primaryCta.href === 'string' &&
    typeof payload.secondaryCta.label === 'string' &&
    typeof payload.secondaryCta.href === 'string'
  )
}

const isPersonaArray = (value: unknown): value is PersonaContent[] => {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.key === 'string' &&
      typeof entry.label === 'string' &&
      typeof entry.headline === 'string' &&
      Array.isArray(entry.benefits) &&
      entry.benefits.every((benefit: unknown) => typeof benefit === 'string' && benefit.length > 0)
  )
}

const isWorkflowArray = (value: unknown): value is WorkflowStep[] => {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.step === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.copy === 'string'
  )
}

const isResourceArray = (value: unknown): value is ResourceLink[] => {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.title === 'string' &&
      typeof entry.description === 'string' &&
      typeof entry.href === 'string'
  )
}

const isFaqArray = (value: unknown): value is FaqItem[] => {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.question === 'string' &&
      typeof entry.answer === 'string'
  )
}

const isCallToAction = (value: unknown): value is HeroCallToAction => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as HeroCallToAction
  return typeof payload.label === 'string' && typeof payload.href === 'string'
}

const isCopyContent = (value: unknown): value is HomepageCopy => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as HomepageCopy
  const stringFields: Array<keyof HomepageCopy> = [
    'featuresHeading',
    'featuresDescription',
    'workflowHeading',
    'workflowDescription',
    'testimonialsHeading',
    'testimonialsDescription',
    'resourcesHeading',
    'resourcesDescription',
    'faqHeading',
    'faqDescription',
  ]
  const hasStrings = stringFields.every((key) => typeof payload[key] === 'string')
  return hasStrings && isCallToAction(payload.workflowCta)
}

const isCtaContent = (value: unknown): value is CtaContent => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as CtaContent
  return (
    typeof payload.title === 'string' &&
    typeof payload.copy === 'string' &&
    payload.primaryCta !== undefined &&
    payload.secondaryCta !== undefined &&
    typeof payload.primaryCta.label === 'string' &&
    typeof payload.primaryCta.href === 'string' &&
    typeof payload.secondaryCta.label === 'string' &&
    typeof payload.secondaryCta.href === 'string'
  )
}

const validators: SectionValidators = {
  hero: isHeroContent,
  personas: isPersonaArray,
  workflow: isWorkflowArray,
  resources: isResourceArray,
  faqs: isFaqArray,
  copy: isCopyContent,
  cta: isCtaContent,
}

export const updateHomepageSection = <K extends SectionKey>(key: K, value: HomepageContent[K]): HomepageContent[K] => {
  ensureSeedData()
  const validator = validators[key]
  if (!validator(value)) {
    throw new Error(`Invalid payload for section ${key}`)
  }

  db.prepare(
    `INSERT INTO homepage_sections (key, content, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       content = excluded.content,
       updated_at = CURRENT_TIMESTAMP`
  ).run(key, JSON.stringify(value))

  return readSection(key)
}

export const getHomepageSection = <K extends SectionKey>(key: K): HomepageContent[K] => {
  return readSection(key)
}

export const listHomepageSections = (): HomepageContent => {
  return getHomepageContent()
}
