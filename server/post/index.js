const express = require('express')
const { ObjectId } = require('mongodb')
const {
  db,
  requireLogin,
  getFirstAvailablePostId,
  recalculateTeamPoints,
  isCorrectNormal,
  objectIdOrNull
} = require('../helpers')

const router = express.Router()

function hintFromBody(prefix, body) {
  const type = body[`${prefix}HintType`] || 'none'
  const value = String(body[`${prefix}HintValue`] || '').trim()
  if (type === 'none' || !type) return null
  return { type, value }
}

function normalAnswersFromBody(body) {
  return ['R', 'G', 'B'].map((key) => ({
    key,
    label: String(body[`answer${key}Label`] || '').trim(),
    isCorrect: body.normalCorrectAnswer === key,
    hint: hintFromBody(`answer${key}`, body)
  }))
}

router.post('/teams', requireLogin, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    const cardId = String(req.body.cardId || '').trim()
    if (!name || !cardId) return res.redirect('/setup')

    const database = await db()
    await database.collection('teams').updateOne(
      { cardId },
      {
        $setOnInsert: { createdAt: new Date(), questionProgress: [], totalPoints: 0 },
        $set: { name, cardId, isActive: true, updatedAt: new Date() }
      },
      { upsert: true }
    )
    res.redirect('/setup')
  } catch (error) {
    next(error)
  }
})

router.post('/teams/:id/delete', requireLogin, async (req, res, next) => {
  try {
    const teamId = objectIdOrNull(req.params.id)
    if (teamId) await (await db()).collection('teams').deleteOne({ _id: teamId })
    res.redirect('/setup')
  } catch (error) {
    next(error)
  }
})

router.post('/questions', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const type = req.body.type === 'final' ? 'final' : 'normal'
    const now = new Date()
    const question = {
      title: String(req.body.title || '').trim(),
      type,
      points: Number(req.body.points || 0),
      isActive: true,
      createdAt: now,
      updatedAt: now
    }

    if (type === 'normal') {
      const postId = await getFirstAvailablePostId()
      if (!postId) throw new Error('Er zijn geen vrije post-id’s meer beschikbaar.')
      question.postId = postId
      question.answers = normalAnswersFromBody(req.body)
    } else {
      question.correctAnswer = String(req.body.finalCorrectAnswer || '').trim()
      question.requiredForLeaderboard = req.body.requiredForLeaderboard === 'on'
    }

    await database.collection('questions').insertOne(question)
    res.redirect('/beheer')
  } catch (error) {
    next(error)
  }
})

router.post('/questions/:id', requireLogin, async (req, res, next) => {
  try {
    const questionId = objectIdOrNull(req.params.id)
    if (!questionId) return res.redirect('/beheer')

    const database = await db()
    const existing = await database.collection('questions').findOne({ _id: questionId })
    if (!existing) return res.redirect('/beheer')

    const type = req.body.type === 'final' ? 'final' : 'normal'
    const update = {
      title: String(req.body.title || '').trim(),
      type,
      points: Number(req.body.points || 0),
      updatedAt: new Date()
    }

    if (type === 'normal') {
      update.postId = existing.type === 'normal' && existing.postId ? existing.postId : await getFirstAvailablePostId(existing._id)
      if (!update.postId) throw new Error('Er zijn geen vrije post-id’s meer beschikbaar.')
      update.answers = normalAnswersFromBody(req.body)
      update.correctAnswer = null
      update.requiredForLeaderboard = false
    } else {
      update.postId = null
      update.answers = []
      update.correctAnswer = String(req.body.finalCorrectAnswer || '').trim()
      update.requiredForLeaderboard = req.body.requiredForLeaderboard === 'on'
    }

    await database.collection('questions').updateOne({ _id: questionId }, { $set: update })
    res.redirect('/beheer')
  } catch (error) {
    next(error)
  }
})

router.post('/questions/:id/delete', requireLogin, async (req, res, next) => {
  try {
    const questionId = objectIdOrNull(req.params.id)
    if (questionId) {
      const database = await db()
      await database.collection('questions').deleteOne({ _id: questionId })
      await database.collection('teams').updateMany({}, { $pull: { questionProgress: { questionId } }, $set: { updatedAt: new Date() } })
      const teams = await database.collection('teams').find({}).project({ _id: 1 }).toArray()
      await Promise.all(teams.map((team) => recalculateTeamPoints(team._id)))
    }
    res.redirect('/beheer')
  } catch (error) {
    next(error)
  }
})

