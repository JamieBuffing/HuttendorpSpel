const express = require('express')
const path = require('path')
const { pingMongo } = require('./server/client')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    await pingMongo()

    res.render('mongoDB/views/index', {
      mongoStatus: 'connected',
      mongoMessage: 'MongoDB verbinding werkt'
    })
  } catch (error) {
    console.error('MongoDB healthcheck fout:', error)

    res.status(500).render('mongoDB/views/index', {
      mongoStatus: 'error',
      mongoMessage: error.message || 'MongoDB verbinding mislukt'
    })
  }
})

router.get('/health', async (req, res) => {
  try {
    await pingMongo()

    return res.status(200).json({
      ok: true,
      module: 'mongoDB',
      status: 'connected'
    })
  } catch (error) {
    console.error('MongoDB /health fout:', error)

    return res.status(500).json({
      ok: false,
      module: 'mongoDB',
      status: 'error',
      message: error.message || 'MongoDB verbinding mislukt'
    })
  }
})

const publicPath = path.join(__dirname, 'public')

module.exports = {
  name: 'MongoDB',
  path: '/mongodb',
  router,
  publicPath,
  key: 'mongodb',
  access: {
    type: 'service',
    required: true,
    teamBased: false,
    canDisable: false
  }
}