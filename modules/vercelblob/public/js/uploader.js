(function () {
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

    const response = await fetch(options.handleUploadUrl || '/vercelblob/server-upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Blob-Client-Payload': encodeURIComponent(JSON.stringify(payload))
      },
      body: file
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(result?.error || 'Upload naar Vercel Blob mislukt')
    }

    return result
  }

  globalThis.JaBuvoBlobUploader = {
    uploadWithVercelBlob,
    buildBlobPathname
  }
})()
