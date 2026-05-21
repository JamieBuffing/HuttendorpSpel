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

function nibbleToHex(value) {
  const clean = Number(value || 0) & 15
  return clean < 10 ? String(clean) : String.fromCharCode(55 + clean)
}

function checksumHex(data) {
  const total = String(data || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 16
  return nibbleToHex(total)
}

function bitsToNibble(bits) {
  return String(bits || '').split('').reduce((value, bit) => (value << 1) + (bit === '1' ? 1 : 0), 0) & 15
}

function decodeBackupRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 6) {
    throw new Error('Er zijn exact 6 coderegels nodig.')
  }

  const nibbles = []
  for (const row of rows) {
    const cleanRow = String(row || '').replace(/[^01]/g, '')
    if (cleanRow.length !== 16) {
      throw new Error('Elke coderegel moet 16 bits bevatten.')
    }

    for (let i = 0; i < 16; i += 4) {
      nibbles.push(bitsToNibble(cleanRow.slice(i, i + 4)))
    }
  }

  // Arduino payload-indeling:
  // positie 0: P, 1-2: postnummer, 3: antwoord, 4-17: UID, 18: checksum, 19-23: padding
  const postId = `p${nibbleToHex(nibbles[1])}${nibbleToHex(nibbles[2])}`.toLowerCase()
  const answerMap = { 13: 'R', 12: 'G', 11: 'B' }
  const answer = answerMap[nibbles[3]]

  if (!answer) {
    throw new Error('Antwoord kon niet worden gelezen.')
  }

  const uid = nibbles.slice(4, 18).map(nibbleToHex).join('').toUpperCase()
  const checksum = nibbleToHex(nibbles[18])
  const expectedChecksum = checksumHex(`P${postId.slice(1).toUpperCase()}${answer}${uid}`)

  if (checksum !== expectedChecksum) {
    throw new Error(`Checksum klopt niet. Gelezen: ${checksum}, verwacht: ${expectedChecksum}.`)
  }

  return { postId, uid, answer, checksum }
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

router.post('/import/scan-code', requireLogin, async (req, res) => {
  try {
    const decoded = decodeBackupRows(req.body.rows)
    const result = await saveAnswerFromEsp({
      postId: decoded.postId,
      teamId: decoded.uid,
      cardId: decoded.uid,
      answer: decoded.answer,
      allowOverwrite: false
    })

    res.status(result.ok || result.alreadyAnswered ? 200 : 400).json({
      ok: Boolean(result.ok || result.alreadyAnswered),
      decoded,
      result,
      alreadyAnswered: Boolean(result.alreadyAnswered)
    })
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message || 'Backup-code kon niet worden gelezen.'
    })
  }
})

router.post('/import', requireLogin, async (req, res) => {
  try {
    let rows = req.body.rows
    if (typeof rows === 'string') {
      rows = rows
        .split('\n')
        .map((row) => row.trim())
        .filter(Boolean)
    }

    const decoded = decodeBackupRows(rows)
    const result = await saveAnswerFromEsp({
      postId: decoded.postId,
      teamId: decoded.uid,
      cardId: decoded.uid,
      answer: decoded.answer,
      allowOverwrite: false
    })

    res.render('pages/import', {
      result: { decoded, result },
      error: null
    })
  } catch (error) {
    res.status(400).render('pages/import', {
      result: null,
      error: error.message || 'Backup-code kon niet worden gelezen.'
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