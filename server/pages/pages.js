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

function calculateBackupChecksum(data) {
  const total = String(data || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const value = total % 16
  return value < 10 ? String(value) : String.fromCharCode('A'.charCodeAt(0) + value - 10)
}

function normalizeDecodedPostId(value) {
  const clean = String(value || '').toUpperCase()
  const match = clean.match(/^P(\d{2})/)
  if (match) return `p${match[1]}`
  return clean.toLowerCase()
}

function decodeBackupCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^0-9A-FPBRG]/g, '')

  if (code.length < 6) {
    return { ok: false, error: 'Code te kort' }
  }

  if (code[0] !== 'P') {
    return { ok: false, error: 'Code moet met P beginnen' }
  }

  const postPart = code.slice(0, 3)
  const answer = code[3]

  if (!['R', 'G', 'B'].includes(answer)) {
    return { ok: false, error: 'Ongeldig antwoord in code' }
  }

  // Zoek de checksumpositie. De Arduino vult na de checksum aan met nullen tot 24 tekens.
  for (let checksumIndex = 5; checksumIndex < code.length; checksumIndex++) {
    const payload = code.slice(0, checksumIndex)
    const checksum = code[checksumIndex]
    const rest = code.slice(checksumIndex + 1)

    if (rest && !/^0*$/.test(rest)) continue
    if (calculateBackupChecksum(payload) !== checksum) continue

    const uid = code.slice(4, checksumIndex)
    if (!uid) continue

    return {
      ok: true,
      postId: normalizeDecodedPostId(postPart),
      uid,
      answer,
      checksum
    }
  }

  // Fallback voor bekende UID-lengte van NTAG kaarten: 14 hex tekens.
  const payload = code.slice(0, 18)
  const checksum = code[18]
  if (payload.length === 18 && checksum && calculateBackupChecksum(payload) === checksum) {
    return {
      ok: true,
      postId: normalizeDecodedPostId(postPart),
      uid: code.slice(4, 18),
      answer,
      checksum
    }
  }

  return { ok: false, error: 'Checksum klopt niet of code is onvolledig' }
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
    decoded: null,
    result: null,
    error: null
  })
})

router.post('/import/scan-code', requireLogin, async (req, res, next) => {
  try {
    const decoded = decodeBackupCode(req.body.code)

    if (!decoded.ok) {
      return res.status(400).json(decoded)
    }

    const result = await saveAnswerFromEsp({
      postId: decoded.postId,
      cardId: decoded.uid,
      teamId: decoded.uid,
      answer: decoded.answer,
      allowOverwrite: false
    })

    if (!result.ok && !result.alreadyAnswered) {
      return res.status(400).json({ ok: false, decoded, result, error: result.error || 'Import mislukt' })
    }

    res.json({ ok: true, decoded, result, alreadyAnswered: Boolean(result.alreadyAnswered) })
  } catch (error) {
    next(error)
  }
})

router.post('/import', requireLogin, async (req, res) => {
  const rawCode = String(req.body.code || '')
  const decoded = decodeBackupCode(rawCode)

  if (!decoded.ok) {
    return res.status(400).render('pages/import', {
      decoded: null,
      result: null,
      error: decoded.error || 'Ongeldige backup-code.'
    })
  }

  const result = await saveAnswerFromEsp({
    postId: decoded.postId,
    cardId: decoded.uid,
    teamId: decoded.uid,
    answer: decoded.answer,
    allowOverwrite: false
  })

  res.render('pages/import', {
    decoded,
    result,
    error: result.ok || result.alreadyAnswered ? null : (result.error || 'Import mislukt')
  })
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