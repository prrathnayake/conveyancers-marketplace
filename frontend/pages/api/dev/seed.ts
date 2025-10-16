import fs from 'fs/promises'
import path from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'
import { Pool } from 'pg'

import { ensureDevToken } from '../../../lib/auth'

const resolveSeedFile = () => {
  const customPath = process.env.DEV_SEED_SQL_PATH
  if (customPath) {
    return customPath
  }
  return path.join(process.cwd(), '..', 'backend', 'sql', '2_seed.sql')
}

const createPool = () => {
  const connectionString = process.env.DEV_SEED_DATABASE_URL
  if (!connectionString) {
    throw new Error('DEV_SEED_DATABASE_URL is not configured')
  }
  return new Pool({ connectionString })
}

const executeSeed = async () => {
  const filePath = resolveSeedFile()
  const sql = await fs.readFile(filePath, 'utf8')
  const pool = createPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  if (!ensureDevToken(req)) {
    res.status(401).json({ error: 'unauthorised' })
    return
  }

  try {
    await executeSeed()
    res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Failed to run seed', error)
    res.status(500).json({ error: 'seed_failed' })
  }
}
