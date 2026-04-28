const { MongoClient } = require('mongodb')

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME

if (!uri) {
  throw new Error('MONGODB_URI ontbreekt in environment variables')
}

if (!dbName) {
  throw new Error('MONGODB_DB_NAME ontbreekt in environment variables')
}

let client = null
let connectPromise = null
let lastHealthCheckAt = 0

const HEALTH_CHECK_COOLDOWN_MS = 30_000

function createClient() {
  return new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 20000,
    retryWrites: true
  })
}

async function connectClient() {
  if (client) {
    return client
  }

  if (!connectPromise) {
    connectPromise = (async () => {
      const newClient = createClient()
      await newClient.connect()
      client = newClient
      return client
    })().catch((error) => {
      connectPromise = null
      client = null
      throw error
    })
  }

  return connectPromise
}

async function ensureHealthyClient() {
  const activeClient = await connectClient()

  const now = Date.now()
  const shouldCheckHealth =
    !lastHealthCheckAt || now - lastHealthCheckAt > HEALTH_CHECK_COOLDOWN_MS

  if (!shouldCheckHealth) {
    return activeClient
  }

  try {
    await activeClient.db('admin').command({ ping: 1 })
    lastHealthCheckAt = now
    return activeClient
  } catch (error) {
    try {
      await activeClient.close()
    } catch (closeError) {
      console.error('Fout bij sluiten van Mongo client:', closeError)
    }

    client = null
    connectPromise = null
    lastHealthCheckAt = 0

    const reconnectedClient = await connectClient()
    await reconnectedClient.db('admin').command({ ping: 1 })
    lastHealthCheckAt = Date.now()

    return reconnectedClient
  }
}

async function getDb(dbNameOverride) {
  const client = await getMongoClient()

  const dbName = dbNameOverride || process.env.MONGODB_DB_NAME

  if (!dbName) {
    throw new Error('MONGODB_DB_NAME ontbreekt')
  }

  return client.db(dbName)
}

async function getMongoClient() {
  return ensureHealthyClient()
}

async function pingMongo() {
  const healthyClient = await ensureHealthyClient()
  return healthyClient.db('admin').command({ ping: 1 })
}

module.exports = {
  getDb,
  getMongoClient,
  pingMongo
}