const fs = require('node:fs')
const path = require('node:path')

function trim(value) {
  let start = 0
  let end = value.length
  while (start < end && /\s/.test(value[start])) {
    start += 1
  }
  while (end > start && /\s/.test(value[end - 1])) {
    end -= 1
  }
  return value.slice(start, end)
}

function stripInlineComment(value) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (char === '#' && !inSingle && !inDouble) {
      return value.slice(0, i).trimEnd()
    }
  }
  return value.trimEnd()
}

function applyEnvFile(filePath, { override } = { override: false }) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false
  }
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = trim(rawLine)
    if (!line || line.startsWith('#')) {
      continue
    }
    const equalsIndex = line.indexOf('=')
    if (equalsIndex === -1) {
      continue
    }
    let key = trim(line.slice(0, equalsIndex))
    if (key.startsWith('export ')) {
      key = trim(key.slice('export '.length))
    }
    if (!key) {
      continue
    }
    let value = line.slice(equalsIndex + 1)
    // Preserve leading whitespace in the raw value until after comment stripping.
    if (!value) {
      value = ''
    }
    value = stripInlineComment(value.replace(/^\s+/, ''))
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!override && Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue
    }
    process.env[key] = value
  }
  return true
}

function locateEnvBase(startDir) {
  let dir = startDir
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, '.env')
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (!parent || parent === dir) {
      break
    }
    dir = parent
  }
  return null
}

function loadEnv(options = {}) {
  const startDir = options.startDir ? path.resolve(options.startDir) : process.cwd()
  const loaded = []
  const visited = new Set()

  const record = (filePath, override) => {
    if (!filePath) {
      return
    }
    const absolute = path.resolve(filePath)
    if (visited.has(absolute)) {
      return
    }
    if (applyEnvFile(absolute, { override })) {
      visited.add(absolute)
      loaded.push(absolute)
    }
  }

  const explicit = process.env.CONVEYANCERS_ENV_FILE && process.env.CONVEYANCERS_ENV_FILE.trim()
  if (explicit) {
    record(path.isAbsolute(explicit) ? explicit : path.resolve(startDir, explicit), true)
    return loaded
  }

  const baseEnv = locateEnvBase(startDir)
  if (baseEnv) {
    record(baseEnv, false)
    const localEnv = `${baseEnv}.local`
    if (fs.existsSync(localEnv) && fs.statSync(localEnv).isFile()) {
      record(localEnv, true)
    }
  }
  return loaded
}

module.exports = { loadEnv }
