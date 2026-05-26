const express = require('express')
const { ObjectId } = require('mongodb')
const {
  POST_IDS,
  db,
  requireLogin,
  getFirstAvailablePostId,
  buildLeaderboard,
  buildLeidingOverview,
  saveAnswerFromEsp,
  objectIdOrNull
} = require('../helpers')

const router = express.Router()

function parseBackupJson(raw) {
  const value = String(raw || '').trim()
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (error) {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  }
}

function normalizeRawRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .slice(0, 6)
    .map((row) => String(row || '').replace(/[^01]/g, ''))
}

function normalizeRawBits(bits) {
  return String(bits || '').replace(/[^01]/g, '')
}

function checksum(data) {
  const total = String(data || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 16
  return total < 10 ? String(total) : String.fromCharCode(55 + total)
}

function valueToPayloadChar(value, index) {
  if (index === 0) return value === 14 ? 'P' : null
  if (index === 3) {
    if (value === 11) return 'B'
    if (value === 12) return 'G'
    if (value === 13) return 'R'
    return null
  }
  if (value >= 0 && value <= 9) return String(value)
  if (value >= 10 && value <= 15) return String.fromCharCode(55 + value)
  return null
}

function parsePayload(payload) {
  const clean = String(payload || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-FP RGB]/g, '')
    .replace(/\s/g, '')
  if (clean.length < 6) return null

  const data = clean.slice(0, -1)
  const check = clean.slice(-1)
  if (checksum(data) !== check) return null
  if (data[0] !== 'P') return null

  const postId = data.slice(0, 3).toLowerCase()
  const answer = data[3]
  const uid = data.slice(4).toUpperCase()

  if (!/^p\d\d$/.test(postId)) return null
  if (!['R', 'G', 'B'].includes(answer)) return null
  if (!/^[0-9A-F]+$/.test(uid)) return null

  return { postId, uid, cardId: uid, teamId: uid, answer, payload: clean }
}

function decodePayloadFromBits(rawBits, payloadLength) {
  const bits = normalizeRawBits(rawBits)
  if (bits.length < payloadLength * 4) return null

  let payload = ''

  for (let i = 0; i < payloadLength; i++) {
    const chunk = bits.slice(i * 4, i * 4 + 4)
    if (chunk.length !== 4) return null

    const value = parseInt(chunk, 2)
    const char = valueToPayloadChar(value, i)
    if (!char) return null

    payload += char
  }

  return parsePayload(payload)
}

function bitFromSample(sample) {
  if (!sample) return 0
  const ones = sample.split('').filter((bit) => bit === '1').length
  return ones >= Math.ceil(sample.length / 2) ? 1 : 0
}

function rawRowsToBitStream(rawRows) {
  const rows = normalizeRawRows(rawRows)
  if (rows.length !== 6) return ''

  const DATA_X = 4
  const DATA_BIT_W = 2
  const DATA_ROW1_W = 111
  const DATA_ROW_W = 120

  let bits = ''

  for (let rowIndex = 0; rowIndex < 6; rowIndex++) {
    const row = rows[rowIndex]
    const rowWidth = rowIndex === 0 ? DATA_ROW1_W : DATA_ROW_W
    const cells = Math.floor(rowWidth / DATA_BIT_W)

    if (row.length < DATA_X + rowWidth - 2) return ''

    for (let i = 0; i < cells; i++) {
      const start = DATA_X + i * DATA_BIT_W
      bits += bitFromSample(row.slice(start, start + DATA_BIT_W)) ? '1' : '0'
    }
  }

  return bits
}

function decodeOledBackupCode({ rawRows, rawBits, payload }) {
  if (payload) {
    const parsed = parsePayload(payload)
    if (parsed) return parsed
  }

  const bits = normalizeRawBits(rawBits) || rawRowsToBitStream(rawRows)
  if (!bits) return null

  // Payload is: P01 + R/G/B + UID + checksum.
  // Try short to long. Capacity is currently 355 bits = 88 chars.
  for (let payloadLength = 6; payloadLength <= Math.floor(bits.length / 4); payloadLength++) {
    const decoded = decodePayloadFromBits(bits, payloadLength)
    if (decoded) return decoded
  }

  return null
}

router.get('/', (req, res) => res.redirect('/dashboard'))

router.get('/login', (req, res) => {
  if (req.session?.isAdminLoggedIn) return res.redirect('/leaderboard')
  res.render('pages/login', { error: null, next: req.query.next || '/leaderboard' })
})

router.post('/login', (req, res) => {
  const password = process.env.ADMIN_PASSWORD || process.env.LOGIN_PASSWORD
  if (req.body.password === password) {
    req.session.isAdminLoggedIn = true
    return res.redirect(req.body.next || '/leaderboard')
  }
  res.status(401).render('pages/login', { error: 'Wachtwoord klopt niet.', next: req.body.next || '/leaderboard' })
})

router.post('/logout', (req, res) => {
  req.session.isAdminLoggedIn = false
  res.redirect('/dashboard')
})

