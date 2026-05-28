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
  objectIdOrNull,
  getGameContext,
  getCurrentGameId,
  gameFilter
} = require('../helpers')

const router = express.Router()

function decodeQrBackupCode(input) {
  const code = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const match = code.match(/^(P\d{2})([RGB])([0-9A-F]{4,32})$/)
  if (!match) {
    throw new Error('Ongeldige QR-code. Verwacht formaat zoals P01R042A16BAFC2091.')
  }
  return {
    code,
    postId: match[1].toLowerCase(),
    answer: match[2],
    uid: match[3]
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

router.use(async (req, res, next) => {
  try {
    const { currentGame, games } = await getGameContext()
    res.locals.currentGame = currentGame
    res.locals.games = games
    res.locals.currentUrl = req.originalUrl
    next()
  } catch (error) {
    next(error)
  }
})

router.get('/dashboard', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    const database = await db()
    const gameId = await getCurrentGameId()
    const cardId = String(req.query.cardId || '').trim().toUpperCase()
    let team = null
    let progressRows = []

    if (cardId) {
      team = await database.collection('teams').findOne({ gameId, cardId, isActive: { $ne: false } })
      if (team) {
        const questionIds = (team.questionProgress || []).map((item) => item.questionId).filter(Boolean)
        const questions = await database.collection('questions').find({ gameId, _id: { $in: questionIds } }).toArray()
        const questionMap = new Map(questions.map((question) => [String(question._id), question]))
        progressRows = (team.questionProgress || [])
          .filter((item) => questionMap.has(String(item.questionId)))
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
    const decoded = decodeQrBackupCode(req.body.code)

    if (req.body.testOnly === true || req.body.testOnly === 'true') {
      return res.json({ ok: true, testOnly: true, decoded })
    }

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
      error: error.message || 'QR-code kon niet worden verwerkt.'
    })
  }
})

router.post('/import', requireLogin, async (req, res) => {
  try {
    const decoded = decodeQrBackupCode(req.body.code)
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
      error: error.message || 'QR-code kon niet worden verwerkt.'
    })
  }
})

router.get('/setup', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const teams = await database.collection('teams').find(await gameFilter({})).sort({ createdAt: 1 }).toArray()
    res.render('pages/setup', { teams, error: null })
  } catch (error) {
    next(error)
  }
})

router.get('/beheer', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const questions = await database.collection('questions').find(await gameFilter({ isActive: { $ne: false } })).sort({ type: 1, postId: 1, createdAt: 1 }).toArray()
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
    const gameId = await getCurrentGameId()
    const editingQuestion = await database.collection('questions').findOne({ _id: new ObjectId(req.params.id), gameId })
    if (!editingQuestion) return res.redirect('/beheer')
    const questions = await database.collection('questions').find({ gameId, isActive: { $ne: false } }).sort({ type: 1, postId: 1, createdAt: 1 }).toArray()
    const availablePostId = editingQuestion.postId || await getFirstAvailablePostId(editingQuestion._id, gameId)
    const usedPostIds = new Set(questions.filter((q) => q.type === 'normal' && String(q._id) !== String(editingQuestion._id)).map((q) => q.postId))
    res.render('pages/beheer', { questions, availablePostId, usedPostIds, postIds: POST_IDS, editingQuestion, error: null })
  } catch (error) {
    next(error)
  }
})

router.get('/gamemaster', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const gameId = await getCurrentGameId()
    const cardId = String(req.query.cardId || '').trim().toUpperCase()
    const finalQuestions = await database.collection('questions').find({ gameId, type: 'final', isActive: { $ne: false } }).sort({ createdAt: 1 }).toArray()
    let team = null
    let rows = []

    if (cardId) {
      team = await database.collection('teams').findOne({ gameId, cardId, isActive: { $ne: false } })
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
