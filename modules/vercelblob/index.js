const express = require('express')
const path = require('path')
const {
  pingBlob,
  handleClientUploadRequest
} = require('./server/client')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const details = await pingBlob()

    res.render('vercelblob/views/index', {
      blobStatus: 'connected',
      blobMessage: 'Vercel Blob service module werkt',
      blobDetails: details
    })
  } catch (error) {
    console.error('Vercel Blob module fout:', error)

    res.status(500).render('vercelblob/views/index', {
      blobStatus: 'error',
      blobMessage: error.message || 'Vercel Blob verbinding mislukt',
      blobDetails: null
    })
  }
})

router.get('/health', async (req, res) => {
  try {
    const details = await pingBlob()

    return res.status(200).json({
      ok: true,
      module: 'vercelblob',
      status: 'connected',
      details
    })
  } catch (error) {
    console.error('Vercel Blob /health fout:', error)

    return res.status(500).json({
      ok: false,
      module: 'vercelblob',
      status: 'error',
      message: error.message || 'Vercel Blob verbinding mislukt'
    })
  }
})

router.post('/client-upload', async (req, res) => {
  try {
    const jsonResponse = await handleClientUploadRequest(req)
    return res.status(200).json(jsonResponse)
  } catch (error) {
    console.error('Vercel Blob client upload fout:', error)
    return res.status(400).json({
      error: error.message || 'Client upload mislukt'
    })
  }
})

const publicPath = path.join(__dirname, 'public')

module.exports = {
  name: 'Vercel Blob',
  path: '/vercelblob',
  router,
  publicPath,
  key: 'vercelblob',
  access: {
    type: 'service',
    required: true,
    teamBased: false,
    canDisable: false
  }
}