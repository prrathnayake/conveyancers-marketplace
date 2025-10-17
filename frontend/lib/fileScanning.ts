import path from 'path'

export class FileScanError extends Error {
  code: 'blocked_extension' | 'blocked_mime_type' | 'malicious_content'

  constructor(code: FileScanError['code'], message: string) {
    super(message)
    this.code = code
  }
}

const allowedExtensions = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.rtf',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.heic',
  '.gif',
  '.tiff',
  '.tif',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.zip',
])

const blockedExtensions = new Set(['.exe', '.bat', '.cmd', '.scr', '.ps1', '.psm1', '.vbs', '.js', '.msi', '.com'])

const blockedMimeTypes = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/x-sh',
  'application/x-bat',
  'application/x-ms-installer',
  'text/javascript',
  'application/javascript',
])

const suspiciousPatterns: Array<RegExp> = [
  /<script[\s>]/i,
  /powershell/i,
  /cmd\.exe/i,
  /wget\s+http/i,
  /curl\s+http/i,
  /BEGIN DDEAUTO/i,
]

const suspiciousBuffers = [
  Buffer.from('MZ'), // Windows executables
  Buffer.from('word/vbaProject.bin'), // Office macros
]

type ScanOptions = {
  filename?: string | null
  mimeType?: string | null
}

const getExtension = (filename?: string | null): string | null => {
  if (!filename) {
    return null
  }
  return path.extname(filename).toLowerCase()
}

export const assertFileIsSafe = (buffer: Buffer, options: ScanOptions = {}): void => {
  const extension = getExtension(options.filename)
  if (extension) {
    if (blockedExtensions.has(extension)) {
      throw new FileScanError('blocked_extension', `Uploads with ${extension} files are not permitted`)
    }
    if (!allowedExtensions.has(extension)) {
      throw new FileScanError('blocked_extension', `Unsupported attachment type: ${extension}`)
    }
  }

  const mimeType = options.mimeType?.toLowerCase()
  if (mimeType && blockedMimeTypes.has(mimeType)) {
    throw new FileScanError('blocked_mime_type', `Uploads with MIME type ${mimeType} are not permitted`)
  }

  for (const signature of suspiciousBuffers) {
    if (buffer.indexOf(signature) !== -1) {
      throw new FileScanError('malicious_content', 'Potentially unsafe binary content detected')
    }
  }

  const sample = buffer.slice(0, Math.min(buffer.length, 2048)).toString('utf8').toLowerCase()
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sample)) {
      throw new FileScanError('malicious_content', 'Potentially malicious script content detected')
    }
  }
}

export default assertFileIsSafe
