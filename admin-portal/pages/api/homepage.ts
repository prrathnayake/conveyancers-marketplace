import type { NextApiRequest, NextApiResponse } from 'next'

import {
  getHomepageContent,
  getHomepageSection,
  type HomepageContent,
  type HomepageCopy,
  type HeroContent,
  type PersonaContent,
  type WorkflowStep,
  type ResourceLink,
  type FaqItem,
  type CtaContent,
  updateHomepageSection,
} from '../../../frontend/lib/homepage'
import { requireRole } from '../../../frontend/lib/session'

type SectionPayload =
  | { section: 'hero'; content: HeroContent }
  | { section: 'personas'; content: PersonaContent[] }
  | { section: 'workflow'; content: WorkflowStep[] }
  | { section: 'resources'; content: ResourceLink[] }
  | { section: 'faqs'; content: FaqItem[] }
  | { section: 'copy'; content: HomepageCopy }
  | { section: 'cta'; content: CtaContent }

type HomepageResponse = HomepageContent

type SectionResponse<K extends SectionPayload['section']> = {
  section: K
  content: HomepageContent[K]
}

const handler = (
  req: NextApiRequest,
  res: NextApiResponse<HomepageResponse | SectionResponse<SectionPayload['section']> | { error: string }>,
): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const content = getHomepageContent()
    res.status(200).json(content)
    return
  }

  if (req.method === 'PUT') {
    const payload = req.body as SectionPayload | undefined
    if (!payload || !payload.section) {
      res.status(400).json({ error: 'missing_section' })
      return
    }

    try {
      switch (payload.section) {
        case 'hero': {
          const updated = updateHomepageSection('hero', payload.content)
          res.status(200).json({ section: 'hero', content: updated })
          break
        }
        case 'personas': {
          const updated = updateHomepageSection('personas', payload.content)
          res.status(200).json({ section: 'personas', content: updated })
          break
        }
        case 'workflow': {
          const updated = updateHomepageSection('workflow', payload.content)
          res.status(200).json({ section: 'workflow', content: updated })
          break
        }
        case 'resources': {
          const updated = updateHomepageSection('resources', payload.content)
          res.status(200).json({ section: 'resources', content: updated })
          break
        }
        case 'faqs': {
          const updated = updateHomepageSection('faqs', payload.content)
          res.status(200).json({ section: 'faqs', content: updated })
          break
        }
        case 'copy': {
          const updated = updateHomepageSection('copy', payload.content)
          res.status(200).json({ section: 'copy', content: updated })
          break
        }
        case 'cta': {
          const updated = updateHomepageSection('cta', payload.content)
          res.status(200).json({ section: 'cta', content: updated })
          break
        }
        default:
          res.status(400).json({ error: 'invalid_section' })
          return
      }
    } catch (error) {
      console.error('Failed to update homepage content', error)
      res.status(400).json({ error: 'invalid_payload' })
    }
    return
  }

  if (req.method === 'PATCH') {
    const { section } = req.query
    if (typeof section !== 'string') {
      res.status(400).json({ error: 'missing_section' })
      return
    }
    try {
      if (
        section === 'hero' ||
        section === 'personas' ||
        section === 'workflow' ||
        section === 'resources' ||
        section === 'faqs' ||
        section === 'copy' ||
        section === 'cta'
      ) {
        const typedSection = section as SectionPayload['section']
        const content = getHomepageSection(typedSection)
        res.status(200).json({ section: typedSection, content })
        return
      }
      res.status(400).json({ error: 'invalid_section' })
      return
    } catch (error) {
      console.error('Failed to load homepage section', error)
      res.status(400).json({ error: 'invalid_section' })
    }
    return
  }

  res.setHeader('Allow', ['GET', 'PUT', 'PATCH'])
  res.status(405).json({ error: 'method_not_allowed' })
}

export default handler
