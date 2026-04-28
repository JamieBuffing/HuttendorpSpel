import { upload } from 'https://esm.sh/@vercel/blob/client'

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 120)
}

function sanitizeFilename(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')

  return cleaned || 'bestand'
}

function createUploadKey() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildBlobPathname(payload) {
  return [
    payload.module,
    payload.entityType,
    payload.entityId,
    payload.field,
    `${payload.uploadKey}-${payload.originalFilename}`
  ].join('/')
}

async function uploadWithVercelBlob(file, options = {}) {
  if (!file) {
    throw new Error('Geen bestand gekozen')
  }

  const payload = {
    module: sanitizeSegment(options.module || 'uploads'),
    entityType: sanitizeSegment(options.entityType || 'files'),
    entityId: sanitizeSegment(options.entityId || 'general'),
    field: sanitizeSegment(options.field || 'file'),
    visibility: options.visibility === 'private' ? 'private' : 'public',
    originalFilename: sanitizeFilename(file.name),
    uploadKey: createUploadKey(),
    allowedContentTypes: Array.isArray(options.allowedContentTypes)
      ? options.allowedContentTypes.filter(Boolean)
      : []
  }

  const pathname = buildBlobPathname(payload)

  return upload(pathname, file, {
    access: payload.visibility,
    handleUploadUrl: options.handleUploadUrl || '/vercelblob/client-upload',
    clientPayload: JSON.stringify(payload),
    onUploadProgress: typeof options.onUploadProgress === 'function'
      ? options.onUploadProgress
      : undefined
  })
}

globalThis.JaBuvoBlobUploader = {
  uploadWithVercelBlob,
  buildBlobPathname
}

export {
  uploadWithVercelBlob,
  buildBlobPathname
}