router.post('/api/esp32/answer', async (req, res, next) => {
  try {
    const database = await db()
    const postId = String(req.body.postId || req.body.id || '').trim()
    const cardId = String(req.body.cardId || req.body.teamId || '').trim()
    const selectedAnswer = String(req.body.answer || '').trim().toUpperCase()

    const [team, question] = await Promise.all([
      database.collection('teams').findOne({ cardId, isActive: { $ne: false } }),
      database.collection('questions').findOne({ postId, type: 'normal', isActive: { $ne: false } })
    ])

    if (!team) return res.status(404).json({ ok: false, error: 'Team niet gevonden' })
    if (!question) return res.status(404).json({ ok: false, error: 'Vraag/post niet gevonden' })
    if (!['R', 'G', 'B'].includes(selectedAnswer)) return res.status(400).json({ ok: false, error: 'Ongeldig antwoord' })

    const isCorrect = isCorrectNormal(question, selectedAnswer)
    const pointsEarned = isCorrect ? Number(question.points || 0) : 0
    const progressItem = {
      questionId: question._id,
      type: 'normal',
      postId,
      selectedAnswer,
      isCorrect,
      pointsEarned,
      hintViews: 0,
      answeredAt: new Date()
    }

    await database.collection('teams').updateOne(
      { _id: team._id },
      {
        $pull: { questionProgress: { questionId: question._id } }
      }
    )
    await database.collection('teams').updateOne(
      { _id: team._id },
      {
        $push: { questionProgress: progressItem },
        $set: { updatedAt: new Date() }
      }
    )
    const totalPoints = await recalculateTeamPoints(team._id)

    res.json({ ok: true, isCorrect, pointsEarned, totalPoints })
  } catch (error) {
    next(error)
  }
})

router.post('/api/hints/view', async (req, res, next) => {
  try {
    const database = await db()
    const teamId = objectIdOrNull(req.body.teamId)
    const questionId = objectIdOrNull(req.body.questionId)
    if (!teamId || !questionId) return res.status(400).json({ ok: false })

    const team = await database.collection('teams').findOne({ _id: teamId })
    const progress = (team?.questionProgress || []).find((item) => String(item.questionId) === String(questionId))
    if (!progress || Number(progress.hintViews || 0) >= 3) return res.status(403).json({ ok: false, error: 'Hintlimiet bereikt' })

    await database.collection('teams').updateOne(
      { _id: teamId, 'questionProgress.questionId': questionId },
      { $inc: { 'questionProgress.$.hintViews': 1 }, $set: { updatedAt: new Date() } }
    )
    res.json({ ok: true, hintViews: Number(progress.hintViews || 0) + 1 })
  } catch (error) {
    next(error)
  }
})

router.post('/gamemaster/final', requireLogin, async (req, res, next) => {
  try {
    const database = await db()
    const teamId = objectIdOrNull(req.body.teamId)
    const questionId = objectIdOrNull(req.body.questionId)
    const status = req.body.status === 'correct' ? 'correct' : 'wrong'
    if (!teamId || !questionId) return res.redirect('/gamemaster')

    const question = await database.collection('questions').findOne({ _id: questionId, type: 'final' })
    if (!question) return res.redirect('/gamemaster')

    const isCorrect = status === 'correct'
    const progressItem = {
      questionId: question._id,
      type: 'final',
      givenAnswer: question.correctAnswer,
      isCorrect,
      pointsEarned: isCorrect ? Number(question.points || 0) : 0,
      answeredBy: 'gamemaster',
      answeredAt: new Date()
    }

    await database.collection('teams').updateOne({ _id: teamId }, { $pull: { questionProgress: { questionId: question._id } } })
    await database.collection('teams').updateOne(
      { _id: teamId },
      { $push: { questionProgress: progressItem }, $set: { updatedAt: new Date() } }
    )
    await recalculateTeamPoints(teamId)
    res.redirect(`/gamemaster?cardId=${encodeURIComponent(req.body.cardId || '')}`)
  } catch (error) {
    next(error)
  }
})

module.exports = router