router.get('/dashboard', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    const database = await db()
    const cardId = String(req.query.cardId || '').trim()
    let team = null
    let progressRows = []

    if (cardId) {
      team = await database.collection('teams').findOne({ cardId, isActive: { $ne: false } })
      if (team) {
        const questionIds = (team.questionProgress || []).map((item) => item.questionId).filter(Boolean)
        const questions = await database.collection('questions').find({ _id: { $in: questionIds } }).toArray()
        const questionMap = new Map(questions.map((question) => [String(question._id), question]))
        progressRows = (team.questionProgress || [])
          .slice()
          .sort((a, b) => new Date(a.answeredAt || 0) - new Date(b.answeredAt || 0))
          .map((item) => ({ progress: item, question: questionMap.get(String(item.questionId)) }))
      }
    }

    res.render('pages/dashboard', { cardId, team, progressRows })
  } catch (error) {
    next(error)
  }
})

router.get('/leaderboard', requireLogin, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store')
    res.render('pages/leaderboard', { teams: await buildLeaderboard() })
  } catch (error) {
    next(error)
  }
})

router.get('/leiding-overzicht', requireLogin, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store')
    res.render('pages/leiding-overzicht', { overview: await buildLeidingOverview() })
  } catch (error) {
    next(error)
  }
})

router.get('/import', requireLogin, (req, res) => {
  res.render('pages/import', {
    result: null,
    error: null
  })
})

router.post('/import/scan-code', requireLogin, async (req, res, next) => {
  try {
    const decoded = decodeOledBackupCode({
      rawRows: req.body.rawRows,
      rawBits: req.body.rawBits,
      payload: req.body.payload
    })

    if (!decoded) {
      return res.status(400).json({
        ok: false,
        error: 'Code niet herkend of checksum klopt niet. Houd het OLED-scherm recht in het kader en probeer opnieuw.'
      })
    }

    const result = await saveAnswerFromEsp({
      postId: decoded.postId,
      cardId: decoded.uid,
      teamId: decoded.uid,
      answer: decoded.answer,
      allowOverwrite: false
    })

    if (!result.ok && result.alreadyAnswered) {
      return res.json({
        ok: true,
        alreadyAnswered: true,
        decoded,
        result,
        message: 'Antwoord stond al in de database.'
      })
    }

    if (!result.ok) {
      return res.status(400).json({ ok: false, decoded, result, error: result.error || 'Import mislukt' })
    }

    res.json({ ok: true, decoded, result, message: 'Backup antwoord opgeslagen.' })
  } catch (error) {
    next(error)
  }
})

router.post('/import', requireLogin, async (req, res) => {
  const rawJson = String(req.body.json || '')

  try {
    const objects = parseBackupJson(rawJson)
    const results = []

    for (const item of objects) {
      results.push(await saveAnswerFromEsp({
        postId: item.postId || item.id,
        teamId: item.teamId || item.cardId,
        cardId: item.cardId || item.teamId,
        answer: item.answer,
        allowOverwrite: false
      }))
    }

    res.render('pages/import', {
      result: { legacy: true, results, count: objects.length },
      error: null
    })
  } catch (error) {
    res.status(400).render('pages/import', {
      result: null,
      error: 'Ongeldige import.'
    })
  }
})

router.get('/setup', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const teams = await database.collection('teams').find({}).sort({ createdAt: 1 }).toArray()
    res.render('pages/setup', { teams, error: null })
  } catch (error) {
    next(error)
  }
})

router.get('/beheer', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const questions = await database.collection('questions').find({ isActive: { $ne: false } }).sort({ type: 1, postId: 1, createdAt: 1 }).toArray()
    const availablePostId = await getFirstAvailablePostId()
    const usedPostIds = new Set(questions.filter((q) => q.type === 'normal').map((q) => q.postId))
    res.render('pages/beheer', { questions, availablePostId, usedPostIds, postIds: POST_IDS, editingQuestion: null, error: null })
  } catch (error) {
    next(error)
  }
})

router.get('/beheer/:id/edit', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const editingQuestion = await database.collection('questions').findOne({ _id: new ObjectId(req.params.id) })
    if (!editingQuestion) return res.redirect('/beheer')
    const questions = await database.collection('questions').find({ isActive: { $ne: false } }).sort({ type: 1, postId: 1, createdAt: 1 }).toArray()
    const availablePostId = editingQuestion.postId || await getFirstAvailablePostId(editingQuestion._id)
    const usedPostIds = new Set(questions.filter((q) => q.type === 'normal' && String(q._id) !== String(editingQuestion._id)).map((q) => q.postId))
    res.render('pages/beheer', { questions, availablePostId, usedPostIds, postIds: POST_IDS, editingQuestion, error: null })
  } catch (error) {
    next(error)
  }
})

router.get('/gamemaster', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const cardId = String(req.query.cardId || '').trim()
    const finalQuestions = await database.collection('questions').find({ type: 'final', isActive: { $ne: false } }).sort({ createdAt: 1 }).toArray()
    let team = null
    let rows = []

    if (cardId) {
      team = await database.collection('teams').findOne({ cardId, isActive: { $ne: false } })
      if (team) {
        rows = finalQuestions.map((question) => {
          const progress = (team.questionProgress || []).find((item) => String(item.questionId) === String(question._id) && item.type === 'final')
          return { question, progress }
        })
      }
    }

    res.render('pages/gamemaster', { cardId, team, finalQuestions, rows })
  } catch (error) {
    next(error)
  }
})

module.exports = router