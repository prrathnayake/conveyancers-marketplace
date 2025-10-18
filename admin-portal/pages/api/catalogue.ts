import type { NextApiRequest, NextApiResponse } from 'next'

import type { CatalogueEntry } from '../../../frontend/lib/catalogue'
import { listCatalogueEntries, saveCatalogueEntries } from '../../../frontend/lib/catalogue'
import { requireRole } from '../../../frontend/lib/session'
type CatalogueResponse = {
  entries: CatalogueEntry[]
}

const handler = (req: NextApiRequest, res: NextApiResponse<CatalogueResponse | { error: string }>): void => {
  const user = requireRole(req, res, ['admin'])
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const entries = listCatalogueEntries()
    res.status(200).json({ entries })
    return
  }

  if (req.method === 'PUT') {
    const { entries } = req.body as { entries?: CatalogueEntry[] }
    if (!entries || !Array.isArray(entries)) {
      res.status(400).json({ error: 'missing_entries' })
      return
    }

    saveCatalogueEntries(entries, user)

    res.status(200).json({ entries: listCatalogueEntries() })
    return
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  res.status(405).json({ error: 'method_not_allowed' })
}

export default handler
