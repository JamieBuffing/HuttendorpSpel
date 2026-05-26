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

const PIXELMAP_DATA_ZONES = [
  { x: 4, y: 4, w: 111, h: 8 },
  { x: 4, y: 13, w: 120, h: 8 },
  { x: 4, y: 22, w: 120, h: 8 },
  { x: 4, y: 31, w: 120, h: 8 },
  { x: 4, y: 40, w: 120, h: 8 },
  { x: 4, y: 49, w: 120, h: 8 }
]

function barcodeChecksum(data) {
  let total = 0
  for (const char of String(data || '')) total += char.charCodeAt(0)
  const value = total % 16
  return value < 10 ? String(value) : String.fromCharCode(65 + value - 10)
}

function hexFromBits(bitString) {
  const clean = String(bitString || '').replace(/[^01]/g, '')
  let hex = ''

  for (let i = 0; i + 3 < clean.length; i += 4) {
    hex += parseInt(clean.slice(i, i + 4), 2).toString(16).toUpperCase()
  }

  return hex
}

function decodePixelmapBitString(bitString) {
  const hex = hexFromBits(bitString)

  if (hex.length < 4) throw new Error('Code is te kort')

  const rawLength = parseInt(hex.slice(0, 2), 16)
  if (!Number.isFinite(rawLength) || rawLength < 5) throw new Error('Lengte in code is ongeldig')

  const neededLength = 2 + rawLength + 1
  if (hex.length < neededLength) throw new Error('Code is niet compleet')

  const raw = hex.slice(2, 2 + rawLength)
  const checksum = hex.slice(2 + rawLength, 2 + rawLength + 1)
  const expected = barcodeChecksum(raw)

  if (checksum !== expected) {
    throw new Error(`Checksum klopt niet (${checksum} ≠ ${expected})`)
  }

  const postId = raw.slice(0, 3).toLowerCase()
  const answer = raw.slice(3, 4).toUpperCase()
  const uid = raw.slice(4).toUpperCase()

  if (!postId || !uid || !['R', 'G', 'B'].includes(answer)) {
    throw new Error('Code bevat geen geldige post, UID of antwoord')
  }

  return { postId, uid, answer, raw, checksum }
}

router.get('/import', requireLogin, (req, res) => {
  res.render('pages/import', {
    result: null,
    error: null,
    zones: PIXELMAP_DATA_ZONES
  })
})

router.post('/import/scan-code', requireLogin, async (req, res) => {
  try {
    const decoded = decodePixelmapBitString(req.body.bitString || '')

    const result = await saveAnswerFromEsp({
      postId: decoded.postId,
      cardId: decoded.uid,
      teamId: decoded.uid,
      answer: decoded.answer,
      allowOverwrite: false
    })

    if (!result.ok && result.alreadyAnswered) {
      return res.json({ ok: true, alreadyAnswered: true, decoded, result })
    }

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'Opslaan mislukt', decoded, result })
    }

    res.json({ ok: true, decoded, result })
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Code kon niet gelezen worden' })
  }
})

router.post('/import', requireLogin, async (req, res) => {
  try {
    const decoded = decodePixelmapBitString(req.body.bitString || req.body.code || '')
    const result = await saveAnswerFromEsp({
      postId: decoded.postId,
      cardId: decoded.uid,
      teamId: decoded.uid,
      answer: decoded.answer,
      allowOverwrite: false
    })

    res.render('pages/import', {
      result: { decoded, result },
      error: result.ok || result.alreadyAnswered ? null : result.error,
      zones: PIXELMAP_DATA_ZONES
    })
  } catch (error) {
    res.status(400).render('pages/import', {
      result: null,
      error: error.message || 'Code kon niet gelezen worden',
      zones: PIXELMAP_DATA_ZONES
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