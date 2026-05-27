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

const DATA_ROWS_DEF = [
  { x: 4, y: 4, bits: 13 },
  { x: 4, y: 13, bits: 15 },
  { x: 4, y: 22, bits: 15 },
  { x: 4, y: 31, bits: 15 },
  { x: 4, y: 40, bits: 15 },
  { x: 4, y: 49, bits: 15 }
]

const TOTAL_BACKUP_BITS = DATA_ROWS_DEF.reduce((sum, row) => sum + row.bits, 0)

function hexDigit(value) {
  const v = Number(value) & 0x0F
  return v < 10 ? String(v) : String.fromCharCode(65 + v - 10)
}

function calculateBackupChecksum(data) {
  let total = 0
  for (const ch of String(data || '')) total += ch.charCodeAt(0)
  return hexDigit(total % 16)
}

function nibbleToHex(value) {
  return hexDigit(value)
}

function decodeBackupBits(rawBits) {
  const bits = String(rawBits || '').replace(/[^01]/g, '')

  if (bits.length < TOTAL_BACKUP_BITS) {
    return {
      ok: false,
      error: `Te weinig bits ontvangen (${bits.length}/${TOTAL_BACKUP_BITS})`,
      bits
    }
  }

  const usedBits = bits.slice(0, TOTAL_BACKUP_BITS)
  const allValues = []

  for (let i = 0; i + 3 < usedBits.length; i += 4) {
    allValues.push(parseInt(usedBits.slice(i, i + 4), 2))
  }

  if (allValues.length < 6) {
    return {
      ok: false,
      error: 'Code is te kort',
      bits: usedBits,
      values: allValues
    }
  }

  const candidates = []

  for (let offset = 0; offset < allValues.length; offset++) {
    const values = allValues.slice(offset)

    if (values.length < 6) continue

    const postPrefix = values[0]

    if (postPrefix !== 14) {
      continue
    }

    const postDigit1 = values[1]
    const postDigit2 = values[2]

    if (postDigit1 > 9 || postDigit2 > 9) {
      continue
    }

    const answerValue = values[3]
    const answer =
      answerValue === 13 ? 'R' :
      answerValue === 12 ? 'G' :
      answerValue === 11 ? 'B' :
      null

    if (!answer) {
      continue
    }

    const postId = `p${postDigit1}${postDigit2}`
    const maxUidLength = Math.min(17, values.length - 5)

    for (let uidLength = 4; uidLength <= maxUidLength; uidLength++) {
      const uidValues = values.slice(4, 4 + uidLength)
      const checksumValue = values[4 + uidLength]

      if (checksumValue === undefined) continue

      const uid = uidValues.map(nibbleToHex).join('')
      const rawPayload = `P${postDigit1}${postDigit2}${answer}${uid}`
      const expectedChecksum = calculateBackupChecksum(rawPayload)
      const receivedChecksum = nibbleToHex(checksumValue)

      if (expectedChecksum === receivedChecksum) {
        candidates.push({
          postId,
          uid,
          answer,
          checksum: receivedChecksum,
          uidLength,
          rawPayload,
          offset
        })
      }
    }
  }

  if (!candidates.length) {
    return {
      ok: false,
      error: 'Checksum klopt niet of P-start niet gevonden',
      bits: usedBits,
      values: allValues
    }
  }

  candidates.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset
    return b.uidLength - a.uidLength
  })

  return {
    ok: true,
    bits: usedBits,
    values: allValues,
    candidates,
    decoded: candidates[0]
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

router.get('/import', requireLogin, (req, res) => {
  res.render('pages/import', {
    result: null,
    error: null
  })
})

router.post('/import/scan-code', requireLogin, async (req, res) => {
  try {
    const decoded = decodeBackupBits(req.body.bits)

    if (!decoded.ok) {
      return res.status(400).json(decoded)
    }

    const attempts = []

    for (const candidate of decoded.candidates) {
      const result = await saveAnswerFromEsp({
        postId: candidate.postId,
        cardId: candidate.uid,
        teamId: candidate.uid,
        answer: candidate.answer,
        allowOverwrite: false
      })

      attempts.push({ candidate, result })

      if (result.ok || result.alreadyAnswered) {
        return res.json({
          ok: true,
          decoded: candidate,
          alreadyAnswered: Boolean(result.alreadyAnswered),
          importResult: result,
          attempts
        })
      }
    }

    res.status(400).json({
      ok: false,
      error: 'Code gelezen, maar geen passend team/post antwoord gevonden',
      decoded: decoded.decoded,
      candidates: decoded.candidates,
      attempts
    })
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Import mislukt' })
  }
})

router.post('/import', requireLogin, async (req, res) => {
  try {
    const decoded = decodeBackupBits(req.body.bits || '')
    let result = null

    if (decoded.ok) {
      result = await saveAnswerFromEsp({
        postId: decoded.decoded.postId,
        cardId: decoded.decoded.uid,
        teamId: decoded.decoded.uid,
        answer: decoded.decoded.answer,
        allowOverwrite: false
      })
    }

    res.render('pages/import', {
      result: result || decoded,
      error: decoded.ok ? null : decoded.error
    })
  } catch (error) {
    res.status(400).render('pages/import', {
      result: null,
      error: error.message || 'Import mislukt'
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