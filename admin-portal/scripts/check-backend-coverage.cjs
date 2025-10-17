#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const pagesDir = path.join(__dirname, '..', 'pages')
const apiDir = path.join(pagesDir, 'api')

const tsxFiles = []
const stack = [pagesDir]
while (stack.length > 0) {
  const current = stack.pop()
  const entries = fs.readdirSync(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name === 'api') {
      continue
    }
    const resolved = path.join(current, entry.name)
    if (entry.isDirectory()) {
      stack.push(resolved)
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      tsxFiles.push(resolved)
    }
  }
}

const apiPathPattern = /['"`]\/api\/([A-Za-z0-9_\-\/\[\]]*)/g
const endpoints = new Map()

for (const file of tsxFiles) {
  const source = fs.readFileSync(file, 'utf8')
  const matches = new Set()
  let match
  while ((match = apiPathPattern.exec(source)) !== null) {
    const rawPath = match[1]
    if (!rawPath) {
      continue
    }
    const normalized = rawPath.replace(/\/?$/, '')
    matches.add(normalized)
  }
  if (matches.size > 0) {
    endpoints.set(file, Array.from(matches).sort())
  }
}

const missing = []

const checkEndpoint = (relativePath) => {
  const safePath = relativePath.replace(/^\/+/, '')
  if (!safePath) {
    return true
  }
  const fileCandidate = path.join(apiDir, `${safePath}.ts`)
  if (fs.existsSync(fileCandidate)) {
    return true
  }
  const directoryCandidate = path.join(apiDir, safePath)
  if (fs.existsSync(directoryCandidate)) {
    const stat = fs.statSync(directoryCandidate)
    if (stat.isDirectory()) {
      const contents = fs.readdirSync(directoryCandidate)
      return contents.some((item) => /\.(ts|tsx)$/.test(item))
    }
  }
  return false
}

for (const [file, paths] of endpoints.entries()) {
  for (const endpoint of paths) {
    if (!checkEndpoint(endpoint)) {
      missing.push({ file: path.relative(pagesDir, file), endpoint })
    }
  }
}

if (endpoints.size === 0) {
  console.log('No admin UI pages invoke API endpoints.')
  process.exit(0)
}

console.log('Discovered admin UI → API dependencies:')
for (const [file, paths] of endpoints.entries()) {
  console.log(`- ${path.relative(pagesDir, file)}`)
  for (const endpoint of paths) {
    const status = checkEndpoint(endpoint) ? '✓' : '✗'
    console.log(`  ${status} /api/${endpoint}`)
  }
}

if (missing.length > 0) {
  console.error('\nMissing API implementations detected:')
  for (const item of missing) {
    console.error(`- ${item.endpoint} referenced in ${item.file}`)
  }
  process.exit(1)
}

console.log('\nAll referenced admin API routes are implemented.')
