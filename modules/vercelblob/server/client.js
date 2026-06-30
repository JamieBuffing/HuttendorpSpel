const { list, put } = require('@vercel/blob')

const token = process.env.BLOB_READ_WRITE_TOKEN

if (!token) {
  throw new Error('BLOB_READ_WRITE_TOKEN ontbreekt in environment variables')
}

const REQUIRE_LOGIN = process.env.BLOB_REQUIRE_LOGIN !== 'false'

async function pingBlob() {
  const result = await list({
    token,
    limit: 1
  })

  return {
    ok: true,
    storeConnected: true,
    blobCountReturned: Array.isArray(result.blobs) ? result.blobs.length : 0,
    cursor: result.cursor || null,
    hasMore: Boolean(result.hasMore)
  }
}

function parseClientPayload(clientPayload) {
  if (!clientPayload) {
    throw new Error('clientPayload ontbreekt')
  }

  let parsed

  try {
    parsed = JSON.parse(clientPayload)
  } catch {
    throw new Error('clientPayload is geen geldige JSON')
  }

  return normalizeClientPayload(parsed)
}

function normalizeClientPayload(payload = {}) {
  const normalized = {
    module: sanitizeSegment(payload.module || 'uploads'),
    entityType: sanitizeSegment(payload.entityType || 'files'),
    entityId: sanitizeSegment(payload.entityId || 'general'),
    field: sanitizeSegment(payload.field || 'file'),
    visibility: payload.visibility === 'private' ? 'private' : 'public',
    originalFilename: sanitizeFilename(payload.originalFilename || 'bestand'),
    uploadKey: sanitizeSegment(payload.uploadKey || ''),
    allowedContentTypes: Array.isArray(payload.allowedContentTypes)
      ? payload.allowedContentTypes.filter(Boolean)
      : []
  }

  if (!normalized.uploadKey) {
    throw new Error('uploadKey ontbreekt in clientPayload')
  }

  return normalized
}

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

function buildBlobPathname(payload) {
  return [
    payload.module,
    payload.entityType,
    payload.entityId,
    payload.field,
    `${payload.uploadKey}-${payload.originalFilename}`
  ].join('/')
}

function getAuthenticatedUser(req) {
  if (req?.session?.isAdminLoggedIn) {
    return { id: 'admin', email: 'admin-login' }
  }

  if (req?.session?.googleUser) {
    return req.session.googleUser
  }

  if (req?.session?.user) {
    return req.session.user
  }

  if (req?.user) {
    return req.user
  }

  if (req?.session?.passport?.user) {
    return req.session.passport.user
  }

  return null
}

async function handleClientUploadRequest(req) {
  const { handleUpload } = await import('@vercel/blob/client')

  return handleUpload({
    token,
    body: req.body,
    request: req,

    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const authenticatedUser = getAuthenticatedUser(req)

      if (REQUIRE_LOGIN && !authenticatedUser) {
        console.error('Blob upload auth ontbreekt', {
          hasSession: Boolean(req.session),
          hasSessionUser: Boolean(req?.session?.user),
          hasReqUser: Boolean(req?.user),
          hasPassportUser: Boolean(req?.session?.passport?.user),
          hasGoogleUser: Boolean(req?.session?.googleUser),
          hasAdminLogin: Boolean(req?.session?.isAdminLoggedIn),
          sessionKeys: req?.session ? Object.keys(req.session) : []
        })

        throw new Error('Login vereist voor upload')
      }

      const payload = parseClientPayload(clientPayload)
      const expectedPathname = buildBlobPathname(payload)

      if (pathname !== expectedPathname) {
        throw new Error('Ongeldig upload pad')
      }

      const options = {
        access: payload.visibility,
        addRandomSuffix: false,
        tokenPayload: JSON.stringify({
          module: payload.module,
          entityType: payload.entityType,
          entityId: payload.entityId,
          field: payload.field,
          visibility: payload.visibility,
          originalFilename: payload.originalFilename,
          uploadKey: payload.uploadKey,
          uploadedBy:
            authenticatedUser?.email ||
            authenticatedUser?.id ||
            authenticatedUser?._id ||
            (typeof authenticatedUser === 'string' ? authenticatedUser : null)
        })
      }

      if (payload.allowedContentTypes.length > 0) {
        options.allowedContentTypes = payload.allowedContentTypes
      }

      return options
    }
  })
}

async function handleServerUploadRequest(req) {
  const authenticatedUser = getAuthenticatedUser(req)

  if (REQUIRE_LOGIN && !authenticatedUser) {
    console.error('Blob server upload auth ontbreekt', {
      hasSession: Boolean(req.session),
      hasSessionUser: Boolean(req?.session?.user),
      hasReqUser: Boolean(req?.user),
      hasPassportUser: Boolean(req?.session?.passport?.user),
      hasGoogleUser: Boolean(req?.session?.googleUser),
      hasAdminLogin: Boolean(req?.session?.isAdminLoggedIn),
      sessionKeys: req?.session ? Object.keys(req.session) : []
    })

    throw new Error('Login vereist voor upload')
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new Error('Uploadbestand ontbreekt')
  }

  const encodedPayload = String(req.headers['x-blob-client-payload'] || '')
  if (!encodedPayload) {
    throw new Error('Upload metadata ontbreekt')
  }

  let clientPayload
  try {
    clientPayload = decodeURIComponent(encodedPayload)
  } catch {
    throw new Error('Upload metadata is ongeldig gecodeerd')
  }

  const payload = parseClientPayload(clientPayload)
  const pathname = buildBlobPathname(payload)
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim()

  if (payload.allowedContentTypes.length > 0 && !payload.allowedContentTypes.includes(contentType)) {
    throw new Error('Bestandstype is niet toegestaan')
  }

  return put(pathname, req.body, {
    access: payload.visibility,
    token,
    contentType: contentType || undefined,
    addRandomSuffix: false
  })
}

module.exports = {
  pingBlob,
  handleClientUploadRequest,
  handleServerUploadRequest,
  buildBlobPathname
}
