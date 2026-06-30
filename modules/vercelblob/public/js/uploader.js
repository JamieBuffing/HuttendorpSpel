(function () {
  const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
  let vercelBlobClientPromise = null

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

  async function loadVercelBlobClient() {
    if (!vercelBlobClientPromise) {
      vercelBlobClientPromise = import('https://esm.sh/@vercel/blob@2.3.3/client?bundle')
        .then((module) => {
          if (typeof module.upload !== 'function') {
            throw new Error('Vercel Blob upload client is niet beschikbaar')
          }

          return module
        })
        .catch((error) => {
          vercelBlobClientPromise = null
          throw new Error(`Vercel Blob direct upload client kon niet laden: ${error.message || error}`)
        })
    }

    return vercelBlobClientPromise
  }

  function shouldUseDirectUpload(file, options) {
    if (options.uploadMode === 'server') return false
    if (options.uploadMode === 'direct') return true

    return file.size > SERVER_UPLOAD_MAX_BYTES || String(file.type || '').startsWith('video/')
  }

  async function uploadViaServer(file, options, payload) {
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

  async function uploadDirectToBlob(file, options, payload) {
    const { upload } = await loadVercelBlobClient()

    return upload(buildBlobPathname(payload), file, {
      access: payload.visibility,
      handleUploadUrl: options.clientUploadUrl || '/vercelblob/client-upload',
      clientPayload: JSON.stringify(payload),
      multipart: true,
      onUploadProgress: typeof options.onUploadProgress === 'function'
        ? options.onUploadProgress
        : undefined
    })
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

    if (shouldUseDirectUpload(file, options)) {
      return uploadDirectToBlob(file, options, payload)
    }

    return uploadViaServer(file, options, payload)
  }

  globalThis.JaBuvoBlobUploader = {
    uploadWithVercelBlob,
    buildBlobPathname
  }
})()
